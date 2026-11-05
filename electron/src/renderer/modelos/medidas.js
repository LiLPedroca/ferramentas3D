// Cálculos do paquímetro: distância entre faces, profundidade e diâmetro de furos e pinos.
// Trabalha com a malha em triângulos soltos (Float32Array x,y,z por vértice), nas coordenadas da peça.
import { Triangle, Vector3 } from "three";

const PARALELO_GRAUS = 3;

// ---------- Álgebra pequena ----------
// Autovalores/autovetores de uma matriz simétrica 3×3 (método de Jacobi). Devolve em ordem crescente.
export function autovetores3(m) {
  const a = m.map((l) => [...l]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iter = 0; iter < 50; iter++) {
    let [p, q] = [0, 1];
    if (Math.abs(a[0][2]) > Math.abs(a[p][q])) [p, q] = [0, 2];
    if (Math.abs(a[1][2]) > Math.abs(a[p][q])) [p, q] = [1, 2];
    if (Math.abs(a[p][q]) < 1e-12) break;
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;
    for (let k = 0; k < 3; k++) {
      const [akp, akq] = [a[k][p], a[k][q]];
      a[k][p] = c * akp - s * akq;
      a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const [apk, aqk] = [a[p][k], a[q][k]];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const [vkp, vkq] = [v[k][p], v[k][q]];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  return [0, 1, 2]
    .map((i) => ({ valor: a[i][i], vetor: new Vector3(v[0][i], v[1][i], v[2][i]).normalize() }))
    .sort((x, y) => x.valor - y.valor);
}

// Círculo que melhor passa pelos pontos (mínimos quadrados de Kåsa). pontos: [[x, y]]
export function ajustarCirculo(pontos) {
  if (pontos.length < 3) return null;
  // centraliza para estabilidade numérica
  const mx = pontos.reduce((s, p) => s + p[0], 0) / pontos.length;
  const my = pontos.reduce((s, p) => s + p[1], 0) / pontos.length;
  let [suu, suv, svv, suuu, svvv, suvv, svuu] = [0, 0, 0, 0, 0, 0, 0];
  for (const [x, y] of pontos) {
    const u = x - mx;
    const w = y - my;
    suu += u * u;
    suv += u * w;
    svv += w * w;
    suuu += u * u * u;
    svvv += w * w * w;
    suvv += u * w * w;
    svuu += w * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-12) return null;
  const b1 = (suuu + suvv) / 2;
  const b2 = (svvv + svuu) / 2;
  const uc = (b1 * svv - b2 * suv) / det;
  const vc = (suu * b2 - suv * b1) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / pontos.length);
  const cx = uc + mx;
  const cy = vc + my;
  const rms = Math.sqrt(pontos.reduce((s, [x, y]) => s + (Math.hypot(x - cx, y - cy) - r) ** 2, 0) / pontos.length);
  return { cx, cy, r, rms };
}

// ---------- Malha ----------
const vertice = (pos, i) => new Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);

function normalDoTriangulo(pos, t) {
  const a = vertice(pos, t * 3);
  const b = vertice(pos, t * 3 + 1).sub(a);
  const c = vertice(pos, t * 3 + 2).sub(a);
  return b.cross(c); // comprimento = 2 × área
}

// Corte da malha por um plano: segmentos de cada triângulo que atravessa o plano.
// Os pontos de uma aresta compartilhada saem idênticos nos dois triângulos (ordem fixa na interpolação).
function segmentosDoCorte(pos, origem, normal) {
  const segs = [];
  const d = new Float64Array(3);
  const ps = [0, 1, 2].map(() => new Vector3());
  const menor = (p, q) => p.x < q.x || (p.x === q.x && (p.y < q.y || (p.y === q.y && p.z < q.z)));
  for (let t = 0; t < pos.length / 9; t++) {
    for (let k = 0; k < 3; k++) {
      ps[k].set(pos[t * 9 + k * 3], pos[t * 9 + k * 3 + 1], pos[t * 9 + k * 3 + 2]);
      d[k] = (ps[k].x - origem.x) * normal.x + (ps[k].y - origem.y) * normal.y + (ps[k].z - origem.z) * normal.z;
    }
    if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] < 0 && d[1] < 0 && d[2] < 0)) continue;
    const pontos = [];
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      if ((d[i] > 0) === (d[j] > 0) || d[i] === d[j]) continue;
      const [p, q, dp, dq] = menor(ps[i], ps[j]) ? [ps[i], ps[j], d[i], d[j]] : [ps[j], ps[i], d[j], d[i]];
      pontos.push(p.clone().lerp(q, dp / (dp - dq)));
    }
    if (pontos.length === 2) {
      pontos.t = t; // triângulo de onde veio (para saber de que lado fica o material)
      segs.push(pontos);
    }
  }
  return segs;
}

