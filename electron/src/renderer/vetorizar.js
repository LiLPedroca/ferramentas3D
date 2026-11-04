// Vetorização (imagem → SVG) feita aqui, pensada para fidelidade:
// 1. Paleta: as cores exatas da imagem quando são poucas; senão k-médias, ignorando os pixels de
//    borda (o serrilhado não vira cor).
// 2. Cobertura: cada pixel de borda é dividido entre as duas cores que ele mistura (anti-aliasing),
//    então a borda é achada entre os pixels, com precisão de fração de pixel.
// 3. Camadas empilhadas: cada cor cobre também a área das cores de cima → nada de frestas.
// 4. Contorno por marching squares na cobertura 0,5 e ajuste de curvas de Bézier (Schneider),
//    preservando os cantos.
// Usado pelo worker do Conversor SVG e pelo Chaveiro de logo.

const DETALHE = {
  baixo: { tolerancia: 0.8, mancha: 24 },
  medio: { tolerancia: 0.4, mancha: 6 },
  alto: { tolerancia: 0.2, mancha: 1.5 },
};

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// ---------- Preparação ----------
function desfocar(data, w, h) {
  // gaussiano 3×3 (1 2 1) no RGB, alfa intacto
  const saida = new Uint8ClampedArray(data);
  const pesos = [1, 2, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const soma = [0, 0, 0];
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const p = pesos[dx + 1] * pesos[dy + 1];
          const i = (yy * w + xx) * 4;
          soma[0] += data[i] * p;
          soma[1] += data[i + 1] * p;
          soma[2] += data[i + 2] * p;
          total += p;
        }
      }
      const i = (y * w + x) * 4;
      saida[i] = soma[0] / total;
      saida[i + 1] = soma[1] / total;
      saida[i + 2] = soma[2] / total;
    }
  }
  return saida;
}

// Cor mais comum na borda da imagem (provável fundo).
function corDoFundo(data, w, h) {
  const contagem = new Map();
  const somar = (x, y) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 20) return;
    const chave = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  };
  for (let x = 0; x < w; x += 2) {
    somar(x, 0);
    somar(x, h - 1);
  }
  for (let y = 0; y < h; y += 2) {
    somar(0, y);
    somar(w - 1, y);
  }
  let melhor = null;
  let maximo = 0;
  for (const [chave, n] of contagem) {
    if (n > maximo) {
      maximo = n;
      melhor = chave;
    }
  }
  return melhor ? melhor.split(",").map((v) => Number(v) * 16 + 8) : null;
}

// ---------- Paleta ----------
export function escolherPaleta(data, w, h, quantidade) {
  // 1) poucas cores exatas (logos, desenhos): usa as próprias, sem aproximar
  const exatas = new Map();
  for (let i = 0; i < data.length && exatas.size <= 4096; i += 4) {
    if (data[i + 3] < 128) continue;
    const chave = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    exatas.set(chave, (exatas.get(chave) ?? 0) + 1);
  }
  // 2) caixas de 5 bits por canal, só com pixels "calmos" (fora das bordas)
  const caixas = new Map();
  const passo = Math.max(1, Math.floor(Math.sqrt((w * h) / 250000)));
  for (let y = 0; y < h; y += passo) {
    for (let x = 0; x < w; x += passo) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      let borda = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        borda = Math.max(borda, Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]));
      }
      if (borda > 60) continue;
      const chave = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const c = caixas.get(chave) ?? { n: 0, s: [0, 0, 0] };
      c.n++;
      c.s[0] += data[i];
      c.s[1] += data[i + 1];
      c.s[2] += data[i + 2];
      caixas.set(chave, c);
    }
  }
  const pontos = [...caixas.values()].map((c) => ({ cor: c.s.map((v) => v / c.n), n: c.n }));
  if (exatas.size <= quantidade) {
    return [...exatas.keys()].map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
  }
  if (!pontos.length) return [];
  // k-médias++ determinístico sobre as caixas (peso = quantidade de pixels)
  const centros = [pontos.reduce((a, b) => (b.n > a.n ? b : a)).cor.slice()];
  while (centros.length < quantidade) {
    let melhor = null;
    let valor = 0;
    for (const p of pontos) {
      const d = Math.min(...centros.map((c) => dist2(c, p.cor)));
      const v = d * p.n;
      if (v > valor) {
        valor = v;
        melhor = p;
      }
    }
    if (!melhor || valor < 1) break;
    centros.push(melhor.cor.slice());
  }
  for (let volta = 0; volta < 12; volta++) {
    const somas = centros.map(() => ({ n: 0, s: [0, 0, 0] }));
    for (const p of pontos) {
      let k = 0;
      let menor = Infinity;
      centros.forEach((c, i) => {
        const d = dist2(c, p.cor);
        if (d < menor) {
          menor = d;
          k = i;
        }
      });
      somas[k].n += p.n;
      for (let c = 0; c < 3; c++) somas[k].s[c] += p.cor[c] * p.n;
    }
    somas.forEach((s, i) => {
      if (s.n) centros[i] = s.s.map((v) => v / s.n);
    });
  }
  // cores quase iguais viram uma
  const finais = [];
  for (const c of centros.map((c) => c.map(Math.round))) if (!finais.some((f) => dist2(f, c) < 12 ** 2)) finais.push(c);
  return finais;
}

