// Chaveiro de logo: a imagem vetorizada por cores vira relevo sobre uma base com argola.
// Cada cor é uma parte separada no 3MF (impressão multicor).
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { baseCircularComArgola, baseComArgola, extrudar, posicionarNaOrigem, simplificarContorno } from "./geometria.js";

export const LIMITES_LOGO = { largura: [15, 90], espessuraBase: [1.2, 8], relevo: [0.4, 4], margem: [1.5, 10], furo: [2.5, 10] };

function numero(valor, nome, [minimo, maximo]) {
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < minimo || n > maximo) {
    throw new Error(`${nome}: use um valor entre ${String(minimo).replace(".", ",")} e ${String(maximo).replace(".", ",")} mm.`);
  }
  return n;
}

export function validarOpcoesLogo(o) {
  return {
    largura: numero(o.largura, "Largura do logo", LIMITES_LOGO.largura),
    espessuraBase: numero(o.espessuraBase, "Espessura da base", LIMITES_LOGO.espessuraBase),
    relevo: numero(o.relevo, "Relevo", LIMITES_LOGO.relevo),
    margem: numero(o.margem, "Margem", LIMITES_LOGO.margem),
    furo: numero(o.furo, "Furo da argola", LIMITES_LOGO.furo),
    base: o.base === "retangulo" ? "retangulo" : "circulo",
    corBase: /^#[0-9a-f]{6}$/i.test(o.corBase) ? o.corBase : "#1f2937",
  };
}

const areaForma = (forma) => Math.abs(THREE.ShapeUtils.area(forma.getPoints(8)));

// svg: texto SVG (do vetorizador). Devolve { partes, tamanho, cores, opcoes }.
export function gerarLogo(svg, opcoes) {
  const o = validarOpcoesLogo(opcoes);
  const dados = new SVGLoader().parse(svg);

  // formas por cor, ainda em pixels do SVG
  const grupos = new Map();
  for (const caminho of dados.paths) {
    const preenchimento = caminho.userData?.style?.fill;
    if (!preenchimento || preenchimento === "none") continue;
    if (Number(caminho.userData?.style?.fillOpacity ?? 1) < 0.1) continue;
    const corHex = `#${caminho.color.getHexString()}`;
    const formas = SVGLoader.createShapes(caminho);
    if (!grupos.has(corHex)) grupos.set(corHex, []);
    grupos.get(corHex).push(...formas);
  }
  if (grupos.size === 0) throw new Error("A imagem ficou vazia depois da conversão. Tente outra imagem ou desligue a remoção de fundo.");

  // escala para a largura pedida e Y para cima
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
  const escala = o.largura / Math.max(maxX - minX, 1e-6);
  // converte e simplifica (o contorno do vetorizador repete cantos de pixel e faz "espinhos")
  const converter = (pts) => simplificarContorno(pts.map((p) => new THREE.Vector2((p.x - minX) * escala, (maxY - p.y) * escala)));
  const areaMinima = 0.4; // mm²: descarta fragmentos que não imprimem

  const partes = [];
  const cores = [];
  for (const [corHex, formas] of grupos) {
    const convertidas = formas
      .map((f) => {
        const nova = new THREE.Shape(converter(f.getPoints(8)));
        nova.holes = f.holes.map((h) => new THREE.Path(converter(h.getPoints(8)))).filter((h) => h.getPoints().length >= 3);
        return nova;
      })
      .filter((f) => f.getPoints().length >= 3 && areaForma(f) >= areaMinima);
    if (convertidas.length === 0) continue;
    cores.push(corHex);
    partes.push({ nome: `Cor ${cores.length}`, cor: corHex, formas: convertidas });
  }
  if (partes.length === 0) throw new Error("O logo ficou pequeno demais para imprimir. Aumente a largura.");

  const caixa = { minX: 0, maxX: (maxX - minX) * escala, minY: 0, maxY: (maxY - minY) * escala };
  // para o disco: o ponto do logo mais distante do centro (logos redondos não precisam da diagonal)
  const cx = caixa.maxX / 2;
  const cy = caixa.maxY / 2;
  let raioDoConteudo = 0;
  for (const p of partes) for (const f of p.formas) for (const q of f.getPoints()) raioDoConteudo = Math.max(raioDoConteudo, Math.hypot(q.x - cx, q.y - cy));
  const { forma } =
    o.base === "retangulo"
      ? baseComArgola(caixa, { margem: o.margem, furo: o.furo })
      : baseCircularComArgola(caixa, { margem: o.margem, furo: o.furo, raioDoConteudo });

  const geometrias = [
    { nome: "Base", cor: o.corBase, geometria: extrudar(forma, o.espessuraBase, 0) },
    ...partes.map((p) => ({ nome: p.nome, cor: p.cor, geometria: extrudar(p.formas, o.relevo, o.espessuraBase) })),
  ];
  const tamanho = posicionarNaOrigem(geometrias.map((g) => g.geometria));
  return { partes: geometrias, tamanho, cores, opcoes: o };
}
