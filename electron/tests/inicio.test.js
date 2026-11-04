import { describe, expect, it } from "vitest";
import { FERRAMENTAS } from "../src/core/ferramentas.js";
import { contarFerramentas, filtrarFerramentas, normalizar, saudacao } from "../src/core/inicio.js";

// Lista de exemplo, independente do catálogo real.
const EXEMPLO = [
  { id: "a", titulo: "Orçamentos", descricao: "Pedidos em PDF", categoria: "Vendas", disponivel: true },
  { id: "b", titulo: "Visualizar 3D", descricao: "Abra um STL e veja o volume", categoria: "Produção", disponivel: true },
  { id: "c", titulo: "Etiquetas", descricao: "QR code", categoria: "Vendas", disponivel: false },
];

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
    expect(filtrarFerramentas(EXEMPLO, { busca: "ORCAMENTO" }).map((f) => f.id)).toEqual(["a"]);
  });

  it("exige todas as palavras", () => {
    expect(filtrarFerramentas(EXEMPLO, { busca: "stl volume" }).map((f) => f.id)).toEqual(["b"]);
  });

  it("filtro de disponíveis esconde o que ainda não existe", () => {
    expect(filtrarFerramentas(EXEMPLO, { filtro: "disponiveis" }).map((f) => f.id)).toEqual(["a", "b"]);
    expect(filtrarFerramentas(EXEMPLO, { filtro: "em-breve" }).map((f) => f.id)).toEqual(["c"]);
  });

  it("busca vazia devolve a lista inteira", () => {
    expect(filtrarFerramentas(EXEMPLO, { busca: "   " })).toHaveLength(3);
  });
});

describe("catálogo real", () => {
  it("só tem ferramentas prontas, com ids únicos e tela registrada", () => {
    const ids = FERRAMENTAS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FERRAMENTAS) {
      expect(f.disponivel).toBe(true);
      expect(["calculadora", "visualizador", "produtos"]).toContain(f.tela);
    }
  });

  it("conta as ferramentas", () => {
    expect(contarFerramentas(FERRAMENTAS)).toEqual({ total: 3, disponiveis: 3, emBreve: 0 });
  });
});
