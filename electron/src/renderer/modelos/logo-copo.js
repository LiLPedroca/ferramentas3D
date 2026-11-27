// Logo do 2D para 3D nos Copos personalizados: onde fica o tubo do copo, a logo dobrada na curva (só na
// prévia; o arquivo leva a logo reta, deitada na mesa) e onde cada cópia fica.

// Tubo: a faixa de altura em que a superfície de fora do copo é a cor principal (sem borda, base nem
// detalhes). partes: [{ geometria }] da prévia do copo; a parte 0 é a principal.
export function medirTubo(partes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let altura = 0;
  for (const p of partes) {
    const a = p.geometria.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i] < minX) minX = a[i];
      if (a[i] > maxX) maxX = a[i];
      if (a[i + 1] < minY) minY = a[i + 1];
      if (a[i + 1] > maxY) maxY = a[i + 1];
      if (a[i + 2] > altura) altura = a[i + 2];
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const n = Math.ceil(altura) + 1;
  const raio = new Float64Array(n); // maior raio em cada faixa de 1 mm
  const raioDe = partes.map(() => new Float64Array(n));
  // maior raio em cada faixa de 1 mm e cada fatia de ângulo (o drapeado e os relevos não são redondos)
  const mapa = new Float32Array(n * ANGULOS);
  partes.forEach((p, k) => {
    const a = p.geometria.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const b = Math.min(n - 1, Math.max(0, Math.floor(a[i + 2])));
      const dx = a[i] - cx;
      const dy = a[i + 1] - cy;
      const r = Math.hypot(dx, dy);
      if (r > raioDe[k][b]) raioDe[k][b] = r;
      if (r > raio[b]) raio[b] = r;
      const c = b * ANGULOS + fatiaDoAngulo(Math.atan2(dx, -dy));
      if (r > mapa[c]) mapa[c] = r;
    }
  });
  // faixa do tubo: a parte principal está na superfície de fora (até 1,5 mm do maior raio) e as outras não
  const doTubo = (b) => raioDe[0][b] > 0 && raioDe[0][b] >= raio[b] - 1.5 && raioDe.slice(1).every((r) => r[b] < raio[b] - 1.5);
  let melhor = [0, 0];
  for (let b = 0; b < n; ) {
    if (!doTubo(b)) {
      b++;
      continue;
    }
    let f = b;
    while (f + 1 < n && doTubo(f + 1)) f++;
    if (f - b > melhor[1] - melhor[0]) melhor = [b, f];
    b = f + 1;
  }
  // 1 mm de folga em cada ponta
  // fora do tubo (borda, base, detalhes) vale o maior raio de todas as partes: a logo fica por cima delas
  const raios = Array.from(raio, (r, b) => (b >= melhor[0] && b <= melhor[1] && raioDe[0][b] ? raioDe[0][b] : r));
  return { centro: [cx, cy], altura, z0: melhor[0] + 1, z1: melhor[1], raios, mapa };
}

// Fatias de ângulo do mapa de raios (4° cada). Ângulo 0 = frente (-Y), como em logoNaCurva.
const ANGULOS = 90;
const voltaToda = 2 * Math.PI;
const fatiaDoAngulo = (teta) => Math.floor(((((teta % voltaToda) + voltaToda) % voltaToda) / voltaToda) * ANGULOS) % ANGULOS;

// Raio do cilindro onde a peça fica: o ponto mais saliente do copo embaixo dela (todas as alturas e ângulos
// que ela cobre). A peça inteira fica nesse cilindro, sem abrir para fora nas partes onduladas do copo.
export function raioDaPeca(tubo, caixa, pos) {
  const meio = raioEm(tubo, pos.z);
  if (!tubo.mapa) return meio;
  const n = tubo.raios.length;
  const de = Math.max(0, Math.floor(pos.z - caixa.altura / 2));
  const ate = Math.min(n - 1, Math.floor(pos.z + caixa.altura / 2));
  const meiaVolta = Math.min(Math.PI, caixa.largura / 2 / Math.max(1, meio) + voltaToda / ANGULOS);
  const fatias = Math.ceil((meiaVolta / voltaToda) * ANGULOS);
  const centro = fatiaDoAngulo(pos.angulo);
  let maior = 0;
  for (let b = de; b <= ate; b++) {
    for (let k = -fatias; k <= fatias; k++) {
      const r = tubo.mapa[b * ANGULOS + ((centro + k + ANGULOS) % ANGULOS)];
      if (r > maior) maior = r;
    }
  }
  return maior || meio;
}