// Todos os laços fechados do corte. Cada laço: { pontos, triangulo } (um triângulo da parede).
function lacosDoCorte(pos, origem, normal) {
  const segs = segmentosDoCorte(pos, origem, normal);
  const vizinhos = new Map();
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = chave(p);
      if (!vizinhos.has(k)) vizinhos.set(k, []);
      vizinhos.get(k).push(i);
    }
  });
  const usados = new Uint8Array(segs.length);
  const lacos = [];
  for (let i = 0; i < segs.length; i++) {
    if (usados[i]) continue;
    usados[i] = 1;
    const pontos = [segs[i][0], segs[i][1]];
    let ponta = segs[i][1];
    let fechado = false;
    for (let passo = 0; passo < segs.length; passo++) {
      const prox = (vizinhos.get(chave(ponta)) ?? []).find((j) => !usados[j]);
      if (prox === undefined) {
        fechado = chave(ponta) === chave(pontos[0]);
        break;
      }
      usados[prox] = 1;
      const [a, b] = segs[prox];
      ponta = chave(a) === chave(ponta) ? b : a;
      pontos.push(ponta);
    }
    if (fechado || chave(ponta) === chave(pontos[0])) lacos.push({ pontos, triangulo: segs[i].t });
  }
  return lacos;
}

function baseDoPlano(eixo) {
  const u = new Vector3(1, 0, 0);
  if (Math.abs(u.dot(eixo)) > 0.9) u.set(0, 1, 0);
  u.sub(eixo.clone().multiplyScalar(u.dot(eixo))).normalize();
  return [u, eixo.clone().cross(u)];
}

