import { describe, expect, it } from "vitest";
import { niveisDeAltura, vistaDeCima } from "../src/renderer/modelos/vista-de-cima.js";

// caixa fechada (12 triângulos soltos) de x0..x1, y0..y1, z0..z1
function caixa(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return Float32Array.from(f.flatMap((t) => t.flatMap((i) => v[i])));
}
const pixel = (r, x, y) => [...r.data.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4)];

describe("STL e 3MF no 2D para 3D (vista de cima)", () => {
  it("STL sem cor: a base sai preta e o relevo branco; fora da peça é transparente", () => {
    // chaveiro: placa 40 × 20 × 2 mm e um relevo de 10 × 10 mm até 3 mm no meio
    const posicoes = new Float32Array([...caixa(0, 0, 0, 40, 20, 2), ...caixa(15, 5, 2, 25, 15, 3)]);
    const r = vistaDeCima([{ posicoes, cor: null }], { lado: 400, margem: 0.05 });
    expect(r.larguraMm).toBeCloseTo(40, 3);
    expect(r.alturaMm).toBeCloseTo(20, 3);
    expect(r.porCor).toBe(false);
    expect(r.cores).toEqual(["#000000", "#FFFFFF"]);
    const mmX = (x) => Math.round(20 + x * 9); // borda 20 px, 9 px por mm
    expect(pixel(r, mmX(3), mmX(3))).toEqual([0, 0, 0, 255]); // placa
    expect(pixel(r, mmX(20), mmX(10))).toEqual([255, 255, 255, 255]); // relevo
    expect(pixel(r, 2, 2)[3]).toBe(0); // fundo
  });

  it("3MF com cores: cada pedaço com a sua cor, e o de cima cobre o de baixo", () => {
    const r = vistaDeCima(
      [
        { posicoes: caixa(0, 0, 0, 30, 30, 2), cor: "#1E88E5" },
        { posicoes: caixa(0, 20, 2, 10, 30, 4), cor: "#FDD835FF" },
      ],
      { lado: 300, margem: 0 },
    );
    expect(r.porCor).toBe(true);
    expect(pixel(r, 150, 150)).toEqual([0x1e, 0x88, 0xe5, 255]);
    // o pedaço amarelo fica no canto de cima à esquerda (y maior = em cima na imagem)
    expect(pixel(r, 30, 30)).toEqual([0xfd, 0xd8, 0x35, 255]);
  });

  it("alturas próximas viram uma só e alturas raras são ignoradas", () => {
    const z = [...Array(500).fill(2), ...Array(500).fill(2.1), ...Array(300).fill(3), 7];
    const n = niveisDeAltura(z);
    expect(n.length).toBe(2);
    expect(n[0]).toBeCloseTo(2.05, 2);
    expect(n[1]).toBeCloseTo(3, 3);
  });
});
