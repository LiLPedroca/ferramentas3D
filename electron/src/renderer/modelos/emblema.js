// Emblema em duas cores a partir de uma imagem: a parte escura vira o desenho (2ª cor) e a clara
// fica na cor da base. Um PNG com fundo transparente dá o contorno exato do emblema.
import { areaDoLaco, contornos } from "../vetorizar.js";
import { unirIlhas } from "./manifold.js";

export const FORMATOS_EMBLEMA = ["contorno", "circulo"];

const MANCHA = 4; // px²: manchas menores que isso são ruído da imagem

// imagem: { width, height, data } (RGBA). limiar: brilho (0 a 1) que separa escuro de claro.
// Devolve laços em pixels (y para baixo): { w, h, desenho, silhueta } — silhueta só quando a
// imagem tem fundo transparente.
export function lacosDoEmblema(imagem, { limiar = 0.5, inverter = false } = {}) {
  const { width: w, height: h, data } = imagem;
  const n = w * h;
  const desenho = new Float32Array(n);
  const silhueta = new Float32Array(n);
  let transparente = false;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const a = data[i + 3] / 255;
    const brilho = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    // passa por 0,5 exatamente no limiar; a transição suave aproveita o antisserrilhado da imagem
    let escuro = Math.min(1, Math.max(0, 0.5 + (limiar - brilho) * 4));
    if (inverter) escuro = 1 - escuro;
    desenho[p] = escuro * a;
    silhueta[p] = a;
    if (a < 0.5) transparente = true;
  }
  const filtrar = (lacos) => lacos.filter((l) => Math.abs(areaDoLaco(l)) >= MANCHA);
  const lacosDesenho = filtrar(contornos(desenho, w, h));
  if (!lacosDesenho.length) throw new Error("O emblema não tem parte escura. Ajuste o limiar ou marque “Inverter cores”.");
  return { w, h, desenho: lacosDesenho, silhueta: transparente ? filtrar(contornos(silhueta, w, h)) : null };
}

const area = (laco) => {
  let s = 0;
  for (let i = 0; i < laco.length; i++) {
    const p = laco[i];
    const q = laco[(i + 1) % laco.length];
    s += p[0] * q[1] - p[1] * q[0];
  }
  return s / 2;
};

// Base e desenho do emblema em mm, centrados em (0, 0), com "tamanho" de largura máxima.
// formato: "contorno" (segue a imagem) ou "circulo". aro: borda da base em volta do desenho.
export function formasDoEmblema(M, guardar, emblema, { tamanho, formato = "contorno", aro = 1.5 }) {
  const C = M.CrossSection;
  const virar = (lacos) => lacos.map((l) => l.map(([x, y]) => [x, -y]));
  const desenhoPx = guardar(new C(virar(emblema.desenho), "EvenOdd"));
  const todoPx = emblema.silhueta ? guardar(guardar(new C(virar(emblema.silhueta), "EvenOdd")).add(desenhoPx)) : desenhoPx;
  // contorno cheio: só os laços externos (os furos do desenho ficam na base)
  const externos = todoPx.toPolygons().filter((l) => area(l) > 0);
  const cheioPx = guardar(new C(externos, "Positive"));
  const cx = cheioPx.bounds();
  const centro = [(cx.min[0] + cx.max[0]) / 2, (cx.min[1] + cx.max[1]) / 2];
  let escala;
  if (formato === "circulo") {
    let maior = 0;
    for (const l of externos) for (const p of l) maior = Math.max(maior, Math.hypot(p[0] - centro[0], p[1] - centro[1]));
    escala = (tamanho / 2 - aro) / maior;
  } else {
    escala = (tamanho - 2 * aro) / Math.max(cx.max[0] - cx.min[0], cx.max[1] - cx.min[1]);
  }
  if (!(escala > 0)) throw new Error("O emblema ficou pequeno demais. Aumente o tamanho ou diminua o aro.");
  const ajustar = (s) => guardar(guardar(s.translate([-centro[0], -centro[1]])).scale([escala, escala]));
  const desenho = ajustar(desenhoPx);
  const cheio = ajustar(cheioPx);
  let base;
  if (formato === "circulo") base = guardar(C.circle(tamanho / 2, 160));
  else {
    base = aro > 0 ? guardar(cheio.offset(aro, "Round", 2, 64)) : cheio;
    base = unirIlhas(M, guardar, base, Math.max(2.4, aro * 1.4));
  }
  return { base, desenho: guardar(desenho.intersect(base)) };
}
