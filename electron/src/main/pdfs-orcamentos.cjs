// Onde ficou o PDF de cada orçamento. Ao editar o orçamento e gerar o PDF de novo, o mesmo
// arquivo é atualizado (sem perguntar onde salvar). Se o arquivo sumiu, pergunta outra vez.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { Documento } = require("./armazenamento.cjs");
const { ErroValidacao } = require("../core/validacao.cjs");

function criarPdfsOrcamentos(pasta) {
  const doc = new Documento(pasta, "pdfs-orcamentos");
  return {
    // Caminho do PDF já gerado para este orçamento, se o arquivo ainda existe.
    async caminhoExistente(id) {
      const mapa = await doc.ler();
      const caminho = mapa[id];
      if (typeof caminho !== "string" || !path.isAbsolute(caminho)) return null;
      try {
        await fs.access(caminho);
        return caminho;
      } catch {
        return null;
      }
    },
    lembrar(id, caminho) {
      return doc.alterarValor(async (mapa) => ({ novo: { ...mapa, [id]: caminho }, resultado: caminho }));
    },
  };
}

// Grava o PDF; se o arquivo está aberto e travado em outro programa, explica o que fazer.
async function gravarPdf(caminho, bytes) {
  try {
    await fs.writeFile(caminho, bytes);
  } catch (erro) {
    if (["EBUSY", "EPERM", "EACCES"].includes(erro?.code)) {
      throw new ErroValidacao("Não foi possível atualizar o PDF: ele está aberto em outro programa. Feche o PDF e tente de novo.");
    }
    throw erro;
  }
}

module.exports = { criarPdfsOrcamentos, gravarPdf };
