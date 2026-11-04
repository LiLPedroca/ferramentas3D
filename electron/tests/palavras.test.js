import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import { describe, expect, it } from "vitest";
import { malhaIndexada } from "../src/renderer/modelos/exportar.js";
import { baseCircularComArgola, extrudar, placaArredondada, simplificarContorno } from "../src/renderer/modelos/geometria.js";
import { gerarPalavras, validarOpcoesPalavras } from "../src/renderer/modelos/palavras.js";

const carregar = (nome) => {
  const b = readFileSync(join(__dirname, "..", "src", "renderer", "assets", "fontes", `${nome}-Regular.ttf`));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const fontes = new Map([["Fredoka", carregar("Fredoka")], ["Pacifico", carregar("Pacifico")]]);

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
  return [...arestas.values()].filter((n) => n !== 2).length;
}

const opcoes = {
  modo: "placa",
  linhas: [
    { texto: "Lar", fonte: "Pacifico", altura: "20" },
    { texto: "doce lar", fonte: "Fredoka", altura: "12" },
    { texto: "", fonte: "Fredoka", altura: "10" },
  ],
  espacamento: "4",
  espessura: "3",
  relevo: "2",
};

describe("simplificar contorno", () => {
  it("tira pontos alinhados e espinhos de ida e volta", () => {
    const V = (x, y) => ({ x, y });
    // quadrado com um ponto no meio de um lado e um espinho saindo do lado de cima
    const pts = [V(0, 0), V(5, 0), V(10, 0), V(10, 10), V(6, 10), V(6, 14), V(6, 10), V(0, 10)];
    const s = simplificarContorno(pts);
    expect(s.map((p) => `${p.x},${p.y}`)).toEqual(["0,0", "10,0", "10,10", "0,10"]);
  });
});

describe("bases", () => {
  it("disco com argola e placa saem fechados", () => {
    const caixa = { minX: 0, maxX: 30, minY: 0, maxY: 20 };
    expect(arestasAbertas(extrudar(baseCircularComArgola(caixa).forma, 3))).toBe(0);
    expect(arestasAbertas(extrudar(placaArredondada(caixa).forma, 3))).toBe(0);
  });
});

describe("palavras decorativas", () => {
  it("ignora linhas vazias e valida", () => {
    expect(validarOpcoesPalavras(opcoes).linhas).toHaveLength(2);
    expect(() => validarOpcoesPalavras({ ...opcoes, linhas: [{ texto: " " }] })).toThrow(/pelo menos uma/);
    expect(() => validarOpcoesPalavras({ ...opcoes, linhas: [{ texto: "x", altura: "2" }] })).toThrow(/Altura da linha 1/);
  });

  it("placa: base + texto em relevo, alturas somadas e malhas fechadas", () => {
    const r = gerarPalavras(fontes, opcoes);
    expect(r.partes.map((p) => p.nome)).toEqual(["Placa", "Texto"]);
    expect(r.tamanho.z).toBeCloseTo(5, 3);
    expect(r.tamanho.y).toBeCloseTo(20 + 4 + 12 + 2 * 5, 0); // linhas + espaço + margens
    for (const p of r.partes) expect(arestasAbertas(p.geometria), p.nome).toBe(0);
  });

  it("letreiro: letras e barra com a espessura toda", () => {
    const r = gerarPalavras(fontes, { ...opcoes, modo: "letreiro", espessura: "6" });
    expect(r.partes.map((p) => p.nome)).toEqual(["Letras", "Barra"]);
    expect(r.tamanho.z).toBeCloseTo(6, 3);
    for (const p of r.partes) expect(arestasAbertas(p.geometria), p.nome).toBe(0);
  });
});
