// Base comum de validação dos cadastros (produtos, clientes, configurações...).
// Erros desta classe têm mensagem pronta para mostrar ao usuário.
"use strict";

class ErroValidacao extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroValidacao";
  }
}

const CONTROLE = /[\x00-\x1f\x7f]/;

// Texto de uma linha: apara, junta espaços, limita tamanho e recusa caracteres de controle.
function texto(valor, nome, maximo, { obrigatorio = false, Erro = ErroValidacao } = {}) {
  const limpo = String(valor ?? "").trim().replace(/\s+/g, " ");
  if (obrigatorio && !limpo) throw new Erro(`Preencha o campo: ${nome}.`);
  if (limpo.length > maximo) throw new Erro(`${nome}: use no máximo ${maximo} caracteres.`);
  if (CONTROLE.test(limpo)) throw new Erro(`${nome}: há caracteres inválidos.`);
  return limpo;
}

// Texto com várias linhas (observações): mantém quebras de linha, recusa outros controles.
function textoLongo(valor, nome, maximo, { Erro = ErroValidacao } = {}) {
  const limpo = String(valor ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .trim();
  if (limpo.length > maximo) throw new Erro(`${nome}: use no máximo ${maximo} caracteres.`);
  if (/[\x00-\x09\x0b-\x1f\x7f]/.test(limpo)) throw new Erro(`${nome}: há caracteres inválidos.`);
  return limpo;
}

const ID = /^[A-Za-z0-9-]{8,64}$/;

function dataValida(valor) {
  return typeof valor === "string" && !Number.isNaN(Date.parse(valor));
}

module.exports = { ErroValidacao, ID, dataValida, texto, textoLongo };
