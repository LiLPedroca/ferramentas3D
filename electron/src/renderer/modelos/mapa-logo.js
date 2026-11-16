// Criador de logos: a imagem vira um "mapa" de pixels, cada um com uma das cores prontas (as 13 com
// tinta de Minhas Impressões) ou vazio (-1, fundo recortado).
//
// As "cores do logo" são cores-alvo: { cor (índice em CORES_LOGO), ref (a cor ORIGINAL da imagem que
// ela representa) }. Cada pixel do recorte vai para o alvo cuja ref é mais perto da cor original dele.
// Tirar um alvo manda os pixels para o alvo restante mais parecido; pôr um alvo pega os pixels mais
// perto dele. O que foi corrigido à mão (máscara "manual") não muda quando os alvos mudam.
import modeloImpressao from "../../core/impressao.cjs";
import { areaDoLaco, caminhoSvg, contornos, corDoFundo, curvasDoLaco, escolherPaleta } from "../vetorizar.js";

// Só as cores com tinta (Transparente fica de fora: não dá para imprimir "transparente" num logo).
export const CORES_LOGO = modeloImpressao.CORES.filter((c) => c.hex);
export const VAZIO = -1;
const RGB = CORES_LOGO.map((c) => [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16)));
export const rgbDaCor = (i) => RGB[i].slice();

// Distância "redmean": aproxima a percepção humana melhor que o RGB puro.
function distancia(a, b) {
  const r = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db;
}

