import { describe, expect, it } from "vitest";
import { FERRAMENTAS } from "../src/core/ferramentas.js";
import { contarFerramentas, filtrarFerramentas, normalizar, saudacao } from "../src/core/inicio.js";

describe("saudação", () => {
  it("muda conforme o horário", () => {
    expect(saudacao(5)).toBe("Bom dia");
    expect(saudacao(11)).toBe("Bom dia");
    expect(saudacao(12)).toBe("Boa tarde");
    expect(saudacao(17)).toBe("Boa tarde");
    expect(saudacao(18)).toBe("Boa noite");
    expect(saudacao(2)).toBe("Boa noite");
  });
});

describe("busca e filtro", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(normalizar("  Orçamentos ")).toBe("orcamentos");
    expect(filtrarFerramentas(FERRAMENTAS, { busca: "ORCAMENTO" }).map((f) => f.id)).toEqual(["orcamentos"]);
  });

  it("exige todas as palavras", () => {
    const ids = filtrarFerramentas(FERRAMENTAS, { busca: "stl volume" }).map((f) => f.id);
    expect(ids).toEqual(["visualizador"]);
  });

  it("filtra disponíveis e em breve", () => {
    const disponiveis = filtrarFerramentas(FERRAMENTAS, { filtro: "disponiveis" });
    const emBreve = filtrarFerramentas(FERRAMENTAS, { filtro: "em-breve" });
    expect(disponiveis.every((f) => f.disponivel)).toBe(true);
    expect(emBreve.every((f) => !f.disponivel)).toBe(true);
    expect(disponiveis.length + emBreve.length).toBe(FERRAMENTAS.length);
  });

  it("busca vazia devolve a lista inteira", () => {
    expect(filtrarFerramentas(FERRAMENTAS, { busca: "   " })).toHaveLength(FERRAMENTAS.length);
  });
});

describe("catálogo", () => {
  it("ids únicos e disponíveis apontam para uma tela", () => {
    const ids = FERRAMENTAS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FERRAMENTAS.filter((f) => f.disponivel)) {
      expect(["calculadora", "visualizador"]).toContain(f.tela);
    }
  });

  it("conta prontas e em breve", () => {
    const c = contarFerramentas(FERRAMENTAS);
    expect(c.disponiveis).toBe(2);
    expect(c.emBreve).toBe(FERRAMENTAS.length - 2);
  });
});
