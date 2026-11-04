import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import modelo from "../src/core/configuracoes.cjs";
import servicoMod from "../src/main/configuracoes.cjs";

const { aplicarAlteracao, normalizarGravado } = modelo;
const { criarServicoConfiguracoes, responderConfig } = servicoMod;

describe("modelo de configurações", () => {
  it("normaliza o que estiver gravado sem falhar", () => {
    expect(normalizarGravado(undefined)).toEqual({ nome: "", nomePerguntado: false });
    expect(normalizarGravado({ nome: "  Pedro   Henrique ", nomePerguntado: true })).toEqual({
      nome: "Pedro Henrique",
      nomePerguntado: true,
    });
    expect(normalizarGravado({ nome: "x".repeat(200) }).nome).toBe("");
  });

  it("aplica só os campos enviados", () => {
    const atual = { nome: "Pedro", nomePerguntado: true };
    expect(aplicarAlteracao(atual, { nome: "Ana" })).toEqual({ nome: "Ana", nomePerguntado: true });
    expect(aplicarAlteracao(atual, { outro: 1 })).toEqual(atual);
  });

  it("recusa nome longo ou com caracteres de controle", () => {
    expect(() => aplicarAlteracao({}, { nome: "x".repeat(81) })).toThrow(/80/);
    expect(() => aplicarAlteracao({}, { nome: "a\u0007b" })).toThrow(/inválidos/);
  });
});

describe("serviço de configurações (arquivo)", () => {
  let pasta;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "config-teste-"));
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it("começa vazio, salva e lê de volta", async () => {
    const s = criarServicoConfiguracoes(pasta);
    expect(await s.ler()).toEqual({ nome: "", nomePerguntado: false });
    await s.salvar({ nome: "Pedro", nomePerguntado: true });
    expect(await criarServicoConfiguracoes(pasta).ler()).toEqual({ nome: "Pedro", nomePerguntado: true });
  });

  it("preserva campos desconhecidos de versões futuras", async () => {
    const arquivo = join(pasta, "configuracoes.json");
    await writeFile(arquivo, JSON.stringify({ versao: 1, dados: { nome: "A", futuro: { x: 1 } } }), "utf8");
    await criarServicoConfiguracoes(pasta).salvar({ nome: "B" });
    const gravado = JSON.parse(await readFile(arquivo, "utf8"));
    expect(gravado.dados).toMatchObject({ nome: "B", futuro: { x: 1 } });
  });

  it("erro de validação vira mensagem amigável", async () => {
    const r = await responderConfig(criarServicoConfiguracoes(pasta).salvar({ nome: "x".repeat(90) }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/80 caracteres/);
  });
});
