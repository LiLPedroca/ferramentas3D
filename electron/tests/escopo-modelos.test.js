import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";
import { gerarChaveiro } from "../src/renderer/modelos/chaveiro.js";
import { gerarPalavras } from "../src/renderer/modelos/palavras.js";
import { gerarPecaTeste } from "../src/renderer/modelos/encaixes.js";
import { gerarCaneca } from "../src/renderer/modelos/caneca.js";

let M, fonte;
beforeAll(async () => {
  M = await carregarManifold();
  const b = readFileSync(join(__dirname, "../src/renderer/assets/fontes/Fredoka-Regular.ttf"));
  fonte = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
});

describe("liberação das formas temporárias do Manifold", () => {
  it.each([
    ["chaveiro retangular", () => gerarChaveiro(M, fonte, { texto: "Ana", estilo: "retangular" })],
    ["palavras em placa", () => gerarPalavras(M, new Map([["Fredoka", fonte]]), { estilo: "retangular", linhas: [{ texto: "Ana", fonte: "Fredoka", tamanho: 100 }] })],
    ["palavras em letreiro", () => gerarPalavras(M, new Map([["Fredoka", fonte]]), { modo: "letreiro", linhas: [{ texto: "Ana", fonte: "Fredoka", tamanho: 100 }] })],
    ["teste de encaixes", () => gerarPecaTeste(M, fonte, {})],
    ["caneca com alça", () => gerarCaneca(M, fonte, null, { alca: true, textos: {} })],
  ])("%s libera círculos e retângulos usados na construção", (_nome, gerar) => {
    const criados = [];
    const espioes = ["square", "circle"].map((nome) => {
      const original = M.CrossSection[nome];
      return vi.spyOn(M.CrossSection, nome).mockImplementation((...args) => {
        const forma = original(...args);
        criados.push(forma);
        return forma;
      });
    });
    try {
      gerar();
      expect(criados.length).toBeGreaterThan(0);
      expect(criados.filter((forma) => !forma.isDeleted())).toHaveLength(0);
    } finally {
      espioes.forEach((espiao) => espiao.mockRestore());
      criados.filter((forma) => !forma.isDeleted()).forEach((forma) => forma.delete());
    }
  });
});