// Índice (em CORES_LOGO) da cor pronta mais próxima.
export function corMaisProxima(rgb) {
  let melhor = 0;
  let menor = Infinity;
  RGB.forEach((c, i) => {
    const d = distancia(rgb, c);
    if (d < menor) {
      menor = d;
      melhor = i;
    }
  });
  return melhor;
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const LIMIAR_FUNDO = 42; // distância (RGB) até a cor do fundo para o pixel contar como fundo

// ---------- Fundo ----------
// imagem: { width, height, data (RGBA) }. Devolve { vazio: Uint8Array (1 = sai), fundo: [r, g, b] | null }.
// Pixel transparente sempre sai. Com tirarFundo, sai também o que tem a cor da borda da imagem: só o que
// está ligado à borda (padrão) ou, com areasInternas, também o que ficou preso dentro do logo.
export function mascaraDoFundo(imagem, { tirarFundo = true, areasInternas = false } = {}) {
  const { width: w, height: h, data } = imagem;
  const n = w * h;
  const vazio = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (data[p * 4 + 3] < 128) vazio[p] = 1;
  const fundo = tirarFundo ? corDoFundo(data, w, h) : null;
  if (!fundo) return { vazio, fundo: null };
  const [f0, f1, f2] = fundo;
  const limite = LIMIAR_FUNDO ** 2;
  const pareceFundo = (p) => {
    const i = p * 4;
    if (data[i + 3] < 128) return false;
    const d0 = data[i] - f0;
    const d1 = data[i + 1] - f1;
    const d2 = data[i + 2] - f2;
    return d0 * d0 + d1 * d1 + d2 * d2 < limite;
  };
  // só o fundo ligado à borda da imagem (ou a áreas transparentes ligadas a ela)
  const visto = new Uint8Array(n);
  const pilha = [];
  const tentar = (p) => {
    if (visto[p]) return;
    if (vazio[p] || pareceFundo(p)) {
      visto[p] = 1;
      vazio[p] = 1;
      pilha.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    tentar(x);
    tentar((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    tentar(y * w);
    tentar(y * w + w - 1);
  }
  while (pilha.length) {
    const p = pilha.pop();
    const x = p % w;
    if (x > 0) tentar(p - 1);
    if (x < w - 1) tentar(p + 1);
    if (p >= w) tentar(p - w);
    if (p < n - w) tentar(p + w);
  }
  // áreas internas: o fundo preso dentro do logo também sai, marcado com 2 (vira furo na base)
  if (areasInternas) for (let p = 0; p < n; p++) if (!vazio[p] && pareceFundo(p)) vazio[p] = 2;
  return { vazio, fundo };
}

// Furos que atravessam a peça: o que foi apagado à mão e as áreas internas removidas (vazio = 2).
// Sem isso, a base (estilo Contorno) tapa os vãos de dentro e o apagado continua aparecendo na cor dela.
export function mascaraDeFuros(mapa, vazio, manual) {
  const n = mapa.idx.length;
  const furos = new Uint8Array(n);
  let algum = false;
  for (let p = 0; p < n; p++) {
    if (mapa.idx[p] !== VAZIO) continue;
    if ((manual && manual[p]) || (vazio && vazio[p] === 2 && !(manual && manual[p]))) {
      furos[p] = 1;
      algum = true;
    }
  }
  return algum ? furos : null;
}

// Cor que marca os furos no SVG (não é cor pronta).
export const COR_FURO = "#ff00ff";

// ---------- Cores-alvo ----------
// Distância do ponto c ao segmento a-b, e onde ele cai (t de 0 a 1).
function noSegmento(c, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ab2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  if (!ab2) return { t: 0, d: Math.sqrt(dist2(c, a)) };
  const t = ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / ab2;
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return { t, d: Math.sqrt(dist2(c, q)) };
}

// Acha as cores do logo sozinho (sem perguntar quantas): agrupa as cores da imagem, cada grupo vira a
// cor pronta mais próxima, grupos da mesma cor pronta se juntam e os tons de borda (mistura de duas
// cores, como o cinza entre o preto e o branco) e manchas ínfimas ficam de fora.
export function coresAutomaticas(imagem, vazio, fundo = null) {
  const { width: w, height: h, data } = imagem;
  // amostra de 1 a cada 4 pixels (2×2): a paleta sai igual e bem mais rápido
  const ws = Math.ceil(w / 2);
  const hs = Math.ceil(h / 2);
  const so = new Uint8ClampedArray(ws * hs * 4);
  let total = 0;
  for (let y = 0; y < hs; y++) {
    for (let x = 0; x < ws; x++) {
      const p = y * 2 * w + x * 2;
      const q = y * ws + x;
      if (vazio[p]) continue;
      so[q * 4] = data[p * 4];
      so[q * 4 + 1] = data[p * 4 + 1];
      so[q * 4 + 2] = data[p * 4 + 2];
      so[q * 4 + 3] = 255;
      total++;
    }
  }
  if (!total) return [];
  const paleta = escolherPaleta(so, ws, hs, 10);
  if (!paleta.length) return [];
  const contagem = new Float64Array(paleta.length);
  const k3 = paleta.length;
  for (let q = 0; q < ws * hs; q++) {
    const i = q * 4;
    if (!so[i + 3]) continue;
    let k = 0;
    let menor = Infinity;
    for (let j = 0; j < k3; j++) {
      const c = paleta[j];
      const d0 = so[i] - c[0];
      const d1 = so[i + 1] - c[1];
      const d2 = so[i + 2] - c[2];
      const d = d0 * d0 + d1 * d1 + d2 * d2;
      if (d < menor) {
        menor = d;
        k = j;
      }
    }
    contagem[k]++;
  }
  const grupos = paleta.map((cor, k) => ({ cor, n: contagem[k] })).filter((g) => g.n > 0).sort((a, b) => b.n - a.n);
  const aceitos = []; // { cor (pronta), ref, n }
  for (const g of grupos) {
    const parte = g.n / total;
    if (parte < 0.004) continue; // manchinha: vira a cor vizinha
    // tom de borda: fica "no meio do caminho" entre duas cores já aceitas (ou uma delas e o fundo)
    const refs = aceitos.map((a) => a.ref);
    if (fundo) refs.push(fundo);
    let mistura = false;
    for (let a = 0; a < refs.length && !mistura; a++) {
      for (let b = a + 1; b < refs.length && !mistura; b++) {
        const { t, d } = noSegmento(g.cor, refs[a], refs[b]);
        if (t > 0.12 && t < 0.88 && d < 28 && parte < 0.08) mistura = true;
      }
    }
    if (mistura) continue;
    if (parte < 0.015 && aceitos.length) {
      // pequena e parecida com uma cor já aceita: é a mesma cor (sombra, JPEG)
      if (aceitos.some((a) => dist2(a.ref, g.cor) < 50 ** 2)) continue;
    }
    const pronta = corMaisProxima(g.cor);
    const igual = aceitos.find((a) => a.cor === pronta);
    if (igual) {
      const soma = igual.n + g.n;
      igual.ref = igual.ref.map((v, i) => (v * igual.n + g.cor[i] * g.n) / soma);
      igual.n = soma;
    } else {
      aceitos.push({ cor: pronta, ref: g.cor.slice(), n: g.n });
    }
  }
  if (!aceitos.length && grupos.length) aceitos.push({ cor: corMaisProxima(grupos[0].cor), ref: grupos[0].cor.slice(), n: grupos[0].n });
  return aceitos.map(({ cor, ref }) => ({ cor, ref: ref.map(Math.round) }));
}

// Alvo novo pelo botão "+ Cor": representa a própria cor pronta.
export const alvoDaCor = (cor) => ({ cor, ref: rgbDaCor(cor) });

// Borda com o fundo: pixels encostados no que saiu e que são mistura do fundo com uma cor do logo
// (meio-tom do serrilhado) saem também, se puxam mais para o fundo, ou ficam com aquela cor. Sem isso,
// um logo preto em fundo branco ganha um contorno branco fininho. Repete para bordas largas (imagem ampliada).
function limparBordaDoFundo(imagem, idx, alvos, fundo) {
  const { width: w, data } = imagem;
  const refs = alvos.map((a) => a.ref);
  const longe = refs.map((r) => dist2(r, fundo) > 60 * 60);
  for (let volta = 0; volta < 8; volta++) {
    const mudar = [];
    for (let p = 0; p < idx.length; p++) {
      if (idx[p] === VAZIO) continue;
      const x = p % w;
      const encosta = (x > 0 && idx[p - 1] === VAZIO) || (x < w - 1 && idx[p + 1] === VAZIO) || (p >= w && idx[p - w] === VAZIO) || (p < idx.length - w && idx[p + w] === VAZIO);
      if (!encosta) continue;
      const i = p * 4;
      let melhor = null;
      let menor = 30 * 30; // a mistura precisa ficar perto da linha entre o fundo e a cor
      for (let k = 0; k < refs.length; k++) {
        if (!longe[k]) continue;
        const r = refs[k];
        const v0 = r[0] - fundo[0];
        const v1 = r[1] - fundo[1];
        const v2 = r[2] - fundo[2];
        const c = v0 * v0 + v1 * v1 + v2 * v2;
        const t = ((data[i] - fundo[0]) * v0 + (data[i + 1] - fundo[1]) * v1 + (data[i + 2] - fundo[2]) * v2) / c;
        if (t <= 0 || t >= 0.92) continue; // perto da cor pura: é logo de verdade
        const e0 = data[i] - fundo[0] - t * v0;
        const e1 = data[i + 1] - fundo[1] - t * v1;
        const e2 = data[i + 2] - fundo[2] - t * v2;
        const d = e0 * e0 + e1 * e1 + e2 * e2;
        if (d < menor) (menor = d), (melhor = { k, t });
      }
      if (!melhor) continue;
      const novo = melhor.t < 0.5 ? VAZIO : alvos[melhor.k].cor;
      if (novo !== idx[p]) mudar.push(p, novo);
    }
    if (!mudar.length) break;
    for (let j = 0; j < mudar.length; j += 2) idx[mudar[j]] = mudar[j + 1];
  }
}

// Mapa do recorte automático com estes alvos. fundo (opcional): cor do fundo que saiu.
export function mapaPorAlvos(imagem, vazio, alvos, fundo = null) {
  const { width: w, height: h, data } = imagem;
  const n = w * h;
  const idx = new Int8Array(n).fill(VAZIO);
  if (alvos.length) {
    const refs = alvos.map((a) => a.ref);
    for (let p = 0; p < n; p++) {
      if (vazio[p]) continue;
      const i = p * 4;
      let melhor = 0;
      let menor = Infinity;
      for (let k = 0; k < refs.length; k++) {
        const r = refs[k];
        const d0 = data[i] - r[0];
        const d1 = data[i + 1] - r[1];
        const d2 = data[i + 2] - r[2];
        const d = d0 * d0 + d1 * d1 + d2 * d2;
        if (d < menor) {
          menor = d;
          melhor = k;
        }
      }
      // meio-tom da borda: um pixel que é mistura de duas cores do logo (ex.: cinza entre preto e branco)
      // fica com a mais próxima das duas, e não com uma terceira cor parecida com a mistura (dourado)
      if (menor > 400 && refs.length > 2) {
        let par = null;
        let perto = menor * 0.25;
        for (let a = 0; a < refs.length; a++)
          for (let b = a + 1; b < refs.length; b++) {
            if (a === melhor || b === melhor) continue;
            const ra = refs[a];
            const rb = refs[b];
            const v0 = rb[0] - ra[0];
            const v1 = rb[1] - ra[1];
            const v2 = rb[2] - ra[2];
            const c = v0 * v0 + v1 * v1 + v2 * v2;
            if (!c) continue;
            const t = ((data[i] - ra[0]) * v0 + (data[i + 1] - ra[1]) * v1 + (data[i + 2] - ra[2]) * v2) / c;
            if (t <= 0 || t >= 1) continue;
            const e0 = data[i] - ra[0] - t * v0;
            const e1 = data[i + 1] - ra[1] - t * v1;
            const e2 = data[i + 2] - ra[2] - t * v2;
            const d = e0 * e0 + e1 * e1 + e2 * e2;
            if (d < perto) (perto = d), (par = t < 0.5 ? a : b);
          }
        if (par !== null) melhor = par;
      }
      idx[p] = alvos[melhor].cor;
    }
    if (fundo) limparBordaDoFundo(imagem, idx, alvos, fundo);
    limparSerrilhado(idx, w, h);
  }
  return { largura: w, altura: h, idx };
}

// Recorte e cores automáticos de uma vez. alvos: os escolhidos (ou null para achar sozinho).
export function recorteAutomatico(imagem, { tirarFundo = true, areasInternas = false, alvos = null } = {}) {
  const { vazio, fundo } = mascaraDoFundo(imagem, { tirarFundo, areasInternas });
  const lista = alvos ?? coresAutomaticas(imagem, vazio, fundo);
  return { mapa: mapaPorAlvos(imagem, vazio, lista, fundo), alvos: lista, vazio, fundo };
}

// Põe as correções à mão por cima do automático: onde manual = 1 fica o que está em "mapa".
export function juntarManual(auto, mapa, manual) {
  for (let p = 0; p < mapa.idx.length; p++) if (!manual[p]) mapa.idx[p] = auto.idx[p];
  return mapa;
}

// O serrilhado das bordas (meio-tons) vira fiapos de outra cor, ex.: um contorno cinza de 1 pixel em volta
// de uma letra preta. Pixel com menos de 3 vizinhos (de 8) da mesma cor fica com a cor mais comum em volta.
export function limparSerrilhado(idx, w, h, passadas = 2) {
  const contagem = new Int32Array(130); // índice = cor + 1 (VAZIO = 0)
  const vistos = new Int16Array(8);
  for (let volta = 0; volta < passadas; volta++) {
    const antes = idx.slice();
    let mudou = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const v = antes[p];
        // atalho: os 4 vizinhos diretos iguais já garantem 3 ou mais iguais
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1 && antes[p - 1] === v && antes[p + 1] === v && antes[p - w] === v && antes[p + w] === v) continue;
        let iguais = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx;
            const yy = y + dy;
            const q = xx < 0 || yy < 0 || xx >= w || yy >= h ? VAZIO : antes[yy * w + xx];
            if (q === v) iguais++;
            else {
              if (!contagem[q + 1]) vistos[n++] = q;
              contagem[q + 1]++;
            }
          }
        }
        let melhor = v;
        let maximo = iguais;
        for (let i = 0; i < n; i++) {
          const q = vistos[i];
          if (iguais < 3 && contagem[q + 1] > maximo) {
            maximo = contagem[q + 1];
            melhor = q;
          }
          contagem[q + 1] = 0;
        }
        if (melhor !== v) {
          idx[p] = melhor;
          mudou = true;
        }
      }
    }
    if (!mudou) break;
  }
  return idx;
}

