// STL e 3MF no 2D para 3D: a peça vista de cima vira uma imagem (o que se vê olhando a mesa de cima).
// 3MF com cores: cada pedaço sai com a sua cor. Sem cores (STL): cada altura vira uma cor
// (a base numa cor, o relevo em outra), para o 2D para 3D separar as partes.

// Cores das alturas, da mais baixa para a mais alta.
export const CORES_DAS_ALTURAS = ["#000000", "#FFFFFF", "#E53935", "#FDD835", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA"];

const hexParaRgb = (h) => {
  const n = Number.parseInt(String(h).replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Alturas que aparecem de cima: agrupa as alturas próximas (degrau menor que `degrau` mm é a mesma
// altura) e descarta grupos pequenos demais (menos de `minimo` dos pixels). Devolve os centros, crescentes.
export function niveisDeAltura(alturas, { degrau = 0.3, minimo = 0.005, maximo = CORES_DAS_ALTURAS.length } = {}) {
  if (!alturas.length) return [];
  const ordenadas = Float64Array.from(alturas).sort();
  const grupos = [];
  let inicio = 0;
  for (let i = 1; i <= ordenadas.length; i++) {
    if (i === ordenadas.length || ordenadas[i] - ordenadas[i - 1] > degrau) {
      grupos.push({ de: ordenadas[inicio], ate: ordenadas[i - 1], n: i - inicio, soma: ordenadas.slice(inicio, i).reduce((s, z) => s + z, 0) });
      inicio = i;
    }
  }
  let bons = grupos.filter((g) => g.n >= minimo * ordenadas.length);
  if (!bons.length) bons = [grupos.reduce((a, b) => (b.n > a.n ? b : a))];
  // muitas alturas: fica com as mais usadas (sempre a base, que é a mais baixa)
  if (bons.length > maximo) bons = [bons[0], ...bons.slice(1).sort((a, b) => b.n - a.n).slice(0, maximo - 1)].sort((a, b) => a.de - b.de);
  return bons.map((g) => g.soma / g.n);
}

// pecas: [{ posicoes: Float32Array (triângulos soltos, 9 números cada), cor?, coresTriangulos? }].
// Devolve { width, height, data (RGBA, fundo transparente), larguraMm, alturaMm, porCor, cores }.
export function vistaDeCima(pecas, { lado = 2000, margem = 0.02 } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pecas) {
    const a = p.posicoes;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i] < minX) minX = a[i];
      if (a[i] > maxX) maxX = a[i];
      if (a[i + 1] < minY) minY = a[i + 1];
      if (a[i + 1] > maxY) maxY = a[i + 1];
    }
  }
  const larguraMm = maxX - minX;
  const alturaMm = maxY - minY;
  if (!(larguraMm > 0 && alturaMm > 0)) throw new Error("Essa peça não tem área vista de cima.");
  const util = Math.round(lado * (1 - 2 * margem));
  const escala = util / Math.max(larguraMm, alturaMm);
  const borda = Math.round(lado * margem);
  const width = Math.max(1, Math.round(larguraMm * escala)) + 2 * borda;
  const height = Math.max(1, Math.round(alturaMm * escala)) + 2 * borda;
  const topo = new Float32Array(width * height).fill(-Infinity);
  const qualCor = new Int16Array(width * height).fill(-1);

  // cores do arquivo (null = sem cor)
  const cores = [];
  const indiceDaCor = new Map();
  const corId = (c) => {
    const chave = c ? String(c).toUpperCase().slice(0, 7) : null;
    if (!indiceDaCor.has(chave)) {
      indiceDaCor.set(chave, cores.length);
      cores.push(chave);
    }
    return indiceDaCor.get(chave);
  };

  // pixel (x, y) da imagem: x cresce para a direita, y para baixo (o fundo da mesa fica em cima)
  const px = (x) => (x - minX) * escala + borda;
  const py = (y) => (maxY - y) * escala + borda;
  for (const p of pecas) {
    const a = p.posicoes;
    const base = corId(p.cor);
    for (let i = 0, t = 0; i + 8 < a.length; i += 9, t++) {
      const cor = p.coresTriangulos?.[t] ? corId(p.coresTriangulos[t]) : base;
      const x0 = px(a[i]), y0 = py(a[i + 1]), z0 = a[i + 2];
      const x1 = px(a[i + 3]), y1 = py(a[i + 4]), z1 = a[i + 5];
      const x2 = px(a[i + 6]), y2 = py(a[i + 7]), z2 = a[i + 8];
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue; // parede vista de lado: não aparece de cima
      const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const xb = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
      const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const yb = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
      for (let y = ya; y <= yb; y++) {
        const cy = y + 0.5;
        for (let x = xa; x <= xb; x++) {
          const cx = x + 0.5;
          const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area;
          const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * z0 + w1 * z1 + w2 * z2;
          const k = y * width + x;
          if (z > topo[k]) {
            topo[k] = z;
            qualCor[k] = cor;
          }
        }
      }
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  const comCor = cores.filter(Boolean);
  const porCor = comCor.length >= 2;
  if (porCor) {
    const rgb = cores.map((c) => (c ? hexParaRgb(c) : [128, 128, 128]));
    const quantos = new Array(cores.length).fill(0);
    let total = 0;
    for (let k = 0; k < qualCor.length; k++) {
      if (qualCor[k] < 0) continue;
      const [r, g, b] = rgb[qualCor[k]];
      data.set([r, g, b, 255], k * 4);
      quantos[qualCor[k]]++;
      total++;
    }
    // só as cores que aparecem de cima (pedaços escondidos embaixo não contam)
    const visiveis = cores.filter((c, i) => quantos[i] > 0.002 * total).map((c) => c ?? "#808080");
    return { width, height, data, larguraMm, alturaMm, porCor, cores: visiveis };
  }
  // sem cores: uma cor por altura
  const alturas = [];
  for (let k = 0; k < topo.length; k++) if (topo[k] > -Infinity) alturas.push(topo[k]);
  const niveis = niveisDeAltura(alturas);
  const rgb = CORES_DAS_ALTURAS.map(hexParaRgb);
  for (let k = 0; k < topo.length; k++) {
    if (topo[k] === -Infinity) continue;
    let melhor = 0;
    for (let n = 1; n < niveis.length; n++) if (Math.abs(topo[k] - niveis[n]) < Math.abs(topo[k] - niveis[melhor])) melhor = n;
    const [r, g, b] = rgb[melhor];
    data.set([r, g, b, 255], k * 4);
  }
  return { width, height, data, larguraMm, alturaMm, porCor, cores: CORES_DAS_ALTURAS.slice(0, niveis.length) };
}