// Encontra sozinho os furos e pinos redondos, cortando a peça em várias alturas nos 3 eixos.
// pos: triângulos soltos nas coordenadas da peça (Y para cima, como no Three.js).
// Devolve [{ tipo, eixo, eixoNome, centro, raio, rms, lados, inicio, fim, profundidade }].
const EIXOS_ANALISE = [
  { nome: "Z", vetor: new Vector3(0, 1, 0) },
  { nome: "X", vetor: new Vector3(1, 0, 0) },
  { nome: "Y", vetor: new Vector3(0, 0, -1) },
];
export function acharFurosEPinos(pos, { niveis = [0.06, 0.2, 0.35, 0.5, 0.65, 0.8, 0.94], maximo = 80 } = {}) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    min.min(new Vector3(pos[i], pos[i + 1], pos[i + 2]));
    max.max(new Vector3(pos[i], pos[i + 1], pos[i + 2]));
  }
  const tamanho = max.clone().sub(min);
  const maiorLado = Math.max(tamanho.x, tamanho.y, tamanho.z);
  const grupos = new Map();

  for (const { nome, vetor } of EIXOS_ANALISE) {
    const [u, v] = baseDoPlano(vetor);
    const lo = Math.min(min.dot(vetor), max.dot(vetor));
    const hi = Math.max(min.dot(vetor), max.dot(vetor));
    for (const f of niveis) {
      const altura = lo + (hi - lo) * f;
      const origem = vetor.clone().multiplyScalar(altura);
      for (const laco of lacosDoCorte(pos, origem, vetor)) {
        const pts = laco.pontos.map((p) => [p.dot(u), p.dot(v)]);
        if (pts.length < 9) continue;
        const c = ajustarCirculo(pts);
        if (!c || c.r < 0.3 || c.r > maiorLado || c.rms > c.r * 0.02) continue;
        const lados = contarLados(pts);
        if (lados < 8) continue;
        const centro = u.clone().multiplyScalar(c.cx).addScaledVector(v, c.cy).addScaledVector(vetor, altura);
        const parede = vertice(pos, laco.triangulo * 3);
        const normal = normalDoTriangulo(pos, laco.triangulo).normalize();
        const paraCentro = centro.clone().sub(parede);
        paraCentro.sub(vetor.clone().multiplyScalar(paraCentro.dot(vetor)));
        const tipo = paraCentro.dot(normal) > 0 ? "furo" : "pino";
        const k = `${nome}|${Math.round(c.cx * 10)}|${Math.round(c.cy * 10)}|${Math.round(c.r * 20)}|${tipo}`;
        if (!grupos.has(k)) grupos.set(k, { tipo, eixo: vetor.clone(), eixoNome: nome, centro, raio: c.r, rms: c.rms, lados, u, v });
      }
    }
  }

  // Comprimento ao longo do eixo: vértices da parede (à distância "raio" do eixo, com a normal de lado).
  const lista = [...grupos.values()].slice(0, maximo);
  const nTri = pos.length / 9;
  for (const g of lista) {
    const tol = Math.max(0.05, g.raio * 0.03);
    let [ini, fim] = [Infinity, -Infinity];
    for (let t = 0; t < nTri; t++) {
      const n = normalDoTriangulo(pos, t);
      const area = n.length();
      if (area < 1e-12 || Math.abs(n.dot(g.eixo)) / area > 0.35) continue;
      // o meio do triângulo precisa estar na parede; os cantos podem se afastar um pouco
      // (furo levemente cônico: o triângulo alto vai de um diâmetro a outro)
      const radialDe = (p) => {
        const rel = p.clone().sub(g.centro);
        const h = rel.dot(g.eixo);
        return { h, radial: rel.sub(g.eixo.clone().multiplyScalar(h)).length() };
      };
      const meio = radialDe(vertice(pos, t * 3).add(vertice(pos, t * 3 + 1)).add(vertice(pos, t * 3 + 2)).divideScalar(3));
      if (Math.abs(meio.radial - g.raio) > tol) continue;
      let todos = true;
      const alturas = [];
      for (let k = 0; k < 3; k++) {
        const { h, radial } = radialDe(vertice(pos, t * 3 + k));
        if (Math.abs(radial - g.raio) > Math.max(tol, g.raio * 0.12)) {
          todos = false;
          break;
        }
        alturas.push(h);
      }
      if (!todos) continue;
      for (const h of alturas) {
        ini = Math.min(ini, h);
        fim = Math.max(fim, h);
      }
    }
    if (!Number.isFinite(ini)) [ini, fim] = [0, 0];
    g.inicio = g.centro.clone().addScaledVector(g.eixo, ini);
    g.fim = g.centro.clone().addScaledVector(g.eixo, fim);
    g.profundidade = fim - ini;
    g.centro = g.inicio.clone().lerp(g.fim, 0.5);
    delete g.u;
    delete g.v;
  }
  // sem comprimento = corte de um cone ou chanfro, não é furo nem pino
  return juntarParecidos(lista.filter((g) => g.profundidade >= 0.3)).sort((a, b) =>
    a.tipo === b.tipo ? a.raio - b.raio : a.tipo === "furo" ? -1 : 1,
  );
}

