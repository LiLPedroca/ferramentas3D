import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import clientesMod from "../src/main/clientes.cjs";
import produtosMod from "../src/main/produtos.cjs";
import orcamentosMod from "../src/main/orcamentos.cjs";
import configMod from "../src/main/configuracoes.cjs";
import finMod from "../src/main/financeiro.cjs";
import testeMod from "../src/main/dados-teste.cjs";
import dadosTeste from "../src/core/dados-teste.cjs";
import fin from "../src/core/financeiro.cjs";
import pdf from "../src/core/orcamento-pdf.cjs";
import { calcular, criarEntrada } from "../src/core/calculadora.js";
import { Racional } from "../src/core/racional.js";

let pasta;
beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), "dados-teste-"));
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

function servicos() {
  const configuracoes = configMod.criarServicoConfiguracoes(pasta);
  const clientes = clientesMod.criarServicoClientes(pasta);
  const produtos = produtosMod.criarServicoProdutos(pasta);
  const orcamentos = orcamentosMod.criarServicoOrcamentos(pasta, { clientes, configuracoes });
  const financeiro = finMod.criarServicoFinanceiro(pasta, { orcamentos });
  const teste = testeMod.criarServicoDadosTeste({ clientes, produtos, orcamentos, vendas: financeiro.vendas, configuracoes });
  return { configuracoes, clientes, produtos, orcamentos, financeiro, teste };
}

const item = { descricao: "Peça", quantidade: "1", preco: "50,00" };

describe("dados de teste", () => {
  it("o cálculo pronto da Peça teste bate com a calculadora", () => {
    const c = dadosTeste.calculoTeste("2026-11-11T00:00:00.000Z");
    const R = (t) => Racional.deTexto(t);
    const r = calcular(
      criarEntrada({
        pesoG: R(c.pesoG), precoKg: R(c.precoKg), horas: R(c.horas), potenciaW: R(c.potenciaW), tarifaKwh: R(c.tarifaKwh),
        custoHoraImpressora: R(c.custoHora), maoDeObra: R(c.maoDeObra), lucroPct: R(c.lucroPct), quantidade: 1,
      }),
    );
    expect(r.custoLote.centavosArredondados().toString()).toBe(c.custosCentavos.total);
    expect(r.precoUnitario.centavosArredondados().toString()).toBe("2854");
    expect(dadosTeste.produtoTeste().precoCentavos).toBe("2854");
  });

  it("cria uma vez só e recria sem duplicar", async () => {
    const s = servicos();
    expect(await s.teste.criarNaPrimeiraVez()).toBe(true);
    expect(await s.teste.criarNaPrimeiraVez()).toBe(false);
    await s.clientes.excluir("cliente-teste");
    expect(await s.teste.criarNaPrimeiraVez()).toBe(false); // excluído pelo usuário: não volta sozinho
    await s.teste.recriar();
    await s.teste.recriar();
    const clientes = await s.clientes.listar();
    expect(clientes.filter((c) => c.teste)).toHaveLength(1);
    expect((await s.produtos.listar()).filter((p) => p.teste)).toHaveLength(1);
  });

  it("editar o cliente de teste mantém a marca", async () => {
    const s = servicos();
    await s.teste.recriar();
    const c = await s.clientes.salvar({ nome: "Cliente Teste 2", telefone: "", email: "", documento: "", cidade: "", observacoes: "" }, "cliente-teste");
    expect(c.teste).toBe(true);
  });

  it("orçamento de teste: numeração própria, fora do financeiro e limpável", async () => {
    const s = servicos();
    await s.teste.recriar();
    await s.configuracoes.salvar({ orcamento: { proximoNumero: "40" } });
    const real = await s.orcamentos.salvar({ cliente: { nome: "Ana" }, itens: [item], situacao: "finalizado" });
    const t1 = await s.orcamentos.salvar({ clienteId: "cliente-teste", itens: [item], situacao: "finalizado" });
    const t2 = await s.orcamentos.salvar({ clienteId: "cliente-teste", itens: [item], situacao: "finalizado" });
    const real2 = await s.orcamentos.salvar({ cliente: { nome: "Bia" }, itens: [item], situacao: "finalizado" });
    expect([real.numero, t1.numero, t2.numero, real2.numero]).toEqual([40, 1, 2, 41]);
    expect(t1.teste).toBe(true);
    expect(real.teste).toBeUndefined();

    // O mesmo número pode existir nos dois grupos, mas não repetido dentro do grupo.
    await expect(s.orcamentos.salvar({ clienteId: "cliente-teste", numero: "2", itens: [item] })).rejects.toThrow(/de teste com o número 2/);
    const t40 = await s.orcamentos.salvar({ clienteId: "cliente-teste", numero: "40", itens: [item] });
    expect(t40.numero).toBe(40);

    // Trocar o cliente de teste por um real dá um número real novo.
    const virouReal = await s.orcamentos.salvar({ cliente: { nome: "Caio" }, numero: String(t2.numero), itens: [item] }, t2.id);
    expect(virouReal.teste).toBeUndefined();
    expect(virouReal.numero).toBe(42);

    await s.financeiro.sincronizarOrcamento(real.id, { modo: "integral", formas: ["pix"] });
    await s.financeiro.sincronizarOrcamento(t1.id, { modo: "integral", formas: ["pix"] });
    const { vendas, despesas } = await s.financeiro.listar();
    expect(vendas.find((v) => v.orcamentoId === t1.id).teste).toBe(true);
    const r = fin.resumoFinanceiro(vendas, despesas, fin.periodoDe("tudo"));
    expect(r.vendas).toBe(5000n);
    expect(r.recebido).toBe(5000n);
    expect(fin.orcamentosSemVenda(await s.orcamentos.listar(), vendas).some((o) => o.teste)).toBe(false);

    const apagados = await s.teste.limpar();
    expect(apagados).toEqual({ orcamentos: 2, vendas: 1 });
    expect((await s.orcamentos.listar()).map((o) => o.numero).sort()).toEqual([40, 41, 42]);
    expect((await s.financeiro.listar()).vendas).toHaveLength(1);
    expect(await s.clientes.listar()).toHaveLength(1); // o Cliente Teste continua
  });

  it("PDF de teste tem a marca TESTE e o nome do arquivo avisa", () => {
    const o = {
      numero: 3,
      teste: true,
      criadoEm: "2026-11-11T12:00:00.000Z",
      validadeDias: 7,
      cliente: { nome: "Cliente Teste", telefone: "", email: "", documento: "", cidade: "" },
      itens: [{ descricao: "Peça", quantidade: 1, precoUnitarioCentavos: "100" }],
      descontoCentavos: "0",
      freteCentavos: "0",
    };
    expect(pdf.corpoOrcamento(o)).toContain('class="marca-teste">TESTE<');
    expect(pdf.corpoOrcamento(o)).toContain("T-0003");
    expect(pdf.corpoOrcamento({ ...o, teste: undefined })).not.toContain("marca-teste");
    expect(pdf.nomeArquivoPdf(o, { hoje: new Date(2026, 10, 11) })).toBe("TESTE - Orçamento - Cliente Teste - 11-11-2026.pdf");
  });
});
