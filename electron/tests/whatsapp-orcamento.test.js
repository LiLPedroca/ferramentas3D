import { describe, expect, it } from "vitest";
import wpp from "../src/core/whatsapp-orcamento.cjs";
import cfg from "../src/core/configuracoes.cjs";

const { MENSAGEM_PADRAO, linkAppWhatsapp, linkWebWhatsapp, montarMensagem, numeroWhatsapp, valoresDaMensagem } = wpp;

describe("número do WhatsApp", () => {
  it("tira o que não é número e põe 55 quando falta", () => {
    expect(numeroWhatsapp("(11) 98765-4321")).toBe("5511987654321");
    expect(numeroWhatsapp("11 3456-7890")).toBe("551134567890");
    expect(numeroWhatsapp("+55 (21) 99999-0000")).toBe("5521999990000");
  });
  it("sem telefone ou número curto: null", () => {
    expect(numeroWhatsapp("")).toBeNull();
    expect(numeroWhatsapp("12345")).toBeNull();
    expect(numeroWhatsapp(undefined)).toBeNull();
  });
});

describe("mensagem", () => {
  const valores = { cliente: "Maria", numero: "0012", total: "R$ 330,00", validade: "26/11/2026" };
  it("troca os campos; vazia usa a padrão", () => {
    expect(montarMensagem("", valores)).toBe("Olá, Maria! Seu orçamento nº 0012 está pronto. Total: R$ 330,00. Segue o PDF.");
    expect(montarMensagem("Oi {cliente}, vale até {validade}. {outro}", valores)).toBe("Oi Maria, vale até 26/11/2026. {outro}");
    expect(MENSAGEM_PADRAO).toContain("{cliente}");
  });
  it("valores do orçamento: primeiro nome, número com 4 dígitos, total e validade", () => {
    const o = {
      numero: 12,
      cliente: { nome: "Maria da Silva" },
      itens: [{ descricao: "Copo", quantidade: 10, precoUnitarioCentavos: "3300" }],
      validadeDias: 7,
      criadoEm: "2026-11-19T15:00:00.000Z",
      descontoCentavos: "0",
      freteCentavos: "0",
    };
    const v = valoresDaMensagem(o);
    expect(v).toMatchObject({ cliente: "Maria", numero: "0012" });
    expect(v.validade).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
  it("links: direto no aplicativo e, de reserva, pelo navegador", () => {
    expect(linkAppWhatsapp("5511987654321", "Olá & tchau")).toBe("whatsapp://send?phone=5511987654321&text=Ol%C3%A1%20%26%20tchau");
    expect(linkWebWhatsapp("5511987654321", "a b")).toBe("https://wa.me/5511987654321?text=a%20b");
  });
  it("configuração guarda a mensagem (vazia = padrão)", () => {
    const c = cfg.aplicarAlteracao({}, { orcamento: { mensagemWhatsapp: "  Oi {cliente}  " } });
    expect(c.orcamento.mensagemWhatsapp).toBe("Oi {cliente}");
    expect(cfg.normalizarGravado({}).orcamento.mensagemWhatsapp).toBe("");
  });
});

describe("campo {pix}", () => {
  it("mostra a chave formatada; sem Pix fica vazio", () => {
    const o = { numero: 1, cliente: { nome: "Ana" }, itens: [], validadeDias: 7, criadoEm: "2026-11-19T15:00:00.000Z" };
    expect(valoresDaMensagem(o, { tipo: "cpf", chave: "12345678909" }).pix).toBe("123.456.789-09");
    expect(valoresDaMensagem(o).pix).toBe("");
    expect(montarMensagem("Pix: {pix}", { pix: "a@b.com" })).toBe("Pix: a@b.com");
  });
});