// Raio do tubo na altura z (mm), entre as faixas de 1 mm.
export function raioEm(tubo, z) {
  const t = Math.min(tubo.raios.length - 1.001, Math.max(0, z - 0.5));
  const b = Math.floor(t);
  return tubo.raios[b] + (tubo.raios[b + 1] - tubo.raios[b]) * (t - b);
}

// Caixa das malhas da logo ([{ vertices }]) no plano: { min:[x,y], max:[x,y], largura, altura }.
export function caixaDaLogo(malhas) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of malhas) {
    for (let i = 0; i < m.vertices.length; i += 3) {
      minX = Math.min(minX, m.vertices[i]);
      maxX = Math.max(maxX, m.vertices[i]);
      minY = Math.min(minY, m.vertices[i + 1]);
      maxY = Math.max(maxY, m.vertices[i + 1]);
    }
  }
  return { min: [minX, minY], max: [maxX, maxY], largura: maxX - minX, altura: maxY - minY };
}

// A altura do centro da logo fica dentro do tubo (a logo inteira não passa da borda nem da base).
export function limitarAltura(z, alturaLogo, tubo) {
  const meio = (tubo.z0 + tubo.z1) / 2;
  if (alturaLogo >= tubo.z1 - tubo.z0) return meio;
  return Math.min(tubo.z1 - alturaLogo / 2, Math.max(tubo.z0 + alturaLogo / 2, z));
}

// Posição livre na altura: a logo pode ir do pé à boca do copo (só não sai dele).
export function limitarNoCopo(z, alturaLogo, tubo) {
  const topo = tubo.altura ?? tubo.z1;
  if (alturaLogo >= topo) return topo / 2;
  return Math.min(topo - alturaLogo / 2, Math.max(alturaLogo / 2, z));
}

// A logo nessa altura passa do tubo (fica por cima da borda, da base ou de um detalhe).
export const passaDoTubo = (z, alturaLogo, tubo) => z - alturaLogo / 2 < tubo.z0 - 0.01 || z + alturaLogo / 2 > tubo.z1 + 0.01;

// Logo maior que o tubo (na altura): ela encosta na borda ou na base.
export const logoMaiorQueOTubo = (alturaLogo, tubo) => alturaLogo > tubo.z1 - tubo.z0;

const voltaInteira = 2 * Math.PI;
const normalizar = (a) => ((a % voltaInteira) + voltaInteira) % voltaInteira;

// Ângulo da próxima cópia: a primeira vai atrás (180°), as seguintes no meio do maior espaço livre.
// largura: quanto uma logo ocupa em volta do copo (radianos, com folga). null = não cabe mais.
export function anguloDaNovaCopia(angulos, largura) {
  if (!angulos.length) return 0;
  if (angulos.length === 1) return normalizar(angulos[0] + Math.PI);
  const a = angulos.map(normalizar).sort((x, y) => x - y);
  let melhor = null;
  for (let i = 0; i < a.length; i++) {
    const de = a[i];
    const ate = i + 1 < a.length ? a[i + 1] : a[0] + voltaInteira;
    if (!melhor || ate - de > melhor.vao) melhor = { vao: ate - de, meio: normalizar((de + ate) / 2) };
  }
  return melhor.vao >= 2 * largura ? melhor.meio : null;
}