// Mapa de uma imagem que já está nas cores prontas (PNG das correções, modelos antigos): sem recorte.
// O magenta (#ff00ff, que não é cor pronta) marca o que foi apagado à mão.
export const MAGENTA = [255, 0, 255];
export function mapaDeCoresProntas(imagem) {
  const { width: w, height: h, data } = imagem;
  const idx = new Int8Array(w * h).fill(VAZIO);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] >= 128) idx[p] = corMaisProxima([data[i], data[i + 1], data[i + 2]]);
  }
  return { largura: w, altura: h, idx };
}

// RGBA do mapa (para desenhar e para salvar como PNG com fundo transparente).
export function rgbaDoMapa(mapa) {
  const saida = new Uint8ClampedArray(mapa.largura * mapa.altura * 4);
  for (let p = 0; p < mapa.idx.length; p++) {
    const c = mapa.idx[p];
    if (c === VAZIO) continue;
    const [r, g, b] = RGB[c];
    saida.set([r, g, b, 255], p * 4);
  }
  return saida;
}

// Correções à mão como imagem (para Meus modelos): pixel manual com cor = a cor; apagado à mão = magenta;
// o resto, transparente.
export function rgbaDasCorrecoes(mapa, manual) {
  const saida = new Uint8ClampedArray(mapa.largura * mapa.altura * 4);
  for (let p = 0; p < mapa.idx.length; p++) {
    if (!manual[p]) continue;
    const c = mapa.idx[p];
    saida.set([...(c === VAZIO ? MAGENTA : RGB[c]), 255], p * 4);
  }
  return saida;
}

