// Levar produtos de um PC para outro: exportar todos num arquivo e importar juntando (nunca apaga).
// Em CommonJS porque roda no processo principal (que grava) e nos testes.
"use strict";

const { ErroValidacao } = require("./validacao.cjs");
const { LIMITES, validarProduto } = require("./produto.cjs");

const TIPO = "produtos-ferramentas3d";

// Produtos de teste (dados de exemplo) não viajam.
function montarPacoteProdutos(produtos, agora = new Date().toISOString()) {
  return { tipo: TIPO, versao: 1, exportadoEm: agora, produtos: produtos.filter((p) => p.teste !== true) };
}

// Texto do arquivo -> produtos válidos. Itens inválidos são pulados e contados.
function lerPacoteProdutos(texto) {
  let json;
  try {
    json = JSON.parse(String(texto).replace(/^﻿/, ""));
  } catch {
    throw new ErroValidacao("Este arquivo não é de produtos do Programa Ferramentas 3D.");
  }
  if (!json || json.tipo !== TIPO || !Array.isArray(json.produtos)) {
    throw new ErroValidacao("Este arquivo não é de produtos do Programa Ferramentas 3D.");
  }
  if (json.versao !== 1) throw new ErroValidacao("Este arquivo é de uma versão mais nova do programa. Atualize antes de importar.");
  const produtos = [];
  let invalidos = 0;
  const vistos = new Set();
  for (const p of json.produtos) {
    try {
      validarProduto(p);
      if (p.teste === true || vistos.has(p.id)) throw new Error();
      vistos.add(p.id);
      produtos.push(p);
    } catch {
      invalidos++;
    }
  }
  return { produtos, invalidos };
}

// Nome para comparar: sem maiúsculas, acentos e espaços extras.
const chaveDoNome = (nome) =>
  String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// O que a importação faria. novos: entram; atualizar: mesmo id, importado mais recente;
// mesmoNome: id diferente mas nome igual a um produto daqui (pergunta ao usuário); iguais: nada a fazer.
function planejarImportacao(atuais, importados) {
  const porId = new Map(atuais.map((p) => [p.id, p]));
  const porNome = new Map();
  for (const p of atuais) if (!porNome.has(chaveDoNome(p.nome))) porNome.set(chaveDoNome(p.nome), p);
  const plano = { novos: [], atualizar: [], mesmoNome: [], iguais: 0 };
  for (const p of importados) {
    const atual = porId.get(p.id);
    if (atual) {
      if (Date.parse(p.atualizadoEm) > Date.parse(atual.atualizadoEm)) plano.atualizar.push(p);
      else plano.iguais++;
      continue;
    }
    const xara = porNome.get(chaveDoNome(p.nome));
    if (xara) plano.mesmoNome.push({ importado: p, atual: xara });
    else plano.novos.push(p);
  }
  return plano;
}

// Aplica o plano. escolha (para os de mesmo nome): "atualizar" troca o conteúdo do produto daqui pelo
// importado (mantém o id daqui, usado nos orçamentos); "manter" adiciona o importado como outro produto.
// Itens inválidos que já estavam no arquivo ficam como estão (nunca apaga).
function aplicarImportacao(atuais, plano, escolha = "manter") {
  const lista = atuais.map((p) => ({ ...p }));
  const indice = new Map(lista.map((p, i) => [p.id, i]));
  let novos = 0;
  let atualizados = 0;
  for (const p of plano.atualizar) {
    lista[indice.get(p.id)] = validarProduto({ ...p, ...(lista[indice.get(p.id)].teste ? { teste: true } : {}) });
    atualizados++;
  }
  const entrar = [...plano.novos];
  for (const { importado, atual } of plano.mesmoNome) {
    if (escolha === "atualizar") {
      const i = indice.get(atual.id);
      lista[i] = validarProduto({ ...importado, id: atual.id, criadoEm: atual.criadoEm });
      atualizados++;
    } else entrar.push(importado);
  }
  if (lista.length + entrar.length > LIMITES.produtos) {
    throw new ErroValidacao(`Limite de ${LIMITES.produtos} produtos atingido. Nada foi importado.`);
  }
  for (const p of entrar) {
    lista.push(validarProduto(p));
    novos++;
  }
  return { produtos: lista, novos, atualizados };
}

module.exports = { aplicarImportacao, chaveDoNome, lerPacoteProdutos, montarPacoteProdutos, planejarImportacao };
