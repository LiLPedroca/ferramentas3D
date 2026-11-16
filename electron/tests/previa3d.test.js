// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cotasDaCaixa } from "../src/renderer/modelos/previa3d.js";

describe("prévia 3D: cotas", () => {
  it("X e Y em mm com 2 casas e vírgula, linhas fora da peça", () => {
    const c = cotasDaCaixa({ min: [0, 0, 0], max: [99.98, 120.46, 3] });
    expect(c.x.valor).toBe("X: 99,98 mm");
    expect(c.y.valor).toBe("Y: 120,46 mm");
    expect(c.x.de[0]).toBe(0);
    expect(c.x.ate[0]).toBeCloseTo(99.98, 5);
    expect(c.x.de[1]).toBeLessThan(0); // na frente da peça
    expect(c.y.de[0]).toBeGreaterThan(99.98); // ao lado da peça
    expect(c.y.ate[1]).toBeCloseTo(120.46, 5);
  });
});
