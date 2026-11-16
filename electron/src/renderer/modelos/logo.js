// Criador de logos (antes "Chaveiro de logo"): a imagem vetorizada por cores vira relevo sobre uma base,
// com ou sem argola. Cada cor é uma parte separada no 3MF (impressão multicor). Geometria com o Manifold:
// cores sem sobreposição, base de contorno (com pontes), círculo ou retangular, argola em qualquer ponto da borda.
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { simplificarContorno } from "./geometria.js";
import { areaComSinal, comEscopo, malhaDoSolido, prenderArgola, resolverLargura, unirIlhas } from "./manifold.js";

export const ESTILOS_LOGO = ["contorno", "circulo", "retangular"];

export const PADRAO_LOGO = {
  largura: 50,
  borda: 0, // 0 = a base segue exatamente o contorno do logo
  base: 2.4,
  relevo: 1.2,
  furo: 4,
  parede: 2,
  estilo: "contorno",
  argola: null, // posição na borda (0 a 1); null = em cima, no meio
  comArgola: true, // false = só o logo (para colar, aplique)
  corBase: "#f4f4f4",
};

export const LIMITES_LOGO = { largura: [20, 150], borda: [0, 8], base: [1.2, 8], relevo: [0.4, 5], furo: [3, 8], parede: [1.6, 5] };
const NOMES = { largura: "Largura total", borda: "Borda", base: "Base", relevo: "Relevo", furo: "Furo da argola", parede: "Parede da argola" };
const virgula = (n) => String(n).replace(".", ",");

function numero(valor, chave) {
  const [minimo, maximo] = LIMITES_LOGO[chave];
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < minimo || n > maximo) throw new Error(`${NOMES[chave]}: use de ${virgula(minimo)} a ${virgula(maximo)} mm.`);
  return n;
}

