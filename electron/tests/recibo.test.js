import { describe, expect, it } from "vitest";
import rec from "../src/core/recibo.cjs";

const { corpoRecibo, linhasDaVenda, mensagemRecibo, nomeArquivoRecibo, numeroRecibo, proximoNumero, validarRecibos, valorPorExtenso } = rec;

const P1 = "11111111-2222-3333-4444-555555555555";
const P2 = "22222222-2222-3333-4444-555555555555";

describe("valor por extenso", () => {
  it("reais e centavos", () => {
    expect(valorPorExtenso(33000n)).toBe("trezentos e trinta reais");
    expect(valorPorExtenso(10000n)).toBe("cem reais");
    expect(valorPorExtenso(150n)).toBe("um real e cinquenta centavos");
    expect(valorPorExtenso(1n)).toBe("um centavo");
    expect(valorPorExtenso(23000n)).toBe("duzentos e trinta reais");
    expect(valorPorExtenso(100000n)).toBe("mil reais");
    expect(valorPorExtenso(110000n)).toBe("mil e cem reais");
    expect(valorPorExtenso(125099n)).toBe("mil, duzentos e cinquenta reais e noventa e nove centavos");
    expect(valorPorExtenso(200000000n)).toBe("dois milhões de reais");
    expect(valorPorExtenso(1611500n)).toBe("dezesseis mil, cento e quinze reais");
  });
});

describe("pagamentos e recibos da venda", () => {
  const venda = {
    id: "v",
    descricao: "Copos",
    valorCentavos: "33000",
    pagamentos: [
      { id: P2, data: "2026-11-26", valorCentavos: "23000", formas: ["credito"] },
      { id: P1, data: "2026-11-19", valorCentavos: "10000", formas: ["pix"] },
    ],
    recibos: [{ numero: 7, pagamentoId: P1, tipo: "sinal", data: "2026-11-19", valorCentavos: "10000" }],
  };

  it("sinal e saldo em ordem de data, com o recibo já gerado", () => {
    const l = linhasDaVenda(venda);
    expect(l.map((x) => x.tipo)).toEqual(["sinal", "saldo"]);
    expect(l[0].recibo.numero).toBe(7);
    expect(l[0].restaCentavos).toBe(23000n);
    expect(l[1].restaCentavos).toBe(0n);
    expect(l[1].anteriores).toHaveLength(1);
  });

  it("pagamento único que quita tudo; recibo de pagamento apagado vira cancelado", () => {
    const unico = linhasDaVenda({ ...venda, pagamentos: [{ id: P1, data: "2026-11-19", valorCentavos: "33000", formas: ["pix"] }], recibos: [{ numero: 3, pagamentoId: P2, tipo: "sinal", data: "2026-11-01", valorCentavos: "1" }] });
    expect(unico[0].tipo).toBe("pagamento");
    expect(unico[1]).toMatchObject({ cancelado: true });
  });

  it("numeração não repete", () => {
    expect(proximoNumero([venda], 0)).toBe(8);
    expect(proximoNumero([venda], 12)).toBe(13);
    expect(numeroRecibo(7)).toBe("R-0007");
  });

  it("valida o registro", () => {
    expect(() => validarRecibos([{ numero: 0 }])).toThrow(/Recibos/);
    expect(() => validarRecibos(venda.recibos)).not.toThrow();
  });

  it("PDF do sinal e do saldo", () => {
    const orcamento = { numero: 12, cliente: { nome: "Maria da Silva", documento: "" }, itens: [{ descricao: "Copo <b>", quantidade: 10, precoUnitarioCentavos: "3300" }] };
    const empresa = { nome: "Pedro 3D", cidade: "São Paulo", assinatura: "data:image/png;base64,AAAA", assinaturaNome: "Pedro Henrique" };
    const [sinal, saldo] = linhasDaVenda(venda);
    const h1 = corpoRecibo({ venda, orcamento, empresa, linha: sinal, numero: 7, assinar: true });
    expect(h1).toContain("como <b>sinal</b> do orçamento nº 0012");
    expect(h1).toContain("CPF não informado");
    expect(h1).toContain("(cem reais)");
    expect(h1).toContain("Sinal — restam R$ 230,00");
    expect(h1).toContain('<img src="data:image/png;base64,AAAA"');
    expect(h1).toContain("Copo &lt;b&gt;");
    expect(h1).toContain("São Paulo, 19 de novembro de 2026");
    const h2 = corpoRecibo({ venda, orcamento, empresa, linha: saldo, numero: 8, assinar: false });
    expect(h2).toContain("dando plena quitação do orçamento");
    expect(h2).toContain("Sinal (19/11/2026, recibo R-0007)");
    expect(h2).toContain("Quitado");
    expect(h2).not.toContain("<img");
  });

  it("nome do arquivo e mensagem", () => {
    expect(nomeArquivoRecibo({ numero: 7, cliente: "Maria da Silva", orcamentoNumero: 12, tipo: "sinal" })).toBe("Recibo R-0007 - Maria da Silva - Orçamento 0012 - Sinal.pdf");
    expect(mensagemRecibo({ cliente: "Maria da Silva", numero: 7, orcamentoNumero: 12 })).toBe("Olá, Maria! Segue o recibo nº R-0007 do orçamento nº 0012.");
  });
});
