import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import backupCore from "../src/core/backup.cjs";
import backupMod from "../src/main/backup.cjs";
import clientesMod from "../src/main/clientes.cjs";
import orcamentosMod from "../src/main/orcamentos.cjs";
import configMod from "../src/main/configuracoes.cjs";
import finMod from "../src/main/financeiro.cjs";

let pasta;
beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), "financeiro-"));
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

function servicos() {
  const configuracoes = configMod.criarServicoConfiguracoes(pasta);
  const clientes = clientesMod.criarServicoClientes(pasta);
  const orcamentos = orcamentosMod.criarServicoOrcamentos(pasta, { clientes, configuracoes });
  const financeiro = finMod.criarServicoFinanceiro(pasta, { orcamentos });
  const backup = backupMod.criarServicoBackup(pasta, {
    colecoes: { clientes, orcamentos, vendas: financeiro.vendas, despesas: financeiro.despesas },
    configuracoes,
    versaoApp: "0.43.0",
  });
  return { configuracoes, clientes, orcamentos, financeiro, backup };
}

const item = { descricao: "Vaso", quantidade: "1", preco: "100", custoUnitarioCentavos: "4000" };

describe("serviço financeiro", () => {
  it("finalizar com sinal, salvar de novo e completar o pagamento sem duplicar", async () => {
    const s = servicos();
    const o = await s.orcamentos.salvar({ cliente: { nome: "Marcos", telefone: "(34) 99999-0000" }, itens: [item], situacao: "finalizado" });
    expect(o.cliente).toMatchObject({ nome: "Marcos", telefone: "34999990000" });
    const v = await s.financeiro.sincronizarOrcamento(o.id, { modo: "parcial", valor: "30", formas: ["pix"] });
    expect(v.pagamentos.map((p) => p.valorCentavos)).toEqual(["3000"]);
    // salvar de novo ("manter") reaproveita a venda
    const v2 = await s.financeiro.sincronizarOrcamento(o.id, { modo: "manter" });
    expect(v2.id).toBe(v.id);
    expect(v2.pagamentos).toHaveLength(1);
    // reabrir e dizer que pagou o integral: registra só os R$ 70 que faltam
    const v3 = await s.financeiro.sincronizarOrcamento(o.id, { modo: "integral", formas: ["dinheiro"] });
    expect(v3.pagamentos.map((p) => p.valorCentavos)).toEqual(["3000", "7000"]);
    expect((await s.financeiro.listar()).vendas).toHaveLength(1);
    await expect(s.financeiro.registrarPagamento(v3.id, { valor: "1" })).rejects.toThrow(/quitada/);
    await expect(s.financeiro.excluirVenda(v3.id)).rejects.toThrow(/recebimentos/);
  });

  it("orçamento só salvo (sem finalizar) não cria venda; numeração começa no número configurado", async () => {
    const s = servicos();
    await s.configuracoes.salvar({ orcamento: { proximoNumero: "40592" } });
    const o = await s.orcamentos.salvar({ itens: [item] });
    expect(o.numero).toBe(40592);
    expect(await s.financeiro.sincronizarOrcamento(o.id, { modo: "manter" })).toBeNull();
    expect((await s.financeiro.listar()).vendas).toEqual([]);
  });

  it("vincula orçamento antigo a uma venda manual de mesmo valor", async () => {
    const s = servicos();
    const o = await s.orcamentos.salvar({ cliente: { nome: "Ana" }, itens: [item], situacao: "enviado" });
    const manual = await s.financeiro.salvarVenda({ descricao: "Vaso da Ana", valor: "100", data: "2026-11-01" });
    await s.financeiro.registrarPagamento(manual.id, { valor: "20", data: "2026-11-01" });
    const ligada = await s.financeiro.vincularOrcamento(o.id, manual.id);
    expect(ligada).toMatchObject({ id: manual.id, orcamentoId: o.id, custoCentavos: "4000", data: "2026-11-01" });
    expect(ligada.pagamentos).toHaveLength(1);
    const outra = await s.financeiro.salvarVenda({ descricao: "x", valor: "99", data: "2026-11-01" });
    const o2 = await s.orcamentos.salvar({ itens: [item], situacao: "enviado" });
    await expect(s.financeiro.vincularOrcamento(o2.id, outra.id)).rejects.toThrow(/valores diferentes/);
    const cancelado = await s.orcamentos.definirSituacao(o2.id, "recusado");
    expect(cancelado.situacao).toBe("recusado");
  });

  it("restaurar backup antigo (sem vendas) não apaga as vendas atuais", async () => {
    const s = servicos();
    await s.financeiro.salvarVenda({ descricao: "Venda", valor: "10", data: "2026-11-01" });
    const antigo = JSON.stringify({ tipo: backupCore.TIPO, versao: 1, dados: { clientes: [], orcamentos: [], configuracoes: {} } });
    const lido = backupCore.lerBackup(antigo);
    expect(lido.ausentes).toEqual(expect.arrayContaining(["vendas", "despesas"]));
    await s.backup.restaurar(lido);
    expect((await s.financeiro.listar()).vendas).toHaveLength(1);
    // backup novo leva vendas e despesas
    await s.financeiro.salvarDespesa({ descricao: "Filamento", valor: "80", data: "2026-11-02" });
    const novo = backupCore.lerBackup(await s.backup.gerarTexto());
    expect(novo.resumo).toMatchObject({ vendas: 1, despesas: 1 });
  });
});
