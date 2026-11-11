// Backup e armazenamento: exportar, restaurar (com cópia de segurança antes), cópias automáticas
// diárias e resumo do espaço usado. Trabalha sobre os mesmos arquivos dos cadastros.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { lerBackup, montarBackup, nomeBackup } = require("../core/backup.cjs");

const PASTA_AUTOMATICOS = "backups-automaticos";
const MANTER_AUTOMATICOS = 10;
const UM_DIA = 24 * 60 * 60 * 1000;

function criarServicoBackup(pasta, { colecoes, configuracoes, versaoApp }) {
  const pastaAuto = path.join(pasta, PASTA_AUTOMATICOS);

  async function juntarDados() {
    const dados = { configuracoes: await configuracoes.documento.ler() };
    for (const [nome, servico] of Object.entries(colecoes)) dados[nome] = await servico.colecao.ler();
    return dados;
  }

  async function gerarTexto() {
    return JSON.stringify(montarBackup(await juntarDados(), { versaoApp }), null, 2);
  }

  async function gravarAutomatico(prefixo) {
    await fs.mkdir(pastaAuto, { recursive: true });
    const destino = path.join(pastaAuto, nomeBackup(prefixo));
    await fs.writeFile(destino, await gerarTexto(), "utf8");
    return destino;
  }

  async function listarAutomaticos() {
    try {
      const nomes = (await fs.readdir(pastaAuto)).filter((n) => /^[A-Za-z0-9-]+\.json$/.test(n));
      const itens = await Promise.all(
        nomes.map(async (nome) => {
          const info = await fs.stat(path.join(pastaAuto, nome));
          return { nome, tamanho: info.size, data: info.mtime.toISOString() };
        }),
      );
      return itens.sort((a, b) => b.data.localeCompare(a.data));
    } catch (erro) {
      if (erro.code === "ENOENT") return [];
      throw erro;
    }
  }

  // Remove só cópias automáticas diárias antigas (as "antes-de-restaurar" ficam).
  async function podarAutomaticos() {
    const diarios = (await listarAutomaticos()).filter((a) => a.nome.startsWith("diario-"));
    for (const antigo of diarios.slice(MANTER_AUTOMATICOS)) {
      await fs.rm(path.join(pastaAuto, antigo.nome), { force: true });
    }
  }

  return {
    gerarTexto,
    listarAutomaticos,

    // Uma cópia por dia, ao abrir o programa. Não faz nada se ainda não houver dados.
    async copiaDiaria() {
      const automaticos = await listarAutomaticos();
      const ultimo = automaticos.find((a) => a.nome.startsWith("diario-"));
      if (ultimo && Date.now() - Date.parse(ultimo.data) < UM_DIA) return null;
      const dados = await juntarDados();
      const vazio = Object.keys(colecoes).every((n) => dados[n].length === 0);
      if (vazio) return null;
      const destino = await gravarAutomatico("diario");
      await podarAutomaticos();
      return destino;
    },

    async resumo() {
      const arquivos = [];
      for (const nome of [...Object.keys(colecoes), "configuracoes"]) {
        try {
          const info = await fs.stat(path.join(pasta, `${nome}.json`));
          arquivos.push({ nome, tamanho: info.size });
        } catch {
          arquivos.push({ nome, tamanho: 0 });
        }
      }
      const contagem = {};
      for (const [nome, servico] of Object.entries(colecoes)) contagem[nome] = (await servico.listar()).length;
      return { pasta, arquivos, contagem, automaticos: await listarAutomaticos() };
    },

    lerArquivoBackup: async (caminho) => lerBackup(await fs.readFile(caminho, "utf8")),

    lerAutomatico: async (nome) => {
      if (!/^[A-Za-z0-9-]+\.json$/.test(nome)) throw new Error("Nome de backup inválido.");
      return lerBackup(await fs.readFile(path.join(pastaAuto, nome), "utf8"));
    },

    // Substitui os dados atuais pelos do backup, guardando antes uma cópia do estado atual.
    async restaurar(lido) {
      const seguranca = await gravarAutomatico("antes-de-restaurar");
      for (const [nome, servico] of Object.entries(colecoes)) {
        if (lido.ausentes?.includes(nome)) continue;
        await servico.colecao.alterar(async () => ({ itens: lido.dados[nome], resultado: true }));
      }
      await configuracoes.documento.alterarValor(async (atual) => ({
        novo: { ...atual, ...lido.dados.configuracoes },
        resultado: true,
      }));
      return { seguranca: path.basename(seguranca), resumo: lido.resumo };
    },
  };
}

module.exports = { criarServicoBackup };