// Prévia: a logo dobrada na superfície do tubo. pos: { angulo (rad, 0 = frente), z (centro, mm) }.
// Triângulos compridos são divididos antes (senão cortariam a curva por dentro do copo).
// normais (opcional): lista que recebe a normal de cada vértice, já curvada. Sem elas, a luz calculada
// triângulo a triângulo riscava a prévia (os pedaços finos da divisão ficavam com sombras diferentes).
export function logoNaCurva(malha, caixa, pos, tubo, { folga = 0.25, passo = 2, normais = null } = {}) {
  const lcx = (caixa.min[0] + caixa.max[0]) / 2;
  const lcy = (caixa.min[1] + caixa.max[1]) / 2;
  // um cilindro só por cópia: com o raio mudando por altura, a peça abria nas partes onduladas e as camadas
  // dela (base, letras, cores) se atravessavam, riscando a prévia
  const raioMeio = raioDaPeca(tubo, caixa, pos);
  const [cx, cy] = tubo.centro;
  const v = malha.vertices;
  const t = malha.triangulos;
  const saida = [];
  const ponto = (i) => [v[i * 3] - lcx, v[i * 3 + 1] - lcy, v[i * 3 + 2]];
  const curvar = ([u, w, h]) => {
    const z = pos.z + w;
    const r = raioMeio + folga + h;
    const teta = pos.angulo + u / raioMeio;
    return [cx + r * Math.sin(teta), cy - r * Math.cos(teta), z];
  };
  // normal da peça plana (nu, nw, nh) levada para a curva no ângulo do ponto
  let normal = [0, 0, 1];
  const normalCurvada = (u) => {
    const teta = pos.angulo + u / raioMeio;
    const c = Math.cos(teta);
    const s = Math.sin(teta);
    const [nu, nw, nh] = normal;
    return [nu * c + nh * s, nu * s - nh * c, nw];
  };
  // Corta cada triângulo nas mesmas linhas verticais (u = k · passo) para todos: vizinhos são divididos nos
  // mesmos pontos da aresta comum. Dividir cada um pelo meio deixava frestas finas entre eles (riscos).
  const emitir = (p) => {
    saida.push(...curvar(p));
    if (normais) normais.push(...normalCurvada(p[0]));
  };
  const cortar = (poligono, u, manterMaior) => {
    const fora = [];
    for (let k = 0; k < poligono.length; k++) {
      const p = poligono[k];
      const q = poligono[(k + 1) % poligono.length];
      const pDentro = manterMaior ? p[0] >= u : p[0] <= u;
      const qDentro = manterMaior ? q[0] >= u : q[0] <= u;
      if (pDentro) fora.push(p);
      if (pDentro !== qDentro) {
        const f = (u - p[0]) / (q[0] - p[0]);
        fora.push([u, p[1] + f * (q[1] - p[1]), p[2] + f * (q[2] - p[2])]);
      }
    }
    return fora;
  };
  const dividir = (a, b, c) => {
    const umin = Math.min(a[0], b[0], c[0]);
    const umax = Math.max(a[0], b[0], c[0]);
    const primeira = Math.floor(umin / passo);
    const ultima = Math.max(primeira + 1, Math.ceil(umax / passo)); // parede vertical (u constante) também sai
    for (let k = primeira; k < ultima; k++) {
      let fatia = [a, b, c];
      if (k * passo > umin) fatia = cortar(fatia, k * passo, true);
      if ((k + 1) * passo < umax) fatia = cortar(fatia, (k + 1) * passo, false);
      for (let j = 1; j + 1 < fatia.length; j++) {
        emitir(fatia[0]);
        emitir(fatia[j]);
        emitir(fatia[j + 1]);
      }
    }
  };
  for (let i = 0; i < t.length; i += 3) {
    const a = ponto(t[i]);
    const b = ponto(t[i + 1]);
    const c = ponto(t[i + 2]);
    if (normais) {
      const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
      const l = Math.hypot(...n) || 1;
      normal = [n[0] / l, n[1] / l, n[2] / l];
    }
    dividir(a, b, c);
  }
  return new Float32Array(saida);
}

// Na mesa: as logos retas, deitadas, numa coluna à direita do copo (e depois à esquerda).
// copo: { min:[x,y], max:[x,y] } na mesa. Devolve [{ x, y }] (canto de baixo à esquerda de cada logo) e
// se todas couberam na mesa.
export function logosNaMesa(n, caixa, copo, opcoes = {}) {
  return pecasNaMesa(Array.from({ length: n }, () => caixa), copo, opcoes);
}

// Mesmo arranjo, com peças de tamanhos diferentes (logos e nomes juntos). caixas: [{ largura, altura }].
export function pecasNaMesa(caixas, copo, { mesa = [260, 260], folga = 6, margem = 5 } = {}) {
  const lugares = [];
  let cabem = true;
  let coluna = 0; // 0 = à direita do copo, 1 = à esquerda
  let y = margem;
  for (const caixa of caixas) {
    if (y + caixa.altura > mesa[1] - margem && coluna < 1) {
      coluna++;
      y = margem;
    }
    const x = coluna === 0 ? copo.max[0] + folga : copo.min[0] - folga - caixa.largura;
    const livre = coluna === 0 ? mesa[0] - margem - (copo.max[0] + folga) : copo.min[0] - folga - margem;
    if (livre < caixa.largura || y + caixa.altura > mesa[1] - margem) cabem = false;
    lugares.push({ x, y });
    y += caixa.altura + folga;
  }
  return { lugares, cabem };
}
