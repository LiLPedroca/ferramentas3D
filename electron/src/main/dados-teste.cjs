// Serviço dos dados de teste: recriar o cliente e o produto de teste e limpar os orçamentos e vendas de teste.
// Nunca toca em cadastros reais: só itens marcados com "teste": true ou com os ids fixos de teste.
"use strict";

const { clienteTeste, comItem, produtoTeste, CLIENTE_TESTE_ID, PRODUTO_TESTE_ID } = require("../core/dados-teste.cjs");

function criarServicoDadosTeste({ clientes, produtos, orcamentos, vendas, configuracoes }) {
  async function recriar() {
    await clientes.colecao.alterar(async (itens) => {
      const anterior = itens.find((c) => c.id === CLIENTE_TESTE_ID);
      return { itens: comItem(itens, clienteTeste({ anterior })), resultado: true };
    });
    await produtos.colecao.alterar(async (itens) => {
      const anterior = itens.find((p) => p.id === PRODUTO_TESTE_ID);
      return { itens: comItem(itens, produtoTeste({ anterior })), resultado: true };
    });
    await configuracoes.salvar({ dadosTesteCriados: true });
    return true;
  }

  // Apaga só orçamentos e vendas de teste (com os pagamentos que estão dentro das vendas).
  async function limpar() {
    const semTeste = (colecao) =>
      colecao.alterar(async (itens) => {
        const resto = itens.filter((x) => x?.teste !== true);
        return { itens: resto, resultado: itens.length - resto.length };
      });
    const orcamentosApagados = await semTeste(orcamentos.colecao);
    const vendasApagadas = await semTeste(vendas.colecao);
    return { orcamentos: orcamentosApagados, vendas: vendasApagadas };
  }

  // Na primeira vez que esta versão abre, cria os dados de teste. Depois, só pelo botão.
  async function criarNaPrimeiraVez() {
    const config = await configuracoes.ler();
    if (config.dadosTesteCriados) return false;
    await recriar();
    return true;
  }

  return { criarNaPrimeiraVez, limpar, recriar };
}

module.exports = { criarServicoDadosTeste };
