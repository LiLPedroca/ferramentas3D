// Geometria dos modelos personalizados: texto em relevo (opentype.js) e bases com argola.
// Unidades em milímetros. Z para cima, base apoiada em z = 0.
import * as THREE from "three";

// ---------- Contornos ----------
// Tira pontos repetidos seguidos e o ponto final igual ao inicial (geram triângulos degenerados
// e deixam a malha com arestas abertas).
function limparPontos(pts, tolerancia = 1e-6) {
  const limpos = [];
  for (const p of pts) {
    const ultimo = limpos[limpos.length - 1];
    if (!ultimo || Math.abs(ultimo.x - p.x) > tolerancia || Math.abs(ultimo.y - p.y) > tolerancia) limpos.push(p);
  }
  while (limpos.length > 2) {
    const a = limpos[0];
    const b = limpos[limpos.length - 1];
    if (Math.abs(a.x - b.x) > tolerancia || Math.abs(a.y - b.y) > tolerancia) break;
    limpos.pop();
  }
  return limpos;
}

// Converte os comandos de um caminho do opentype em polígonos (lista de pontos), com Y para cima.
function poligonosDoCaminho(caminho, segmentosCurva = 8) {
  const poligonos = [];
  let atual = null;
  let x0 = 0;
  let y0 = 0;
  const fechar = () => {
    if (atual) {
      const pts = limparPontos(atual.getPoints(segmentosCurva));
      if (pts.length >= 3) poligonos.push(pts);
    }
    atual = null;
  };
  for (const c of caminho.commands) {
    if (c.type === "M") {
      fechar();
      atual = new THREE.Path();
      atual.moveTo(c.x, -c.y);
      x0 = c.x;
      y0 = -c.y;
    } else if (c.type === "L") atual?.lineTo(c.x, -c.y);
    else if (c.type === "Q") atual?.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === "C") atual?.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
    else if (c.type === "Z") {
      atual?.lineTo(x0, y0);
      fechar();
    }
  }
  fechar();
  return poligonos;
}

const areaComSinal = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
  return a / 2;
};

