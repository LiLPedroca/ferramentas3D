// Estoque de filamentos (usa o serviço genérico de cadastros) + descontar o que uma impressão usou.
"use strict";

const { LIMITES, descontar, montarFilamento, validarFilamento } = require("../core/filamento.cjs");
const { ErroValidacao } = require("../core/validacao.cjs");
const { criarServicoColecao } = require("./servico-colecao.cjs");

// rolos por material e cor (o estoque é consultado assim)
const porMaterialECor = (a, b) => a.material.localeCompare(b.material, "pt-BR") || a.cor.localeCompare(b.cor, "pt-BR");

function criarServicoFilamentos(pasta) {
  const servico = criarServicoColecao(pasta, {
    nome: "filamentos",
    rotulo: "filamento",
    limite: LIMITES.rolos,
    validar: validarFilamento,
    ordenar: porMaterialECor,
    montar: (valores, { id, anterior }) => montarFilamento(valores, { id, anterior }),
  });
  servico.descontar = (id, gramas) =>
    servico.colecao.alterar(async (itens) => {
      const rolo = itens.find((f) => f.id === id);
      if (!rolo) throw new ErroValidacao("Este rolo não existe mais. Atualize a lista.");
      const novo = descontar(rolo, gramas);
      return { itens: itens.map((f) => (f.id === id ? novo : f)), resultado: novo };
    });
  return servico;
}

module.exports = { criarServicoFilamentos };
