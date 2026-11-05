// Estoque de filamentos: rolos com material, cor, preço por kg e peso restante
// (CommonJS: processo principal, tela e testes).
"use strict";

const { ErroValidacao, ID, dataValida, texto, textoLongo } = require("./validacao.cjs");
const { centavosDeTexto } = require("./produto.cjs");

const MATERIAIS = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Silk", "Outro"];
const LIMITES = { marca: 60, cor: 40, observacoes: 300, pesoG: 20_000, rolos: 1000 };
// rolo "acabando": menos de 15% ou menos de 100 g
const ALERTA_FRACAO = 0.15;
const ALERTA_GRAMAS = 100;

function gramas(valor, nome, { obrigatorio = true, maximo = LIMITES.pesoG } = {}) {
  const t = String(valor ?? "").trim().replace(",", ".");
  if (!t) {
    if (obrigatorio) throw new ErroValidacao(`Preencha o campo: ${nome}.`);
    return 0;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > maximo) throw new ErroValidacao(`${nome}: use de 0 a ${maximo.toLocaleString("pt-BR")} g.`);
  return Math.round(n * 10) / 10;
}

// valores: { marca, material, cor, corHex, pesoTotal, restante, precoKg, observacoes }
function montarFilamento(valores, { id, anterior, agora = new Date().toISOString() } = {}) {
  const v = valores ?? {};
  const material = MATERIAIS.includes(v.material) ? v.material : "PLA";
  const pesoTotalG = gramas(v.pesoTotal, "Peso do rolo");
  if (pesoTotalG <= 0) throw new ErroValidacao("Peso do rolo: informe o peso de filamento do rolo (ex.: 1000 g).");
  const restanteTexto = String(v.restante ?? "").trim();
  const restanteG = restanteTexto ? gramas(restanteTexto, "Restante") : pesoTotalG;
  if (restanteG > pesoTotalG) throw new ErroValidacao("Restante: não pode passar do peso do rolo.");
  const filamento = {
    id,
    marca: texto(v.marca, "Marca", LIMITES.marca),
    material,
    cor: texto(v.cor, "Cor", LIMITES.cor, { obrigatorio: true }),
    corHex: /^#[0-9a-f]{6}$/i.test(v.corHex ?? "") ? v.corHex.toLowerCase() : "#888888",
    pesoTotalG,
    restanteG,
    precoKgCentavos: centavosDeTexto(v.precoKg, "Preço por kg", { obrigatorio: true }),
    observacoes: textoLongo(v.observacoes, "Observações", LIMITES.observacoes),
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  validarFilamento(filamento);
  return filamento;
}

function validarFilamento(f) {
  if (!f || typeof f !== "object") throw new ErroValidacao("Filamento inválido.");
  if (typeof f.id !== "string" || !ID.test(f.id)) throw new ErroValidacao("Identificador inválido.");
  if (!MATERIAIS.includes(f.material)) throw new ErroValidacao("Material inválido.");
  texto(f.marca, "Marca", LIMITES.marca);
  texto(f.cor, "Cor", LIMITES.cor, { obrigatorio: true });
  if (!/^#[0-9a-f]{6}$/.test(f.corHex)) throw new ErroValidacao("Cor inválida.");
  for (const campo of ["pesoTotalG", "restanteG"]) {
    if (typeof f[campo] !== "number" || !Number.isFinite(f[campo]) || f[campo] < 0 || f[campo] > LIMITES.pesoG) throw new ErroValidacao("Peso inválido.");
  }
  if (f.pesoTotalG <= 0 || f.restanteG > f.pesoTotalG) throw new ErroValidacao("Peso inválido.");
  if (!/^\d{1,13}$/.test(String(f.precoKgCentavos))) throw new ErroValidacao("Preço inválido.");
  textoLongo(f.observacoes, "Observações", LIMITES.observacoes);
  if (!dataValida(f.criadoEm) || !dataValida(f.atualizadoEm)) throw new ErroValidacao("Data inválida.");
  return true;
}

// Desconta (ou devolve, com gramas negativas) filamento do rolo. Não deixa passar de 0 nem do total.
function descontar(f, gramasUsadas, agora = new Date().toISOString()) {
  const g = Number(gramasUsadas);
  if (!Number.isFinite(g) || Math.abs(g) > LIMITES.pesoG) throw new ErroValidacao("Quantidade de filamento inválida.");
  const restanteG = Math.round(Math.min(f.pesoTotalG, Math.max(0, f.restanteG - g)) * 10) / 10;
  return { ...f, restanteG, atualizadoEm: agora };
}

function acabando(f) {
  return f.restanteG < ALERTA_GRAMAS || f.restanteG < f.pesoTotalG * ALERTA_FRACAO;
}

// Valor do filamento que ainda está no rolo, em centavos (BigInt).
function valorRestanteCentavos(f) {
  return (BigInt(f.precoKgCentavos) * BigInt(Math.round(f.restanteG * 10))) / 10000n;
}

module.exports = { LIMITES, MATERIAIS, acabando, descontar, montarFilamento, validarFilamento, valorRestanteCentavos };
