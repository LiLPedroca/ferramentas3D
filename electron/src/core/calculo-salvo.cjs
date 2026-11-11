// Cópia do cálculo da Calculadora 3D guardada junto do produto, do item do orçamento e da venda.
// Mudanças futuras de preços ou configurações não alteram esta cópia.
"use strict";

const { ErroValidacao } = require("./validacao.cjs");

const DECIMAL = /^\d{1,9}(\.\d{1,6})?$/;
const CENTAVOS = /^-?\d{1,13}$/;
const PARAMETROS = ["pesoG", "precoKg", "horas", "potenciaW", "tarifaKwh", "custoHora", "maoDeObra", "lucroPct"];
const CUSTOS = ["filamento", "energia", "impressora", "maoDeObra", "total"];

// c: { pesoG, quantidade, precoKg, horas, potenciaW, tarifaKwh, custoHora, maoDeObra, lucroPct,
//      custosCentavos: { filamento, energia, impressora, maoDeObra, total }, data }
function validarCalculo(c) {
  if (c === undefined) return undefined;
  if (!c || typeof c !== "object") throw new ErroValidacao("Cálculo guardado inválido.");
  const r = {};
  for (const k of PARAMETROS) {
    if (!DECIMAL.test(String(c[k]))) throw new ErroValidacao("Cálculo guardado inválido.");
    r[k] = String(c[k]);
  }
  if (!Number.isInteger(c.quantidade) || c.quantidade < 1 || c.quantidade > 100_000) throw new ErroValidacao("Cálculo guardado inválido.");
  r.quantidade = c.quantidade;
  const custos = c.custosCentavos;
  if (!custos || typeof custos !== "object") throw new ErroValidacao("Cálculo guardado inválido.");
  r.custosCentavos = {};
  for (const k of CUSTOS) {
    if (!CENTAVOS.test(String(custos[k]))) throw new ErroValidacao("Cálculo guardado inválido.");
    r.custosCentavos[k] = String(custos[k]);
  }
  if (typeof c.data !== "string" || Number.isNaN(Date.parse(c.data))) throw new ErroValidacao("Cálculo guardado inválido.");
  r.data = c.data;
  return r;
}

module.exports = { validarCalculo };
