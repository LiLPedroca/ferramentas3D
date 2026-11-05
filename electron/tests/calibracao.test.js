import { describe, expect, it } from "vitest";
import { previsaoImpressa, resumoCalibracao, textoDiferenca, textoDoResumo, tipoDaCalibracao } from "../src/renderer/modelos/calibracao.js";

const c = (tipo, modelo, real, filamento = "PLA Preto") => ({ filamento, tipo, modelo, real });

describe("real × modelo", () => {
  const lista = [c("furo", 8, 7.85), c("furo", 5, 4.83), c("pino", 6, 6.05), c("externa", 40, 39.88), c("furo", 8, 8.2, "PETG")];

  it("resume por filamento", () => {
    const r = resumoCalibracao(lista, "PLA Preto");
    expect(r.furo.diferenca).toBeCloseTo(-0.16);
    expect(r.furo.n).toBe(2);
    expect(r.pino.diferenca).toBeCloseTo(0.05);
    expect(r.externa.percentual).toBeCloseTo(-0.3);
    expect(resumoCalibracao(lista, "PETG").pino).toBeNull();
  });

  it("prevê como vai sair", () => {
    const r = resumoCalibracao(lista, "PLA Preto");
    expect(previsaoImpressa("furo", 10, r)).toBeCloseTo(9.84);
    expect(previsaoImpressa("externa", 100, r)).toBeCloseTo(99.7);
    expect(previsaoImpressa("pino", 6, resumoCalibracao([], "x"))).toBeNull();
  });

  it("textos", () => {
    expect(textoDoResumo(resumoCalibracao(lista, "PLA Preto"))).toBe(
      "Furos saem 0,16 mm menores (2 medidas) · pinos saem 0,05 mm mais grossos (1 medida) · medidas externas 0,3% menores (1 medida).",
    );
    expect(textoDoResumo(resumoCalibracao([], "x"))).toBe("");
    expect(textoDiferenca(8, 7.85)).toBe("−0,15 mm (−1,88%)");
    expect(tipoDaCalibracao({ tipo: "diametro", furo: { tipo: "pino" } })).toBe("pino");
    expect(tipoDaCalibracao({ tipo: "distancia" })).toBe("externa");
  });
});
