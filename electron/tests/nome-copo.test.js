import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import { beforeAll, describe, expect, it } from "vitest";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";
import { BASES_NOME, gerarNomeCopo, numeroDaBase, validarOpcoesNomeCopo } from "../src/renderer/modelos/nome-copo.js";

const pastaFontes = join(__dirname, "..", "src", "renderer", "assets", "fontes");
const fontes = new Map();
const fonte = (nome) => {
  if (!fontes.has(nome)) {
    const b = readFileSync(join(pastaFontes, `${nome}-Regular.ttf`));
    fontes.set(nome, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
  }
  return fontes.get(nome);
};

let M;
beforeAll(async () => {
  M = await carregarManifold();
});

// toda aresta em exatamente dois triângulos, uma vez em cada sentido, e volume positivo
function conferirFechada({ vertices, triangulos }) {
  const arestas = new Map();
  let volume = 0;
  for (let i = 0; i < triangulos.length; i += 3) {
    const t = [triangulos[i], triangulos[i + 1], triangulos[i + 2]];
    for (let k = 0; k < 3; k++) {
      const chave = `${t[k]}>${t[(k + 1) % 3]}`;
      arestas.set(chave, (arestas.get(chave) ?? 0) + 1);
    }
    const [a, b, c] = t.map((j) => [vertices[j * 3], vertices[j * 3 + 1], vertices[j * 3 + 2]]);
    volume += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  for (const [chave, n] of arestas) {
    expect(n).toBe(1);
    const [a, b] = chave.split(">");
    expect(arestas.get(`${b}>${a}`)).toBe(1);
  }
  expect(volume).toBeGreaterThan(0);
}

describe("nome no copo", () => {
  it("numera as 11 bases na ordem combinada", () => {
    expect(BASES_NOME).toHaveLength(11);
    expect(numeroDaBase("contorno")).toBe(1);
    expect(numeroDaBase("sombra")).toBe(11);
  });

  it("recusa nome vazio, base desconhecida e largura fora do limite", () => {
    expect(() => validarOpcoesNomeCopo({ texto: "  " })).toThrow("Digite o nome.");
    expect(() => validarOpcoesNomeCopo({ estilo: "argola" })).toThrow("Base inválida.");
    expect(() => validarOpcoesNomeCopo({ largura: 10 })).toThrow("Largura");
  });

  it.each(BASES_NOME.map((b) => b.id))("base %s gera base e letras fechadas na largura pedida", (estilo) => {
    const r = gerarNomeCopo(M, fonte("Lobster"), { texto: "Maria", estilo, largura: 60 });
    expect(r.malhas.map((m) => m.nome)).toEqual(["Base do nome", "Letras"]);
    for (const m of r.malhas) conferirFechada(m);
    expect(r.dimensoes[0]).toBeCloseTo(60, 1);
    // sem argola: a base é uma peça só e as letras ficam por cima dela (exceto a sombra, ao lado)
    expect(r.dimensoes[2]).toBeCloseTo(2.6, 5);
  });

  it("funciona em fontes de estilos diferentes", () => {
    for (const id of ["BebasNeue", "GreatVibes", "Modak"]) {
      const r = gerarNomeCopo(M, fonte(id), { texto: "João Pedro", estilo: "capsula", largura: 80 });
      for (const m of r.malhas) conferirFechada(m);
    }
  });
});
