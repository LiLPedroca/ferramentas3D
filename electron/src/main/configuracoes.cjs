// Serviço de configurações: ler e alterar, validando no processo principal.
"use strict";

const { Documento } = require("./armazenamento.cjs");
const { ConfiguracaoInvalida, aplicarAlteracao, normalizarGravado } = require("../core/configuracoes.cjs");

function criarServicoConfiguracoes(pasta) {
  const documento = new Documento(pasta, "configuracoes");
  return {
    async ler() {
      return normalizarGravado(await documento.ler());
    },
    salvar(alteracao) {
      return documento.alterarValor(async (atual) => {
        const novo = aplicarAlteracao(atual, alteracao);
        // Mantém campos que esta versão não conhece (vindos de versões futuras).
        return { novo: { ...atual, ...novo }, resultado: novo };
      });
    },
  };
}

async function responderConfig(promessa) {
  try {
    return { ok: true, dados: await promessa };
  } catch (erro) {
    const mensagem = erro instanceof ConfiguracaoInvalida ? erro.message : `Não foi possível concluir: ${erro.message}`;
    return { ok: false, erro: mensagem };
  }
}

module.exports = { criarServicoConfiguracoes, responderConfig };
