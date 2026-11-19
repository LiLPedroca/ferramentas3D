import { describe, expect, it } from "vitest";
import pixMod from "../src/core/pix.cjs";

const { chaveParaMostrar, chavePix, codigoPix, crc16, mostrarPixNoOrcamento } = pixMod;

describe("código Pix (BR Code)", () => {
  it("bate com o exemplo do manual do Banco Central", () => {
    const codigo = codigoPix({ chave: "123e4567-e12b-12d1-a456-426655440000", nome: "Fulano de Tal", cidade: "BRASILIA" });
    expect(codigo).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
  });

  it("leva o valor, tira acentos e corta nome (25) e cidade (15)", () => {
    const c = codigoPix({ chave: "+5511987654321", nome: "Impressões 3D do Pedro Henrique Ltda", cidade: "São José dos Campos" }, 33000n);
    expect(c).toContain("5406330.00");
    expect(c).toContain("5925Impressoes 3D do Pedro He");
    expect(c).toContain("6015Sao Jose dos Ca");
    expect(c.slice(-4)).toBe(crc16(c.slice(0, -4)));
  });

  it("sem nome ou cidade não gera", () => {
    expect(codigoPix({ chave: "x", nome: "", cidade: "SP" })).toBe("");
  });
});

describe("chave Pix", () => {
  it("formata cada tipo do jeito do Pix", () => {
    expect(chavePix("cpf", "123.456.789-09")).toBe("12345678909");
    expect(chavePix("cnpj", "12.345.678/0001-95")).toBe("12345678000195");
    expect(chavePix("celular", "(11) 98765-4321")).toBe("+5511987654321");
    expect(chavePix("email", " Loja@Exemplo.com ")).toBe("loja@exemplo.com");
    expect(chavePix("aleatoria", "123E4567-E12B-12D1-A456-426655440000")).toBe("123e4567-e12b-12d1-a456-426655440000");
  });
  it("recusa chave errada com mensagem clara", () => {
    expect(() => chavePix("cpf", "123")).toThrow(/CPF/);
    expect(() => chavePix("email", "sem-arroba")).toThrow(/e-mail/);
    expect(() => chavePix("", "x")).toThrow(/tipo/);
  });
  it("mostra formatado", () => {
    expect(chaveParaMostrar("cpf", "12345678909")).toBe("123.456.789-09");
    expect(chaveParaMostrar("celular", "+5511987654321")).toBe("(11) 98765-4321");
  });
});

describe("quando aparece no orçamento", () => {
  const pix = { chave: "12345678909", nome: "Pedro", cidade: "Sao Paulo", sempre: false };
  it("sempre, se marcado; senão só com pagamento Pix", () => {
    expect(mostrarPixNoOrcamento({ ...pix, sempre: true }, { formasPagamento: [] })).toBe(true);
    expect(mostrarPixNoOrcamento(pix, { formasPagamento: ["credito"] })).toBe(false);
    expect(mostrarPixNoOrcamento(pix, { formasPagamento: ["pix"] })).toBe(true);
    expect(mostrarPixNoOrcamento({ ...pix, chave: "" }, { formasPagamento: ["pix"] })).toBe(false);
  });
});

describe("Pix nas Configurações e no PDF", async () => {
  const cfg = (await import("../src/core/configuracoes.cjs")).default;
  const pdf = (await import("../src/core/orcamento-pdf.cjs")).default;
  it("guarda a chave no formato do Pix e exige nome e cidade", () => {
    const c = cfg.aplicarAlteracao({}, { empresaParcial: { pix: { tipo: "celular", chave: "(11) 98765-4321", nome: "Pedro", cidade: "São Paulo", sempre: true } } });
    expect(c.empresa.pix).toEqual({ tipo: "celular", chave: "+5511987654321", nome: "Pedro", cidade: "São Paulo", sempre: true });
    expect(() => cfg.aplicarAlteracao({}, { empresaParcial: { pix: { tipo: "cpf", chave: "12345678909", nome: "", cidade: "" } } })).toThrow(/nome e a cidade/);
    expect(cfg.normalizarGravado({}).empresa.pix.chave).toBe("");
  });
  it("PDF leva o bloco Pix com QR só quando deve", () => {
    const o = { numero: 3, cliente: { nome: "Ana" }, itens: [{ descricao: "Copo", quantidade: 2, precoUnitarioCentavos: "1500" }], validadeDias: 7, criadoEm: "2026-11-19T15:00:00.000Z", formasPagamento: ["pix"], descontoCentavos: "0", freteCentavos: "0" };
    const empresa = { pix: { tipo: "cpf", chave: "12345678909", nome: "Pedro", cidade: "Sao Paulo", sempre: false } };
    const html = pdf.corpoOrcamento(o, empresa);
    expect(html).toContain("Pagamento via Pix");
    expect(html).toContain("<svg");
    expect(html).toContain("540530.00");
    expect(pdf.corpoOrcamento({ ...o, formasPagamento: ["credito"] }, empresa)).not.toContain("Pagamento via Pix");
  });
});
