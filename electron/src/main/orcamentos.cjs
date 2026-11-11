// Serviço de orçamentos: cadastro (com o cliente resolvido pelo processo principal) e PDF.
"use strict";

const { LIMITES, SITUACOES, montarOrcamento, validarOrcamento } = require("../core/orcamento.cjs");
const { documentoDeTexto, emailDeTexto, telefoneDeTexto } = require("../core/cliente.cjs");
const { ErroValidacao } = require("../core/validacao.cjs");
const { criarServicoColecao } = require("./servico-colecao.cjs");

// Cópia dos dados do cliente no momento do orçamento.
function fotografiaCliente(c) {
  return { id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, documento: c.documento, cidade: c.cidade };
}

// Cliente preenchido na tela (cadastrado e/ou digitado). Os campos digitados valem para este orçamento.
function clienteDoFormulario(dados) {
  const c = dados && typeof dados === "object" ? dados : {};
  if (!String(c.nome ?? "").trim()) return null;
  const cliente = {
    nome: c.nome,
    telefone: telefoneDeTexto(c.telefone),
    email: emailDeTexto(c.email),
    documento: documentoDeTexto(c.documento),
    cidade: String(c.cidade ?? ""),
  };
  if (String(c.endereco ?? "").trim()) cliente.endereco = c.endereco;
  return cliente;
}

function criarServicoOrcamentos(pasta, { clientes, configuracoes }) {
  const servico = criarServicoColecao(pasta, {
    nome: "orcamentos",
    rotulo: "orçamento",
    limite: LIMITES.orcamentos,
    validar: validarOrcamento,
    ordenar: (a, b) => b.numero - a.numero,
    async montar(valores, { id, anterior, itens }) {
      const v = valores ?? {};
      let cliente = null;
      const clienteId = typeof v.clienteId === "string" ? v.clienteId : "";
      const cadastrado = clienteId ? (await clientes.listar()).find((c) => c.id === clienteId) : undefined;
      if (clienteId && !cadastrado && anterior?.cliente?.id !== clienteId) {
        throw new ErroValidacao("O cliente escolhido não existe mais. Escolha outro.");
      }
      if (v.cliente && typeof v.cliente === "object") {
        cliente = clienteDoFormulario(v.cliente);
        if (cliente && clienteId) cliente.id = clienteId;
      } else if (cadastrado) cliente = fotografiaCliente(cadastrado);
      else if (clienteId) cliente = anterior.cliente; // cliente excluído depois
      else if (String(v.clienteNome ?? "").trim()) {
        cliente = { nome: v.clienteNome, telefone: "", email: "", documento: "", cidade: "" };
      }
      const config = configuracoes ? await configuracoes.ler() : null;
      const proximoNumero = config?.orcamento?.proximoNumero ?? 1;
      return montarOrcamento({ ...v, cliente, proximoNumero }, { id, anterior, existentes: itens });
    },
  });

  // Muda só a situação (ex.: cancelar um orçamento antigo na revisão do financeiro).
  servico.definirSituacao = (id, situacao) => {
    if (!SITUACOES.includes(situacao)) throw new ErroValidacao("Situação inválida.");
    return servico.colecao.alterar(async (itens) => {
      const o = itens.find((x) => x.id === id);
      if (!o) throw new ErroValidacao("Este orçamento não existe mais.");
      const novo = validarOrcamento({ ...o, situacao, atualizadoEm: new Date().toISOString() });
      return { itens: itens.map((x) => (x.id === id ? novo : x)), resultado: novo };
    });
  };
  return servico;
}

module.exports = { criarServicoOrcamentos };
