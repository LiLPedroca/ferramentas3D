// Serviço da Gestão financeira: vendas (pagamentos ficam dentro da venda, gravados juntos) e despesas.
"use strict";

const { randomUUID } = require("node:crypto");
const fin = require("../core/financeiro.cjs");
const { ErroValidacao } = require("../core/validacao.cjs");
const { centavosDeTexto } = require("../core/produto.cjs");
const { criarServicoColecao } = require("./servico-colecao.cjs");

const maisRecente = (a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm);

// resposta da janela de pagamento -> total recebido desejado (centavos) ou undefined (não mexe)
function recebidoDesejado(resposta, total, venda) {
  const modo = resposta?.modo;
  if (modo === "manter" || modo === undefined) return undefined;
  if (modo === "pendente") return venda ? undefined : "0";
  if (modo === "integral") return total;
  if (modo === "parcial") {
    const valor = centavosDeTexto(resposta.valor, "Valor recebido", { obrigatorio: true });
    if (BigInt(valor) <= 0n) throw new ErroValidacao("Valor recebido: informe um valor maior que zero.");
    if (BigInt(valor) >= BigInt(total)) throw new ErroValidacao("Para o valor total, escolha \"Pagou o valor integral\".");
    // valor informado é o que o cliente pagou até agora (sinal ou parcial)
    return valor;
  }
  throw new ErroValidacao("Escolha se o cliente pagou.");
}

function criarServicoFinanceiro(pasta, { orcamentos }) {
  const vendas = criarServicoColecao(pasta, {
    nome: "vendas",
    rotulo: "venda",
    limite: fin.LIMITES.vendas,
    validar: fin.validarVenda,
    ordenar: maisRecente,
    montar: (valores, { id, anterior }) => fin.montarVendaManual(valores, { id, anterior }),
  });
  const despesas = criarServicoColecao(pasta, {
    nome: "despesas",
    rotulo: "despesa",
    limite: fin.LIMITES.despesas,
    validar: fin.validarDespesa,
    ordenar: maisRecente,
    montar: (valores, { id, anterior }) => fin.montarDespesa(valores, { id, anterior }),
  });

  // Troca uma venda dentro da coleção (uma gravação só).
  const alterarVenda = (id, funcao) =>
    vendas.colecao.alterar(async (itens) => {
      const atual = itens.find((v) => v.id === id);
      if (!atual) throw new ErroValidacao("Esta venda não existe mais. Atualize a tela.");
      const nova = await funcao(atual, itens);
      return { itens: itens.map((v) => (v.id === id ? nova : v)), resultado: nova };
    });

  async function orcamentoPorId(id) {
    const o = (await orcamentos.listar()).find((x) => x.id === id);
    if (!o) throw new ErroValidacao("Este orçamento não existe mais.");
    return o;
  }

  return {
    vendas,
    despesas,

    async listar() {
      return { vendas: await vendas.listar(), despesas: await despesas.listar() };
    },

    salvarVenda: (valores, id) => vendas.salvar(valores, id),

    // Não exclui venda com recebimentos: o histórico de caixa ficaria errado.
    excluirVenda(id) {
      return vendas.colecao.alterar(async (itens) => {
        const v = itens.find((x) => x.id === id);
        if (!v) throw new ErroValidacao("Esta venda já foi excluída.");
        if (v.pagamentos.length) throw new ErroValidacao("Esta venda tem recebimentos. Ela não pode ser excluída.");
        return { itens: itens.filter((x) => x.id !== id), resultado: true };
      });
    },

    registrarPagamento: (id, pagamento) => alterarVenda(id, (v) => fin.registrarPagamento(v, pagamento, { id: randomUUID() })),

    definirProducao(id, producao) {
      if (!fin.PRODUCAO.includes(producao)) throw new ErroValidacao("Situação de produção inválida.");
      return alterarVenda(id, (v) => fin.validarVenda({ ...v, producao, atualizadoEm: new Date().toISOString() }));
    },

    salvarDespesa: (valores, id) => despesas.salvar(valores, id),
    excluirDespesa: (id) => despesas.excluir(id),

    // Cria ou atualiza a venda do orçamento conforme a resposta da janela de pagamento.
    // resposta: { modo: "pendente" | "parcial" | "integral" | "manter", valor, formas, data }
    // "manter" só atualiza valor e itens de uma venda que já existe (salvar de novo).
    async sincronizarOrcamento(orcamentoId, resposta) {
      const o = await orcamentoPorId(orcamentoId);
      return vendas.colecao.alterar(async (itens) => {
        const existente = itens.find((v) => v.orcamentoId === o.id) ?? null;
        if (!existente && (resposta?.modo ?? "manter") === "manter") return { itens, resultado: null };
        const total = fin.dadosDoOrcamento(o).valorCentavos;
        const venda = fin.sincronizarVendaDoOrcamento(o, existente, {
          recebidoTotalCentavos: recebidoDesejado(resposta, total, existente),
          formas: resposta?.formas,
          divisao: resposta?.divisao,
          data: resposta?.data,
          idPagamento: randomUUID(),
          idVenda: randomUUID(),
        });
        const novos = existente ? itens.map((v) => (v.id === existente.id ? venda : v)) : [...itens, venda];
        return { itens: novos, resultado: venda };
      });
    },

    // Orçamento antigo que já tinha uma venda lançada à mão (mesmo valor): liga os dois.
    async vincularOrcamento(orcamentoId, vendaId) {
      const o = await orcamentoPorId(orcamentoId);
      return vendas.colecao.alterar(async (itens) => {
        if (itens.some((v) => v.orcamentoId === o.id)) throw new ErroValidacao("Este orçamento já tem uma venda.");
        const v = itens.find((x) => x.id === vendaId);
        if (!v) throw new ErroValidacao("Esta venda não existe mais.");
        if (v.orcamentoId) throw new ErroValidacao("Esta venda já pertence a outro orçamento.");
        const dados = fin.dadosDoOrcamento(o);
        if (dados.valorCentavos !== v.valorCentavos) throw new ErroValidacao("A venda e o orçamento têm valores diferentes.");
        const ligada = fin.sincronizarVendaDoOrcamento(o, v, {});
        return { itens: itens.map((x) => (x.id === v.id ? ligada : x)), resultado: ligada };
      });
    },
  };
}

module.exports = { criarServicoFinanceiro };
