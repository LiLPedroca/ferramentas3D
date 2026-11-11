// Dados de teste: um cliente e um produto fictícios para experimentar orçamentos, PDF e pagamentos.
// Orçamentos e vendas do cliente de teste ficam marcados ("teste": true): numeração própria,
// marca "TESTE" no PDF e nada entra nos números da Gestão financeira.
"use strict";

const { montarCliente } = require("./cliente.cjs");
const { montarProduto } = require("./produto.cjs");

const CLIENTE_TESTE_ID = "cliente-teste";
const PRODUTO_TESTE_ID = "produto-teste";

// Dados claramente falsos (nunca dados de pessoas reais).
const VALORES_CLIENTE = {
  nome: "Cliente Teste",
  telefone: "00000000000",
  email: "teste@exemplo.com",
  documento: "",
  cidade: "Cidade Exemplo",
  observacoes: "Cliente fictício para testes. Os orçamentos e vendas dele não entram no financeiro.",
};

// Cálculo pronto: 50 g a R$ 120/kg, 2 h, 150 W, R$ 0,90/kWh, R$ 1,50/h de impressora,
// R$ 5 de mão de obra e 100% de lucro. Custo R$ 14,27; preço R$ 28,54.
function calculoTeste(data) {
  return {
    pesoG: "50",
    quantidade: 1,
    precoKg: "120",
    horas: "2",
    potenciaW: "150",
    tarifaKwh: "0.9",
    custoHora: "1.5",
    maoDeObra: "5",
    lucroPct: "100",
    custosCentavos: { filamento: "600", energia: "27", impressora: "300", maoDeObra: "500", total: "1427" },
    data,
  };
}

function clienteTeste({ anterior, agora = new Date().toISOString() } = {}) {
  return montarCliente(VALORES_CLIENTE, { id: CLIENTE_TESTE_ID, anterior: { ...anterior, teste: true }, agora });
}

function produtoTeste({ anterior, agora = new Date().toISOString() } = {}) {
  return montarProduto(
    {
      nome: "Peça teste",
      categoria: "",
      preco: "28,54",
      pesoG: "50",
      alturaMm: "40",
      larguraMm: "40",
      comprimentoMm: "40",
      observacoes: "Produto fictício para testes.",
      custo: { custoUnitarioCentavos: "1427", lucroPct: "100", data: agora, calculo: calculoTeste(agora) },
    },
    { id: PRODUTO_TESTE_ID, anterior: { criadoEm: anterior?.criadoEm, teste: true }, agora },
  );
}

// Troca (ou inclui) o item de teste numa lista, mantendo os outros como estão.
function comItem(lista, item) {
  return lista.some((x) => x.id === item.id) ? lista.map((x) => (x.id === item.id ? item : x)) : [...lista, item];
}

module.exports = { CLIENTE_TESTE_ID, PRODUTO_TESTE_ID, calculoTeste, clienteTeste, comItem, produtoTeste };
