import { describe, it, expect } from "vitest";
import { aplicarCores, coresIniciais, lerPacoteCopo } from "../src/renderer/modelos/copos.js";
describe("copos personalizados", () => {
  it("começa em preto e branco independentemente das cores do arquivo de referência", () => {
    for (const origem of [["#000000", "#ffffff"], ["#000000", "#39ff14"], ["#fec600", "#0056b8"]]) {
      const partes = origem.map(cor => ({ cor }));
      expect(coresIniciais(partes)).toEqual(["#1b1b1b", "#f4f4f4"]);
      expect(partes.map(p => p.cor)).toEqual(origem);
    }
  });
  it("cores salvas viram a cor pronta mais parecida; ausentes ou inválidas viram preto/branco", () => {
    const partes = [{ cor: "#000000" }, { cor: "#39ff14" }];
    expect(coresIniciais(partes, ["#d6322f", "#2463d8"])).toEqual(["#d6322f", "#2463d8"]);
    expect(coresIniciais(partes, ["#ff0000", "#0077ff"])).toEqual(["#d6322f", "#2463d8"]);
    expect(coresIniciais(partes, ["inválida"])).toEqual(["#1b1b1b", "#f4f4f4"]);
  });
  it("cada cor mantém sua geometria e seu slot ao ser editada", () => {
    const geometria = {};
    const partes = [{ cor: "#000000", geometria, slot: 1 }, { cor: "#ffffff", geometria: {}, slot: 2 }];
    const r = aplicarCores(partes, ["#ff0000", "#00ff00"]);
    expect(r.map(p => p.cor)).toEqual(["#ff0000", "#00ff00"]);
    expect(r[0].geometria).toBe(geometria);
    expect(r[1].slot).toBe(2);
    expect(partes[0].cor).toBe("#000000");
  });
  it("recusa arquivos truncados em vez de exibir uma peça incompleta", () => {
    expect(() => lerPacoteCopo(new Uint8Array([0, 0]))).toThrow();
  });
});
