import { describe, expect, it } from "vitest";
import { Racional } from "../src/core/racional.js";
import {
  EntradaInvalida,
  calcular,
  criarEntrada,
  formatarReais,
  lerInteiro,
  lerNumero,
  pecasParaPagarImpressora,
} from "../src/core/calculadora.js";

const R = (n, d = 1n) => new Racional(BigInt(n), BigInt(d));

// Mesmos valores base dos testes do Python.
function entrada(sobrescrever = {}) {
  return criarEntrada({
    pesoG: R(100),
    precoKg: R(100),
    potenciaW: R(200),
    horas: R(2),
    tarifaKwh: R(1),
    custoHoraImpressora: R(3),
    maoDeObra: R(5),
    lucroPct: R(50),
    quantidade: 1,
    ...sobrescrever,
  });
}

const iguais = (a, b) => expect(a.compara(b)).toBe(0);

describe("calcular (paridade com o Python)", () => {
  it("filamento, impressora e mão de obra", () => {
    const r = calcular(entrada());
    iguais(r.filamento, R(10));
    iguais(r.impressora, R(6));
    iguais(r.maoDeObra, R(5));
  });

  it("energia exata", () => {
    iguais(calcular(entrada()).energia, R(2, 5));
  });

  it("custo total e preço com lucro sobre o custo", () => {
    const r = calcular(entrada());
    const custo = R(10).soma(R(200, 1000).multiplica(R(2))).soma(R(6)).soma(R(5));
    iguais(r.custoLote, custo);
    iguais(r.precoLote, custo.multiplica(R(3, 2)));
  });

  it("divisão por quantidade", () => {
    const r = calcular(entrada({ quantidade: 4 }));
    iguais(r.custoUnitario, r.custoLote.divide(R(4)));
    iguais(r.precoUnitario, r.precoLote.divide(R(4)));
  });

  it("lucro unitário", () => {
    const r = calcular(entrada({ quantidade: 2 }));
    iguais(r.lucroUnitario, r.precoUnitario.subtrai(r.custoUnitario));
  });

  it("lucro zero: preço igual ao custo", () => {
    const r = calcular(entrada({ lucroPct: R(0) }));
    iguais(r.precoLote, r.custoLote);
  });

  it("não há erro de ponto flutuante (0,1 + 0,2 = 0,3)", () => {
    const base = { pesoG: R(0), horas: R(0) };
    const a = calcular(entrada({ ...base, maoDeObra: R(1, 10) }));
    const b = calcular(entrada({ ...base, maoDeObra: R(2, 10) }));
    iguais(a.custoLote.soma(b.custoLote), R(3, 10));
  });
});

describe("validação", () => {
  it("recusa valores negativos", () => {
    expect(() => entrada({ pesoG: R(-1) })).toThrow(EntradaInvalida);
  });

  it("recusa quantidade menor que 1", () => {
    expect(() => entrada({ quantidade: 0 })).toThrow(EntradaInvalida);
  });
});

describe("pecasParaPagarImpressora", () => {
  it("arredonda para cima", () => {
    expect(pecasParaPagarImpressora(R(1000), R(30))).toBe(34n); // 33,33 -> 34
  });

  it("sem lucro retorna null", () => {
    expect(pecasParaPagarImpressora(R(1000), R(0))).toBeNull();
    expect(pecasParaPagarImpressora(R(1000), R(-5))).toBeNull();
  });
});

describe("formatação", () => {
  it("arredonda meio para cima", () => {
    expect(formatarReais(R(1, 8))).toBe("R$ 0,13"); // 0,125
    expect(formatarReais(R(10, 3))).toBe("R$ 3,33");
  });

  it("padrão brasileiro com separador de milhar", () => {
    expect(formatarReais(R(1234567, 1000))).toBe("R$ 1.234,57");
    expect(formatarReais(R(0))).toBe("R$ 0,00");
  });

  it("negativo", () => {
    expect(formatarReais(R(-1500))).toBe("-R$ 1.500,00");
  });
});

describe("leitura de campos", () => {
  it("aceita vírgula e ponto", () => {
    iguais(lerNumero("12,5", "x"), R(25, 2));
    iguais(lerNumero("12.5", "x"), R(25, 2));
  });

  it("rejeita vazio e texto inválido com mensagem", () => {
    expect(() => lerNumero("", "Peso")).toThrow(/Preencha o campo: Peso/);
    expect(() => lerNumero("abc", "Peso")).toThrow(EntradaInvalida);
    expect(() => lerNumero("1,2,3", "Peso")).toThrow(EntradaInvalida);
  });

  it("inteiro aceita só dígitos", () => {
    expect(lerInteiro(" 4 ", "Qtd")).toBe(4);
    expect(() => lerInteiro("2,5", "Qtd")).toThrow(EntradaInvalida);
    expect(() => lerInteiro("-1", "Qtd")).toThrow(EntradaInvalida);
  });
});
