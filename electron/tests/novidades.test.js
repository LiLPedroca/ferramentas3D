import { describe, expect, it } from "vitest";
import { NOVIDADES, compararVersoes, novidadeDaTela } from "../src/core/novidades.js";
import modelo from "../src/core/configuracoes.cjs";

const { aplicarAlteracao, normalizarGravado } = modelo;
const lista = [{ id: "calc-nova", versao: "0.42.0", tela: "calculadora", titulo: "t", texto: "t", itens: [], botao: "b" }];

describe("avisos de novidade", () => {
  it("compara versões", () => {
    expect(compararVersoes("0.41.0", "0.42.0")).toBe(-1);
    expect(compararVersoes("0.42.0", "0.42.0")).toBe(0);
    expect(compararVersoes("1.0.0", "0.99.9")).toBe(1);
  });

  it("mostra uma vez para quem já usava antes da mudança", () => {
    const antigo = { primeiraVersao: "0.0.0", novidadesVistas: [] };
    expect(novidadeDaTela("calculadora", antigo, "0.42.0", lista)?.id).toBe("calc-nova");
    expect(novidadeDaTela("produtos", antigo, "0.42.0", lista)).toBeNull();
    expect(novidadeDaTela("calculadora", { ...antigo, novidadesVistas: ["calc-nova"] }, "0.42.0", lista)).toBeNull();
    expect(novidadeDaTela("calculadora", { ...antigo, ocultarNovidades: true }, "0.42.0", lista)).toBeNull();
  });

  it("não mostra para quem instalou já com a mudança nem antes de ela existir", () => {
    expect(novidadeDaTela("calculadora", { primeiraVersao: "0.42.0" }, "0.42.0", lista)).toBeNull();
    expect(novidadeDaTela("calculadora", { primeiraVersao: "0.0.0" }, "0.41.0", lista)).toBeNull();
  });

  it("catálogo real tem ids únicos e campos preenchidos", () => {
    expect(new Set(NOVIDADES.map((n) => n.id)).size).toBe(NOVIDADES.length);
    for (const n of NOVIDADES) {
      expect(n.id).toMatch(/^[a-z0-9-]+$/);
      expect(n.titulo && n.texto && n.botao && n.itens.length).toBeTruthy();
    }
  });

  it("configuração guarda vistas, opção de ocultar e a primeira versão (só uma vez)", () => {
    const c = aplicarAlteracao({}, { novidadesVistas: ["calc-nova", "calc-nova"], ocultarNovidades: true, primeiraVersao: "0.42.0" });
    expect(c).toMatchObject({ novidadesVistas: ["calc-nova"], ocultarNovidades: true, primeiraVersao: "0.42.0" });
    expect(aplicarAlteracao(c, { primeiraVersao: "0.50.0" }).primeiraVersao).toBe("0.42.0");
    expect(normalizarGravado({ primeiraVersao: "x" }).primeiraVersao).toBe("");
    expect(() => aplicarAlteracao({}, { novidadesVistas: ["<b>"] })).toThrow(/Novidades/);
  });
});