// Volta das correções salvas: põe no mapa e marca a máscara manual.
export function aplicarCorrecoes(imagem, mapa, manual) {
  const { width: w, height: h, data } = imagem;
  if (w !== mapa.largura || h !== mapa.altura) return false;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] < 128) continue;
    const c = [data[i], data[i + 1], data[i + 2]];
    manual[p] = 1;
    mapa.idx[p] = dist2(c, MAGENTA) < 30 ** 2 ? VAZIO : corMaisProxima(c);
  }
  return true;
}

export function coresUsadas(mapa) {
  const vistas = new Set();
  for (const c of mapa.idx) if (c !== VAZIO) vistas.add(c);
  return [...vistas].sort((a, b) => a - b);
}

export const mapaVazio = (mapa) => !mapa.idx.some((c) => c !== VAZIO);

// ---------- Correção à mão ----------
// valor: VAZIO, um índice de cor, ou "restaurar" (volta ao valor de "origem", o mapa automático).
// manual (opcional): marca 1 no que foi corrigido; "restaurar" desmarca.
// Pinta um disco de raio "raio" (pixels) com centro em (x, y). Devolve se algo mudou.
export function pintarDisco(mapa, x, y, raio, valor, origem = null, manual = null) {
  const { largura: w, altura: h, idx } = mapa;
  const r2 = raio * raio;
  let mudou = false;
  for (let yy = Math.max(0, Math.floor(y - raio)); yy <= Math.min(h - 1, Math.ceil(y + raio)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - raio)); xx <= Math.min(w - 1, Math.ceil(x + raio)); xx++) {
      if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > r2) continue;
      const p = yy * w + xx;
      const restaurar = valor === "restaurar";
      const novo = restaurar ? (origem ? origem.idx[p] : idx[p]) : valor;
      if (manual) {
        const m = restaurar ? 0 : 1;
        if (manual[p] !== m) {
          manual[p] = m;
          mudou = true;
        }
      }
      if (idx[p] !== novo) {
        idx[p] = novo;
        mudou = true;
      }
    }
  }
  return mudou;
}

