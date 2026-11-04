// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { malhaIndexada } from "../src/renderer/modelos/exportar.js";
import { gerarLogo } from "../src/renderer/modelos/logo.js";

// SVG real gerado pelo Conversor SVG (logo de teste: círculo azul, triângulo laranja, "3D" vazado).
const svg = readFileSync(join(__dirname, "dados", "logo-teste.svg"), "utf8");
const opcoes = { largura: "35", espessuraBase: "3", relevo: "1", margem: "3", furo: "4,5", base: "circulo", corBase: "#1f2937" };

function arestasAbertas(geometria) {
  const g = malhaIndexada(geometria);
  const idx = g.index.array;
  const arestas = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    for (const [x, y] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
      const c = x < y ? `${x}-${y}` : `${y}-${x}`;
      arestas.set(c, (arestas.get(c) ?? 0) + 1);
    }
  }
  return [...arestas.entries()].filter(([, n]) => n !== 2);
}

describe("chaveiro de logo", () => {
  it("separa as cores do logo em partes, sobre a base", () => {
    const r = gerarLogo(svg, opcoes);
    expect(r.partes[0].nome).toBe("Base");
    expect(r.cores.length).toBeGreaterThanOrEqual(2);
    expect(r.tamanho.z).toBeCloseTo(4, 3);
  });

  it("todas as partes saem com malha fechada", () => {
    const r = gerarLogo(svg, opcoes);
    const problemas = r.partes.map((p) => [p.nome, arestasAbertas(p.geometria).length]).filter(([, n]) => n > 0);
    expect(problemas).toEqual([]);
  });

  it("o disco acompanha o logo redondo (sem sobra da diagonal)", () => {
    const r = gerarLogo(svg, opcoes);
    // logo de 35 mm: raio ~17,5 + margem 3 + furo 4,5 + 2 paredes de 2 = ~29 → diâmetro ~58 mm
    expect(r.tamanho.x).toBeLessThan(62);
    expect(r.tamanho.x).toBeGreaterThan(50);
  });

  it("base retangular também funciona", () => {
    const r = gerarLogo(svg, { ...opcoes, base: "retangulo" });
    expect(arestasAbertas(r.partes[0].geometria)).toEqual([]);
  });

  it("valida as medidas", () => {
    expect(() => gerarLogo(svg, { ...opcoes, largura: "5" })).toThrow(/Largura/);
  });
});