// ---------- Cobertura ----------
// Para cada pixel: as duas cores da paleta que ele mistura (a e b) e quanto tem de b (0 a 1),
// e quanto ele é opaco. Pixel de borda entre vermelho e branco fica, por exemplo, 40% vermelho.
function misturas(data, n, paleta) {
  const a = new Uint8Array(n);
  const b = new Uint8Array(n);
  const tb = new Float32Array(n);
  const opaco = new Float32Array(n);
  const k = paleta.length;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    opaco[p] = data[i + 3] / 255;
    const c = [data[i], data[i + 1], data[i + 2]];
    let m1 = 0;
    let d1 = Infinity;
    let m2 = 0;
    let d2 = Infinity;
    for (let j = 0; j < k; j++) {
      const d = dist2(paleta[j], c);
      if (d < d1) {
        m2 = m1;
        d2 = d1;
        m1 = j;
        d1 = d;
      } else if (d < d2) {
        m2 = j;
        d2 = d;
      }
    }
    a[p] = m1;
    b[p] = m2;
    if (k < 2 || d1 < 9) continue;
    // Pixel de borda: o par de cores que melhor explica a mistura (a cor fica "no caminho" entre
    // as duas). O cinza entre preto e branco é preto+branco, mesmo que azul esteja mais perto.
    let melhor = d1;
    for (let x = 0; x < k; x++) {
      const pa = paleta[x];
      for (let y = x + 1; y < k; y++) {
        const pb = paleta[y];
        const ab0 = pb[0] - pa[0];
        const ab1 = pb[1] - pa[1];
        const ab2c = pb[2] - pa[2];
        const ab2 = ab0 * ab0 + ab1 * ab1 + ab2c * ab2c;
        if (!ab2) continue;
        const t = ((c[0] - pa[0]) * ab0 + (c[1] - pa[1]) * ab1 + (c[2] - pa[2]) * ab2c) / ab2;
        if (t <= 0.02 || t >= 0.98) continue;
        const resto = (c[0] - pa[0] - t * ab0) ** 2 + (c[1] - pa[1] - t * ab1) ** 2 + (c[2] - pa[2] - t * ab2c) ** 2;
        // só aceita se explica bem melhor que a cor pura mais próxima
        if (resto < melhor * 0.5 && resto < 0.06 * ab2 + 100) {
          melhor = resto;
          a[p] = x;
          b[p] = y;
          tb[p] = t;
        }
      }
    }
  }
  return { a, b, tb, opaco };
}

