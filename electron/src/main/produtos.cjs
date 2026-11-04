// Serviço de produtos (usa o serviço genérico de cadastros).
"use strict";

const { LIMITES, montarProduto, validarProduto } = require("../core/produto.cjs");
const { criarServicoColecao, maisRecentePrimeiro, responder } = require("./servico-colecao.cjs");

function criarServicoProdutos(pasta) {
  return criarServicoColecao(pasta, {
    nome: "produtos",
    rotulo: "produto",
    limite: LIMITES.produtos,
    montar: (valores, { id, anterior }) => montarProduto(valores, { id, anterior }),
    validar: validarProduto,
    ordenar: maisRecentePrimeiro,
  });
}

module.exports = { criarServicoProdutos, responder };
