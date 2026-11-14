// Estoque de filamentos: rolos com marca, material, cor (as cores prontas), peso do rolo, preço do
// rolo, quanto resta, rolos fechados iguais e a posição na impressora (CommonJS: processo principal,
// tela e testes).
"use strict";

const { ErroValidacao, ID, dataValida } = require("./validacao.cjs");
const { centavosDeTexto } = require("./produto.cjs");
const { CORES, MATERIAIS } = require("./impressao.cjs");

const MARCAS = ["Sunlu", "Masterprint", "Voolt3D", "Bambu Lab", "Elegoo", "Soleyin", "Multfila"];
const IDS_CORES = new Set(CORES.map((c) => c.id));
const LIMITES = { pesoG: 20_000, rolos: 1000, fechados: 999, posicoes: 4 };
// rolo "acabando": menos de 15% ou menos de 100 g
const ALERTA_FRACAO = 0.15;
const ALERTA_GRAMAS = 100;
const CARRETEL_PADRAO_G = 250; // carretel vazio típico (o usuário corrige pela balança)

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

function posicaoDe(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > LIMITES.posicoes) throw new ErroValidacao("Posição na impressora inválida.");
  return n;
}

// valores (da tela): { marca, material, cor (id), peso (g do rolo cheio), preco (R$ do rolo), restante?, fechados?, posicao? }
// Rolo novo começa cheio. Ao editar, o que resta é mantido (e não passa do peso do rolo).
function montarFilamento(valores, { id, anterior, agora = new Date().toISOString() } = {}) {
  const v = valores ?? {};
  if (!MARCAS.includes(v.marca)) throw new ErroValidacao("Escolha a marca.");
  if (!MATERIAIS.includes(v.material)) throw new ErroValidacao("Escolha o material.");
  if (!IDS_CORES.has(v.cor)) throw new ErroValidacao("Escolha a cor.");
  const pesoTotalG = gramas(v.peso, "Peso do rolo");
  if (pesoTotalG <= 0) throw new ErroValidacao("Peso do rolo: informe o peso de filamento do rolo (ex.: 1000 g).");
  const precoCentavos = centavosDeTexto(v.preco, "Preço do rolo", { obrigatorio: true });
  if (precoCentavos === "0") throw new ErroValidacao("Preço do rolo: informe quanto você pagou no rolo.");
  const restanteTexto = String(v.restante ?? "").trim();
  let restanteG = restanteTexto ? gramas(restanteTexto, "Restante") : (anterior?.restanteG ?? pesoTotalG);
  if (!anterior && !restanteTexto) restanteG = pesoTotalG;
  restanteG = Math.min(restanteG, pesoTotalG);
  const fechados = v.fechados === undefined ? (anterior?.fechados ?? 0) : Number(v.fechados);
  if (!Number.isInteger(fechados) || fechados < 0 || fechados > LIMITES.fechados) throw new ErroValidacao("Rolos fechados: use de 0 a 999.");
  const filamento = {
    id,
    marca: v.marca,
    material: v.material,
    cor: v.cor,
    pesoTotalG,
    restanteG,
    precoCentavos,
    fechados,
    posicao: v.posicao === undefined ? (anterior?.posicao ?? null) : posicaoDe(v.posicao),
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  validarFilamento(filamento);
  return filamento;
}

function validarFilamento(f) {
  if (!f || typeof f !== "object") throw new ErroValidacao("Filamento inválido.");
  if (typeof f.id !== "string" || !ID.test(f.id)) throw new ErroValidacao("Identificador inválido.");
  if (!MARCAS.includes(f.marca)) throw new ErroValidacao("Marca inválida.");
  if (!MATERIAIS.includes(f.material)) throw new ErroValidacao("Material inválido.");
  if (!IDS_CORES.has(f.cor)) throw new ErroValidacao("Cor inválida.");
  for (const campo of ["pesoTotalG", "restanteG"]) {
    if (typeof f[campo] !== "number" || !Number.isFinite(f[campo]) || f[campo] < 0 || f[campo] > LIMITES.pesoG) throw new ErroValidacao("Peso inválido.");
  }
  if (f.pesoTotalG <= 0 || f.restanteG > f.pesoTotalG) throw new ErroValidacao("Peso inválido.");
  if (!/^\d{1,13}$/.test(String(f.precoCentavos))) throw new ErroValidacao("Preço inválido.");
  if (!Number.isInteger(f.fechados) || f.fechados < 0 || f.fechados > LIMITES.fechados) throw new ErroValidacao("Rolos fechados inválidos.");
  if (f.posicao !== null) posicaoDe(f.posicao);
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

// Pesou na balança: o que a balança mostra (com o carretel) menos o carretel vazio.
function pesar(f, balancaG, carretelG, agora = new Date().toISOString()) {
  const bruto = gramas(balancaG, "Peso na balança");
  const carretel = gramas(carretelG, "Carretel vazio", { maximo: 2000 });
  if (bruto < carretel) throw new ErroValidacao("A balança mostrou menos que o carretel vazio. Confira os dois pesos.");
  return { ...f, restanteG: Math.round(Math.min(f.pesoTotalG, bruto - carretel) * 10) / 10, atualizadoEm: agora };
}

// Abriu um dos rolos fechados iguais: um fechado a menos e o rolo volta cheio.
function abrirRoloNovo(f, agora = new Date().toISOString()) {
  if (f.fechados < 1) throw new ErroValidacao("Não há rolo fechado igual a este.");
  return { ...f, fechados: f.fechados - 1, restanteG: f.pesoTotalG, atualizadoEm: agora };
}

function acabando(f) {
  return f.restanteG < ALERTA_GRAMAS || f.restanteG < f.pesoTotalG * ALERTA_FRACAO;
}

// Preço por kg (centavos, BigInt arredondado): preço do rolo ÷ peso do rolo cheio.
function precoKgCentavos(f) {
  const p = BigInt(f.precoCentavos) * 10000n;
  const peso = BigInt(Math.round(f.pesoTotalG * 10));
  return (p + peso / 2n) / peso;
}

// Valor do filamento que ainda está no estoque (rolo aberto + fechados), em centavos (BigInt).
function valorEmEstoqueCentavos(f) {
  const peso = BigInt(Math.round(f.pesoTotalG * 10));
  const aberto = (BigInt(f.precoCentavos) * BigInt(Math.round(f.restanteG * 10))) / peso;
  return aberto + BigInt(f.precoCentavos) * BigInt(f.fechados);
}

// Gramas no estoque (rolo aberto + fechados).
const gramasEmEstoque = (f) => f.restanteG + f.pesoTotalG * f.fechados;

// Cor pronta mais perto de um hex (cor de filamento lida do 3MF). Transparente fica de fora.
function corProntaDoHex(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex ?? ""));
  if (!m) return null;
  const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  let melhor = null;
  let menor = Infinity;
  for (const cor of CORES) {
    if (!cor.hex) continue;
    const k = [1, 3, 5].map((i) => parseInt(cor.hex.slice(i, i + 2), 16));
    const r = (c[0] + k[0]) / 2;
    const d = (2 + r / 256) * (c[0] - k[0]) ** 2 + 4 * (c[1] - k[1]) ** 2 + (2 + (255 - r) / 256) * (c[2] - k[2]) ** 2;
    if (d < menor) {
      menor = d;
      melhor = cor.id;
    }
  }
  return melhor;
}