// ---------- Contornos (marching squares em 0,5) ----------
// campo: Float32Array w×h (cobertura de 0 a 1 por pixel). Devolve laços [[x, y], …] em pixels
// (y para baixo), com o lado de dentro sempre à direita de quem anda.
export function contornos(campo, w, h) {
  const W = w + 2;
  const H = h + 2;
  const v = (i, j) => (i < 1 || j < 1 || i > w || j > h ? 0 : campo[(j - 1) * w + (i - 1)]);
  const ponto = (i1, j1, i2, j2) => {
    const va = v(i1, j1);
    const vb = v(i2, j2);
    const t = vb === va ? 0.5 : (0.5 - va) / (vb - va);
    return [i1 + (i2 - i1) * t - 0.5, j1 + (j2 - j1) * t - 0.5];
  };
  // chaves das arestas da grade: horizontais e verticais
  const H_ = (i, j) => (j * W + i) * 2;
  const V_ = (i, j) => (j * W + i) * 2 + 1;
  const proximo = new Map(); // aresta de saída por aresta de entrada
  const pontos = new Map();
  const ligar = (de, para, pDe, pPara) => {
    proximo.set(de, para);
    if (!pontos.has(de)) pontos.set(de, pDe());
    if (!pontos.has(para)) pontos.set(para, pPara());
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const tl = v(i, j) > 0.5;
      const tr = v(i + 1, j) > 0.5;
      const br = v(i + 1, j + 1) > 0.5;
      const bl = v(i, j + 1) > 0.5;
      const caso = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (caso === 0 || caso === 15) continue;
      const T = [H_(i, j), () => ponto(i, j, i + 1, j)];
      const B = [H_(i, j + 1), () => ponto(i, j + 1, i + 1, j + 1)];
      const L = [V_(i, j), () => ponto(i, j, i, j + 1)];
      const R = [V_(i + 1, j), () => ponto(i + 1, j, i + 1, j + 1)];
      const seg = (x, y) => ligar(x[0], y[0], x[1], y[1]);
      const centro = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 > 0.5;
      switch (caso) {
        case 1: seg(L, B); break;
        case 2: seg(B, R); break;
        case 3: seg(L, R); break;
        case 4: seg(R, T); break;
        case 5: if (centro) { seg(L, T); seg(R, B); } else { seg(L, B); seg(R, T); } break;
        case 6: seg(B, T); break;
        case 7: seg(L, T); break;
        case 8: seg(T, L); break;
        case 9: seg(T, B); break;
        case 10: if (centro) { seg(T, R); seg(B, L); } else { seg(T, L); seg(B, R); } break;
        case 11: seg(T, R); break;
        case 12: seg(R, L); break;
        case 13: seg(R, B); break;
        case 14: seg(B, L); break;
      }
    }
  }
  const lacos = [];
  const usados = new Set();
  for (const inicio of proximo.keys()) {
    if (usados.has(inicio)) continue;
    const laco = [];
    let atual = inicio;
    while (atual !== undefined && !usados.has(atual)) {
      usados.add(atual);
      laco.push(pontos.get(atual));
      atual = proximo.get(atual);
    }
    if (laco.length >= 3) lacos.push(laco);
  }
  return lacos;
}

export const areaDoLaco = (l) => {
  let s = 0;
  for (let i = 0; i < l.length; i++) {
    const p = l[i];
    const q = l[(i + 1) % l.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
};

// ---------- Curvas ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const soma = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = (a) => {
  const c = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / c, a[1] / c];
};
const bezier = (c, t) => {
  const u = 1 - t;
  return [
    u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0],
    u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1],
  ];
};

// Cantos: pontos onde o contorno vira mais que ~50° (olhando 2 a 3 pixels para cada lado).
function cantos(laco) {
  const n = laco.length;
  const giro = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = laco[i];
    let a = null;
    let b = null;
    for (let k = 1; k < n / 2; k++) {
      const q = laco[(i - k + n) % n];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= 2.2) {
        a = q;
        break;
      }
    }
    for (let k = 1; k < n / 2; k++) {
      const q = laco[(i + k) % n];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= 2.2) {
        b = q;
        break;
      }
    }
    if (!a || !b) continue;
    const u = norm(sub(p, a));
    const v = norm(sub(b, p));
    giro[i] = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
  }
  const lista = [];
  for (let i = 0; i < n; i++) {
    if (giro[i] < 0.87) continue;
    // só o ponto de maior giro na vizinhança
    let maximo = true;
    for (let k = -3; k <= 3 && maximo; k++) if (k && giro[(i + k + n) % n] > giro[i]) maximo = false;
    if (maximo) lista.push(i);
  }
  return lista;
}

