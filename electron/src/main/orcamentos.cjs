// Serviço de orçamentos: cadastro (com o cliente resolvido pelo processo principal) e PDF.
"use strict";

const { LIMITES, montarOrcamento, validarOrcamento } = require("../core/orcamento.cjs");
const { ErroValidacao } = require("../core/validacao.cjs");
const { criarServicoColecao } = require("./servico-colecao.cjs");

// Cópia dos dados do cliente no momento do orçamento.
function fotografiaCliente(c) {
  return { id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, documento: c.documento, cidade: c.cidade };
}

function criarServicoOrcamentos(pasta, { clientes }) {
  return criarServicoColecao(pasta, {
    nome: "orcamentos",
    rotulo: "orçamento",
    limite: LIMITES.orcamentos,
    validar: validarOrcamento,
    ordenar: (a, b) => b.numero - a.numero,
    async montar(valores, { id, anterior, itens }) {
      const v = valores ?? {};
      let cliente = null;
      const clienteId = typeof v.clienteId === "string" ? v.clienteId : "";
      if (clienteId) {
        const encontrado = (await clientes.listar()).find((c) => c.id === clienteId);
        if (encontrado) cliente = fotografiaCliente(encontrado);
        else if (anterior?.cliente?.id === clienteId) cliente = anterior.cliente; // cliente excluído depois
        else throw new ErroValidacao("O cliente escolhido não existe mais. Escolha outro.");
      } else if (String(v.clienteNome ?? "").trim()) {
        cliente = { nome: v.clienteNome, telefone: "", email: "", documento: "", cidade: "" };
      }
      return montarOrcamento({ ...v, cliente }, { id, anterior, existentes: itens });
    },
  });
}

module.exports = { criarServicoOrcamentos };
