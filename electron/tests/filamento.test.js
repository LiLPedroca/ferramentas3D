import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { acabando, descontar, montarFilamento, validarFilamento, valorRestanteCentavos } = require("../src/core/filamento.cjs");
const { lerBackup, montarBackup } = require("../src/core/backup.cjs");

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const base = { material: "PLA", marca: "Anycubic", cor: "Branco", corHex: "#FFFFFF", pesoTotal: "1000", precoKg: "99,90" };

describe("estoque de filamentos", () => {
  it("rolo novo começa cheio, com preço em centavos", () => {
    const f = montarFilamento(base, { id: ID, agora: "2026-11-04T10:00:00.000Z" });
    expect(f.restanteG).toBe(1000);
    expect(f.precoKgCentavos).toBe("9990");
    expect(f.corHex).toBe("#ffffff");
    expect(validarFilamento(f)).toBe(true);
  });

  it("valida peso, restante, cor e preço", () => {
    expect(() => montarFilamento({ ...base, cor: " " }, { id: ID })).toThrow(/Cor/);
    expect(() => montarFilamento({ ...base, pesoTotal: "0" }, { id: ID })).toThrow(/Peso do rolo/);
    expect(() => montarFilamento({ ...base, restante: "1200" }, { id: ID })).toThrow(/Restante/);
    expect(() => montarFilamento({ ...base, precoKg: "" }, { id: ID })).toThrow(/Preço por kg/);
    expect(montarFilamento({ ...base, material: "Madeira" }, { id: ID }).material).toBe("PLA");
  });

  it("desconta e devolve sem passar de 0 nem do total; avisa quando acaba", () => {
    const f = montarFilamento({ ...base, restante: "300" }, { id: ID });
    expect(descontar(f, 3.8).restanteG).toBe(296.2);
    expect(descontar(f, 500).restanteG).toBe(0);
    expect(descontar(f, -900).restanteG).toBe(1000);
    expect(acabando(f)).toBe(false);
    expect(acabando(descontar(f, 160))).toBe(true); // 140 g < 15% de 1 kg
    expect(acabando(descontar(f, 210))).toBe(true); // 90 g
  });

  it("valor do que resta no rolo", () => {
    const f = montarFilamento({ ...base, restante: "250" }, { id: ID });
    expect(valorRestanteCentavos(f)).toBe(2497n); // 0,25 kg × R$ 99,90
  });

  it("entra no backup", () => {
    const f = montarFilamento(base, { id: ID });
    const { dados, resumo } = lerBackup(JSON.stringify(montarBackup({ filamentos: [f] }, { versaoApp: "0.23.0" })));
    expect(dados.filamentos).toEqual([f]);
    expect(resumo.filamentos).toBe(1);
  });
});