// Ajuste de curvas de Bézier cúbicas (Schneider, "Graphics Gems"): erro máximo em pixels.
function ajustar(pts, t1, t2, erro, saida) {
  if (pts.length === 2) {
    const d = Math.hypot(...sub(pts[1], pts[0])) / 3;
    saida.push([pts[0], soma(pts[0], mul(t1, d)), soma(pts[1], mul(t2, d)), pts[1]]);
    return;
  }
  let u = parametrizar(pts);
  let curva = gerarBezier(pts, u, t1, t2);
  let [maxErro, divisao] = erroMaximo(pts, curva, u);
  if (maxErro < erro * erro) {
    saida.push(curva);
    return;
  }
  if (maxErro < 4 * erro * erro) {
    for (let i = 0; i < 6; i++) {
      u = reparametrizar(pts, u, curva);
      curva = gerarBezier(pts, u, t1, t2);
      [maxErro, divisao] = erroMaximo(pts, curva, u);
      if (maxErro < erro * erro) {
        saida.push(curva);
        return;
      }
    }
  }
  const tc = norm(sub(pts[divisao - 1], pts[divisao + 1]));
  ajustar(pts.slice(0, divisao + 1), t1, tc, erro, saida);
  ajustar(pts.slice(divisao), mul(tc, -1), t2, erro, saida);
}

function parametrizar(pts) {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((x) => x / total);
}

function gerarBezier(pts, u, t1, t2) {
  const p0 = pts[0];
  const p3 = pts[pts.length - 1];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i];
    const s = 1 - t;
    const b0 = s * s * s;
    const b1 = 3 * s * s * t;
    const b2 = 3 * s * t * t;
    const b3 = t * t * t;
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(pts[i], soma(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const seg = Math.hypot(...sub(p3, p0));
  let al = det ? (x0 * c11 - x1 * c01) / det : 0;
  let ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  // alças negativas, minúsculas ou enormes (viram "fios" no desenho): usa o terço do segmento
  if (!det || al < 1e-6 * seg || ar < 1e-6 * seg || al > 1.5 * seg || ar > 1.5 * seg) al = ar = seg / 3;
  return [p0, soma(p0, mul(t1, al)), soma(p3, mul(t2, ar)), p3];
}

function erroMaximo(pts, curva, u) {
  let maximo = 0;
  let divisao = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = sub(bezier(curva, u[i]), pts[i]);
    const e = dot(d, d);
    if (e >= maximo) {
      maximo = e;
      divisao = i;
    }
  }
  return [maximo, divisao];
}

function reparametrizar(pts, u, c) {
  const d1 = [mul(sub(c[1], c[0]), 3), mul(sub(c[2], c[1]), 3), mul(sub(c[3], c[2]), 3)];
  const d2 = [mul(sub(d1[1], d1[0]), 2), mul(sub(d1[2], d1[1]), 2)];
  return u.map((t, i) => {
    const s = 1 - t;
    const q = bezier(c, t);
    const q1 = soma(soma(mul(d1[0], s * s), mul(d1[1], 2 * s * t)), mul(d1[2], t * t));
    const q2 = soma(mul(d2[0], s), mul(d2[1], t));
    const dif = sub(q, pts[i]);
    const den = dot(q1, q1) + dot(dif, q2);
    if (!den) return t;
    return Math.min(1, Math.max(0, t - dot(dif, q1) / den));
  });
}

const tangente = (pts, i, sentido) => {
  // média da direção dos 3 próximos pontos (menos sensível a ruído)
  const p = pts[i];
  const q = pts[Math.min(pts.length - 1, Math.max(0, i + sentido * Math.min(3, pts.length - 1)))];
  return norm(sentido > 0 ? sub(q, p) : sub(q, p));
};

