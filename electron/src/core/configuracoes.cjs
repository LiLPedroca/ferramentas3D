// Configurações do usuário: validação e mesclagem. Em CommonJS (usado no processo principal e nos testes).
"use strict";

const { ErroValidacao } = require("./validacao.cjs");

class ConfiguracaoInvalida extends ErroValidacao {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ConfiguracaoInvalida";
  }
}

const CONTROLE = /[\x00-\x1f\x7f]/;

function texto(valor, nome, maximo) {
  const limpo = String(valor ?? "").trim().replace(/\s+/g, " ");
  if (limpo.length > maximo) throw new ConfiguracaoInvalida(`${nome}: use no máximo ${maximo} caracteres.`);
  if (CONTROLE.test(limpo)) throw new ConfiguracaoInvalida(`${nome}: há caracteres inválidos.`);
  return limpo;
}

const PADRAO = { nome: "", nomePerguntado: false };

// Lê o que estiver gravado, ignorando campos estranhos ou inválidos (nunca falha).
function normalizarGravado(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  let nome = "";
  try {
    nome = texto(d.nome, "Nome", 80);
  } catch {
    nome = "";
  }
  return { nome, nomePerguntado: d.nomePerguntado === true };
}

// Aplica uma alteração parcial vinda da tela. Só campos conhecidos são aceitos.
function aplicarAlteracao(atual, alteracao) {
  const base = normalizarGravado(atual);
  const a = alteracao && typeof alteracao === "object" ? alteracao : {};
  const novo = { ...base };
  if ("nome" in a) novo.nome = texto(a.nome, "Nome", 80);
  if ("nomePerguntado" in a) novo.nomePerguntado = a.nomePerguntado === true;
  return novo;
}

module.exports = { ConfiguracaoInvalida, PADRAO, aplicarAlteracao, normalizarGravado };