// Junta o que é o mesmo furo/pino visto em alturas diferentes: mesmo eixo, centro quase igual e
// diâmetro parecido (furos cônicos, chanfrados ou com textura dão círculos um pouco diferentes).
// O resultado guarda o diâmetro menor e o maior (raioMin/raioMax) e o comprimento somado.
function juntarParecidos(lista) {
  const grupos = [];
  for (const g of lista) {
    const igual = grupos.find((x) => {
      if (x.tipo !== g.tipo || x.eixoNome !== g.eixoNome) return false;
      const d = g.centro.clone().sub(x.centro);
      const lateral = d.sub(x.eixo.clone().multiplyScalar(d.dot(x.eixo))).length();
      const r = Math.max(x.raio, g.raio);
      const dentroDaFaixa = g.raio >= x.raioMin - Math.max(0.3, r * 0.03) && g.raio <= x.raioMax + Math.max(0.3, r * 0.03);
      return lateral < Math.max(0.5, r * 0.03) && dentroDaFaixa;
    });
    if (!igual) {
      grupos.push({ ...g, raioMin: g.raio, raioMax: g.raio });
      continue;
    }
    igual.raioMin = Math.min(igual.raioMin, g.raio);
    igual.raioMax = Math.max(igual.raioMax, g.raio);
    // comprimento: junta as duas faixas ao longo do eixo
    const base = igual.inicio.dot(igual.eixo);
    const alturas = [igual.inicio, igual.fim, g.inicio, g.fim].map((p) => p.dot(igual.eixo) - base);
    const [ini, fim] = [Math.min(...alturas), Math.max(...alturas)];
    const lateral = igual.inicio.clone().sub(igual.eixo.clone().multiplyScalar(base));
    igual.inicio = lateral.clone().addScaledVector(igual.eixo, base + ini);
    igual.fim = lateral.clone().addScaledVector(igual.eixo, base + fim);
    igual.profundidade = fim - ini;
    igual.centro = igual.inicio.clone().lerp(igual.fim, 0.5);
    igual.raio = (igual.raioMin + igual.raioMax) / 2;
    igual.lados = Math.max(igual.lados, g.lados);
  }
  return grupos;
}

// Espessura de parede: para cada amostra, raio para dentro da peça a partir da face; a distância até
// a face do outro lado é a espessura. lancar(origem, direcao) → { distancia, normal } | null
// (feito com BVH na tela). Devolve { minima, amostras: [{ ponto, espessura }] }.
export function medirParedes(pos, lancar, { amostras = 2500 } = {}) {
  const nTri = pos.length / 9;
  const areas = new Float64Array(nTri);
  let total = 0;
  for (let t = 0; t < nTri; t++) {
    areas[t] = normalDoTriangulo(pos, t).length() / 2;
    total += areas[t];
  }
  if (!total) return { minima: null, amostras: [] };
  // amostragem sistemática pela área (determinística)
  const passo = total / Math.min(amostras, nTri);
  const resultado = [];
  let acumulado = 0;
  let proximo = passo / 2;
  for (let t = 0; t < nTri; t++) {
    acumulado += areas[t];
    while (proximo <= acumulado && resultado.length < amostras) {
      proximo += passo;
      const n = normalDoTriangulo(pos, t);
      if (n.lengthSq() < 1e-20) continue;
      n.normalize();
      const c = vertice(pos, t * 3).add(vertice(pos, t * 3 + 1)).add(vertice(pos, t * 3 + 2)).divideScalar(3);
      const dentro = n.clone().negate();
      const achado = lancar(c.clone().addScaledVector(dentro, 1e-3), dentro);
      // só conta se saiu pela face do outro lado (normal virada contra o raio)
      if (achado && achado.normal.dot(dentro) > 0.2) resultado.push({ ponto: c, espessura: achado.distancia + 1e-3 });
    }
  }
  const minima = resultado.reduce((m, a) => Math.min(m, a.espessura), Infinity);
  return { minima: Number.isFinite(minima) ? minima : null, amostras: resultado };
}

const chave = (p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;

// Laço do corte que passa mais perto do ponto clicado.
function lacoPerto(segs, ponto) {
  if (!segs.length) return [];
  const vizinhos = new Map();
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = chave(p);
      if (!vizinhos.has(k)) vizinhos.set(k, []);
      vizinhos.get(k).push(i);
    }
  });
  let inicio = 0;
  let melhor = Infinity;
  const tmp = new Vector3();
  segs.forEach(([a, b], i) => {
    const ab = b.clone().sub(a);
    const t = Math.min(1, Math.max(0, tmp.copy(ponto).sub(a).dot(ab) / (ab.lengthSq() || 1)));
    const dist = a.clone().addScaledVector(ab, t).distanceTo(ponto);
    if (dist < melhor) [melhor, inicio] = [dist, i];
  });
  const usados = new Set([inicio]);
  const laco = [segs[inicio][0], segs[inicio][1]];
  for (const lado of [1, 0]) {
    let ponta = lado ? segs[inicio][1] : segs[inicio][0];
    for (let passo = 0; passo < segs.length; passo++) {
      const prox = (vizinhos.get(chave(ponta)) ?? []).find((i) => !usados.has(i));
      if (prox === undefined) break;
      usados.add(prox);
      const [a, b] = segs[prox];
      ponta = chave(a) === chave(ponta) ? b : a;
      if (lado) laco.push(ponta);
      else laco.unshift(ponta);
    }
  }
  return laco;
}

