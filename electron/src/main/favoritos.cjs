// Favoritos do Caçador de STL (usa o serviço genérico de cadastros).
"use strict";

const { LIMITES, montarFavorito, validarFavorito } = require("../core/stl.cjs");
const { criarServicoColecao, maisRecentePrimeiro } = require("./servico-colecao.cjs");

function criarServicoFavoritos(pasta) {
  return criarServicoColecao(pasta, {
    nome: "favoritos-stl",
    rotulo: "favorito",
    limite: LIMITES.favoritos,
    validar: validarFavorito,
    ordenar: maisRecentePrimeiro,
    montar: (valores, { id, anterior, itens }) => montarFavorito(valores, { id, anterior, existentes: itens }),
  });
}

module.exports = { criarServicoFavoritos };