// O contorno a 0,5 de cobertura "come" a ponta dos cantos vivos. Reconstrói cada canto no
// cruzamento das retas que chegam nele (medidas de 1,5 a 6 pixels de distância) e tira os pontos
// arredondados bem junto da ponta.
function afiarCantos(laco, indices) {
  const n = laco.length;
  const novo = laco.slice();
  const remover = new Set();
  const reta = (i, sentido) => {
    const p = laco[i];
    const pts = [];
    for (let k = 1; k < n / 2; k++) {
      const q = laco[(i + sentido * k + n) % n];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d > 6) break;
      if (d >= 1.5) pts.push(q);
    }
    if (pts.length < 2) return null;
    return { a: pts[0], dir: norm(sub(pts[pts.length - 1], pts[0])) };
  };
  for (const i of indices) {
    const r1 = reta(i, -1);
    const r2 = reta(i, 1);
    if (!r1 || !r2) continue;
    const cruz = r1.dir[0] * r2.dir[1] - r1.dir[1] * r2.dir[0];
    if (Math.abs(cruz) < 0.3) continue; // quase paralelas: não é canto de verdade
    const d = sub(r2.a, r1.a);
    const t = (d[0] * r2.dir[1] - d[1] * r2.dir[0]) / cruz;
    const ponta = soma(r1.a, mul(r1.dir, t));
    if (Math.hypot(...sub(ponta, laco[i])) > 1.5) continue;
    novo[i] = ponta;
    for (const s of [-1, 1]) {
      for (let k = 1; k < n / 2; k++) {
        const j = (i + s * k + n) % n;
        if (Math.hypot(...sub(laco[j], laco[i])) >= 1.2 || indices.includes(j)) break;
        remover.add(j);
      }
    }
  }
  const mapa = [];
  const saida = [];
  novo.forEach((p, i) => {
    if (remover.has(i)) return;
    mapa[i] = saida.length;
    saida.push(p);
  });
  return { laco: saida, cantos: indices.map((i) => mapa[i]).filter((i) => i !== undefined) };
}

// Laço → curvas cúbicas. Divide nos cantos; sem cantos, ajusta o laço todo.
export function curvasDoLaco(lacoOriginal, erro) {
  if (lacoOriginal.length < 6) {
    const n = lacoOriginal.length;
    return lacoOriginal.map((p, i) => [p, p, lacoOriginal[(i + 1) % n], lacoOriginal[(i + 1) % n]]);
  }
  const { laco, cantos: c } = afiarCantos(lacoOriginal, cantos(lacoOriginal));
  const n = laco.length;
  const trechos = [];
  if (c.length === 0) {
    // sem cantos: duas metades, com tangentes contínuas nas emendas
    const meio = Math.floor(n / 2);
    const fechado = [...laco, laco[0]];
    const tIni = norm(sub(laco[1], laco[n - 1]));
    const tMeio = norm(sub(laco[meio + 1], laco[meio - 1]));
    trechos.push([fechado.slice(0, meio + 1), tIni, mul(tMeio, -1)]);
    trechos.push([fechado.slice(meio), tMeio, mul(tIni, -1)]);
  } else {
    for (let k = 0; k < c.length; k++) {
      const de = c[k];
      const ate = c[(k + 1) % c.length];
      const pts = [];
      for (let i = de; ; i = (i + 1) % n) {
        pts.push(laco[i]);
        if (i === ate && pts.length > 1) break;
      }
      trechos.push([pts, tangente(pts, 0, 1), tangente(pts, pts.length - 1, -1)]);
    }
  }
  const saida = [];
  for (const [pts, t1, t2] of trechos) {
    if (pts.length < 2) continue;
    ajustar(pts, t1, t2, erro, saida);
  }
  return saida;
}