// Eixo do cilindro em volta do ponto: as normais da parede ficam perpendiculares ao eixo,
// então o eixo é a direção com menor variância das normais.
const triangulo = new Triangle();
const maisPerto = new Vector3();
function eixoLocal(pos, ponto, normalDaFace) {
  for (const raio of [2, 5, 12]) {
    const m = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    let n = 0;
    for (let t = 0; t < pos.length / 9; t++) {
      const c = new Vector3(
        (pos[t * 9] + pos[t * 9 + 3] + pos[t * 9 + 6]) / 3,
        (pos[t * 9 + 1] + pos[t * 9 + 4] + pos[t * 9 + 7]) / 3,
        (pos[t * 9 + 2] + pos[t * 9 + 5] + pos[t * 9 + 8]) / 3,
      );
      // triângulos compridos (parede de copo de ponta a ponta) também contam: mede até a esfera em volta deles
      let alcance = 0;
      for (let k = 0; k < 3; k++) alcance = Math.max(alcance, Math.hypot(pos[t * 9 + k * 3] - c.x, pos[t * 9 + k * 3 + 1] - c.y, pos[t * 9 + k * 3 + 2] - c.z));
      if (c.distanceTo(ponto) - alcance > raio) continue;
      if (c.distanceTo(ponto) > raio) {
        triangulo.set(vertice(pos, t * 3), vertice(pos, t * 3 + 1), vertice(pos, t * 3 + 2));
        if (triangulo.closestPointToPoint(ponto, maisPerto).distanceTo(ponto) > raio) continue;
      }
      const normal = normalDoTriangulo(pos, t);
      const area = normal.length();
      if (area < 1e-12) continue;
      normal.divideScalar(area);
      // só a superfície que continua a face clicada (curva suave): a tampa e o fundo ficam de fora
      if (normalDaFace && normal.dot(normalDaFace) < 0.5) continue;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += area * normal.getComponent(i) * normal.getComponent(j);
      n++;
    }
    if (n < 6) continue;
    const [menor, meio, maior] = autovetores3(m);
    // superfície plana: só uma direção de normal → não é furo nem pino
    // (a parede de um furo com muitos lados, vista de perto, já passa de 0,5%)
    if (meio.valor < maior.valor * 0.005) return null;
    return menor.vetor;
  }
  return null;
}

// Diâmetro do furo ou pino clicado. normalDaFace: normal da face clicada (aponta para fora da peça).
// Devolve { centro, eixo, raio, rms, lados, tipo: "furo" | "pino" } ou null.
export function medirDiametro(pos, ponto, normalDaFace) {
  const eixo = eixoLocal(pos, ponto, normalDaFace && normalDaFace.clone().normalize());
  if (!eixo) return null;
  const laco = lacoPerto(segmentosDoCorte(pos, ponto, eixo), ponto);
  if (laco.length < 6) return null;
  const u = new Vector3(1, 0, 0);
  if (Math.abs(u.dot(eixo)) > 0.9) u.set(0, 1, 0);
  u.sub(eixo.clone().multiplyScalar(u.dot(eixo))).normalize();
  const v = eixo.clone().cross(u);
  const pts = laco.map((p) => {
    const d = p.clone().sub(ponto);
    return [d.dot(u), d.dot(v)];
  });
  const circulo = ajustarCirculo(pts);
  if (!circulo || circulo.r < 0.05 || circulo.rms > circulo.r * 0.06) return null;
  const centro = ponto.clone().addScaledVector(u, circulo.cx).addScaledVector(v, circulo.cy);
  const tipo = centro.clone().sub(ponto).dot(normalDaFace) > 0 ? "furo" : "pino";
  return { centro, eixo, raio: circulo.r, rms: circulo.rms, lados: contarLados(pts), tipo };
}

