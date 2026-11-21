// PDFs na nuvem (orçamentos, recibos e etiquetas): o arquivo original vai para a conta e desce
// nos outros PCs, na pasta do mesmo tipo (Minhas pastas). Assim o PDF que o cliente recebeu é o
// mesmo em todo lugar (não é refeito).
//   pdfs.json        -> lista sincronizada { id, tipo, nome, tamanho, sha, criadoEm, atualizadoEm }
//   pdfs-locais.json -> só deste PC: id -> caminho do arquivo aqui
// O conteúdo sobe comprimido (gzip, sem perda) em usuarios/<uid>/arquivos/<id>~<sha>.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { createHash } = require("node:crypto");
const { Colecao, Documento } = require("./armazenamento.cjs");
const { ErroValidacao, dataValida } = require("../core/validacao.cjs");

const TIPOS = ["orcamentos", "recibos", "etiquetas"];
const LIMITE_BYTES = 20 * 1024 * 1024;
const NOME = /^[^\\/:*?"<>|\u0000-\u001f]{1,200}\.pdf$/i;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const idDe = (tipo, nome) => `pdf-${createHash("sha1").update(`${tipo}/${nome.toLowerCase()}`).digest("hex")}`;
const chaveDe = (item) => `${item.id}~${item.sha.slice(0, 16)}`;

function validarPdf(p) {
  if (!p || typeof p !== "object") throw new ErroValidacao("PDF inválido.");
  if (!TIPOS.includes(p.tipo)) throw new ErroValidacao("Tipo de PDF inválido.");
  if (typeof p.nome !== "string" || !NOME.test(p.nome) || p.nome.startsWith(".")) throw new ErroValidacao("Nome de PDF inválido.");
  if (p.id !== idDe(p.tipo, p.nome)) throw new ErroValidacao("Identificador de PDF inválido.");
  if (typeof p.sha !== "string" || !/^[0-9a-f]{64}$/.test(p.sha)) throw new ErroValidacao("Resumo do PDF inválido.");
  if (!Number.isInteger(p.tamanho) || p.tamanho < 0 || p.tamanho > LIMITE_BYTES) throw new ErroValidacao("Tamanho do PDF inválido.");
  if (!dataValida(p.criadoEm) || !dataValida(p.atualizadoEm)) throw new ErroValidacao("Data inválida.");
  return true;
}

async function lerSePuder(caminho) {
  try {
    return await fs.readFile(caminho);
  } catch {
    return null;
  }
}

// pastaDe(tipo): pasta onde os PDFs desse tipo descem (cria se precisar).
function criarPdfsNuvem({ pasta, pastaDe, agora = () => new Date().toISOString() }) {
  const colecao = new Colecao(pasta, "pdfs");
  const locais = new Documento(pasta, "pdfs-locais");

  // Lugar livre para gravar: o nome de sempre ou, se já existe outro arquivo com esse nome
  // que não é nosso, "nome (2).pdf", "nome (3).pdf"... Nunca sobrescreve arquivo do usuário.
  async function destinoLivre(pastaTipo, nome, nosso) {
    const base = nome.replace(/\.pdf$/i, "");
    for (let n = 1; n < 100; n++) {
      const candidato = path.join(pastaTipo, n === 1 ? nome : `${base} (${n}).pdf`);
      if (candidato === nosso) return candidato;
      try {
        await fs.access(candidato);
      } catch {
        return candidato;
      }
    }
    throw new Error("Muitos arquivos com o mesmo nome.");
  }

  return {
    colecao,
    validar: validarPdf,

    // Depois de gravar um PDF: guarda o caminho deste PC e põe na lista (que a sincronização sobe).
    async registrar(tipo, caminho, bytes) {
      if (!TIPOS.includes(tipo)) return null;
      const nome = path.basename(caminho);
      if (!NOME.test(nome) || bytes.length > LIMITE_BYTES) return null;
      const id = idDe(tipo, nome);
      const sha = sha256(bytes);
      await locais.alterarValor(async (m) => ({ novo: { ...m, [id]: caminho }, resultado: true }));
      return colecao.alterar(async (itens) => {
        const anterior = itens.find((i) => i.id === id);
        if (anterior?.sha === sha) return { itens, resultado: anterior };
        const agoraTexto = agora();
        const item = { id, tipo, nome, tamanho: bytes.length, sha, criadoEm: anterior?.criadoEm ?? agoraTexto, atualizadoEm: agoraTexto };
        return { itens: anterior ? itens.map((i) => (i.id === id ? item : i)) : [...itens, item], resultado: item };
      });
    },

    // PDFs que já estavam nas pastas do programa (gerados antes da conta existir): entram na lista.
    // Arquivos que vieram da nuvem ou já registrados ficam como estão. Devolve quantos entraram.
    async registrarPastas() {
      const conhecidos = new Set(Object.values(await locais.ler()).map((c) => String(c).toLowerCase()));
      let novos = 0;
      for (const tipo of TIPOS) {
        const pastaTipo = await pastaDe(tipo);
        let nomes = [];
        try {
          nomes = await fs.readdir(pastaTipo);
        } catch {
          continue;
        }
        for (const nome of nomes) {
          const caminho = path.join(pastaTipo, nome);
          if (!NOME.test(nome) || conhecidos.has(caminho.toLowerCase())) continue;
          const bytes = await lerSePuder(caminho);
          if (!bytes || bytes.length > LIMITE_BYTES) continue;
          if (await this.registrar(tipo, caminho, bytes)) novos++;
        }
      }
      return novos;
    },

    // Antes de subir a lista: sobe o conteúdo de cada PDF. Devolve só os que subiram
    // (um PDF apagado ou trocado aqui fica de fora até ser gerado de novo).
    async antesDeEnviar(nuvem, uid, itens) {
      const mapa = await locais.ler();
      const prontos = [];
      for (const item of itens) {
        const bytes = mapa[item.id] ? await lerSePuder(mapa[item.id]) : null;
        if (!bytes || sha256(bytes) !== item.sha) continue;
        await nuvem.gravarArquivo(uid, chaveDe(item), zlib.gzipSync(bytes, { level: 9 }));
        prontos.push(item);
      }
      return prontos;
    },

    // PDFs que chegaram (ou que faltam aqui): baixa, confere e grava na pasta do tipo.
    async depoisDeReceber(nuvem, uid, itens) {
      const mapa = await locais.ler();
      const novos = {};
      for (const item of itens) {
        const atual = mapa[item.id];
        const bytesAqui = atual ? await lerSePuder(atual) : null;
        if (bytesAqui && sha256(bytesAqui) === item.sha) continue;
        let bytes;
        try {
          bytes = zlib.gunzipSync(await nuvem.lerArquivo(uid, chaveDe(item)));
        } catch {
          continue; // ainda não subiu por completo: tenta na próxima
        }
        if (sha256(bytes) !== item.sha) continue;
        const pastaTipo = await pastaDe(item.tipo);
        const destino = await destinoLivre(pastaTipo, item.nome, atual && path.dirname(atual) === pastaTipo ? atual : undefined);
        await fs.writeFile(`${destino}.tmp`, bytes);
        await fs.rename(`${destino}.tmp`, destino);
        novos[item.id] = destino;
      }
      if (Object.keys(novos).length) await locais.alterarValor(async (m) => ({ novo: { ...m, ...novos }, resultado: true }));
      return Object.keys(novos).length;
    },
  };
}

module.exports = { TIPOS, criarPdfsNuvem, idDe, validarPdf };
