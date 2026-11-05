import { describe, expect, it } from "vitest";
import { FERRAMENTAS, GRUPOS } from "../src/core/ferramentas.js";
import {
  boasVindas,
  contarFerramentas,
  filtrarFerramentas,
  gruposVisiveis,
  normalizar,
  saudacao,
} from "../src/core/inicio.js";

describe("boas-vindas", () => {
  it("usa só o primeiro nome", () => {
    expect(boasVindas("  Pedro Henrique ")).toBe("Bem-vindo, Pedro!");
    expect(boasVindas("")).toBe("Bem-vindo!");
    expect(boasVindas(undefined)).toBe("Bem-vindo!");
  });
});

describe("grupos", () => {
  it("esconde grupo sem ferramenta pronta", () => {
    const grupos = [{ id: "a" }, { id: "b" }];
    const ferramentas = [
      { id: "x", grupo: "a", disponivel: true },
      { id: "y", grupo: "b", disponivel: false },
    ];
    const visiveis = gruposVisiveis(grupos, ferramentas);
    expect(visiveis.map((g) => g.id)).toEqual(["a"]);
    expect(visiveis[0].ferramentas.map((f) => f.id)).toEqual(["x"]);
  });

  it("toda ferramenta real pertence a um grupo existente", () => {
    const ids = new Set(GRUPOS.map((g) => g.id));
    for (const f of FERRAMENTAS) expect(ids.has(f.grupo)).toBe(true);
  });
});

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
      expect(["calculadora", "visualizador", "produtos", "clientes", "orcamentos", "metadados", "backup", "detector", "svg", "stl", "chaveiro", "logo", "palavras", "projetos"]).toContain(f.tela);
    }
  });

  it("conta as ferramentas", () => {
    const n = FERRAMENTAS.length;
    expect(contarFerramentas(FERRAMENTAS)).toEqual({ total: n, disponiveis: n, emBreve: 0 });
  });
});
