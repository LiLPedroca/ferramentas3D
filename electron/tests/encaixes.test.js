import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import { beforeAll, describe, expect, it } from "vitest";
import { calcularEncaixe, gerarPecaTeste } from "../src/renderer/modelos/encaixes.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";

let M;
let fonte;
beforeAll(async () => {
  M = await carregarManifold();
  const b = readFileSync(join(__dirname, "..", "src", "renderer", "assets", "fontes", "Fredoka-Regular.ttf"));
  fonte = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
});

function fechada({ vertices, triangulos }) {
  const arestas = new Map();
  for (let i = 0; i < triangulos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangulos[i + k];
      const b = triangulos[i + ((k + 1) % 3)];
      const chave = a < b ? `${a}-${b}` : `${b}-${a}`;
      arestas.set(chave, (arestas.get(chave) ?? 0) + 1);
    }
  }
  return [...arestas.values()].every((n) => n === 2) && vertices.length > 0;
}

describe("encaixes e tolerâncias", () => {
  it("folga por tipo de encaixe, material e bico", () => {
    expect(calcularEncaixe({ medida: 8, encaixe: "deslizante" })).toEqual({ folga: 0.2, furo: 8.2, pino: 7.8 });
    expect(calcularEncaixe({ medida: 8, encaixe: "justo", material: "PETG" }).folga).toBe(0.15);
    expect(calcularEncaixe({ medida: 8, encaixe: "folgado", bico: 0.6 }).folga).toBe(0.6);
    expect(calcularEncaixe({ medida: 10, calibrada: "0.25" })).toEqual({ folga: 0.25, furo: 10.25, pino: 9.75 });
    expect(() => calcularEncaixe({ medida: 0 })).toThrow(/Medida/);
  });

  it("peça de teste: furos com as folgas pedidas, placa e pino fechados", () => {
    const r = gerarPecaTeste(M, fonte, { diametro: 8, folgaInicial: 0.1, passo: 0.05, quantidade: 6, espessura: 4 });
    expect(r.folgas).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
    expect(r.malhas.map((m) => m.nome)).toEqual(["Placa de teste", "Pino"]);
    for (const m of r.malhas) expect(fechada(m), m.nome).toBe(true);
    // furos: o laço de cada furo tem o raio pedido (diâmetro + folga)
    const furos = r.camadas[0].lacos.filter((l) => {
      let s = 0;
      for (let i = 0; i < l.length; i++) s += l[i][0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * l[i][1];
      return s < 0;
    });
    expect(furos).toHaveLength(6);
    const diametros = furos
      .map((l) => {
        const xs = l.map((p) => p[0]);
        return Math.max(...xs) - Math.min(...xs);
      })
      .sort((a, b) => a - b);
    diametros.forEach((d, i) => expect(d).toBeCloseTo(8 + r.folgas[i], 2));
    // pino: volume de um cilindro de 8 mm
    const alturaPino = 4 * 1.5 + 4;
    expect(r.malhas[1].volume).toBeCloseTo(Math.PI * 16 * alturaPino, -1);
  });
});