// Traço do pincel entre dois pontos (discos a cada meio raio, sem buracos).
export function pintarTraco(mapa, x0, y0, x1, y1, raio, valor, origem = null, manual = null) {
  const passos = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(0.5, raio / 2)));
  let mudou = false;
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    mudou = pintarDisco(mapa, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, raio, valor, origem, manual) || mudou;
  }
  return mudou;
}

// Varinha (valor VAZIO) e balde (valor = cor): troca a região ligada (4 vizinhos) da mesma cor do ponto.
export function encher(mapa, x, y, valor, manual = null) {
  const { largura: w, altura: h, idx } = mapa;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const alvo = idx[y * w + x];
  if (alvo === valor) return false;
  const pilha = [y * w + x];
  idx[y * w + x] = valor;
  if (manual) manual[y * w + x] = 1;
  while (pilha.length) {
    const p = pilha.pop();
    const px = p % w;
    for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * h - w ? p + w : -1]) {
      if (q >= 0 && idx[q] === alvo) {
        idx[q] = valor;
        if (manual) manual[q] = 1;
        pilha.push(q);
      }
    }
  }
  return true;
}

// ---------- Vetorização ----------
// Pixels de borda da camada: algum dos 4 vizinhos está do outro lado.
function bordaDaCamada(dentro, w, h) {
  const lista = [];
  for (let y = 0; y < h; y++) {
    const linha = y * w;
    for (let x = 0; x < w; x++) {
      const p = linha + x;
      const v = dentro[p];
      if ((x > 0 && dentro[p - 1] !== v) || (x < w - 1 && dentro[p + 1] !== v) || (y > 0 && dentro[p - w] !== v) || (y < h - 1 && dentro[p + w] !== v)) lista.push(p);
    }
  }
  return lista;
}