// ---------- Paquímetro de passar o mouse ----------
function dentroDoPoligono([x, y], pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Corte da peça por um plano, com os laços redondos já reconhecidos. Um laço dentro de um número
// ímpar de outros laços é um furo (o material fica do lado de fora dele).
function corteComCirculos(pos, origem, eixo) {
  const [u, v] = baseDoPlano(eixo);
  const altura = origem.dot(eixo);
  const lacos = lacosDoCorte(pos, origem, eixo).map((l) => ({ pts: l.pontos.map((p) => [p.dot(u), p.dot(v)]) }));
  for (const l of lacos) {
    if (l.pts.length < 9) continue;
    const c = ajustarCirculo(l.pts);
    if (!c || c.r < 0.3 || c.rms > c.r * 0.03) continue;
    const lados = contarLados(l.pts);
    if (lados < 8) continue;
    l.circulo = { ...c, lados, centro: u.clone().multiplyScalar(c.cx).addScaledVector(v, c.cy).addScaledVector(eixo, altura) };
  }
  for (const l of lacos) l.furo = lacos.filter((o) => o !== l && dentroDoPoligono(l.pts[0], o.pts)).length % 2 === 1;
  return { lacos, u, v };
}

const menorPor = (lista, f) => lista.reduce((m, x) => (m === null || f(x) < f(m) ? x : m), null);

// Até onde vai a parede redonda (raio) ao longo do eixo, a partir do centro: [ini, fim].
function extensaoDaParede(pos, centro, eixo, raio) {
  const tol = Math.max(0.05, raio * 0.03);
  let [ini, fim] = [Infinity, -Infinity];
  const radialDe = (p) => {
    const rel = p.sub(centro);
    const h = rel.dot(eixo);
    return { h, radial: rel.addScaledVector(eixo, -h).length() };
  };
  for (let t = 0; t < pos.length / 9; t++) {
    const n = normalDoTriangulo(pos, t);
    const area = n.length();
    if (area < 1e-12 || Math.abs(n.dot(eixo)) / area > 0.35) continue;
    const meio = radialDe(vertice(pos, t * 3).add(vertice(pos, t * 3 + 1)).add(vertice(pos, t * 3 + 2)).divideScalar(3));
    if (Math.abs(meio.radial - raio) > tol) continue;
    const alturas = [];
    for (let k = 0; k < 3; k++) {
      const { h, radial } = radialDe(vertice(pos, t * 3 + k));
      if (Math.abs(radial - raio) > Math.max(tol, raio * 0.12)) break;
      alturas.push(h);
    }
    if (alturas.length < 3) continue;
    ini = Math.min(ini, ...alturas);
    fim = Math.max(fim, ...alturas);
  }
  return Number.isFinite(ini) ? [ini, fim] : [0, 0];
}

const RECUO = 0.137; // corte um pouco para dentro da face (número "torto" para não cair em cima de vértices)

// O que é redondo debaixo do mouse: parede de furo/pino/copo ou a face plana de uma borda redonda
// (a boca de um copo, a ponta de um pino, a volta de um furo). pos/ponto/normal nas coordenadas da peça;
// normal aponta para fora da peça. perto: até quantos mm da borda conta como "em cima da borda".
// lancar(origem, direcao) → { distancia } | null serve para a profundidade (opcional).
// Devolve { centro, eixo, externo?, interno?, profundidade?, passante?, altura? } ou null.
// externo/interno: { raio, rms, lados }.
export function identificarRedondo(pos, ponto, normal, { perto = 0.5, lancar = null } = {}) {
  const parede = medirDiametro(pos, ponto, normal);
  const eixo = parede ? parede.eixo.clone() : normal.clone().normalize();
  const cortar = (deslocamento) => {
    const c = corteComCirculos(pos, ponto.clone().addScaledVector(eixo, deslocamento), eixo);
    const P = [ponto.dot(c.u), ponto.dot(c.v)];
    const redondos = c.lacos.filter((l) => l.circulo);
    for (const l of redondos) l.radial = Math.hypot(P[0] - l.circulo.cx, P[1] - l.circulo.cy);
    return redondos;
  };
  const naBorda = (l, tol) => Math.abs(l.radial - l.circulo.r) < tol;

  let redondos;
  let principal = null;
  let noFundo = false;
  if (parede) {
    redondos = cortar(0);
    principal = menorPor(redondos.filter((l) => naBorda(l, Math.max(perto, l.circulo.r * 0.1))), (l) => Math.abs(l.circulo.r - parede.raio));
  } else {
    redondos = cortar(-RECUO); // logo abaixo da face, dentro do material
    principal = menorPor(redondos.filter((l) => naBorda(l, perto)), (l) => Math.abs(l.radial - l.circulo.r));
    if (!principal) {
      // fundo de um furo (ou de um copo): logo acima da face há um furo em volta do ponto
      const acima = cortar(RECUO);
      const furo = menorPor(acima.filter((l) => l.furo && l.radial < l.circulo.r), (l) => l.circulo.r);
      if (furo) [redondos, principal, noFundo] = [acima, furo, true];
      // ponta de pino / boca de copo: o menor disco em volta do ponto
      else principal = menorPor(redondos.filter((l) => !l.furo && l.radial < l.circulo.r), (l) => l.circulo.r);
    }
  }
  if (!principal) return null;

  const c0 = principal.circulo;
  const juntos = redondos.filter((l) => l !== principal && Math.hypot(l.circulo.cx - c0.cx, l.circulo.cy - c0.cy) < Math.max(0.5, c0.r * 0.05));
  const [externo, interno] = principal.furo
    ? [menorPor(juntos.filter((l) => !l.furo && l.circulo.r > c0.r), (l) => l.circulo.r), principal]
    : [principal, menorPor(juntos.filter((l) => l.furo && l.circulo.r < c0.r), (l) => -l.circulo.r)];

  const resumo = (l) => l && { raio: l.circulo.r, rms: l.circulo.rms, lados: l.circulo.lados };
  const r = { centro: c0.centro.clone(), eixo, externo: resumo(externo), interno: resumo(interno) };

  // Profundidade do furo: do fundo até a boca.
  if (interno) {
    const meio = interno.circulo.centro;
    const [ini, fim] = extensaoDaParede(pos, meio, eixo, interno.circulo.r);
    if (noFundo) r.profundidade = fim - ini;
    else if (!parede) {
      // na boca: raio pelo meio do furo até bater no fundo
      if (lancar) {
        const fundo = lancar(meio, eixo.clone().negate());
        if (fundo) r.profundidade = fundo.distancia + RECUO;
        else r.passante = true;
      } else r.profundidade = fim - ini;
    } else if (lancar) {
      const cima = lancar(meio, eixo);
      const baixo = lancar(meio, eixo.clone().negate());
      if (!cima && !baixo) r.passante = true;
      else if (cima && baixo) r.profundidade = cima.distancia + baixo.distancia;
      else r.profundidade = cima ? cima.distancia - ini : baixo.distancia + fim;
    } else r.profundidade = fim - ini;
  }
  if (externo) {
    const [ini, fim] = extensaoDaParede(pos, externo.circulo.centro, eixo, externo.circulo.r);
    if (fim - ini >= 0.3) r.altura = fim - ini;
  }
  return r;
}

// Aresta reta inteira a partir de um pedaço dela (a, b): segue as arestas reais na mesma direção.
export function arestaReta(reais, a, b, graus = 2) {
  const cos = Math.cos((graus * Math.PI) / 180);
  const deChave = (k) => {
    const [x, y, z] = k.split(",").map(Number);
    return new Vector3(x / 1e4, y / 1e4, z / 1e4);
  };
  const estender = (ponta, sentido) => {
    let atual = ponta.clone();
    let k = reais.chave(atual);
    const vistos = new Set([k]);
    for (let passo = 0; passo < 100000; passo++) {
      let prox = null;
      for (const kv of reais.vizinhos.get(k) ?? []) {
        if (vistos.has(kv)) continue;
        const p = deChave(kv);
        const d = p.clone().sub(atual);
        const len = d.length();
        if (len > 1e-9 && d.divideScalar(len).dot(sentido) > cos) {
          prox = { kv, p };
          break;
        }
      }
      if (!prox) break;
      vistos.add(prox.kv);
      [atual, k] = [prox.p, prox.kv];
    }
    return atual;
  };
  const dir = b.clone().sub(a).normalize();
  const ini = estender(a, dir.clone().negate());
  const fim = estender(b, dir);
  return { a: ini, b: fim, comprimento: ini.distanceTo(fim) };
}

// Lados do polígono: cantos onde a direção muda (cada lado do furo costuma ter 2 triângulos,
// e o corte passa pelos dois, criando pontos no meio de um lado reto).
function contarLados(pts) {
  const unicos = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
  if (unicos.length > 2 && Math.hypot(unicos[0][0] - unicos.at(-1)[0], unicos[0][1] - unicos.at(-1)[1]) < 1e-6) unicos.pop();
  const n = unicos.length;
  let cantos = 0;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [unicos[(i - 1 + n) % n], unicos[i], unicos[(i + 1) % n]];
    const giro = Math.abs(Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])));
    if (giro > 1e-3) cantos++;
  }
  return cantos;
}

