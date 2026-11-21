// Sincronização com a nuvem (regras puras, sem rede): o que sobe, o que desce e como juntar.
// Cada item é comparado com o "base": o resumo (hash) do item na última sincronização.
//   - mudou só aqui      -> sobe
//   - mudou só na nuvem  -> desce
//   - mudou nos dois     -> fica o de "atualizadoEm" mais recente
// Nunca se perde dado: excluir num PC e editar no outro mantém a versão editada.
"use strict";

const { createHash } = require("node:crypto");

// Cadastros que vão para a nuvem (Minhas Impressões fica de fora: depende dos arquivos STL/3MF).
const COLECOES_NUVEM = ["produtos", "clientes", "orcamentos", "favoritos", "projetos", "filamentos", "vendas", "despesas"];

// Configurações que valem para a conta. Ficam de fora as do PC (fatiador, novidades já vistas...).
const CONFIG_NUVEM = ["nome", "nomePerguntado", "empresa", "orcamento", "calculadora", "categorias", "ultimoRecibo", "calibracoes", "medidasSalvas", "estoque"];

// Um documento do Firestore guarda no máximo 1 MiB. Itens maiores vão em partes.
const TAMANHO_PARTE = 700_000; // caracteres (com folga para acentos em UTF-8)

const resumo = (valor) => (valor === undefined ? undefined : createHash("sha1").update(JSON.stringify(valor)).digest("hex"));

function maisNovo(a, b) {
  const ta = typeof a === "string" ? a : "";
  const tb = typeof b === "string" ? b : "";
  return ta > tb;
}

// locais: itens do arquivo (com id). remotos: [{ id, item | null (excluído na nuvem) }].
// base: { id: hash }. validar(item) lança erro se o item for inválido.
// Devolve { itens, mudouLocal, base, enviar: [item], excluir: [id] }.
function mesclar({ locais, remotos, base, validar }) {
  const porId = new Map(locais.map((i) => [i.id, i]));
  const novaBase = { ...base };
  let mudouLocal = false;

  for (const r of remotos) {
    if (r.item) {
      try {
        validar(r.item);
        if (r.item.id !== r.id) throw new Error("id diferente");
      } catch {
        continue; // item estranho na nuvem: ignora, não mexe no que está aqui
      }
    }
    const local = porId.get(r.id);
    const hashLocal = resumo(local);
    const hashRemoto = r.item ? resumo(r.item) : undefined;
    const mudouAqui = hashLocal !== base[r.id];

    // A nuvem tem a mesma versão da última sincronização (releitura): nada novo lá.
    if (hashRemoto === base[r.id]) continue;

    if (hashLocal === hashRemoto) {
      if (hashRemoto === undefined) delete novaBase[r.id];
      else novaBase[r.id] = hashRemoto;
      continue;
    }

    let aplicar;
    if (!mudouAqui) aplicar = true;
    else if (!r.item) aplicar = false; // excluído lá, editado aqui: fica a edição
    else if (!local) aplicar = true; // excluído aqui, existe lá: volta (nada se perde)
    else if (maisNovo(r.item.atualizadoEm, local.atualizadoEm)) aplicar = true;
    // Empate (ou sem data, como nas configurações): no primeiro contato vale a nuvem,
    // senão um PC novo, com tudo no padrão, apagaria o que a conta já tem.
    else aplicar = base[r.id] === undefined && !maisNovo(local.atualizadoEm, r.item.atualizadoEm);

    if (!aplicar) continue;
    if (r.item) porId.set(r.id, r.item);
    else porId.delete(r.id);
    if (hashRemoto === undefined) delete novaBase[r.id];
    else novaBase[r.id] = hashRemoto;
    mudouLocal = true;
  }

  // Mantém a ordem do arquivo; itens novos vindos da nuvem entram no fim.
  const itens = [];
  for (const i of locais) if (porId.has(i.id)) itens.push(porId.get(i.id));
  const jaListados = new Set(itens.map((i) => i.id));
  for (const [id, item] of porId) if (!jaListados.has(id)) itens.push(item);

  const enviar = itens.filter((i) => resumo(i) !== novaBase[i.id]);
  const excluir = Object.keys(novaBase).filter((id) => !porId.has(id));
  return { itens, mudouLocal, base: novaBase, enviar, excluir };
}

// Configurações viram "itens" (um por chave), para usar a mesma junção.
function configParaItens(config) {
  return CONFIG_NUVEM.filter((c) => config[c] !== undefined).map((c) => ({ id: c, valor: config[c] }));
}

function itensParaConfig(itens) {
  const config = {};
  for (const i of itens) if (CONFIG_NUVEM.includes(i.id)) config[i.id] = i.valor;
  return config;
}

function validarItemConfig(item) {
  if (!item || typeof item !== "object" || !CONFIG_NUVEM.includes(item.id) || !("valor" in item)) throw new Error("Configuração inválida.");
}

// Texto JSON -> partes de até TAMANHO_PARTE caracteres.
function dividir(texto) {
  const partes = [];
  for (let i = 0; i < texto.length; i += TAMANHO_PARTE) partes.push(texto.slice(i, i + TAMANHO_PARTE));
  return partes.length ? partes : [""];
}

module.exports = {
  COLECOES_NUVEM,
  CONFIG_NUVEM,
  TAMANHO_PARTE,
  configParaItens,
  dividir,
  itensParaConfig,
  mesclar,
  resumo,
  validarItemConfig,
};
