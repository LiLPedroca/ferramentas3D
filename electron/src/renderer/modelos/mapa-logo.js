// Criador de logos: a imagem vira um "mapa" de pixels, cada um com uma das cores prontas (as 14 de
// Minhas Impressões) ou vazio (-1, fundo recortado). O recorte e as cores automáticos podem ser
// corrigidos à mão (borracha, restaurar, varinha, pincel, balde) e o mapa vira o SVG do relevo.
import modeloImpressao from "../../core/impressao.cjs";
import { areaDoLaco, caminhoSvg, contornos, corDoFundo, curvasDoLaco, escolherPaleta } from "../vetorizar.js";

// Só as cores com tinta (Transparente fica de fora: não dá para imprimir "transparente" num logo).
export const CORES_LOGO = modeloImpressao.CORES.filter((c) => c.hex);
export const VAZIO = -1;
const RGB = CORES_LOGO.map((c) => [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16)));

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

// imagem: { width, height, data (RGBA) }. opcoes: { cores (quantas cores no logo), tirarFundo, fundoDeDentro }
// fundoDeDentro: também tira a cor do fundo que ficou presa dentro do logo (miolo das letras).
// Devolve { largura, altura, idx: Int8Array } (VAZIO ou índice em CORES_LOGO).
export function mapaAutomatico(imagem, { cores = 3, tirarFundo = true, fundoDeDentro = true } = {}) {
  const { width: w, height: h, data } = imagem;
  const n = w * h;
  const idx = new Int8Array(n).fill(VAZIO);
  const quantidade = Math.max(1, Math.min(12, Number(cores) || 3)) + (tirarFundo ? 1 : 0);
  const paleta = escolherPaleta(data, w, h, Math.max(2, quantidade));
  if (!paleta.length) return { largura: w, altura: h, idx };

  // cada pixel opaco: cor da paleta mais próxima
  const daPaleta = new Int16Array(n).fill(-1);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (data[i + 3] < 128) continue;
    const c = [data[i], data[i + 1], data[i + 2]];
    let melhor = 0;
    let menor = Infinity;
    paleta.forEach((cor, k) => {
      const d = dist2(c, cor);
      if (d < menor) {
        menor = d;
        melhor = k;
      }
    });
    daPaleta[p] = melhor;
  }

  // fundo: as cores da paleta parecidas com a cor da borda da imagem
  const doFundo = new Set();
  if (tirarFundo) {
    const fundo = corDoFundo(data, w, h);
    if (fundo) {
      let maisProxima = -1;
      let menor = Infinity;
      paleta.forEach((c, k) => {
        const d = Math.sqrt(dist2(c, fundo));
        if (d < 45) doFundo.add(k);
        if (d < menor) {
          menor = d;
          maisProxima = k;
        }
      });
      if (!doFundo.size && menor <= 60) doFundo.add(maisProxima);
    }
  }
  const vazio = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (daPaleta[p] < 0) vazio[p] = 1;
  if (doFundo.size) {
    if (fundoDeDentro) {
      for (let p = 0; p < n; p++) if (doFundo.has(daPaleta[p])) vazio[p] = 1;
    } else {
      // só o fundo ligado à borda da imagem (o que está dentro do logo fica)
      const pilha = [];
      const tentar = (p) => {
        if (!vazio[p] && doFundo.has(daPaleta[p])) {
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
    }
  }
  const pronta = paleta.map((c) => corMaisProxima(c));
  for (let p = 0; p < n; p++) if (!vazio[p]) idx[p] = pronta[daPaleta[p]];
  limparSerrilhado(idx, w, h);
  return { largura: w, altura: h, idx };
}

// O serrilhado das bordas (meio-tons) vira fiapos de outra cor, ex.: um contorno cinza de 1 pixel em volta
// de uma letra preta. Pixel com menos de 3 vizinhos (de 8) da mesma cor fica com a cor mais comum em volta.
export function limparSerrilhado(idx, w, h, passadas = 2) {
  const contagem = new Map();
  for (let volta = 0; volta < passadas; volta++) {
    const antes = idx.slice();
    let mudou = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const v = antes[p];
        let iguais = 0;
        contagem.clear();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx;
            const yy = y + dy;
            const q = xx < 0 || yy < 0 || xx >= w || yy >= h ? VAZIO : antes[yy * w + xx];
            if (q === v) iguais++;
            else contagem.set(q, (contagem.get(q) ?? 0) + 1);
          }
        }
        if (iguais >= 3) continue;
        let melhor = v;
        let maximo = iguais;
        for (const [q, k] of contagem) {
          if (k > maximo) {
            maximo = k;
            melhor = q;
          }
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

// Mapa de uma imagem que já está nas cores prontas (salva em Meus modelos): sem recorte nem paleta.
export function mapaDeCoresProntas(imagem) {
  const { width: w, height: h, data } = imagem;
  const idx = new Int8Array(w * h).fill(VAZIO);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] >= 128) idx[p] = corMaisProxima([data[i], data[i + 1], data[i + 2]]);
  }
  return { largura: w, altura: h, idx };
}

