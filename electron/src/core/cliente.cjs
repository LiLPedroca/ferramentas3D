// Modelo de cliente: normalização e validação (CommonJS: processo principal e testes).
"use strict";

const { ErroValidacao, ID, dataValida, texto, textoLongo } = require("./validacao.cjs");

const LIMITES = { nome: 120, email: 120, cidade: 80, observacoes: 500, clientes: 10_000 };

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

// Telefone: guarda só os dígitos. Aceita de 8 a 13 dígitos (com DDD e, opcionalmente, 55).
function telefoneDeTexto(valor) {
  const d = soDigitos(valor);
  if (!d) return "";
  if (d.length < 8 || d.length > 13) throw new ErroValidacao("Telefone: confira o número (com DDD).");
  return d;
}

function emailDeTexto(valor) {
  const e = texto(valor, "E-mail", LIMITES.email).toLowerCase();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new ErroValidacao("E-mail: confira o endereço.");
  return e;
}

function cpfValido(d) {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function cnpjValido(d) {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

// CPF ou CNPJ opcional: guarda só os dígitos, conferindo os dígitos verificadores.
function documentoDeTexto(valor) {
  const d = soDigitos(valor);
  if (!d) return "";
  if (d.length === 11 && cpfValido(d)) return d;
  if (d.length === 14 && cnpjValido(d)) return d;
  throw new ErroValidacao("CPF/CNPJ: confira o número.");
}

function validarCliente(c) {
  if (!c || typeof c !== "object") throw new ErroValidacao("Cliente inválido.");
  if (typeof c.id !== "string" || !ID.test(c.id)) throw new ErroValidacao("Identificador inválido.");
  texto(c.nome, "Nome", LIMITES.nome, { obrigatorio: true });
  for (const campo of ["telefone", "documento"]) {
    if (typeof c[campo] !== "string" || (c[campo] && !/^\d+$/.test(c[campo]))) {
      throw new ErroValidacao("Cliente com dados inválidos.");
    }
  }
  telefoneDeTexto(c.telefone);
  documentoDeTexto(c.documento);
  emailDeTexto(c.email);
  texto(c.cidade, "Cidade", LIMITES.cidade);
  textoLongo(c.observacoes, "Observações", LIMITES.observacoes);
  if (c.teste !== undefined && c.teste !== true) throw new ErroValidacao("Cliente com dados inválidos.");
  if (!dataValida(c.criadoEm) || !dataValida(c.atualizadoEm)) throw new ErroValidacao("Data inválida.");
  return c;
}

// valores: { nome, telefone, email, documento, cidade, observacoes }
function montarCliente(valores, { id, anterior, agora = new Date().toISOString() }) {
  const v = valores ?? {};
  const cliente = {
    id,
    nome: texto(v.nome, "Nome", LIMITES.nome, { obrigatorio: true }),
    telefone: telefoneDeTexto(v.telefone),
    email: emailDeTexto(v.email),
    documento: documentoDeTexto(v.documento),
    cidade: texto(v.cidade, "Cidade", LIMITES.cidade),
    observacoes: textoLongo(v.observacoes, "Observações", LIMITES.observacoes),
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  // O cliente de teste continua marcado depois de editado.
  if (anterior?.teste === true) cliente.teste = true;
  return validarCliente(cliente);
}

module.exports = { LIMITES, cnpjValido, cpfValido, documentoDeTexto, emailDeTexto, montarCliente, telefoneDeTexto, validarCliente };
