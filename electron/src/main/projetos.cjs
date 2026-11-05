// "Meus modelos" (usa o serviço genérico de cadastros). Arquivo: projetos.json na pasta de dados.
"use strict";

const { LIMITES, montarProjeto, validarProjeto } = require("../core/projeto.cjs");
const { criarServicoColecao, maisRecentePrimeiro } = require("./servico-colecao.cjs");

function criarServicoProjetos(pasta) {
  return criarServicoColecao(pasta, {
    nome: "projetos",
    rotulo: "modelo",
    limite: LIMITES.projetos,
    validar: validarProjeto,
    ordenar: maisRecentePrimeiro,
    montar: (valores, { id, anterior }) => montarProjeto(valores, { id, anterior }),
  });
}

module.exports = { criarServicoProjetos };
