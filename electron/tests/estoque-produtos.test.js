import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import produtoMod from "../src/core/produto.cjs";
import estoqueMod from "../src/core/estoque-produtos.cjs";
import produtosServico from "../src/main/produtos.cjs";
import estoqueServico from "../src/main/estoque-produtos.cjs";
import { Colecao } from "../src/main/armazenamento.cjs";

const { montarProduto, validarProduto } = produtoMod;
const { acabando, conciliar, disponiveis, faltasParaVenda, reservadas } = estoqueMod;

const PID = "11111111-2222-3333-4444-555555555555";
const OID = "aaaaaaaa-2222-3333-4444-555555555555";
const VID = "bbbbbbbb-2222-3333-4444-555555555555";
const T0 = "2026-11-18T10:00:00.000Z";
const T1 = "2026-11-18T11:00:00.000Z";
const T2 = "2026-11-18T12:00:00.000Z";

const produto = (extra = {}, anterior) => montarProduto({ nome: "Chaveiro", preco: "10", ...extra }, { id: PID, anterior, agora: T0 });
const orcamento = (quantidade = 3, situacao = "finalizado") => ({
  id: OID,
  numero: 12,
  situacao,
  cliente: { nome: "João" },
  itens: [{ descricao: "Chaveiro", quantidade, precoUnitarioCentavos: "1000", produtoId: PID }],
});
const venda = (producao = "em-producao") => ({ id: VID, orcamentoId: OID, orcamentoNumero: 12, producao, criadoEm: T1 });

describe("material e campos de estoque", () => {
  it("guarda o material escolhido e recusa fora da lista", () => {
    expect(produto({ material: "PETG" }).material).toBe("PETG");
    expect(produto().material).toBe("");
    expect(() => produto({ material: "Madeira" })).toThrow(/material/i);
  });

  it("produto antigo, sem material nem estoque, continua válido", () => {
    const p = produto();
    delete p.material;
    expect(() => validarProduto(p)).not.toThrow();
  });

  it("estoque vazio = sem controle; com número liga e registra o começo", () => {
    expect(produto().estoque).toBeUndefined();
    const p = produto({ estoque: "10", estoqueMinimo: "2" });
    expect(p.estoque).toBe(10);
    expect(p.estoqueMinimo).toBe(2);
    expect(p.historico).toHaveLength(1);
    expect(p.historico[0].texto).toBe("Começou com 10 peças");
    expect(() => produto({ estoque: "1,5" })).toThrow(/inteiro/);
  });

  it("ajuste à mão vira linha no histórico; campo intocado não desfaz saídas", () => {
    const p = { ...produto({ estoque: "10" }), estoque: 7 }; // 3 saíram enquanto o editor estava aberto
    const igual = montarProduto({ nome: "Chaveiro", preco: "10", estoque: "10", estoqueVisto: "10" }, { id: PID, anterior: p, agora: T1 });
    expect(igual.estoque).toBe(7);
    expect(igual.historico).toHaveLength(1);
    const ajustado = montarProduto({ nome: "Chaveiro", preco: "10", estoque: "12", estoqueVisto: "10" }, { id: PID, anterior: p, agora: T1 });
    expect(ajustado.estoque).toBe(12);
    expect(ajustado.historico.at(-1).texto).toBe("Ajustado à mão: de 7 para 12");
  });

  it("desligar o controle mantém o histórico", () => {
    const p = produto({ estoque: "5" });
    const d = montarProduto({ nome: "Chaveiro", preco: "10", estoque: "", estoqueVisto: "5" }, { id: PID, anterior: p, agora: T1 });
    expect(d.estoque).toBeUndefined();
    expect(d.historico.map((h) => h.tipo)).toEqual(["inicio", "desligado"]);
  });
});