// RGBA do mapa (para desenhar na tela e para salvar como PNG com fundo transparente).
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

export function coresUsadas(mapa) {
  const vistas = new Set();
  for (const c of mapa.idx) if (c !== VAZIO) vistas.add(c);
  return [...vistas].sort((a, b) => a - b);
}

export const mapaVazio = (mapa) => !mapa.idx.some((c) => c !== VAZIO);

// ---------- Edição ----------
// valor: VAZIO, um índice de cor, ou "restaurar" (volta ao valor de "origem", o mapa automático).
// Pinta um disco de raio "raio" (pixels) com centro em (x, y). Devolve se algo mudou.
export function pintarDisco(mapa, x, y, raio, valor, origem = null) {
  const { largura: w, altura: h, idx } = mapa;
  const r2 = raio * raio;
  let mudou = false;
  for (let yy = Math.max(0, Math.floor(y - raio)); yy <= Math.min(h - 1, Math.ceil(y + raio)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - raio)); xx <= Math.min(w - 1, Math.ceil(x + raio)); xx++) {
      if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > r2) continue;
      const p = yy * w + xx;
      const novo = valor === "restaurar" ? (origem ? origem.idx[p] : idx[p]) : valor;
      if (idx[p] !== novo) {
        idx[p] = novo;
        mudou = true;
      }
    }
  }
  return mudou;
}

// Traço do pincel entre dois pontos (discos a cada meio raio, sem buracos).
export function pintarTraco(mapa, x0, y0, x1, y1, raio, valor, origem = null) {
  const passos = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(0.5, raio / 2)));
  let mudou = false;
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    mudou = pintarDisco(mapa, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, raio, valor, origem) || mudou;
  }
  return mudou;
}

// Varinha (valor VAZIO) e balde (valor = cor): troca a região ligada (4 vizinhos) da mesma cor do ponto.
export function encher(mapa, x, y, valor) {
  const { largura: w, altura: h, idx } = mapa;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const alvo = idx[y * w + x];
  if (alvo === valor) return false;
  const pilha = [y * w + x];
  idx[y * w + x] = valor;
  while (pilha.length) {
    const p = pilha.pop();
    const px = p % w;
    for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * h - w ? p + w : -1]) {
      if (q >= 0 && idx[q] === alvo) {
        idx[q] = valor;
        pilha.push(q);
      }
    }
  }
  return true;
}

// ---------- Vetorização ----------
// Camadas empilhadas como no vetorizador: as cores com mais área embaixo, e cada camada cobre também
// as de cima (sem frestas entre cores). A borda de cada camada sai de uma cobertura suavizada, para o
// contorno não ficar em degraus de pixel.
export function svgDoMapa(mapa, { mancha = 6, tolerancia = 0.4 } = {}) {
  const { largura: w, altura: h, idx } = mapa;
  const n = w * h;
  const area = new Map();
  for (const c of idx) if (c !== VAZIO) area.set(c, (area.get(c) ?? 0) + 1);
  const ordem = [...area.keys()].sort((a, b) => area.get(b) - area.get(a));
  const posicao = new Map(ordem.map((c, k) => [c, k]));
  const caminhos = [];
  const campo = new Float32Array(n);
  const tmp = new Float32Array(n);
  for (let k = 0; k < ordem.length; k++) {
    for (let p = 0; p < n; p++) campo[p] = idx[p] !== VAZIO && posicao.get(idx[p]) >= k ? 1 : 0;
    // desfoque 1-2-1 separável (horizontal e vertical)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        tmp[p] = (campo[x > 0 ? p - 1 : p] + 2 * campo[p] + campo[x < w - 1 ? p + 1 : p]) / 4;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        campo[p] = (tmp[y > 0 ? p - w : p] + 2 * tmp[p] + tmp[y < h - 1 ? p + w : p]) / 4;
      }
    }
    const lacos = contornos(campo, w, h).filter((l) => Math.abs(areaDoLaco(l)) >= mancha);
    if (!lacos.length) continue;
    const d = lacos.map((l) => caminhoSvg(curvasDoLaco(l, tolerancia))).join("");
    caminhos.push(`<path fill="${CORES_LOGO[ordem[k]].hex}" fill-rule="evenodd" d="${d}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${caminhos.join("")}</svg>`;
}
