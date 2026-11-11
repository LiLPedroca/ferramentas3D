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

  it("guarda os padrões da calculadora e marca quando foram salvos", () => {
    expect(normalizarGravado({}).calculadora).toMatchObject({ precoKg: "100", tarifaKwh: "0.9", maoDeObra: "15", salvoEm: "" });
    const c = aplicarAlteracao({}, { calculadora: { precoKg: "120,50", potenciaW: "250", tarifaKwh: "0,95", custoHora: "2", maoDeObra: "10", lucroPct: "80", valorImpressora: "" } });
    expect(c.calculadora).toMatchObject({ precoKg: "120.5", tarifaKwh: "0.95", valorImpressora: "" });
    expect(c.calculadora.salvoEm).not.toBe("");
    expect(() => aplicarAlteracao({}, { calculadora: { precoKg: "-1" } })).toThrow(/Preço do filamento/);
  });

  it("dados do orçamento: condições padrão, PDF e numeração, sem perder o que não foi enviado", () => {
    const c = aplicarAlteracao({}, { orcamento: { validadeDias: "10", frete: "15,00", entrega: "envio", formasPagamento: ["pix", "debito"], exibirPdf: { numero: false }, nomeArquivo: "manual", proximoNumero: "40592" } });
    expect(c.orcamento).toMatchObject({ validadeDias: 10, freteCentavos: "1500", entrega: "envio", formasPagamento: ["debito", "pix"], nomeArquivo: "manual", proximoNumero: 40592 });
    expect(c.orcamento.exibirPdf).toEqual({ numero: false, nome: true, quantidade: true, precoUnitario: true, dimensoes: true });
    const so = aplicarAlteracao(c, { orcamento: { proximoNumero: "50000" } });
    expect(so.orcamento).toMatchObject({ validadeDias: 10, freteCentavos: "1500", proximoNumero: 50000 });
    expect(() => aplicarAlteracao({}, { orcamento: { entrega: "drone" } })).toThrow(/Entrega/);
  });

  it("empresa: endereço e logo (só PNG ou JPG)", () => {
    const logo = "data:image/png;base64,iVBORw0KGgo=";
    const c = aplicarAlteracao({}, { empresaParcial: { nome: "Estúdio", endereco: "Rua A, 10", logo } });
    expect(c.empresa).toMatchObject({ nome: "Estúdio", endereco: "Rua A, 10", logo });
    expect(aplicarAlteracao(c, { empresaParcial: { logo: "" } }).empresa).toMatchObject({ nome: "Estúdio", logo: "" });
    expect(() => aplicarAlteracao({}, { empresaParcial: { logo: "data:image/svg+xml;base64,AAAA" } })).toThrow(/Logo/);
  });

  it("cadastra vários fatiadores e mantém o ativo na lista", () => {
    const orca = { nome: "OrcaSlicer", caminho: "C:\\Programas\\Orca\\orca-slicer.exe" };
    const any = { nome: "Anycubic Slicer Next", caminho: "C:\\Programas\\Any\\AnycubicSlicerNext.exe" };
    // configuração antiga: só o ativo, sem lista
    expect(normalizarGravado({ fatiador: orca }).fatiadores).toEqual([orca]);
    const novo = aplicarAlteracao({ fatiador: orca }, { fatiadores: [orca, any, { ...any, caminho: any.caminho.toUpperCase() }], fatiador: any });
    expect(novo.fatiador).toEqual(any);
    expect(novo.fatiadores).toEqual([orca, any]);
    // trocar só o ativo não perde os outros
    expect(aplicarAlteracao(novo, { fatiador: orca }).fatiadores).toEqual([orca, any]);
    expect(() => aplicarAlteracao({}, { fatiadores: [{ nome: "x", caminho: "relativo.exe" }] })).toThrow(/Fatiador/);
  });

  it("guarda categorias de produtos sem repetir e em ordem", () => {
    const novo = aplicarAlteracao({}, { categorias: ["Vasos", " chaveiros ", "Chaveiros", "Copos"] });
    expect(novo.categorias).toEqual(["chaveiros", "Copos", "Vasos"]);
    expect(normalizarGravado({ categorias: ["Ok", 5, "x".repeat(80)] }).categorias).toEqual(["5", "Ok"]);
    expect(normalizarGravado({}).categorias).toEqual([]);
    expect(() => aplicarAlteracao({}, { categorias: ["x".repeat(80)] })).toThrow(/Categoria/);
    expect(() => aplicarAlteracao({}, { categorias: "Vasos" })).toThrow(/Categorias/);
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

  it("guarda a calibração real × modelo e recusa valores absurdos", () => {
    const c = { filamento: "PLA Preto", tipo: "furo", modelo: 8, real: 7.85, data: "2026-11-05T12:00:00.000Z" };
    expect(aplicarAlteracao({}, { calibracoes: [c] }).calibracoes).toEqual([c]);
    expect(() => aplicarAlteracao({}, { calibracoes: [{ ...c, real: 80 }] })).toThrow(/longe demais/);
    expect(() => aplicarAlteracao({}, { calibracoes: [{ ...c, tipo: "x" }] })).toThrow(/tipo/);
    // gravado com um item ruim: ignora só ele
    expect(normalizarGravado({ calibracoes: [c, { tipo: "furo" }] }).calibracoes).toHaveLength(1);
  });

  it("guarda as medidas de cada arquivo", () => {
    const medidas = [
      { tipo: "distancia", a: { p: [0, 0, 0], n: [0, 1, 0] }, b: { p: [10, 0, 0], n: [0, -1, 0] } },
      { tipo: "diametro", furo: { centro: [0, 5, 0], eixo: [0, 1, 0], raio: 4, rms: 0.01, lados: 48, tipo: "furo" } },
    ];
    const novo = aplicarAlteracao({}, { medidasSalvas: [{ chave: "placa.stl|20084|400", nome: "placa.stl", medidas }] });
    expect(novo.medidasSalvas[0].medidas).toHaveLength(2);
    expect(novo.medidasSalvas[0].medidas[1].furo.raio).toBe(4);
    expect(() => aplicarAlteracao({}, { medidasSalvas: [{ chave: "x", medidas: [{ tipo: "distancia", a: { p: [0, 0] } }] }] })).toThrow(/Medida/);
    expect(normalizarGravado({ medidasSalvas: "lixo" }).medidasSalvas).toEqual([]);
  });

  it("guarda as medidas do paquímetro de passar o mouse", () => {
    const medidas = [
      { tipo: "redondo", centro: [0, 95, 0], eixo: [0, 1, 0], externo: { raio: 37, rms: 0.01, lados: 96 }, interno: { raio: 35, rms: 0.01, lados: 96 }, profundidade: 92 },
      { tipo: "redondo", centro: [0, 5, 0], eixo: [0, 1, 0], externo: null, interno: { raio: 4, rms: 0, lados: 48 }, passante: true },
      { tipo: "aresta", a: { p: [0, 0, 0], n: null }, b: { p: [30, 0, 0], n: null } },
      { tipo: "parede", a: { p: [0, 0, 0], n: [0, 1, 0] }, b: { p: [0, -2, 0], n: null }, real: 2.1 },
    ];
    const novo = aplicarAlteracao({}, { medidasSalvas: [{ chave: "copo.stl|1|2", nome: "copo.stl", medidas }] });
    const [boca, furo, aresta, parede] = novo.medidasSalvas[0].medidas;
    expect(boca.interno.raio).toBe(35);
    expect(boca.profundidade).toBe(92);
    expect(furo.passante).toBe(true);
    expect(aresta.b.p).toEqual([30, 0, 0]);
    expect(parede.real).toBe(2.1);
    expect(() => aplicarAlteracao({}, { medidasSalvas: [{ chave: "x", medidas: [{ tipo: "redondo", centro: [0, 0, 0], eixo: [0, 1, 0], externo: null, interno: null }] }] })).toThrow(/Medida/);
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