describe("reserva, saída e volta", () => {
  it("venda reserva, entregue tira do estoque, cancelado devolve", () => {
    let p = produto({ estoque: "10", estoqueMinimo: "7" });
    let r = conciliar([p], [venda()], [orcamento(3)], T1);
    p = r.produtos[0];
    expect(p.estoque).toBe(10);
    expect(reservadas(p)).toBe(3);
    expect(disponiveis(p)).toBe(7);
    expect(acabando(p)).toBe(true);
    expect(r.acabaram).toEqual(["Chaveiro"]);
    expect(p.historico.at(-1).texto).toBe("Reservou 3 peças · Orçamento #0012 · João");

    r = conciliar([p], [venda("entregue")], [orcamento(3)], T2);
    p = r.produtos[0];
    expect(p.estoque).toBe(7);
    expect(reservadas(p)).toBe(0);
    expect(p.historico.at(-1).texto).toBe("Saiu 3 peças · entregue · Orçamento #0012 · João");
    expect(p.historico).toHaveLength(3); // sem linha extra de "reserva liberada"

    r = conciliar([p], [venda("entregue")], [orcamento(3, "recusado")], T2);
    p = r.produtos[0];
    expect(p.estoque).toBe(10);
    expect(p.vinculos).toBeUndefined();
    expect(p.historico.at(-1).texto).toMatch(/^Voltou 3 peças · cancelado/);
  });

  it("nada muda: devolve o mesmo produto", () => {
    const p = conciliar([produto({ estoque: "10" })], [venda()], [orcamento()], T1).produtos[0];
    const r = conciliar([p], [venda()], [orcamento()], T2);
    expect(r.mudou).toBe(false);
    expect(r.produtos[0]).toBe(p);
  });

  it("venda excluída libera a reserva; orçamento excluído não mexe", () => {
    const p = conciliar([produto({ estoque: "10" })], [venda()], [orcamento()], T1).produtos[0];
    expect(conciliar([p], [venda()], [], T2).mudou).toBe(false);
    const liberado = conciliar([p], [], [orcamento()], T2).produtos[0];
    expect(reservadas(liberado)).toBe(0);
    expect(liberado.historico.at(-1).texto).toMatch(/^Reserva liberada: 3 peças · venda excluída/);
  });

  it("orçamento editado muda a reserva pela diferença", () => {
    const p = conciliar([produto({ estoque: "10" })], [venda()], [orcamento(3)], T1).produtos[0];
    const q = conciliar([p], [venda()], [orcamento(5)], T2).produtos[0];
    expect(reservadas(q)).toBe(5);
    expect(q.historico.at(-1).texto).toMatch(/^Reservou 2 peças/);
  });

  it("vendas de antes de ligar o controle não contam; produto sem controle fica igual", () => {
    const antiga = { ...venda(), criadoEm: "2026-11-01T00:00:00.000Z" };
    expect(conciliar([produto({ estoque: "10" })], [antiga], [orcamento()], T1).mudou).toBe(false);
    expect(conciliar([produto()], [venda()], [orcamento()], T1).mudou).toBe(false);
  });

  it("entregar mais do que tem deixa o estoque negativo (falta imprimir)", () => {
    const p = conciliar([produto({ estoque: "2" })], [venda("entregue")], [orcamento(5)], T1).produtos[0];
    expect(p.estoque).toBe(-3);
    expect(() => validarProduto(p)).not.toThrow();
  });
});

describe("aviso de falta ao fechar a venda", () => {
  it("conta só as disponíveis e ignora o que esta venda já reservou", () => {
    const p = produto({ estoque: "4" });
    expect(faltasParaVenda(orcamento(6), [p], null)).toEqual([{ nome: "Chaveiro", faltam: 2 }]);
    expect(faltasParaVenda(orcamento(3), [p], null)).toEqual([]);
    const reservado = conciliar([p], [venda()], [orcamento(3)], T1).produtos[0];
    expect(faltasParaVenda(orcamento(3), [reservado], VID)).toEqual([]);
    expect(faltasParaVenda(orcamento(3), [reservado], null)).toEqual([{ nome: "Chaveiro", faltam: 2 }]);
    expect(faltasParaVenda(orcamento(3), [produto()], null)).toEqual([]);
  });
});

describe("serviço: concilia depois de cada mudança", () => {
  let pasta;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "estoque produtos ção "));
  });
  afterEach(() => rm(pasta, { recursive: true, force: true }));

  it("grava a reserva no arquivo de produtos", async () => {
    const produtos = produtosServico.criarServicoProdutos(pasta);
    const p = await produtos.salvar({ nome: "Chaveiro", preco: "10", estoque: "3", estoqueMinimo: "1" });
    const vendas = { colecao: new Colecao(pasta, "vendas") };
    const orcamentos = { colecao: new Colecao(pasta, "orcamentos") };
    const o = { ...orcamento(2), itens: [{ ...orcamento(2).itens[0], produtoId: p.id }] };
    await orcamentos.colecao.alterar(async () => ({ itens: [o], resultado: null }));
    await vendas.colecao.alterar(async () => ({ itens: [{ ...venda(), criadoEm: new Date().toISOString() }], resultado: null }));
    const estoque = estoqueServico.criarEstoqueProdutos({ produtos, orcamentos, vendas });
    const resultado = await estoque.depois(Promise.resolve({ ok: 1 }));
    expect(resultado).toEqual({ ok: 1, estoqueAcabando: ["Chaveiro"] });
    const [gravado] = await produtos.listar();
    expect(reservadas(gravado)).toBe(2);
    expect(disponiveis(gravado)).toBe(1);
  });
});
