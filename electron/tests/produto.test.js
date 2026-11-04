import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import produtoMod from "../src/core/produto.cjs";
import produtosMod from "../src/main/produtos.cjs";

const { ProdutoInvalido, centavosDeTexto, medidaDeTexto, montarProduto, validarProduto } = produtoMod;
const { criarServicoProdutos, responder } = produtosMod;

const ID = "11111111-2222-3333-4444-555555555555";
const base = { nome: "Chaveiro", preco: "25,90" };

describe("preço em centavos", () => {
  it("aceita formatos brasileiros", () => {
    expect(centavosDeTexto("25,90")).toBe("2590");
    expect(centavosDeTexto("25.9")).toBe("2590");
    expect(centavosDeTexto("1.234,56")).toBe("123456");
    expect(centavosDeTexto("R$ 12")).toBe("1200");
    expect(centavosDeTexto("0")).toBe("0");
  });

  it("recusa valores mal formados", () => {
    for (const t of ["abc", "12,345", "-5", "1,2,3", "1.23.4"]) {
      expect(() => centavosDeTexto(t)).toThrow(ProdutoInvalido);
    }
  });

  it("vazio: opcional vira vazio, obrigatório dá erro", () => {
    expect(centavosDeTexto("  ")).toBe("");
    expect(() => centavosDeTexto("", "Preço", { obrigatorio: true })).toThrow(/Preencha/);
  });
});

describe("medidas", () => {
  it("normaliza com ponto e aceita vazio", () => {
    expect(medidaDeTexto("12,5", "Peso")).toBe("12.5");
    expect(medidaDeTexto("040", "Peso")).toBe("40");
    expect(medidaDeTexto("", "Peso")).toBe("");
  });

  it("recusa negativos e texto", () => {
    expect(() => medidaDeTexto("-1", "Peso")).toThrow(ProdutoInvalido);
    expect(() => medidaDeTexto("dez", "Peso")).toThrow(ProdutoInvalido);
  });
});

describe("montarProduto", () => {
  it("monta e valida um produto completo", () => {
    const p = montarProduto(
      { ...base, categoria: " Chaveiros ", pesoG: "12,4", alturaMm: "40", observacoes: "PLA  azul" },
      { id: ID, agora: "2026-11-04T10:00:00.000Z" },
    );
    expect(p).toMatchObject({
      nome: "Chaveiro",
      categoria: "Chaveiros",
      precoCentavos: "2590",
      pesoG: "12.4",
      alturaMm: "40",
      larguraMm: "",
      observacoes: "PLA azul",
      criadoEm: "2026-11-04T10:00:00.000Z",
    });
  });

  it("exige nome e preço", () => {
    expect(() => montarProduto({ preco: "1" }, { id: ID })).toThrow(/Nome/);
    expect(() => montarProduto({ nome: "X" }, { id: ID })).toThrow(/Preço/);
  });

  it("mantém a data de criação e a foto ao editar", () => {
    const foto = "data:image/jpeg;base64,AAAA";
    const anterior = montarProduto({ ...base, foto }, { id: ID, agora: "2026-01-01T00:00:00.000Z" });
    const editado = montarProduto({ ...base, nome: "Chaveiro 2" }, { id: ID, anterior, agora: "2026-02-01T00:00:00.000Z" });
    expect(editado.criadoEm).toBe("2026-01-01T00:00:00.000Z");
    expect(editado.atualizadoEm).toBe("2026-02-01T00:00:00.000Z");
    expect(editado.foto).toBe(foto);
    const semFoto = montarProduto({ ...base, removerFoto: true }, { id: ID, anterior });
    expect(semFoto.foto).toBeUndefined();
  });

  it("recusa foto que não é imagem", () => {
    expect(() => montarProduto({ ...base, foto: "data:text/html;base64,AAAA" }, { id: ID })).toThrow(/Foto/);
  });

  it("guarda o custo vindo da calculadora", () => {
    const custo = { custoUnitarioCentavos: "1500", lucroPct: "100", data: "2026-11-04T10:00:00.000Z" };
    const p = montarProduto({ ...base, custo }, { id: ID });
    expect(p.custo).toEqual(custo);
    expect(() => montarProduto({ ...base, custo: { custoUnitarioCentavos: "-1" } }, { id: ID })).toThrow(/Custo/);
  });

  it("validarProduto recusa id estranho", () => {
    const p = montarProduto(base, { id: ID });
    expect(() => validarProduto({ ...p, id: "../x" })).toThrow(ProdutoInvalido);
  });
});

describe("serviço de produtos (arquivo)", () => {
  let pasta;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "produtos-teste-"));
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it("cria, lista, edita e exclui", async () => {
    const servico = criarServicoProdutos(pasta);
    expect(await servico.listar()).toEqual([]);

    const criado = await servico.salvar(base);
    expect((await servico.listar()).map((p) => p.nome)).toEqual(["Chaveiro"]);

    await servico.salvar({ ...base, nome: "Chaveiro grande" }, criado.id);
    const lista = await servico.listar();
    expect(lista).toHaveLength(1);
    expect(lista[0].nome).toBe("Chaveiro grande");

    await servico.excluir(criado.id);
    expect(await servico.listar()).toEqual([]);
  });

  it("gravações simultâneas não se perdem", async () => {
    const servico = criarServicoProdutos(pasta);
    await Promise.all(Array.from({ length: 10 }, (_, i) => servico.salvar({ nome: `P${i}`, preco: "1" })));
    expect(await servico.listar()).toHaveLength(10);
  });

  it("usa o .bak se o arquivo principal estiver danificado", async () => {
    const servico = criarServicoProdutos(pasta);
    await servico.salvar({ nome: "A", preco: "1" });
    await servico.salvar({ nome: "B", preco: "1" }); // .bak agora tem "A"
    await writeFile(join(pasta, "produtos.json"), "{ quebrado", "utf8");
    expect((await servico.listar()).map((p) => p.nome)).toEqual(["A"]);
  });

  it("não sobrescreve quando nada pode ser lido", async () => {
    await writeFile(join(pasta, "produtos.json"), "{ quebrado", "utf8");
    const servico = criarServicoProdutos(pasta);
    const resposta = await responder(servico.salvar(base));
    expect(resposta.ok).toBe(false);
    expect(await readFile(join(pasta, "produtos.json"), "utf8")).toBe("{ quebrado");
  });

  it("itens inválidos ficam no arquivo, mas fora da lista", async () => {
    const servico = criarServicoProdutos(pasta);
    await servico.salvar(base);
    const arquivo = join(pasta, "produtos.json");
    const dados = JSON.parse(await readFile(arquivo, "utf8"));
    dados.itens.push({ id: "estranho", nome: "" });
    await writeFile(arquivo, JSON.stringify(dados), "utf8");

    expect(await servico.listar()).toHaveLength(1);
    await servico.salvar({ nome: "Outro", preco: "2" });
    const depois = JSON.parse(await readFile(arquivo, "utf8"));
    expect(depois.itens.some((p) => p.id === "estranho")).toBe(true);
  });

  it("responder devolve mensagem amigável", async () => {
    const servico = criarServicoProdutos(pasta);
    const r = await responder(servico.salvar({ nome: "", preco: "1" }));
    expect(r).toEqual({ ok: false, erro: "Preencha o campo: Nome." });
  });
});
