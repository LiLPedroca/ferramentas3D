// Serviço genérico para cadastros em lista (produtos, clientes, orçamentos...):
// listar, salvar (criar ou editar) e excluir, sempre validando no processo principal.
"use strict";

const { randomUUID } = require("node:crypto");
const { Colecao } = require("./armazenamento.cjs");
const { ErroValidacao } = require("../core/validacao.cjs");

// opcoes: { nome, montar(valores, { id, anterior }), validar(item), limite, ordenar(a, b), rotulo }
function criarServicoColecao(pasta, opcoes) {
  const colecao = new Colecao(pasta, opcoes.nome);
  const rotulo = opcoes.rotulo ?? "item";
  const valido = (item) => {
    try {
      opcoes.validar(item);
      return true;
    } catch {
      return false;
    }
  };

  return {
    colecao,

    // Itens inválidos ficam no arquivo (não são apagados), mas não aparecem na tela.
    async listar() {
      const itens = (await colecao.ler()).filter(valido);
      return opcoes.ordenar ? itens.sort(opcoes.ordenar) : itens;
    },

    salvar(valores, id) {
      return colecao.alterar(async (itens) => {
        const anterior = id ? itens.find((p) => p.id === id) : undefined;
        if (id && !anterior) throw new ErroValidacao(`Este ${rotulo} não existe mais. Atualize a lista.`);
        if (!id && itens.length >= opcoes.limite) {
          throw new ErroValidacao(`Limite de ${opcoes.limite} itens atingido.`);
        }
        const item = await opcoes.montar(valores, { id: id ?? randomUUID(), anterior, itens });
        const novos = anterior ? itens.map((p) => (p.id === id ? item : p)) : [...itens, item];
        return { itens: novos, resultado: item };
      });
    },

    excluir(id) {
      return colecao.alterar(async (itens) => {
        if (!itens.some((p) => p.id === id)) throw new ErroValidacao(`Este ${rotulo} já foi excluído.`);
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
    const mensagem = erro instanceof ErroValidacao ? erro.message : `Não foi possível concluir: ${erro.message}`;
    return { ok: false, erro: mensagem };
  }
}

const maisRecentePrimeiro = (a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm);

module.exports = { criarServicoColecao, maisRecentePrimeiro, responder };