// Campo de cobertura (0 a 1) da camada: 1 nos pixels "dentro". Na borda, se houver a imagem original
// (suave), usa o meio-tom do anti-serrilhado dela para achar a borda com fração de pixel: um pixel
// 30% preto entre o preto e o branco fica com 0,3. Onde houve correção à mão, a borda é a do mapa.
function campoDaCamada(mapa, dentro, borda, suave) {
  const { largura: w, altura: h, idx } = mapa;
  const n = w * h;
  const campo = new Float32Array(n);
  for (let p = 0; p < n; p++) campo[p] = dentro[p];
  if (!suave) return { campo, exato: null };
  const { imagem, refs, fundo, manual } = suave;
  const data = imagem.data;
  const exato = new Uint8Array(n); // 1 = borda calculada pelo meio-tom
  const corDe = (q) => {
    // a cor "pura" do lado onde o pixel q está (null = não dá para saber)
    if (manual?.[q]) return null;
    const c = idx[q];
    if (c !== VAZIO) return refs[c] ?? RGB[c];
    if (data[q * 4 + 3] < 128) return "transparente";
    return fundo;
  };
  for (const p of borda) {
    if (manual?.[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    // vizinho do outro lado da borda (4 vizinhos)
    const v = dentro[p];
    let q = -1;
    if (x > 0 && dentro[p - 1] !== v) q = p - 1;
    else if (x < w - 1 && dentro[p + 1] !== v) q = p + 1;
    else if (y > 0 && dentro[p - w] !== v) q = p - w;
    else if (y < h - 1 && dentro[p + w] !== v) q = p + w;
    if (q < 0) continue;
    const cp = corDe(p);
    const cq = corDe(q);
    if (!cp || !cq) continue;
    const A = v ? cp : cq; // cor de dentro
    const B = v ? cq : cp; // cor de fora
    const i = p * 4;
    let t;
    if (B === "transparente") t = data[i + 3] / 255;
    else if (A === "transparente") continue;
    else {
      const a0 = A[0] - B[0];
      const a1 = A[1] - B[1];
      const a2 = A[2] - B[2];
      const ab2 = a0 * a0 + a1 * a1 + a2 * a2;
      if (ab2 < 40 ** 2) continue; // cores parecidas demais: o meio-tom não diz nada
      t = ((data[i] - B[0]) * a0 + (data[i + 1] - B[1]) * a1 + (data[i + 2] - B[2]) * a2) / ab2;
      if (data[i + 3] < 250) t *= data[i + 3] / 255;
    }
    // a borda passa onde o meio-tom diz (pode cruzar o pixel: o mapa só sabe o lado mais provável)
    campo[p] = Math.min(1, Math.max(0, t));
    exato[p] = 1;
  }
  return { campo, exato };
}

// Desfoque 1-2-1 (3×3) onde a borda não é exata (degraus de pixel). Só mexe perto da borda: longe
// dela os 9 pixels são iguais e o desfoque não muda nada.
function suavizarDegraus(campo, exato, borda, w, h) {
  const saida = campo.slice();
  const visto = new Uint8Array(w * h);
  const K = [1, 2, 1];
  for (const b of borda) {
    const bx = b % w;
    const by = (b - bx) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const y = by + dy;
      if (y < 0 || y >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const x = bx + dx;
        if (x < 0 || x >= w) continue;
        const p = y * w + x;
        if (visto[p]) continue;
        visto[p] = 1;
        // pixel exato e os vizinhos dele mantêm o valor (senão o desfoque puxa a borda exata)
        if (exato && (exato[p] || (x > 0 && exato[p - 1]) || (x < w - 1 && exato[p + 1]) || (y > 0 && exato[p - w]) || (y < h - 1 && exato[p + w]))) continue;
        let soma = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const yy = Math.min(h - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const xx = Math.min(w - 1, Math.max(0, x + kx));
            soma += K[ky + 1] * K[kx + 1] * campo[yy * w + xx];
          }
        }
        saida[p] = soma / 16;
      }
    }
  }
  return saida;
}

