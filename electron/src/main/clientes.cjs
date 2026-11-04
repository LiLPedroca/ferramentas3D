// Serviço de clientes (usa o serviço genérico de cadastros). Lista em ordem alfabética.
"use strict";

const { LIMITES, montarCliente, validarCliente } = require("../core/cliente.cjs");
const { criarServicoColecao } = require("./servico-colecao.cjs");

function criarServicoClientes(pasta) {
  return criarServicoColecao(pasta, {
    nome: "clientes",
    rotulo: "cliente",
    limite: LIMITES.clientes,
    montar: (valores, { id, anterior }) => montarCliente(valores, { id, anterior }),
    validar: validarCliente,
    ordenar: (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  });
}

module.exports = { criarServicoClientes };
