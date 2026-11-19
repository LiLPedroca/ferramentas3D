import { describe, expect, it } from "vitest";
import { NOVIDADES, compararVersoes, listaDeNovidades, temNovidade } from "../src/core/novidades.js";
import modelo from "../src/core/configuracoes.cjs";

const { aplicarAlteracao, normalizarGravado } = modelo;
const n = (id, versao) => ({ id, versao, tela: "inicio", titulo: "t", texto: "t", itens: [], botao: "b" });
const lista = [n("a", "0.40.0"), n("b", "0.42.0"), n("c", "0.42.0"), n("d", "0.43.0")];

describe("avisos de novidade", () => {
  it("compara versões", () => {
    expect(compararVersoes("0.41.0", "0.42.0")).toBe(-1);
    expect(compararVersoes("0.42.0", "0.42.0")).toBe(0);
    expect(compararVersoes("1.0.0", "0.99.9")).toBe(1);
  });

  it("mostra só as novidades da versão em uso (mais recente primeiro)", () => {
    expect(listaDeNovidades({ primeiraVersao: "0.0.0" }, "0.42.0", lista).map((x) => x.id)).toEqual(["c", "b"]);
    expect(listaDeNovidades({ primeiraVersao: "0.0.0" }, "0.43.0", lista).map((x) => x.id)).toEqual(["d"]);
  });

  it("versão sem novidades: mostra as da última versão que teve", () => {
    expect(listaDeNovidades({ primeiraVersao: "0.0.0" }, "0.42.5", lista).map((x) => x.id)).toEqual(["c", "b"]);
  });

  it("marca como nova o que chegou depois da última vez que abriu a lista", () => {
    const l = listaDeNovidades({ primeiraVersao: "0.0.0", novidadesVistoAte: "0.42.0" }, "0.43.0", lista);
    expect(l.filter((x) => x.nova).map((x) => x.id)).toEqual(["d"]);
    expect(temNovidade({ primeiraVersao: "0.0.0", novidadesVistoAte: "0.43.0" }, "0.43.0", lista)).toBe(false);
  });

  it("quem instalou agora não tem nada novo; quem já usava, tem", () => {
    expect(temNovidade({ primeiraVersao: "0.43.0" }, "0.43.0", lista)).toBe(false);
    expect(temNovidade({ primeiraVersao: "0.0.0" }, "0.43.0", lista)).toBe(true);
    expect(temNovidade({}, "0.43.0", lista)).toBe(false);
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
    expect(aplicarAlteracao(c, { novidadesVistoAte: "0.67.0" }).novidadesVistoAte).toBe("0.67.0");
    expect(() => aplicarAlteracao({}, { novidadesVistoAte: "x" })).toThrow(/Versão/);
  });
});
