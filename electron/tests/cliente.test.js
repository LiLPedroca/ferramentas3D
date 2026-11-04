import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import modelo from "../src/core/cliente.cjs";
import servicoMod from "../src/main/clientes.cjs";
import colecaoMod from "../src/main/servico-colecao.cjs";

const { cnpjValido, cpfValido, documentoDeTexto, emailDeTexto, montarCliente, telefoneDeTexto } = modelo;
const { criarServicoClientes } = servicoMod;
const { responder } = colecaoMod;

const ID = "11111111-2222-3333-4444-555555555555";

describe("campos do cliente", () => {
  it("telefone guarda só dígitos e confere o tamanho", () => {
    expect(telefoneDeTexto("(11) 98765-4321")).toBe("11987654321");
    expect(telefoneDeTexto("")).toBe("");
    expect(() => telefoneDeTexto("123")).toThrow(/Telefone/);
  });

  it("e-mail em minúsculas e com formato válido", () => {
    expect(emailDeTexto(" Pedro@Exemplo.COM ")).toBe("pedro@exemplo.com");
    expect(emailDeTexto("")).toBe("");
    expect(() => emailDeTexto("pedro@")).toThrow(/E-mail/);
  });

  it("CPF e CNPJ conferem os dígitos verificadores", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000180")).toBe(false);
    expect(documentoDeTexto("529.982.247-25")).toBe("52998224725");
    expect(documentoDeTexto("11.222.333/0001-81")).toBe("11222333000181");
    expect(documentoDeTexto("")).toBe("");
    expect(() => documentoDeTexto("123.456.789-00")).toThrow(/CPF/);
  });

  it("monta um cliente completo e exige nome", () => {
    const c = montarCliente(
      { nome: " Maria  Souza ", telefone: "(21) 3333-4444", email: "m@x.com", cidade: "Niterói", observacoes: "Prefere\r\nWhatsApp" },
      { id: ID, agora: "2026-11-04T10:00:00.000Z" },
    );
    expect(c).toMatchObject({ nome: "Maria Souza", telefone: "2133334444", cidade: "Niterói", observacoes: "Prefere\nWhatsApp" });
    expect(() => montarCliente({ telefone: "11999999999" }, { id: ID })).toThrow(/Nome/);
  });
});

describe("serviço de clientes", () => {
  let pasta;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "clientes-teste-"));
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it("lista em ordem alfabética, edita e exclui", async () => {
    const s = criarServicoClientes(pasta);
    await s.salvar({ nome: "Zélia" });
    const ana = await s.salvar({ nome: "ana" });
    await s.salvar({ nome: "Bruno" });
    expect((await s.listar()).map((c) => c.nome)).toEqual(["ana", "Bruno", "Zélia"]);

    await s.salvar({ nome: "Ana Paula" }, ana.id);
    expect((await s.listar())[0].nome).toBe("Ana Paula");

    await s.excluir(ana.id);
    expect(await s.listar()).toHaveLength(2);
    const r = await responder(s.excluir(ana.id));
    expect(r).toEqual({ ok: false, erro: "Este cliente já foi excluído." });
  });
});