function pontoDentro(p, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

// Classifica os contornos de uma letra em sólidos e furos. Devolve THREE.Shape[].
// Regra das fontes (preenchimento "nonzero"): contorno no mesmo sentido do maior é sólido, mesmo
// que esteja dentro de outro (peças sobrepostas, como a barra do "A" em algumas fontes, se somam);
// furo é sempre o contorno desenhado no sentido oposto.
export function formasDosPoligonos(poligonos) {
  const itens = poligonos
    .map((pts) => {
      const sinal = areaComSinal(pts);
      return { pts, area: Math.abs(sinal), positivo: sinal > 0 };
    })
    .filter((i) => i.area > 1e-6)
    .sort((a, b) => b.area - a.area);
  if (itens.length === 0) return [];

  const contem = (externo, interno) => externo !== interno && externo.area > interno.area && pontoDentro(interno.pts[0], externo.pts);
  const sentidoSolido = itens[0].positivo;
  const solidos = itens.filter((i) => i.positivo === sentidoSolido);
  const furos = itens.filter((i) => i.positivo !== sentidoSolido);

  const formas = new Map(solidos.map((s) => [s, new THREE.Shape(s.pts)]));
  for (const furo of furos) {
    // o menor sólido que contém o furo
    const dono = solidos.filter((s) => contem(s, furo)).sort((a, b) => a.area - b.area)[0];
    if (dono) formas.get(dono).holes.push(new THREE.Path(furo.pts));
  }
  return [...formas.values()];
}

// Formas do texto com altura total "alturaMm" (do topo das maiúsculas ao pé das descendentes).
// Devolve { formas, caixa: { minX, maxX, minY, maxY } } com o texto começando em x = 0 e centrado em y = 0.
export function formasDoTexto(fonte, texto, alturaMm, { espacamento = 0 } = {}) {
  const t = String(texto ?? "");
  const tamanhoBase = 100;
  // Letra a letra (com kerning), sem o motor de composição do opentype.js, que falha em
  // algumas fontes com regras de substituição avançadas.
  const escalaFonte = tamanhoBase / fonte.unitsPerEm;
  const caminhos = [];
  let x = 0;
  let anterior = null;
  for (const caractere of t) {
    const glifo = fonte.charToGlyph(caractere);
    if (anterior) x += fonte.getKerningValue(anterior, glifo) * escalaFonte;
    caminhos.push(glifo.getPath(x, 0, tamanhoBase));
    x += (glifo.advanceWidth ?? 0) * escalaFonte + espacamento * tamanhoBase;
    anterior = glifo;
  }
  const poligonos = caminhos.map((c) => poligonosDoCaminho(c));
  const todos = poligonos.flat();
  if (todos.length === 0) throw new Error("O texto não tem letras desenháveis nesta fonte.");

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pts of todos) {
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const escala = alturaMm / (maxY - minY);
  const meioY = (minY + maxY) / 2;
  const transformar = (pts) => pts.map((p) => new THREE.Vector2((p.x - minX) * escala, (p.y - meioY) * escala));

  // cada letra separada: contornos de letras diferentes não viram furos umas das outras
  const formas = poligonos.flatMap((lista) => formasDosPoligonos(lista.map(transformar)));
  const largura = (maxX - minX) * escala;
  return { formas, caixa: { minX: 0, maxX: largura, minY: -alturaMm / 2, maxY: alturaMm / 2 } };
}

// ---------- Bases ----------
// Retângulo com o lado esquerdo em meia-lua e um furo para a argola.
// caixa: área do conteúdo (texto). opcoes: { margem, furo, parede, raio }
export function baseComArgola(caixa, { margem = 3, furo = 4.5, parede = 2.5, raio = 3 } = {}) {
  const altura = Math.max(caixa.maxY - caixa.minY + 2 * margem, furo + 2 * parede);
  const metade = altura / 2;
  const cy = (caixa.maxY + caixa.minY) / 2;
  const direita = caixa.maxX + margem;
  const esquerdaConteudo = caixa.minX - margem;
  const centroFuroX = esquerdaConteudo - parede - furo / 2;
  const esquerda = centroFuroX; // centro da meia-lua
  const r = Math.min(raio, metade);

  const forma = new THREE.Shape();
  forma.moveTo(esquerda, cy - metade);
  forma.lineTo(direita - r, cy - metade);
  forma.quadraticCurveTo(direita, cy - metade, direita, cy - metade + r);
  forma.lineTo(direita, cy + metade - r);
  forma.quadraticCurveTo(direita, cy + metade, direita - r, cy + metade);
  forma.lineTo(esquerda, cy + metade);
  forma.absarc(esquerda, cy, metade, Math.PI / 2, (3 * Math.PI) / 2, false);

  const buraco = new THREE.Path();
  buraco.absarc(centroFuroX, cy, furo / 2, 0, Math.PI * 2, true);
  forma.holes.push(buraco);

  return { forma, caixa: { minX: esquerda - metade, maxX: direita, minY: cy - metade, maxY: cy + metade } };
}

// ---------- Extrusão ----------
export function extrudar(formas, espessura, zInicial = 0) {
  const lista = Array.isArray(formas) ? formas : [formas];
  const geometria = new THREE.ExtrudeGeometry(lista, { depth: espessura, bevelEnabled: false, curveSegments: 12 });
  geometria.translate(0, 0, zInicial);
  return geometria;
}

// Leva o conjunto para x, y >= 0 (como os fatiadores esperam ver o modelo).
export function posicionarNaOrigem(geometrias) {
  const caixa = new THREE.Box3();
  for (const g of geometrias) {
    g.computeBoundingBox();
    caixa.union(g.boundingBox);
  }
  for (const g of geometrias) g.translate(-caixa.min.x, -caixa.min.y, -caixa.min.z);
  const tamanho = new THREE.Vector3();
  caixa.getSize(tamanho);
  return tamanho;
}