const num = (x) => {
  const r = Math.round(x * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

// distância do ponto p à reta a→b
function foraDaReta(p, a, b) {
  const ab = sub(b, a);
  const c = Math.hypot(ab[0], ab[1]);
  if (c < 1e-9) return Math.hypot(...sub(p, a));
  return Math.abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / c;
}

// Curvas em "d" do SVG. Trechos retos viram "L"; trechos de tamanho zero saem.
function caminhoSvg(curvas) {
  if (!curvas.length) return "";
  let d = `M${num(curvas[0][0][0])} ${num(curvas[0][0][1])}`;
  for (const c of curvas) {
    if (Math.hypot(...sub(c[3], c[0])) < 0.005 && Math.hypot(...sub(c[1], c[0])) < 0.005) continue;
    const reta = foraDaReta(c[1], c[0], c[3]) < 0.01 && foraDaReta(c[2], c[0], c[3]) < 0.01;
    if (reta) d += `L${num(c[3][0])} ${num(c[3][1])}`;
    else d += `C${num(c[1][0])} ${num(c[1][1])} ${num(c[2][0])} ${num(c[2][1])} ${num(c[3][0])} ${num(c[3][1])}`;
  }
  return `${d}Z`;
}

// ---------- Principal ----------
// imagem: { width, height, data } (RGBA). opcoes: { modo: "cores"|"silhueta", cores, detalhe, suavizar, removerFundo }
// Devolve { svg, caminhos, cores, camadas: [{ cor: [r, g, b], curvas: [[c1, c2, …] por laço] }] }.
export function vetorizar(imagem, opcoes = {}) {
  const { width: w, height: h } = imagem;
  const n = w * h;
  const detalhe = DETALHE[opcoes.detalhe] ?? DETALHE.medio;
  const data = opcoes.suavizar ? desfocar(imagem.data, w, h) : imagem.data;

  // camadas de baixo para cima, cada uma com seu campo de cobertura
  const camadasCampo = [];
  if (opcoes.modo === "silhueta") {
    const campo = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      const brilho = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // escuro = dentro; a passagem por 0,5 cai no brilho 128, entre os pixels
      campo[p] = Math.min(1, Math.max(0, (255 - brilho) / 255)) * (data[i + 3] / 255);
    }
    camadasCampo.push({ cor: [0, 0, 0], campo });
  } else {
    const quantidade = Math.max(2, Math.min(16, Number(opcoes.cores) || 6));
    const paleta = escolherPaleta(data, w, h, quantidade);
    if (!paleta.length) return { svg: svgVazio(w, h), caminhos: 0, cores: 0, camadas: [] };
    const { a, b, tb, opaco } = misturas(data, n, paleta);
    // área de cada cor (para a ordem: maiores embaixo)
    const area = new Float64Array(paleta.length);
    for (let p = 0; p < n; p++) {
      area[a[p]] += (1 - tb[p]) * opaco[p];
      area[b[p]] += tb[p] * opaco[p];
    }
    // fundo: as cores parecidas com a cor da borda saem (ficam por baixo, sem desenhar)
    const remover = new Set();
    const fundo = opcoes.removerFundo ? corDoFundo(data, w, h) : null;
    if (fundo) {
      let maisProxima = -1;
      let menor = Infinity;
      paleta.forEach((c, i) => {
        const d = Math.sqrt(dist2(c, fundo));
        if (d < 45) remover.add(i);
        if (d < menor) {
          menor = d;
          maisProxima = i;
        }
      });
      if (!remover.size && menor <= 60) remover.add(maisProxima);
    }
    const ordem = paleta.map((_, i) => i).filter((i) => area[i] > 0).sort((x, y) => (remover.has(y) - remover.has(x)) || area[y] - area[x]);
    // posição de cada cor na pilha; camada k cobre as cores de posição ≥ k
    const posicao = new Int16Array(paleta.length).fill(-1);
    ordem.forEach((cor, k) => {
      posicao[cor] = k;
    });
    for (let k = 0; k < ordem.length; k++) {
      if (remover.has(ordem[k])) continue;
      const campo = new Float32Array(n);
      for (let p = 0; p < n; p++) {
        const pa = posicao[a[p]] >= k ? 1 - tb[p] : 0;
        const pb = posicao[b[p]] >= k ? tb[p] : 0;
        campo[p] = (pa + pb) * opaco[p];
      }
      camadasCampo.push({ cor: paleta[ordem[k]], campo });
    }
  }

  const camadas = [];
  let caminhos = 0;
  for (const { cor, campo } of camadasCampo) {
    const lacos = contornos(campo, w, h).filter((l) => Math.abs(areaDoLaco(l)) >= detalhe.mancha);
    if (!lacos.length) continue;
    const curvas = lacos.map((l) => curvasDoLaco(l, detalhe.tolerancia));
    camadas.push({ cor, curvas });
    caminhos += 1;
  }
  const corpo = camadas
    .map(({ cor, curvas }) => `<path fill="rgb(${cor.map(Math.round).join(",")})" fill-rule="evenodd" d="${curvas.map(caminhoSvg).join("")}"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${corpo}</svg>`;
  return { svg, caminhos, cores: camadas.length, camadas };
}

const svgVazio = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`;
