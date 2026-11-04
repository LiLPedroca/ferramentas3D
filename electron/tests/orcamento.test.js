import { describe, expect, it } from "vitest";
import modelo from "../src/core/orcamento.cjs";
import pdf from "../src/core/orcamento-pdf.cjs";

const { calcularTotais, dataValidade, montarOrcamento } = modelo;
const { escapar, gerarHtmlOrcamento, nomeArquivoPdf, reais } = pdf;

const ID = "11111111-2222-3333-4444-555555555555";
const PRODUTO = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const AGORA = "2026-11-04T15:00:00.000Z";

const base = {
  cliente: { nome: "Maria", telefone: "11987654321", email: "", documento: "", cidade: "São Paulo" },
  itens: [
    { descricao: "Chaveiro", quantidade: "10", preco: "12,00", produtoId: PRODUTO, custoUnitarioCentavos: "380" },
    { descricao: "Vaso", quantidade: "1", preco: "89,90", custoUnitarioCentavos: "3120" },
  ],
  desconto: "9,90",
  frete: "15",
};

describe("montarOrcamento", () => {
  it("numera em sequência e mantém o número ao editar", () => {
    const o1 = montarOrcamento(base, { id: ID, agora: AGORA });
    expect(o1.numero).toBe(1);
    const o2 = montarOrcamento(base, { id: ID, existentes: [{ numero: 1 }, { numero: 7 }], agora: AGORA });
    expect(o2.numero).toBe(8);
    const editado = montarOrcamento({ ...base, situacao: "enviado" }, { id: ID, anterior: o1, existentes: [{ numero: 9 }] });
    expect(editado.numero).toBe(1);
    expect(editado.situacao).toBe("enviado");
    expect(editado.criadoEm).toBe(o1.criadoEm);
  });

  it("valores padrão", () => {
    const o = montarOrcamento({ itens: base.itens }, { id: ID, agora: AGORA });
    expect(o).toMatchObject({ cliente: null, descontoCentavos: "0", freteCentavos: "0", validadeDias: 7, situacao: "rascunho" });
  });

  it("exige itens válidos", () => {
    expect(() => montarOrcamento({ itens: [] }, { id: ID })).toThrow(/pelo menos um item/);
    expect(() => montarOrcamento({ itens: [{ descricao: "", quantidade: "1", preco: "1" }] }, { id: ID })).toThrow(/Descrição do item 1/);
    expect(() => montarOrcamento({ itens: [{ descricao: "X", quantidade: "0", preco: "1" }] }, { id: ID })).toThrow(/Quantidade do item 1/);
    expect(() => montarOrcamento({ itens: [{ descricao: "X", quantidade: "1", preco: "" }] }, { id: ID })).toThrow(/Preço do item 1/);
  });

  it("não deixa o desconto passar do subtotal + frete", () => {
    expect(() =>
      montarOrcamento({ itens: [{ descricao: "X", quantidade: "1", preco: "10" }], desconto: "20", frete: "5" }, { id: ID }),
    ).toThrow(/desconto/);
  });
});

describe("totais", () => {
  it("soma itens, aplica desconto e frete, e calcula lucro com custos", () => {
    const o = montarOrcamento(base, { id: ID, agora: AGORA });
    const t = calcularTotais(o);
    expect(t.subtotal).toBe(20990n); // 10 × 12,00 + 89,90
    expect(t.desconto).toBe(990n);
    expect(t.frete).toBe(1500n);
    expect(t.total).toBe(21500n);
    expect(t.custo).toBe(6920n); // 10 × 3,80 + 31,20
    expect(t.lucro).toBe(13080n); // 209,90 − 9,90 − 69,20
  });

  it("sem custo em algum item, o lucro fica desconhecido", () => {
    const o = montarOrcamento({ itens: [{ descricao: "X", quantidade: "2", preco: "5" }] }, { id: ID });
    expect(calcularTotais(o).lucro).toBeNull();
  });

  it("validade soma os dias", () => {
    const o = montarOrcamento({ ...base, validadeDias: "10" }, { id: ID, agora: AGORA });
    expect(dataValidade(o).slice(0, 10)).toBe("2026-11-14");
  });
});

describe("PDF", () => {
  it("formata reais e escapa HTML", () => {
    expect(reais(123456n)).toBe("R$ 1.234,56");
    expect(reais(5n)).toBe("R$ 0,05");
    expect(escapar('<script>"x"</script>')).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
  });

  it("monta o HTML com número, cliente, itens e totais, sem injetar HTML do usuário", () => {
    const o = montarOrcamento({ ...base, observacoes: "Linha 1\n<b>Linha 2</b>" }, { id: ID, agora: AGORA });
    const html = gerarHtmlOrcamento(o, { nome: "Estúdio 3D", telefone: "11912345678" });
    expect(html).toContain("Nº 0001");
    expect(html).toContain("Estúdio 3D");
    expect(html).toContain("(11) 91234-5678");
    expect(html).toContain("Maria");
    expect(html).toContain("R$ 215,00");
    expect(html).toContain("Linha 1<br>&lt;b&gt;Linha 2&lt;/b&gt;");
    expect(html).not.toContain("<b>Linha 2</b>");
  });

  it("nome do arquivo sem acentos nem símbolos", () => {
    const o = montarOrcamento({ ...base, cliente: { ...base.cliente, nome: "José & Cia. Ltda" } }, { id: ID, agora: AGORA });
    expect(nomeArquivoPdf(o)).toBe("Orcamento-0001-Jose-Cia-Ltda.pdf");
  });
});
