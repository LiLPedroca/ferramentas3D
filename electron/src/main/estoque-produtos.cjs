// Estoque de produtos: depois de cada mudança em orçamentos ou vendas, acerta as reservas e
// saídas de cada produto (regras em core/estoque-produtos.cjs). Uma conciliação de cada vez.
"use strict";

const { conciliar } = require("../core/estoque-produtos.cjs");

function criarEstoqueProdutos({ produtos, orcamentos, vendas }) {
  let fila = Promise.resolve();

  // Devolve { acabaram: [nomes] } (produtos que entraram em "Acabando" agora).
  function conciliarAgora() {
    const tarefa = fila.then(async () => {
      const [listaVendas, listaOrcamentos] = await Promise.all([vendas.colecao.ler(), orcamentos.colecao.ler()]);
      return produtos.colecao.alterar(async (itens) => {
        const r = conciliar(itens, listaVendas, listaOrcamentos);
        return { itens: r.mudou ? r.produtos : itens, resultado: { acabaram: r.acabaram } };
      });
    });
    fila = tarefa.catch(() => {});
    return tarefa;
  }

  // Envolve uma alteração: concilia depois e devolve o resultado original.
  // O aviso de "Acabando" vai junto em resultado.estoqueAcabando (quando é um objeto).
  async function depois(promessa) {
    const resultado = await promessa;
    try {
      const { acabaram } = await conciliarAgora();
      if (acabaram.length && resultado && typeof resultado === "object") return { ...resultado, estoqueAcabando: acabaram };
    } catch (erro) {
      console.error("Estoque de produtos:", erro);
    }
    return resultado;
  }

  return { conciliar: conciliarAgora, depois };
}

module.exports = { criarEstoqueProdutos };