// De qual rolo sai cada uso. usos: [{ cor, material?, gramas, posicao? }].
// Ordem de preferência: o rolo carregado na impressora com a mesma cor (e material, se informado);
// depois qualquer rolo dessa cor e material com filamento; por último a mesma cor em outro material.
// uso.posicao: sai do rolo dessa posição (sem saber a cor). Devolve { itens: [{ id, gramas }], semRolo: [uso] }.
function planejarDesconto(rolos, usos) {
  const itens = [];
  const semRolo = [];
  const somar = (id, g) => {
    const ja = itens.find((i) => i.id === id);
    if (ja) ja.gramas = Math.round((ja.gramas + g) * 10) / 10;
    else itens.push({ id, gramas: Math.round(g * 10) / 10 });
  };
  for (const uso of usos) {
    if (!(uso.gramas > 0)) continue;
    let rolo = null;
    if (uso.posicao) rolo = rolos.find((f) => f.posicao === uso.posicao) ?? null;
    else {
      const daCor = rolos.filter((f) => f.cor === uso.cor);
      const doMaterial = uso.material ? daCor.filter((f) => f.material === uso.material) : daCor;
      const ordem = (lista) => [...lista].sort((a, b) => (b.posicao !== null) - (a.posicao !== null) || (b.restanteG > 0) - (a.restanteG > 0) || a.restanteG - b.restanteG);
      rolo = ordem(doMaterial)[0] ?? ordem(daCor)[0] ?? null;
    }
    if (rolo) somar(rolo.id, uso.gramas);
    else semRolo.push(uso);
  }
  return { itens, semRolo };
}

module.exports = {
  CARRETEL_PADRAO_G, LIMITES, MARCAS, MATERIAIS,
  abrirRoloNovo, acabando, corProntaDoHex, descontar, gramasEmEstoque, montarFilamento, pesar, planejarDesconto,
  precoKgCentavos, validarFilamento, valorEmEstoqueCentavos,
};