// Camadas empilhadas como no vetorizador: as cores com mais área embaixo, e cada camada cobre também
// as de cima (sem frestas entre cores).
// suave (opcional): { imagem, refs: { [cor]: [r, g, b] }, fundo, manual } para a borda com fração de pixel.
// tolerancia: erro máximo do ajuste das curvas, em pixels do mapa.
export function svgDoMapa(mapa, { mancha = 6, tolerancia = 0.15, suave = null, furos = null } = {}) {
  const { largura: w, altura: h, idx } = mapa;
  const n = w * h;
  const area = new Int32Array(130); // índice = cor + 1
  for (let p = 0; p < n; p++) area[idx[p] + 1]++;
  const ordem = [];
  for (let c = 0; c < 128; c++) if (area[c + 1]) ordem.push(c);
  ordem.sort((a, b) => area[b + 1] - area[a + 1]);
  const posicao = new Int16Array(130).fill(-1); // índice = cor + 1
  ordem.forEach((c, k) => {
    posicao[c + 1] = k;
  });
  const caminhos = [];
  const dentro = new Uint8Array(n);
  for (let k = 0; k < ordem.length; k++) {
    for (let p = 0; p < n; p++) dentro[p] = posicao[idx[p] + 1] >= k ? 1 : 0;
    const borda = bordaDaCamada(dentro, w, h);
    if (!borda.length) continue;
    const { campo, exato } = campoDaCamada(mapa, dentro, borda, suave);
    const final = suavizarDegraus(campo, exato, borda, w, h);
    const lacos = contornos(final, w, h).filter((l) => Math.abs(areaDoLaco(l)) >= mancha);
    if (!lacos.length) continue;
    const d = lacos.map((l) => caminhoSvg(curvasDoLaco(l, tolerancia))).join("");
    caminhos.push(`<path fill="${CORES_LOGO[ordem[k]].hex}" fill-rule="evenodd" d="${d}"/>`);
  }
  if (furos) {
    const borda = bordaDaCamada(furos, w, h);
    if (borda.length) {
      const campo = new Float32Array(n);
      for (let p = 0; p < n; p++) campo[p] = furos[p];
      const lacos = contornos(suavizarDegraus(campo, null, borda, w, h), w, h).filter((l) => Math.abs(areaDoLaco(l)) >= mancha);
      if (lacos.length) caminhos.push(`<path fill="${COR_FURO}" fill-rule="evenodd" d="${lacos.map((l) => caminhoSvg(curvasDoLaco(l, tolerancia))).join("")}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${caminhos.join("")}</svg>`;
}
