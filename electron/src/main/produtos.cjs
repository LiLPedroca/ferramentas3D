// Serviço de produtos: listar, salvar e excluir, sempre validando no processo principal.
"use strict";

const { randomUUID } = require("node:crypto");
const { Colecao } = require("./armazenamento.cjs");
const { LIMITES, ProdutoInvalido, montarProduto, validarProduto } = require("../core/produto.cjs");

function valido(p) {
  try {
    validarProduto(p);
    return true;
  } catch {
    return false;
  }
}

function criarServicoProdutos(pasta) {
  const colecao = new Colecao(pasta, "produtos");

  return {
    // Itens inválidos ficam no arquivo (não são apagados), mas não aparecem na tela.
    async listar() {
      const itens = await colecao.ler();
      return itens.filter(valido).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
    },

    salvar(valores, id) {
      return colecao.alterar(async (itens) => {
        const anterior = id ? itens.find((p) => p.id === id) : undefined;
        if (id && !anterior) throw new ProdutoInvalido("Este produto não existe mais. Atualize a lista.");
        if (!id && itens.length >= LIMITES.produtos) {
          throw new ProdutoInvalido(`Limite de ${LIMITES.produtos} produtos atingido.`);
        }
        const produto = montarProduto(valores, { id: id ?? randomUUID(), anterior });
        const novos = anterior ? itens.map((p) => (p.id === id ? produto : p)) : [...itens, produto];
        return { itens: novos, resultado: produto };
      });
    },

    excluir(id) {
      return colecao.alterar(async (itens) => {
        if (!itens.some((p) => p.id === id)) throw new ProdutoInvalido("Este produto já foi excluído.");
        return { itens: itens.filter((p) => p.id !== id), resultado: true };
      });
    },
  };
}

// Respostas para a tela: { ok: true, dados } ou { ok: false, erro } (mensagem em português).
async function responder(promessa) {
  try {
    return { ok: true, dados: await promessa };
  } catch (erro) {
    const mensagem = erro instanceof ProdutoInvalido ? erro.message : `Não foi possível concluir: ${erro.message}`;
    return { ok: false, erro: mensagem };
  }
}

module.exports = { criarServicoProdutos, responder };
