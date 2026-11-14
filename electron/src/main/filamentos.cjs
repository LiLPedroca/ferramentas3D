// Estoque de filamentos (usa o serviço genérico de cadastros) + descontar o que uma impressão usou,
// pesar na balança, abrir um rolo fechado e escolher o rolo de cada posição da impressora.
"use strict";

const { LIMITES, abrirRoloNovo, descontar, montarFilamento, pesar, validarFilamento } = require("../core/filamento.cjs");
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
  const mudarUm = (id, mudar) =>
    servico.colecao.alterar(async (itens) => {
      const rolo = itens.find((f) => f.id === id);
      if (!rolo) throw new ErroValidacao("Este rolo não existe mais. Atualize a lista.");
      const novo = mudar(rolo);
      validarFilamento(novo);
      return { itens: itens.map((f) => (f.id === id ? novo : f)), resultado: novo };
    });
  servico.descontar = (id, gramas) => mudarUm(id, (f) => descontar(f, gramas));
  servico.pesar = (id, balancaG, carretelG) => mudarUm(id, (f) => pesar(f, balancaG, carretelG));
  servico.abrirRoloNovo = (id) => mudarUm(id, (f) => abrirRoloNovo(f));
  // Vários rolos de uma vez (uma impressão multicor): tudo ou nada. Gramas negativas devolvem (desfazer).
  servico.descontarVarios = (lista) =>
    servico.colecao.alterar(async (itens) => {
      if (!Array.isArray(lista) || lista.length > 16) throw new ErroValidacao("Lista de filamento inválida.");
      let novos = itens;
      for (const { id, gramas } of lista) {
        if (!novos.some((f) => f.id === id)) throw new ErroValidacao("Um dos rolos não existe mais. Atualize a lista.");
        novos = novos.map((f) => (f.id === id ? descontar(f, gramas) : f));
      }
      return { itens: novos, resultado: novos.filter((f) => lista.some((u) => u.id === f.id)) };
    });
  // Põe o rolo numa posição da impressora (1 a 4) ou tira (null). Quem estava na posição sai dela.
  servico.posicionar = (id, posicao) =>
    servico.colecao.alterar(async (itens) => {
      const p = posicao === null ? null : Number(posicao);
      if (p !== null && !(Number.isInteger(p) && p >= 1 && p <= LIMITES.posicoes)) throw new ErroValidacao("Posição na impressora inválida.");
      if (id !== null && !itens.some((f) => f.id === id)) throw new ErroValidacao("Este rolo não existe mais. Atualize a lista.");
      const agora = new Date().toISOString();
      const novos = itens.map((f) => {
        if (f.id === id) return { ...f, posicao: p, atualizadoEm: agora };
        if (p !== null && f.posicao === p) return { ...f, posicao: null, atualizadoEm: agora };
        return f;
      });
      return { itens: novos, resultado: novos };
    });
  return servico;
}

module.exports = { criarServicoFilamentos };
