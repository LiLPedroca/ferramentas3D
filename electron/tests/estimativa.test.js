import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import { describe, expect, it } from "vitest";
import { gerarChaveiro } from "../src/renderer/modelos/chaveiro.js";
import { pesoCurto, pesoDasMalhas, textoDoPeso } from "../src/renderer/modelos/estimativa.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";

describe("peso estimado do filamento", () => {
  it("volume (mm³) × densidade do PLA", () => {
    // cubo de 10 mm = 1 cm³ → 1,24 g
    const r = pesoDasMalhas([{ nome: "Base", volume: 1000 }, { nome: "Texto", volume: 500 }]);
    expect(r.total).toBeCloseTo(1.86, 5);
    expect(r.partes[1].gramas).toBeCloseTo(0.62, 5);
    expect(textoDoPeso(r)).toBe("≈ 1,9 g de filamento (Base 1,2 g · Texto 0,6 g)");
    expect(pesoCurto([{ nome: "x", volume: 20000 }])).toBe("≈ 25 g");
  });

  it("chaveiro: volume das malhas confere com a área × espessura", async () => {
    const M = await carregarManifold();
    const b = readFileSync(join(__dirname, "..", "src", "renderer", "assets", "fontes", "Fredoka-Regular.ttf"));
    const fonte = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const r = gerarChaveiro(M, fonte, { texto: "Ana", base: 2.4, relevo: 1.2, estilo: "retangular" });
    // base: largura × altura × 2,4 menos o furo e cantos, mais a argola → ordem de grandeza conhecida
    const [lx, ly] = r.dimensoes;
    expect(r.malhas[0].volume).toBeGreaterThan(lx * ly * 2.4 * 0.5);
    expect(r.malhas[0].volume).toBeLessThan(lx * ly * 2.4);
    const peso = pesoDasMalhas(r.malhas);
    expect(peso.total).toBeGreaterThan(1);
    expect(peso.total).toBeLessThan(20);
  });
});
