// Exportar modelos direto na pasta "Modelos 3D": nome limpo para o Windows (acentos ficam) e nunca
// sobrescreve um arquivo que já existe (vira "Nome (2).3mf", "Nome (3).3mf"...).
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

function nomeLimpo(nome) {
  const limpo = String(nome ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim();
  return !limpo || RESERVADOS.test(limpo) ? "Modelo" : limpo;
}

async function existe(caminho) {
  try {
    await fs.access(caminho);
    return true;
  } catch {
    return false;
  }
}

// Caminho livre na pasta para base.extensao.
async function caminhoLivre(pasta, base, extensao) {
  for (let n = 1; n < 1000; n++) {
    const caminho = path.join(pasta, `${base}${n > 1 ? ` (${n})` : ""}.${extensao}`);
    if (!(await existe(caminho))) return caminho;
  }
  throw new Error("Há arquivos demais com esse nome na pasta.");
}

// Grava sem sobrescrever (a criação falha se outro arquivo aparecer no meio). Devolve o caminho.
async function gravarSemSobrescrever(pasta, base, extensao, bytes) {
  await fs.mkdir(pasta, { recursive: true });
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const caminho = await caminhoLivre(pasta, base, extensao);
    try {
      await fs.writeFile(caminho, bytes, { flag: "wx" });
      return caminho;
    } catch (erro) {
      if (erro.code !== "EEXIST") throw erro;
    }
  }
  throw new Error("Não foi possível salvar o arquivo.");
}

module.exports = { nomeLimpo, caminhoLivre, gravarSemSobrescrever };
