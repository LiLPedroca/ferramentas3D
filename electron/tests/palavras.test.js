import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import { beforeAll, describe, expect, it } from "vitest";
import { geometriaDaMalha } from "../src/renderer/modelos/geometria.js";
import { malhaIndexada } from "../src/renderer/modelos/exportar.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";
import { gerarPalavras, validarOpcoesPalavras } from "../src/renderer/modelos/palavras.js";

const carregar = (nome) => {
  const b = readFileSync(join(__dirname, "..", "src", "renderer", "assets", "fontes", `${nome}-Regular.ttf`));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const fontes = new Map(["Fredoka", "Pacifico", "GreatVibes", "Cinzel", "Lobster"].map((n) => [n, carregar(n)]));

let M;
beforeAll(async () => {
  M = await carregarManifold();
});

// toda aresta em dois triângulos, uma vez em cada sentido, e volume positivo
function fechada({ vertices, triangulos }) {
  const arestas = new Map();
  let volume = 0;
  for (let i = 0; i < triangulos.length; i += 3) {
    const t = [triangulos[i], triangulos[i + 1], triangulos[i + 2]];
    for (let k = 0; k < 3; k++) {
      const a = t[k];
      const b = t[(k + 1) % 3];
      const chave = a < b ? `${a}-${b}` : `${b}-${a}`;
      const e = arestas.get(chave) ?? [0, 0];
      e[0]++;
      e[1] += a < b ? 1 : -1;
      arestas.set(chave, e);
    }
    const [p, q, r] = t.map((k) => [vertices[k * 3], vertices[k * 3 + 1], vertices[k * 3 + 2]]);
    volume += (p[0] * (q[1] * r[2] - q[2] * r[1]) + p[1] * (q[2] * r[0] - q[0] * r[2]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
  }
  return [...arestas.values()].every(([n, s]) => n === 2 && s === 0) && volume > 0;
}

// partes soltas de uma malha (componentes ligados pelos vértices)
function pedacos({ triangulos }) {
  const pai = new Map();
  const achar = (x) => {
    while (pai.has(x) && pai.get(x) !== x) x = pai.get(x);
    return x;
  };
  for (let i = 0; i < triangulos.length; i += 3) {
    const r = triangulos.slice(i, i + 3).map((v) => {
      if (!pai.has(v)) pai.set(v, v);
      return achar(v);
    });
    pai.set(r[1], r[0]);
    pai.set(r[2], r[0]);
  }
  return new Set([...pai.keys()].map(achar)).size;
}

const opcoes = {
  linhas: [
    { texto: "Lar", fonte: "Pacifico", tamanho: 100 },
    { texto: "doce lar", fonte: "Fredoka", tamanho: 55 },
    { texto: "", fonte: "Fredoka", tamanho: 40 },
  ],
};

describe("palavras decorativas", () => {
  it("ignora linhas vazias e valida", () => {
    expect(validarOpcoesPalavras(opcoes).linhas).toHaveLength(2);
    expect(() => validarOpcoesPalavras({ linhas: [{ texto: " " }] })).toThrow(/pelo menos uma/);
    expect(() => validarOpcoesPalavras({ linhas: [{ texto: "x", tamanho: 5 }] })).toThrow(/Tamanho da linha 1/);
    expect(() => validarOpcoesPalavras({ ...opcoes, largura: 10 })).toThrow(/Largura total: use de 30 a 300/);
  });

  it("placa: largura total exata, alturas somadas e malhas fechadas nos três estilos", () => {
    for (const estilo of ["contorno", "retangular", "capsula"]) {
      for (const largura of [60, 120]) {
        const r = gerarPalavras(M, fontes, { ...opcoes, estilo, largura, espessura: 3, relevo: 2 });
        expect(r.malhas.map((m) => m.nome)).toEqual(["Placa", "Texto"]);
        expect(r.dimensoes[0], `${estilo} ${largura}`).toBeCloseTo(largura, 1);
        expect(r.dimensoes[2]).toBeCloseTo(5, 5);
        for (const m of r.malhas) expect(fechada(m), `${estilo} ${m.nome}`).toBe(true);
      }
    }
  });

  it("placa de contorno é uma peça só, mesmo com linhas separadas", () => {
    const r = gerarPalavras(M, fontes, { ...opcoes, estilo: "contorno", espacamento: 12 });
    expect(pedacos(r.malhas[0])).toBe(1);
  });

  it("letreiro: letras ligadas entre si e à barra, tudo com a espessura toda", () => {
    const r = gerarPalavras(M, fontes, {
      modo: "letreiro",
      linhas: [{ texto: "Júlia", fonte: "GreatVibes", tamanho: 100 }, { texto: "AMOR", fonte: "Cinzel", tamanho: 60 }],
      espessura: 6,
    });
    expect(r.malhas.map((m) => m.nome)).toEqual(["Barra", "Letras"]);
    expect(r.dimensoes[2]).toBeCloseTo(6, 5);
    for (const m of r.malhas) expect(fechada(m), m.nome).toBe(true);
    // letras + barra juntas formam uma peça só (acentos e linhas ligados por pontes)
    const juntas = new M.CrossSection([...r.camadas[0].lacos, ...r.camadas[1].lacos], "NonZero");
    const partes = juntas.decompose();
    expect(partes).toHaveLength(1);
    for (const p of partes) p.delete();
    juntas.delete();
    // e exportam fechadas
    for (const g of r.malhas.map(geometriaDaMalha).map(malhaIndexada)) expect(g.index.count).toBeGreaterThan(0);
  });

  it("linhas mantêm a proporção pedida", () => {
    const r = gerarPalavras(M, fontes, {
      linhas: [{ texto: "AAAA", fonte: "Fredoka", tamanho: 100 }, { texto: "AAAA", fonte: "Fredoka", tamanho: 50 }],
      espacamento: 5,
    });
    // a camada do texto tem as duas linhas: a de baixo com metade da altura da de cima
    const ys = r.camadas[1].lacos.flat().map((p) => p[1]);
    const total = Math.max(...ys) - Math.min(...ys);
    // total = h + 5 + h/2  →  h = (total − 5) / 1,5
    const h = (total - 5) / 1.5;
    expect(h).toBeGreaterThan(5);
    expect(r.dimensoes[0]).toBeCloseTo(90, 1);
  });
});
