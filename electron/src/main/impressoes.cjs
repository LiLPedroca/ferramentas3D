// Serviço de "Minhas Impressões": cadastro (impressoes.json) + arquivos na pasta "impressoes" dos dados.
// Os arquivos nunca são alterados depois de guardados. Ao excluir um item, o arquivo vai para
// "impressoes/excluidos" (não é apagado), para que restaurar um backup antigo ainda o encontre.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { EXTENSOES, LIMITES, extensaoDe, marcarImpressa, montarImpressao, nomeDoArquivo, validarImpressao } = require("../core/impressao.cjs");
const { ErroValidacao, ID } = require("../core/validacao.cjs");
const { criarServicoColecao, maisRecentePrimeiro } = require("./servico-colecao.cjs");

const PASTA = "impressoes";
const EXCLUIDOS = "excluidos";

async function existe(caminho) {
  try {
    await fs.access(caminho);
    return true;
  } catch {
    return false;
  }
}

function criarServicoImpressoes(pasta) {
  const pastaArquivos = path.join(pasta, PASTA);
  const pastaExcluidos = path.join(pastaArquivos, EXCLUIDOS);
  const caminhoDe = (i) => path.join(pastaArquivos, `${i.id}.${i.arquivo.extensao}`);

  const servico = criarServicoColecao(pasta, {
    nome: "impressoes",
    rotulo: "impressão",
    limite: LIMITES.impressoes,
    validar: validarImpressao,
    ordenar: maisRecentePrimeiro,
    // Editar só muda os dados do cartão; o arquivo continua o mesmo.
    montar: (valores, { id, anterior }) => {
      if (!anterior) throw new ErroValidacao("Adicione o arquivo antes de salvar.");
      return montarImpressao(valores, { id, anterior });
    },
  });

  async function porId(id) {
    if (typeof id !== "string" || !ID.test(id)) throw new ErroValidacao("Impressão inválida.");
    const i = (await servico.listar()).find((x) => x.id === id);
    if (!i) throw new ErroValidacao("Esta impressão não existe mais. Atualize a lista.");
    return i;
  }

  return {
    colecao: servico.colecao,
    pastaArquivos,

    // Lista com a indicação de arquivo ausente (ex.: pasta de dados copiada sem a pasta "impressoes").
    async listar() {
      const itens = await servico.listar();
      return Promise.all(itens.map(async (i) => ({ ...i, arquivoAusente: !(await existe(caminhoDe(i))) })));
    },

    salvar: (valores, id) => servico.salvar(valores, id),

    // novo: { bytes: Uint8Array, nome (do arquivo), miniatura?, pesoG?, tempoMin? }
    async adicionar(novo) {
      const bytes = novo?.bytes;
      if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new ErroValidacao("Arquivo vazio ou inválido.");
      if (bytes.length > LIMITES.bytes) throw new ErroValidacao("Arquivo muito grande (máximo de 300 MB).");
      const nomeArquivo = String(novo.nome ?? "").replace(/[\\/]/g, "").slice(0, LIMITES.arquivo);
      const extensao = extensaoDe(nomeArquivo);
      if (!extensao) throw new ErroValidacao(`"${nomeArquivo}": use arquivos ${EXTENSOES.map((e) => e.toUpperCase()).join(", ")}.`);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const id = randomUUID();
      const arquivo = { nome: nomeArquivo, extensao, tamanho: bytes.length, hash };
      const tempo = /^\d{1,7}$/.test(String(novo.tempoMin ?? "")) ? Number(novo.tempoMin) : null;
      // Valida os dados antes de gravar o arquivo.
      montarImpressao(
        { nome: nomeDoArquivo(nomeArquivo), pesoG: novo.pesoG ?? "", tempoH: tempo === null ? "" : Math.floor(tempo / 60), tempoM: tempo === null ? "" : tempo % 60, miniatura: novo.miniatura },
        { id, arquivo },
      );
      await fs.mkdir(pastaArquivos, { recursive: true });
      const destino = path.join(pastaArquivos, `${id}.${extensao}`);
      const temporario = `${destino}.tmp`;
      await fs.writeFile(temporario, bytes);
      await fs.rename(temporario, destino);
      try {
        return await servico.colecao.alterar(async (itens) => {
          const repetido = itens.find((x) => x?.arquivo?.hash === hash);
          if (repetido) throw new ErroValidacao(`"${nomeArquivo}" já está em Minhas Impressões como "${repetido.nome}".`);
          if (itens.length >= LIMITES.impressoes) throw new ErroValidacao(`Limite de ${LIMITES.impressoes} impressões atingido.`);
          const item = montarImpressao(
            { nome: nomeDoArquivo(nomeArquivo), pesoG: novo.pesoG ?? "", tempoH: tempo === null ? "" : Math.floor(tempo / 60), tempoM: tempo === null ? "" : tempo % 60, miniatura: novo.miniatura },
            { id, arquivo },
          );
          return { itens: [...itens, item], resultado: item };
        });
      } catch (erro) {
        await fs.rm(destino, { force: true }); // o arquivo acabou de ser criado por esta chamada
        throw erro;
      }
    },

    // Tira o item da lista; o arquivo vai para "excluidos" (não é apagado).
    async excluir(id) {
      const i = await porId(id);
      await servico.excluir(id);
      if (await existe(caminhoDe(i))) {
        await fs.mkdir(pastaExcluidos, { recursive: true });
        await fs.rename(caminhoDe(i), path.join(pastaExcluidos, path.basename(caminhoDe(i))));
      }
      return true;
    },

    async lerArquivo(id) {
      const i = await porId(id);
      if (!(await existe(caminhoDe(i)))) throw new ErroValidacao("O arquivo desta impressão não foi encontrado na pasta de dados.");
      return { bytes: new Uint8Array(await fs.readFile(caminhoDe(i))), nome: i.arquivo.nome, extensao: i.arquivo.extensao };
    },

    marcarImpressa(id, hoje) {
      return servico.colecao.alterar(async (itens) => {
        const atual = itens.find((x) => x?.id === id);
        if (!atual) throw new ErroValidacao("Esta impressão não existe mais. Atualize a lista.");
        const novo = marcarImpressa(atual, { hoje });
        return { itens: itens.map((x) => (x?.id === id ? novo : x)), resultado: novo };
      });
    },

    // Backup .zip: os arquivos que existem, com o nome da impressão.
    async arquivosParaBackup() {
      const lista = [];
      for (const i of await servico.listar()) {
        if (await existe(caminhoDe(i))) lista.push({ id: i.id, nome: i.nome, extensao: i.arquivo.extensao, caminho: caminhoDe(i) });
      }
      return lista;
    },

    // Backup exportado (formato antigo, .json): copia os arquivos para uma pasta ao lado do .json.
    async copiarArquivosPara(destino) {
      const itens = await servico.listar();
      let copiados = 0;
      for (const i of itens) {
        if (!(await existe(caminhoDe(i)))) continue;
        await fs.mkdir(destino, { recursive: true });
        await fs.copyFile(caminhoDe(i), path.join(destino, path.basename(caminhoDe(i))));
        copiados += 1;
      }
      return copiados;
    },

    // Depois de restaurar: devolve os arquivos que faltam, procurando na pasta do backup e em "excluidos".
    // Nunca sobrescreve um arquivo que já existe.
    async recuperarArquivos(pastaBackup) {
      const itens = await servico.listar();
      let recuperados = 0;
      for (const i of itens) {
        const alvo = caminhoDe(i);
        if (await existe(alvo)) continue;
        const nome = path.basename(alvo);
        const origens = [pastaBackup ? path.join(pastaBackup, nome) : null, path.join(pastaExcluidos, nome)].filter(Boolean);
        for (const origem of origens) {
          if (!(await existe(origem))) continue;
          await fs.mkdir(pastaArquivos, { recursive: true });
          await fs.copyFile(origem, alvo);
          recuperados += 1;
          break;
        }
      }
      return recuperados;
    },
  };
}

// Pasta dos arquivos de um backup exportado: "Backup-...json" -> "Backup-... (arquivos)".
const pastaArquivosDoBackup = (caminhoJson) => caminhoJson.replace(/\.json$/i, "") + " (arquivos)";

module.exports = { criarServicoImpressoes, pastaArquivosDoBackup };
