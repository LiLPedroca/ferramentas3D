// Geometria dos modelos personalizados: texto em relevo (opentype.js) e bases com argola.
// Unidades em milímetros. Z para cima, base apoiada em z = 0.
import * as THREE from "three";

// ---------- Contornos ----------
// Tira pontos repetidos seguidos e o ponto final igual ao inicial (geram triângulos degenerados
// e deixam a malha com arestas abertas).
export function limparPontos(pts, tolerancia = 1e-6) {
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

// Remove pontos alinhados com os vizinhos, inclusive "espinhos" (o contorno vai e volta pelo mesmo
// caminho), que geram paredes sobrepostas e deixam a malha aberta. Comum em contornos vetorizados.
export function simplificarContorno(pts, tolerancia = 1e-4) {
  let lista = limparPontos(pts, tolerancia);
  let mudou = true;
  while (mudou && lista.length > 3) {
    mudou = false;
    const nova = [];
    for (let i = 0; i < lista.length; i++) {
      const a = nova.length ? nova[nova.length - 1] : lista[lista.length - 1];
      const b = lista[i];
      const c = lista[(i + 1) % lista.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const bcx = c.x - b.x;
      const bcy = c.y - b.y;
      const cruz = abx * bcy - aby * bcx;
      const escala = Math.hypot(abx, aby) * Math.hypot(bcx, bcy);
      if (Math.abs(cruz) <= tolerancia * Math.max(escala, 1e-12)) {
        mudou = true; // b está na reta de a até c (ou é a ponta de um espinho): sai
        continue;
      }
      nova.push(b);
    }
    lista = limparPontos(nova, tolerancia);
  }
  return lista;
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

// Disco em volta do conteúdo, com o furo da argola dentro da borda de cima.
// raioDoConteudo (opcional): distância do centro ao ponto mais afastado do conteúdo. Sem ele, usa
// a meia diagonal da caixa (que sobra bastante em conteúdos redondos).
export function baseCircularComArgola(caixa, { margem = 3, furo = 4.5, parede = 2, raioDoConteudo } = {}) {
  const cx = (caixa.minX + caixa.maxX) / 2;
  const cy = (caixa.minY + caixa.maxY) / 2;
  const raioConteudo = (raioDoConteudo ?? Math.hypot(caixa.maxX - caixa.minX, caixa.maxY - caixa.minY) / 2) + margem;
  const raio = raioConteudo + furo + 2 * parede;
  const forma = new THREE.Shape();
  forma.absarc(cx, cy, raio, 0, Math.PI * 2, false);
  const buraco = new THREE.Path();
  buraco.absarc(cx, cy + raioConteudo + parede + furo / 2, furo / 2, 0, Math.PI * 2, true);
  forma.holes.push(buraco);
  return { forma, caixa: { minX: cx - raio, maxX: cx + raio, minY: cy - raio, maxY: cy + raio } };
}

// Placa de cantos arredondados em volta do conteúdo (sem argola).
export function placaArredondada(caixa, { margem = 4, raio = 4 } = {}) {
  const x0 = caixa.minX - margem;
  const x1 = caixa.maxX + margem;
  const y0 = caixa.minY - margem;
  const y1 = caixa.maxY + margem;
  const r = Math.min(raio, (x1 - x0) / 2, (y1 - y0) / 2);
  const forma = new THREE.Shape();
  forma.moveTo(x0 + r, y0);
  forma.lineTo(x1 - r, y0);
  forma.quadraticCurveTo(x1, y0, x1, y0 + r);
  forma.lineTo(x1, y1 - r);
  forma.quadraticCurveTo(x1, y1, x1 - r, y1);
  forma.lineTo(x0 + r, y1);
  forma.quadraticCurveTo(x0, y1, x0, y1 - r);
  forma.lineTo(x0, y0 + r);
  forma.quadraticCurveTo(x0, y0, x0 + r, y0);
  return { forma, caixa: { minX: x0, maxX: x1, minY: y0, maxY: y1 } };
}

// Retângulo simples (barra de ligação das letras).
export function retangulo(x0, y0, x1, y1) {
  const forma = new THREE.Shape();
  forma.moveTo(x0, y0);
  forma.lineTo(x1, y0);
  forma.lineTo(x1, y1);
  forma.lineTo(x0, y1);
  forma.lineTo(x0, y0);
  return forma;
}

// Move os pontos de formas (e furos) no plano.
export function moverFormas(formas, dx, dy) {
  return formas.map((f) => {
    const nova = new THREE.Shape(f.getPoints(12).map((p) => new THREE.Vector2(p.x + dx, p.y + dy)));
    nova.holes = f.holes.map((h) => new THREE.Path(h.getPoints(12).map((p) => new THREE.Vector2(p.x + dx, p.y + dy))));
    return nova;
  });
}

// Malha do Manifold ({ vertices, triangulos }) → geometria indexada do Three.js, marcada como fechada.
export function geometriaDaMalha({ vertices, triangulos }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  g.setIndex(new THREE.BufferAttribute(triangulos, 1));
  g.userData.fechada = true;
  return g;
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
