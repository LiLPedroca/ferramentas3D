// Sincronização dos dados com a conta na nuvem (Firestore).
// Os arquivos JSON continuam sendo a fonte do programa: sem internet tudo funciona e,
// quando a conexão volta, o que mudou aqui sobe e o que mudou nos outros PCs desce.
// O estado (o que já foi sincronizado) fica em sincronizacao.json na pasta de dados.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { configParaItens, itensParaConfig, mesclar, resumo, validarItemConfig } = require("../core/sincronizacao.cjs");
const { normalizarGravado } = require("../core/configuracoes.cjs");
const { ErroSessao } = require("./conta.cjs");

const MARGEM_MS = 60_000; // relê o último minuto (gravações que chegaram quase juntas)
const ESPERA_MS = 3_000; // junta várias gravações seguidas numa sincronização só
const INTERVALO_MS = 5 * 60_000;

const CONFIG = "configuracoes";

// colecoes: { nome: { colecao (Colecao), validar(item) } }. configuracoes: { documento }.
// aoMudar({ nomes, estado }): avisa a tela (dados que desceram da nuvem e o estado da sincronização).
function criarSincronizacao({ pasta, conta, nuvem, colecoes, configuracoes, aoMudar = () => {}, agendar = setTimeout, cancelar = clearTimeout }) {
  const arquivo = path.join(pasta, "sincronizacao.json");
  let situacao = { sincronizando: false, ultima: "", erro: "" };
  let rodando = null;
  let deNovo = false;
  let espera = null;
  let relogio = null;

  async function lerEstado() {
    try {
      const d = JSON.parse(await fs.readFile(arquivo, "utf8"));
      if (d?.versao === 1 && d.colecoes && typeof d.colecoes === "object") return d;
    } catch {
      /* ainda não sincronizou */
    }
    return { versao: 1, uid: "", ultima: "", colecoes: {} };
  }

  async function gravarEstado(estado) {
    await fs.mkdir(pasta, { recursive: true });
    await fs.writeFile(`${arquivo}.tmp`, JSON.stringify(estado), "utf8");
    await fs.rename(`${arquivo}.tmp`, arquivo);
  }

  const desdeCom = (ultimo) => (ultimo ? new Date(Math.max(0, Date.parse(ultimo) - MARGEM_MS)).toISOString() : "");

  // Uma coleção (ou as configurações): desce, junta, sobe. Devolve true se mudou algo aqui.
  async function sincronizarUma(uid, estado, nome, { ler, gravar, validar }) {
    const st = estado.colecoes[nome] ?? { ultimo: "", base: {} };
    const { remotos, ultimo } = await nuvem.mudancas(uid, nome, desdeCom(st.ultimo));

    let m = mesclar({ locais: await ler(), remotos, base: st.base, validar });
    if (m.mudouLocal) {
      // Junta de novo dentro da fila de gravação (o usuário pode ter salvo algo nesse meio tempo).
      m = await gravar((locais) => mesclar({ locais, remotos, base: st.base, validar }));
    }
    st.base = m.base;
    st.ultimo = ultimo || st.ultimo;
    estado.colecoes[nome] = st;

    const alteracoes = [...m.enviar.map((item) => ({ id: item.id, item })), ...m.excluir.map((id) => ({ id, item: null }))];
    if (alteracoes.length) {
      await nuvem.gravar(uid, nome, alteracoes);
      for (const item of m.enviar) st.base[item.id] = resumo(item);
      for (const id of m.excluir) delete st.base[id];
    }
    await gravarEstado(estado);
    return m.mudouLocal;
  }

  async function executar() {
    const sessao = await conta.estado();
    if (!sessao) return;
    situacao = { ...situacao, sincronizando: true, erro: "" };
    aoMudar({ nomes: [], estado: situacao });
    const mudaram = [];
    try {
      let estado = await lerEstado();
      if (estado.uid !== sessao.uid) estado = { versao: 1, uid: sessao.uid, ultima: "", colecoes: {} };

      for (const [nome, { colecao, validar }] of Object.entries(colecoes)) {
        const mudou = await sincronizarUma(sessao.uid, estado, nome, {
          validar,
          ler: () => colecao.ler(),
          gravar: (juntar) =>
            colecao.alterar(async (itens) => {
              const m = juntar(itens);
              return { itens: m.itens, resultado: m };
            }, { silencioso: true }),
        });
        if (mudou) mudaram.push(nome);
      }

      const doc = configuracoes.documento;
      const mudouConfig = await sincronizarUma(sessao.uid, estado, CONFIG, {
        validar: validarItemConfig,
        ler: async () => configParaItens(normalizarGravado(await doc.ler())),
        gravar: (juntar) =>
          doc.alterarValor(async (atual) => {
            const m = juntar(configParaItens(normalizarGravado(atual)));
            return { novo: { ...atual, ...itensParaConfig(m.itens) }, resultado: m };
          }, { silencioso: true }),
      });
      if (mudouConfig) mudaram.push(CONFIG);

      estado.ultima = new Date().toISOString();
      await gravarEstado(estado);
      situacao = { sincronizando: false, ultima: estado.ultima, erro: "" };
    } catch (erro) {
      const mensagem =
        erro instanceof ErroSessao
          ? erro.message
          : erro?.status === 403 || erro?.status === 401
            ? "A nuvem recusou o acesso. Entre de novo na sua conta."
            : /internet|fetch|ENOTFOUND|ECONN|network/i.test(String(erro?.message ?? erro))
              ? "Sem internet agora. Os dados ficam guardados aqui e sobem quando a conexão voltar."
              : `Não foi possível sincronizar: ${erro?.message ?? erro}`;
      situacao = { ...situacao, sincronizando: false, erro: mensagem };
    }
    aoMudar({ nomes: mudaram, estado: situacao });
  }

  // Uma sincronização de cada vez; pedidos no meio viram mais uma rodada no fim.
  function sincronizar() {
    if (rodando) {
      deNovo = true;
      return rodando;
    }
    rodando = (async () => {
      do {
        deNovo = false;
        await executar();
      } while (deNovo);
    })().finally(() => {
      rodando = null;
    });
    return rodando;
  }

  return {
    sincronizar,

    // Depois de uma gravação: espera um pouco e sincroniza.
    pedir() {
      if (espera) cancelar(espera);
      espera = agendar(() => {
        espera = null;
        sincronizar();
      }, ESPERA_MS);
    },

    iniciarRelogio() {
      if (!relogio) relogio = setInterval(() => sincronizar(), INTERVALO_MS);
    },

    pararRelogio() {
      if (relogio) clearInterval(relogio);
      relogio = null;
    },

    async situacao() {
      const estado = await lerEstado();
      return { ...situacao, ultima: situacao.ultima || estado.ultima };
    },

    // Ao sair da conta: esquece o estado (os dados continuam no PC).
    async esquecer() {
      situacao = { sincronizando: false, ultima: "", erro: "" };
      await fs.rm(arquivo, { force: true });
    },
  };
}

module.exports = { criarSincronizacao };