// Distância entre dois pontos; se as faces forem paralelas e opostas (como os bicos do paquímetro),
// também a distância perpendicular entre os planos.
// Só faces viradas uma para a outra (opostas) contam, como os bicos de fora ou as orelhas de dentro.
export function medirDistancia(pA, nA, pB, nB) {
  const reta = pA.distanceTo(pB);
  const angulo = nA && nB ? nA.angleTo(nB.clone().negate()) : Math.PI;
  const opostas = angulo < (PARALELO_GRAUS * Math.PI) / 180;
  const perpendicular = opostas ? Math.abs(pB.clone().sub(pA).dot(nA)) : null;
  return { reta, perpendicular: perpendicular > 1e-3 ? perpendicular : null, delta: pB.clone().sub(pA) };
}

// Arestas "de verdade" da malha: borda solta ou dobra maior que 20° entre os dois triângulos.
// As diagonais que só dividem uma face plana em triângulos ficam de fora (o snap não gruda nelas).
// Devolve { arestas: Set("chaveA|chaveB"), vertices: Set(chave) }.
export function arestasMarcantes(pos, dobraGraus = 20) {
  const cosLimite = Math.cos((dobraGraus * Math.PI) / 180);
  const normais = new Map();
  const nTri = pos.length / 9;
  const k = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  for (let t = 0; t < nTri; t++) {
    const n = normalDoTriangulo(pos, t);
    if (n.lengthSq() < 1e-20) continue;
    n.normalize();
    const ks = [k(t * 3), k(t * 3 + 1), k(t * 3 + 2)];
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const chaveAresta = ks[a] < ks[b] ? `${ks[a]}|${ks[b]}` : `${ks[b]}|${ks[a]}`;
      if (!normais.has(chaveAresta)) normais.set(chaveAresta, []);
      normais.get(chaveAresta).push(n);
    }
  }
  const arestas = new Set();
  const vertices = new Set();
  const vizinhos = new Map(); // vértice → vértices ligados por aresta real
  for (const [chaveAresta, ns] of normais) {
    if (ns.length === 2 && ns[0].dot(ns[1]) > cosLimite) continue;
    arestas.add(chaveAresta);
    const [a, b] = chaveAresta.split("|");
    vertices.add(a);
    vertices.add(b);
    if (!vizinhos.has(a)) vizinhos.set(a, []);
    if (!vizinhos.has(b)) vizinhos.set(b, []);
    vizinhos.get(a).push(b);
    vizinhos.get(b).push(a);
  }
  return { arestas, vertices, vizinhos, chave: (v) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}` };
}

// Profundidade/ressalto: quanto B está abaixo (ou acima) do plano da face de A.
export function medirProfundidade(pA, nA, pB) {
  return Math.abs(pB.clone().sub(pA).dot(nA));
}

// Formata em mm ou polegadas.
export function formatarMedida(mm, unidade = "mm", casas = 2) {
  if (!Number.isFinite(mm)) return "—";
  if (unidade === "pol") return `${(mm / 25.4).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}″`;
  return `${mm.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })} mm`;
}
