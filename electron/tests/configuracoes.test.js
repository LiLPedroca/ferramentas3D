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
    expect(normalizarGravado(undefined)).toMatchObject({ nome: "", nomePerguntado: false });
    expect(normalizarGravado({ nome: "  Pedro   Henrique ", nomePerguntado: true })).toMatchObject({
      nome: "Pedro Henrique",
      nomePerguntado: true,
    });
    expect(normalizarGravado({ nome: "x".repeat(200) }).nome).toBe("");
    // empresa com telefone estranho: ignora só o campo ruim
    const n = normalizarGravado({ empresa: { nome: "Estúdio", telefone: "12" } });
    expect(n.empresa).toMatchObject({ nome: "Estúdio", telefone: "" });
    expect(n.orcamento.validadeDias).toBe(7);
  });

  it("aplica só os campos enviados", () => {
    const atual = { nome: "Pedro", nomePerguntado: true };
    expect(aplicarAlteracao(atual, { nome: "Ana" })).toMatchObject({ nome: "Ana", nomePerguntado: true });
    expect(aplicarAlteracao(atual, { outro: 1 })).toMatchObject(atual);
  });

  it("valida dados da empresa e padrões do orçamento", () => {
    const novo = aplicarAlteracao(
      {},
      {
        empresa: { nome: "Estúdio 3D", telefone: "(11) 91234-5678", email: "OI@Estudio.com", documento: "11.222.333/0001-81" },
        orcamento: { validadeDias: "15", formaPagamento: "Pix ou cartão" },
      },
    );
    expect(novo.empresa).toMatchObject({ telefone: "11912345678", email: "oi@estudio.com", documento: "11222333000181" });
    expect(novo.orcamento).toMatchObject({ validadeDias: 15, formaPagamento: "Pix ou cartão" });
    expect(() => aplicarAlteracao({}, { empresa: { email: "x@" } })).toThrow(/E-mail/);
    expect(() => aplicarAlteracao({}, { orcamento: { validadeDias: "0" } })).toThrow(/Validade/);
  });

  it("valida o fatiador escolhido", () => {
    const ok = aplicarAlteracao({}, { fatiador: { nome: "Bambu Studio", caminho: "C:\\Program Files\\Bambu Studio\\bambu-studio.exe" } });
    expect(ok.fatiador.nome).toBe("Bambu Studio");
    expect(aplicarAlteracao({}, { fatiador: { caminho: "C:\\Apps\\orca-slicer.exe" } }).fatiador.nome).toBe("orca-slicer");
    expect(() => aplicarAlteracao({}, { fatiador: { caminho: "C:\\Apps\\script.bat" } })).toThrow(/Fatiador/);
    expect(() => aplicarAlteracao({}, { fatiador: { caminho: "\\\\servidor\\x.exe" } })).toThrow(/Fatiador/);
    expect(aplicarAlteracao({}, { fatiador: { caminho: "" } }).fatiador).toEqual({ nome: "", caminho: "" });
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
    expect(await s.ler()).toMatchObject({ nome: "", nomePerguntado: false });
    await s.salvar({ nome: "Pedro", nomePerguntado: true });
    expect(await criarServicoConfiguracoes(pasta).ler()).toMatchObject({ nome: "Pedro", nomePerguntado: true });
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
