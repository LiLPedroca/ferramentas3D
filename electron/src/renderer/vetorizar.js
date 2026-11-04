// Vetorização (imagem -> SVG) com o imagetracerjs. Usado pelo worker e, se ele falhar, pela própria tela.
import ImageTracer from "imagetracerjs";

const DETALHE = {
  baixo: { pathomit: 16, ltres: 1.5, qtres: 1.5 },
  medio: { pathomit: 8, ltres: 1, qtres: 1 },
  alto: { pathomit: 2, ltres: 0.5, qtres: 0.5 },
};

// Cor mais comum na borda da imagem (provável fundo).
function corDoFundo({ data, width, height }) {
  const contagem = new Map();
  const somar = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 20) return;
    const chave = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  };
  for (let x = 0; x < width; x += 2) {
    somar(x, 0);
    somar(x, height - 1);
  }
  for (let y = 0; y < height; y += 2) {
    somar(0, y);
    somar(width - 1, y);
  }
  let melhor = null;
  let maximo = 0;
  for (const [chave, n] of contagem) {
    if (n > maximo) {
      maximo = n;
      melhor = chave;
    }
  }
  if (!melhor) return null;
  const [r, g, b] = melhor.split(",").map((v) => Number(v) * 16 + 8);
  return { r, g, b };
}

const distancia = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

// imagem: { width, height, data } (RGBA). opcoes: { modo: "cores"|"silhueta", cores, detalhe, suavizar, removerFundo }
export function vetorizar(imagem, opcoes) {
  const detalhe = DETALHE[opcoes.detalhe] ?? DETALHE.medio;
  const base = {
    ...detalhe,
    rightangleenhance: true,
    colorquantcycles: 3,
    blurradius: opcoes.suavizar ? 2 : 0,
    blurdelta: 20,
    strokewidth: 0,
    roundcoords: 1,
    viewbox: true,
  };

  let dados = imagem;
  let config;
  if (opcoes.modo === "silhueta") {
    // preto e branco pelo brilho; o branco vira transparente
    const copia = new Uint8ClampedArray(imagem.data);
    for (let i = 0; i < copia.length; i += 4) {
      const transparente = copia[i + 3] < 128;
      const claro = 0.299 * copia[i] + 0.587 * copia[i + 1] + 0.114 * copia[i + 2] > 128;
      const v = transparente || claro ? 255 : 0;
      copia[i] = copia[i + 1] = copia[i + 2] = v;
      copia[i + 3] = 255;
    }
    dados = { width: imagem.width, height: imagem.height, data: copia };
    config = { ...base, colorsampling: 0, numberofcolors: 2, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }] };
  } else {
    config = { ...base, colorsampling: 2, numberofcolors: Math.max(2, Math.min(16, Number(opcoes.cores) || 6)) };
  }

  const tracado = ImageTracer.imagedataToTracedata(dados, config);
  // Fundo: todas as cores da paleta parecidas com a cor da borda (a quantização pode criar
  // mais de um tom para o mesmo fundo). Se nenhuma for bem parecida, tira só a mais próxima.
  const fundo = opcoes.removerFundo && opcoes.modo !== "silhueta" ? corDoFundo(imagem) : null;
  const indicesFundo = new Set();
  if (fundo) {
    let maisProxima = -1;
    let menor = Infinity;
    tracado.palette.forEach((cor, i) => {
      const d = distancia(cor, fundo);
      if (d < 45) indicesFundo.add(i);
      if (d < menor) {
        menor = d;
        maisProxima = i;
      }
    });
    if (indicesFundo.size === 0 && menor <= 60) indicesFundo.add(maisProxima);
  }

  let cores = 0;
  tracado.palette.forEach((cor, i) => {
    const remover =
      cor.a < 20 || indicesFundo.has(i) || (opcoes.modo === "silhueta" && cor.r > 128);
    if (remover) tracado.layers[i] = [];
    else if (tracado.layers[i].length) cores += 1;
  });

  const svg = ImageTracer.getsvgstring(tracado, config);
  const caminhos = tracado.layers.reduce((s, camada) => s + camada.length, 0);
  return { svg, caminhos, cores };
}
