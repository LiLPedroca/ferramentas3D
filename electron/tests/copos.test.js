import { describe, it, expect } from "vitest";
import { aplicarCores, lerPacoteCopo } from "../src/renderer/modelos/copos.js";
describe("copos personalizados", () => {
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
