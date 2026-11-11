// Arquivo de backup: todos os dados do usuário num único JSON, e a leitura segura dele.
"use strict";

const { ErroValidacao } = require("./validacao.cjs");
const { validarProduto } = require("./produto.cjs");
const { validarCliente } = require("./cliente.cjs");
const { validarOrcamento } = require("./orcamento.cjs");
const { normalizarGravado } = require("./configuracoes.cjs");
const { validarFavorito } = require("./stl.cjs");
const { validarProjeto } = require("./projeto.cjs");
const { validarFilamento } = require("./filamento.cjs");
const { validarDespesa, validarVenda } = require("./financeiro.cjs");
const { validarImpressao } = require("./impressao.cjs");

const TIPO = "programa-ferramentas-3d-backup";

const COLECOES = {
  produtos: validarProduto,
  clientes: validarCliente,
  orcamentos: validarOrcamento,
  favoritos: validarFavorito,
  projetos: validarProjeto,
  filamentos: validarFilamento,
  vendas: validarVenda,
  despesas: validarDespesa,
  impressoes: validarImpressao,
};

const ROTULOS = { produtos: "produtos", clientes: "clientes", orcamentos: "orçamentos", favoritos: "favoritos de STL", projetos: "modelos salvos", filamentos: "rolos de filamento", vendas: "vendas", despesas: "despesas", impressoes: "impressões" };

// dados: { produtos: [], clientes: [], orcamentos: [], configuracoes: {} }
function montarBackup(dados, { versaoApp, agora = new Date().toISOString() }) {
  return {
    tipo: TIPO,
    versao: 1,
    criadoEm: agora,
    versaoApp: String(versaoApp ?? ""),
    dados: {
      produtos: dados.produtos ?? [],
      clientes: dados.clientes ?? [],
      orcamentos: dados.orcamentos ?? [],
      favoritos: dados.favoritos ?? [],
      projetos: dados.projetos ?? [],
      filamentos: dados.filamentos ?? [],
      vendas: dados.vendas ?? [],
      despesas: dados.despesas ?? [],
      impressoes: dados.impressoes ?? [],
      configuracoes: dados.configuracoes ?? {},
    },
  };
}

function valido(validar, item) {
  try {
    validar(item);
    return true;
  } catch {
    return false;
  }
}

// Lê o texto de um backup. Itens inválidos são descartados e contados.
// Devolve { dados, resumo: { produtos, clientes, orcamentos, criadoEm, versaoApp }, descartados }.
function lerBackup(texto) {
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErroValidacao("Este arquivo não é um backup válido.");
  }
  if (!json || json.tipo !== TIPO || typeof json.dados !== "object" || json.dados === null) {
    throw new ErroValidacao("Este arquivo não é um backup do Programa Ferramentas 3D.");
  }
  if (json.versao !== 1) throw new ErroValidacao("Este backup é de uma versão mais nova do programa. Atualize antes de restaurar.");

  const dados = {};
  const resumo = {
    criadoEm: typeof json.criadoEm === "string" ? json.criadoEm : "",
    versaoApp: typeof json.versaoApp === "string" ? json.versaoApp : "",
  };
  let descartados = 0;
  const ausentes = [];
  for (const [nome, validar] of Object.entries(COLECOES)) {
    // Backup de uma versão que ainda não tinha este cadastro: ao restaurar, ele fica como está.
    if (!(nome in json.dados)) ausentes.push(nome);
    const lista = Array.isArray(json.dados[nome]) ? json.dados[nome] : [];
    const bons = lista.filter((item) => valido(validar, item));
    descartados += lista.length - bons.length;
    // ids repetidos: fica o primeiro
    const vistos = new Set();
    dados[nome] = bons.filter((item) => (vistos.has(item.id) ? false : vistos.add(item.id)));
    descartados += bons.length - dados[nome].length;
    resumo[nome] = dados[nome].length;
  }
  dados.configuracoes = normalizarGravado(json.dados.configuracoes);
  return { dados, resumo, descartados, ausentes };
}

// "Backup-Ferramentas3D-2026-11-04-0215.json"
function nomeBackup(prefixo, agora = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${prefixo}-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}.json`;
}

module.exports = { COLECOES, ROTULOS, TIPO, lerBackup, montarBackup, nomeBackup };
