// @vitest-environment happy-dom
// Criador de logos: recorte automático, cores prontas, edição à mão e o caminho até o 3D.
import { beforeAll, describe, expect, it } from "vitest";
import {
  CORES_LOGO, VAZIO, corMaisProxima, coresUsadas, encher, mapaAutomatico, mapaDeCoresProntas, mapaVazio,
  pintarDisco, pintarTraco, rgbaDoMapa, svgDoMapa,
} from "../src/renderer/modelos/mapa-logo.js";
import { coresDoSvg, gerarLogo } from "../src/renderer/modelos/logo.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";

const indice = (nome) => CORES_LOGO.findIndex((c) => c.nome === nome);

// Logo de teste 120×100: fundo branco "sujo", losango verde-musgo, círculo branco dentro, barra preta.
// Bordas com meio-tom (anti-serrilhado), como numa imagem de verdade.
function imagemTeste() {
  const w = 120;
  const h = 100;
  const data = new Uint8ClampedArray(w * h * 4);
  const misturar = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let cor = [250, 248, 245];
      const losango = 1 - (Math.abs(x + 0.5 - 50) / 35 + Math.abs(y + 0.5 - 50) / 40); // > 0 dentro
      if (losango > 0) cor = misturar(cor, [70, 110, 60], Math.min(1, losango * 30));
      const circulo = 12 - Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
      if (circulo > 0) cor = misturar(cor, [250, 248, 245], Math.min(1, circulo));
      if (x >= 95 && x < 110 && y >= 20 && y < 80) cor = [20, 20, 25];
      data.set([...cor.map(Math.round), 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

let M;
beforeAll(async () => {
  M = await carregarManifold();
});

describe("criador de logos: mapa de cores", () => {
  it("cores da imagem viram as cores prontas mais próximas", () => {
    expect(CORES_LOGO.some((c) => c.nome === "Transparente")).toBe(false);
    expect(CORES_LOGO[corMaisProxima([70, 110, 60])].nome).toBe("Verde");
    expect(CORES_LOGO[corMaisProxima([250, 248, 245])].nome).toBe("Branco");
    expect(CORES_LOGO[corMaisProxima([20, 20, 25])].nome).toBe("Preto");
    expect(CORES_LOGO[corMaisProxima([205, 165, 60])].nome).toBe("Dourado");
  });

  it("recorta o fundo e acha as cores", () => {
    const mapa = mapaAutomatico(imagemTeste(), { cores: 3, tirarFundo: true, fundoDeDentro: true });
    const em = (x, y) => mapa.idx[y * mapa.largura + x];
    expect(em(2, 2)).toBe(VAZIO); // canto: fundo
    expect(em(50, 25)).toBe(indice("Verde"));
    expect(em(100, 50)).toBe(indice("Preto"));
    expect(em(50, 50)).toBe(VAZIO); // miolo branco, da cor do fundo: sai junto
    expect(coresUsadas(mapa).map((c) => CORES_LOGO[c].nome).sort()).toEqual(["Preto", "Verde"]);
  });

  it("pode manter o fundo que está dentro do logo", () => {
    const mapa = mapaAutomatico(imagemTeste(), { cores: 3, tirarFundo: true, fundoDeDentro: false });
    expect(mapa.idx[50 * mapa.largura + 50]).toBe(indice("Branco"));
    expect(mapa.idx[2 * mapa.largura + 2]).toBe(VAZIO);
  });

  it("sem tirar o fundo, nada fica vazio", () => {
    const mapa = mapaAutomatico(imagemTeste(), { cores: 3, tirarFundo: false });
    expect(mapa.idx.includes(VAZIO)).toBe(false);
  });

  it("borracha, restaurar, pincel, varinha e balde", () => {
    const origem = mapaAutomatico(imagemTeste(), { cores: 3 });
    const mapa = { ...origem, idx: origem.idx.slice() };
    const em = (x, y) => mapa.idx[y * mapa.largura + x];
    expect(pintarDisco(mapa, 100, 50, 3, VAZIO)).toBe(true); // borracha
    expect(em(100, 50)).toBe(VAZIO);
    pintarDisco(mapa, 100, 50, 3, "restaurar", origem);
    expect(em(100, 50)).toBe(indice("Preto"));
    pintarTraco(mapa, 96, 30, 96, 70, 1, indice("Vermelho")); // pincel
    expect(em(96, 50)).toBe(indice("Vermelho"));
    expect(encher(mapa, 50, 25, indice("Azul"))).toBe(true); // balde: o losango inteiro
    expect(em(50, 75)).toBe(indice("Azul"));
    expect(em(100, 50)).toBe(indice("Preto")); // outra região não muda
    encher(mapa, 100, 50, VAZIO); // varinha
    expect(em(100, 50)).toBe(VAZIO);
    expect(encher(mapa, 500, 500, VAZIO)).toBe(false); // fora da imagem
    encher(mapa, 50, 25, VAZIO);
    for (let y = 0; y < mapa.altura; y++) for (let x = 0; x < mapa.largura; x++) pintarDisco(mapa, x, y, 1, VAZIO);
    expect(mapaVazio(mapa)).toBe(true);
  });

  it("o PNG salvo volta igual (Meus modelos)", () => {
    const mapa = mapaAutomatico(imagemTeste(), { cores: 3 });
    const volta = mapaDeCoresProntas({ width: mapa.largura, height: mapa.altura, data: rgbaDoMapa(mapa) });
    expect(volta.idx).toEqual(mapa.idx);
  });

  it("mapa → SVG → peça 3D, com e sem argola", () => {
    const mapa = mapaAutomatico(imagemTeste(), { cores: 3 });
    const cores = coresDoSvg(svgDoMapa(mapa));
    expect(cores.map((c) => c.cor).sort()).toEqual([CORES_LOGO[indice("Preto")].hex, CORES_LOGO[indice("Verde")].hex].sort());
    const com = gerarLogo(M, cores, { largura: 50 });
    expect(com.argola).not.toBeNull();
    expect(com.malhas[0].nome).toBe("Base e argola");
    expect(com.dimensoes[0]).toBeCloseTo(50, 0);
    const sem = gerarLogo(M, cores, { largura: 50, comArgola: false });
    expect(sem.argola).toBeNull();
    expect(sem.perimetro).toBeNull();
    expect(sem.malhas[0].nome).toBe("Base");
    expect(sem.malhas).toHaveLength(3);
    expect(sem.dimensoes[0]).toBeCloseTo(50, 0);
  });
});

describe("criador de logos: serrilhado", () => {
  it("contorno de 1 pixel de outra cor some; manchas de verdade ficam", async () => {
    const { limparSerrilhado } = await import("../src/renderer/modelos/mapa-logo.js");
    const w = 20;
    const h = 20;
    const idx = new Int8Array(w * h).fill(VAZIO);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 12; x++) idx[y * w + x] = 1; // barra preta
    for (let y = 5; y < 15; y++) idx[y * w + 12] = 2; // fiapo cinza na borda
    for (let y = 1; y < 4; y++) for (let x = 15; x < 19; x++) idx[y * w + x] = 2; // mancha cinza de 3×4
    limparSerrilhado(idx, w, h);
    expect(idx[10 * w + 12]).not.toBe(2);
    expect(idx[2 * w + 16]).toBe(2);
    expect(idx[10 * w + 8]).toBe(1);
  });
});