export function validarOpcoesLogo(entrada = {}) {
  const o = { ...PADRAO_LOGO, ...entrada };
  if (!ESTILOS_LOGO.includes(o.estilo)) throw new Error("Estilo de base inválido.");
  const argola = o.argola === null || o.argola === undefined || o.argola === "" ? null : Number(o.argola);
  if (argola !== null && !(argola >= 0 && argola <= 1)) throw new Error("Posição da argola inválida.");
  const opcoes = { estilo: o.estilo, argola, comArgola: o.comArgola !== false, corBase: /^#[0-9a-f]{6}$/i.test(o.corBase) ? o.corBase.toLowerCase() : PADRAO_LOGO.corBase };
  for (const chave of Object.keys(LIMITES_LOGO)) opcoes[chave] = numero(o[chave], chave);
  return opcoes;
}

// SVG do vetorizador → contornos por cor, em unidades com a arte de 100 de largura e Y para cima.
// Devolve [{ cor, formas: [[externo, ...furos]] }], com .quadro = { minX, maxY, escala } (para voltar
// de um ponto da peça ao ponto do SVG). juntar: une tons quase iguais (o mapa de cores prontas não precisa).
// tolerancia: tira pontos que desviam menos que isso (em unidades do SVG) da reta entre os vizinhos.
// passo (opcional): corda máxima em unidades da arte (100 de largura); cada curva é amostrada pelo
// comprimento, e não por um número fixo de divisões (curva grande não fica facetada).
export function coresDoSvg(svg, { juntar = true, tolerancia = 0, passo = 0 } = {}) {
  const dados = new SVGLoader().parse(svg);
  const grupos = new Map();
  for (const caminho of dados.paths) {
    const preenchimento = caminho.userData?.style?.fill;
    if (!preenchimento || preenchimento === "none") continue;
    if (Number(caminho.userData?.style?.fillOpacity ?? 1) < 0.1) continue;
    const cor = `#${caminho.color.getHexString()}`;
    if (!grupos.has(cor)) grupos.set(cor, []);
    grupos.get(cor).push(...SVGLoader.createShapes(caminho));
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const formas of grupos.values()) {
    for (const f of formas) {
      for (const p of f.getPoints(8)) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  if (!grupos.size || !(maxX > minX)) throw new Error("A imagem ficou vazia depois da conversão. Tente outra imagem ou desligue a remoção de fundo.");
  const escala = 100 / (maxX - minX);
  // o contorno do vetorizador repete cantos de pixel e faz "espinhos": simplifica antes
  const converter = (pts) => {
    let lista = simplificarContorno(pts.map((p) => new THREE.Vector2(p.x, p.y)));
    if (tolerancia > 0) lista = reduzirLaco(lista, tolerancia);
    return lista.map((p) => [(p.x - minX) * escala, (maxY - p.y) * escala]);
  };
  const passoSvg = passo > 0 ? passo / escala : 0;
  const pontos = (caminho) => (passoSvg ? pontosPorPasso(caminho, passoSvg) : caminho.getPoints(8));
  const lista = [...grupos].map(([cor, formas]) => ({
    cor,
    formas: formas
      .map((f) => [converter(pontos(f)), ...f.holes.map((h) => converter(pontos(h)))].filter((l) => l.length >= 3))
      .filter((lacos) => lacos.length && lacos[0].length >= 3),
  }));
  const saida = juntar ? juntarCoresParecidas(lista) : lista;
  saida.quadro = { minX, maxY, escala };
  return saida;
}

// Pontos de um caminho do SVGLoader com corda de no máximo "passo" (unidades do SVG).
function pontosPorPasso(caminho, passo) {
  const pts = [];
  for (const curva of caminho.curves) {
    if (curva.isLineCurve) {
      const n = Math.max(1, Math.ceil(curva.v1.distanceTo(curva.v2) / passo));
      for (let i = 0; i < n; i++) pts.push(curva.getPoint(i / n));
      continue;
    }
    // getPointAt: posição pelo comprimento (a Bézier não anda em passos iguais com o parâmetro)
    curva.arcLengthDivisions = Math.max(200, Math.ceil(curva.getLength() / passo) * 4);
    curva.updateArcLengths();
    const n = Math.max(2, Math.ceil(curva.getLength() / passo) + 1);
    for (let i = 0; i < n; i++) pts.push(curva.getPointAt(i / n));
  }
  return pts;
}

// Douglas-Peucker num laço fechado: mantém o formato com desvio menor que "tolerancia".
export function reduzirLaco(pts, tolerancia) {
  const n = pts.length;
  if (n < 8) return pts;
  // começa pelo ponto mais longe do primeiro (dois "cantos" fixos)
  let longe = 0;
  let maior = -1;
  for (let i = 1; i < n; i++) {
    const d = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
    if (d > maior) {
      maior = d;
      longe = i;
    }
  }
  const manter = new Uint8Array(n);
  manter[0] = manter[longe] = 1;
  const t2 = tolerancia * tolerancia;
  const pilha = [[0, longe], [longe, n]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    if (b - a < 2) continue;
    const A = pts[a];
    const B = pts[b % n];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const l2 = dx * dx + dy * dy;
    let pior = -1;
    let dpior = t2;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      let d;
      if (l2 < 1e-12) d = (P.x - A.x) ** 2 + (P.y - A.y) ** 2;
      else {
        const c = dx * (P.y - A.y) - dy * (P.x - A.x);
        d = (c * c) / l2;
      }
      if (d > dpior) {
        dpior = d;
        pior = i;
      }
    }
    if (pior >= 0) {
      manter[pior] = 1;
      pilha.push([a, pior], [pior, b]);
    }
  }
  const saida = pts.filter((_, i) => manter[i]);
  return saida.length >= 3 ? saida : pts;
}

// O serrilhado da imagem cria tons quase iguais (dois azuis): viram uma cor só, a que tem mais formas.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function juntarCoresParecidas(lista, distancia = 48) {
  const ordenada = [...lista].sort((a, b) => b.formas.length - a.formas.length);
  const finais = [];
  for (const item of ordenada) {
    const c = rgb(item.cor);
    const parecida = finais.find((f) => Math.hypot(...rgb(f.cor).map((v, i) => v - c[i])) < distancia);
    if (parecida) parecida.formas.push(...item.formas);
    else finais.push({ cor: item.cor, formas: [...item.formas] });
  }
  // mantém a ordem original (as cores de baixo primeiro)
  return lista.map((item) => finais.find((f) => f.cor === item.cor)).filter(Boolean);
}

// svgOuCores: texto SVG ou o resultado de coresDoSvg (para não reler o SVG a cada mudança).
// larguraArteAnterior (opcional): largura da arte da última peça; quando só o desenho mudou, a medida
// certa costuma sair na primeira tentativa.
// A cor COR_FURO (#ff00ff) não é parte do logo: são furos que atravessam também a base.
export function gerarLogo(M, svgOuCores, entrada, larguraArteAnterior = null) {
  const o = validarOpcoesLogo(entrada);
  const todas = typeof svgOuCores === "string" ? coresDoSvg(svgOuCores) : svgOuCores;
  const furosArte = todas.find((c) => c.cor === "#ff00ff")?.formas ?? [];
  const cores = todas.filter((c) => c.cor !== "#ff00ff");
  const C = M.CrossSection;
  return comEscopo(M, (guardar) => {
    // cada cor como uma seção (arte com 100 de largura). Como no SVG, o que vem depois fica por
    // cima: a parte visível de uma cor é ela menos as cores seguintes (o vetorizador empilha camadas).
    const furosSecao = furosArte.length ? guardar(C.union(furosArte.map((lacos) => guardar(new C(lacos, "EvenOdd"))))) : null;
    let acumulado = null;
    const secoes = [];
    for (const { cor, formas } of [...cores].reverse()) {
      if (!formas.length) continue;
      let secao = guardar(C.union(formas.map((lacos) => guardar(new C(lacos, "EvenOdd")))));
      if (furosSecao) secao = guardar(secao.subtract(furosSecao)); // nada do logo em cima de um furo
      const inteira = secao;
      if (acumulado) secao = guardar(secao.subtract(acumulado));
      acumulado = acumulado ? guardar(acumulado.add(inteira)) : inteira;
      secoes.unshift({ cor, secao });
    }
    if (!secoes.length) throw new Error("A imagem ficou vazia depois da conversão. Tente outra imagem ou desligue a remoção de fundo.");

    const gerarCom = (larguraArte) => {
      const s = larguraArte / 100;
      const areaMinima = 0.4; // mm²: fragmentos menores não imprimem
      const partes = secoes
        .map(({ cor, secao }) => {
          // alisa a borda: tira dentes e fiapos mais finos que 0,3 mm (o bico não imprime)
          const alisada = guardar(guardar(guardar(secao.scale([s, s])).offset(-0.15, "Round", 2, 16)).offset(0.15, "Round", 2, 16));
          const pedacos = alisada.decompose().map(guardar).filter((p) => p.area() >= areaMinima);
          return { cor, secao: pedacos.length ? guardar(C.compose(pedacos)) : null };
        })
        .filter((p) => p.secao);
      if (!partes.length) throw new Error("O logo ficou pequeno demais para imprimir. Aumente a largura.");
      const arte = guardar(C.union(partes.map((p) => p.secao)));
      const cx = arte.bounds();
      const meio = [(cx.min[0] + cx.max[0]) / 2, (cx.min[1] + cx.max[1]) / 2];

      let base;
      if (o.estilo === "contorno") {
        // segue o contorno do logo (borda 0 = exatamente o logo, sem moldura). Os vazados de dentro
        // são preenchidos pela base (aparecem na cor dela); partes soltas ganham pontes.
        const contorno = o.borda > 0 ? guardar(arte.offset(o.borda, "Round", 2, 64)) : arte;
        const externos = contorno.toPolygons().filter((laco) => areaComSinal(laco) > 0);
        base = unirIlhas(M, guardar, guardar(new C(externos, "NonZero")), Math.max(2.4, o.borda * 1.4));
      } else if (o.estilo === "circulo") {
        let raio = 0;
        for (const laco of arte.toPolygons()) for (const p of laco) raio = Math.max(raio, Math.hypot(p[0] - meio[0], p[1] - meio[1]));
        base = guardar(guardar(C.circle(raio + o.borda, 128)).translate(meio));
      } else {
        const miolo = guardar(guardar(C.square([cx.max[0] - cx.min[0], cx.max[1] - cx.min[1]])).translate(cx.min));
        base = guardar(miolo.offset(o.borda, "Round", 2, 80));
      }
      if (furosSecao) base = guardar(base.subtract(guardar(furosSecao.scale([s, s]))));
      const presa = o.comArgola ? prenderArgola(M, guardar, base, arte, o, o.argola, [meio[0], 1e4]) : { base, perimetro: null, argola: null };
      base = presa.base;

      const cb = base.bounds();
      return {
        partes,
        base,
        presa,
        caixa: { min: cb.min, max: cb.max },
        s,
        dimensoes: [cb.max[0] - cb.min[0], cb.max[1] - cb.min[1], o.base + o.relevo],
      };
    };

    const chute = larguraArteAnterior > 0 ? larguraArteAnterior : Math.max(5, o.largura - 2 * o.borda - (o.comArgola ? 2 * (o.furo / 2 + o.parede) : 0));
    const r = resolverLargura(o.largura, chute, gerarCom);
    const avisos = [];
    if (o.base < 1.6 || (o.borda > 0 && o.borda < 1.6) || o.relevo < 0.6) avisos.push("Estrutura delicada: confira a resistência e a largura de linha do bico.");
    const malhas = [
      { nome: o.comArgola ? "Base e argola" : "Base", cor: o.corBase, ...malhaDoSolido(guardar(r.base.extrude(o.base)), "base") },
      ...r.partes.map((p, i) => ({
        nome: `Cor ${i + 1}`,
        cor: p.cor,
        ...malhaDoSolido(guardar(guardar(p.secao.extrude(o.relevo)).translate([0, 0, o.base])), `cor ${i + 1}`),
      })),
    ];
    return {
      malhas,
      camadas: [{ lacos: r.base.toPolygons(), cor: o.corBase }, ...r.partes.map((p) => ({ lacos: p.secao.toPolygons(), cor: p.cor }))],
      cores: r.partes.map((p) => p.cor),
      perimetro: r.presa.perimetro,
      argola: r.presa.argola,
      caixa: r.caixa,
      // ponto da peça (mm) = ponto da arte (0 a 100 de largura) × escalaArte
      escalaArte: r.s,
      dimensoes: r.dimensoes,
      avisos,
      opcoes: o,
    };
  });
}
