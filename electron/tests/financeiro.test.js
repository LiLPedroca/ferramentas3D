import { describe, expect, it } from "vitest";
import fin from "../src/core/financeiro.cjs";
import orc from "../src/core/orcamento.cjs";

const {
  montarDespesa,
  montarVendaManual,
  orcamentosSemVenda,
  periodoDe,
  recebido,
  registrarPagamento,
  restante,
  resumoFinanceiro,
  situacaoVenda,
  sincronizarVendaDoOrcamento,
  lucroVenda,
} = fin;
const { montarOrcamento, valorSinal, sinalParaTexto } = orc;

const ID = (n) => `id-teste-${String(n).padStart(4, "0")}`;
const agora = "2026-11-11T12:00:00.000Z";
const hoje = "2026-11-11";

function orcamento(itens, extra = {}) {
  return montarOrcamento(
    { cliente: { nome: "Marcos" }, itens, validadeDias: "7", situacao: "finalizado", ...extra },
    { id: ID(1), existentes: [], agora },
  );
}

describe("vendas ligadas a orçamentos", () => {
  it("orçamento de R$ 100 com sinal de R$ 30 recebido", () => {
    const o = orcamento([{ descricao: "Vaso", quantidade: "1", preco: "100", custoUnitarioCentavos: "4000" }]);
    const v = sincronizarVendaDoOrcamento(o, null, { recebidoTotalCentavos: "3000", formas: ["pix"], idPagamento: ID(2), idVenda: ID(3), agora, hoje });
    expect(v.valorCentavos).toBe("10000");
    expect(recebido(v)).toBe(3000n);
    expect(restante(v)).toBe(7000n);
    expect(situacaoVenda(v)).toBe("parcial");
    expect(lucroVenda(v)).toBe(6000n); // lucro pelo valor total, mesmo antes de quitar
    expect(v.orcamentoId).toBe(o.id);
  });

  it("nada recebido fica pendente; integral fica quitado", () => {
    const o = orcamento([{ descricao: "Vaso", quantidade: "2", preco: "50" }]);
    const pend = sincronizarVendaDoOrcamento(o, null, { recebidoTotalCentavos: "0", idVenda: ID(3), agora, hoje });
    expect(situacaoVenda(pend)).toBe("pendente");
    expect(pend.pagamentos).toEqual([]);
    expect(pend.custoCentavos).toBeNull();
    const quit = sincronizarVendaDoOrcamento(o, pend, { recebidoTotalCentavos: "10000", formas: ["dinheiro"], idPagamento: ID(4), agora, hoje });
    expect(situacaoVenda(quit)).toBe("quitado");
    expect(quit.id).toBe(pend.id);
  });

  it("salvar de novo reaproveita a venda e só registra a diferença", () => {
    const o = orcamento([{ descricao: "Vaso", quantidade: "1", preco: "100" }]);
    const v1 = sincronizarVendaDoOrcamento(o, null, { recebidoTotalCentavos: "3000", formas: ["pix"], idPagamento: ID(2), idVenda: ID(3), agora, hoje });
    const igual = sincronizarVendaDoOrcamento(o, v1, { recebidoTotalCentavos: "3000", idPagamento: ID(5), agora, hoje });
    expect(igual.pagamentos).toHaveLength(1);
    const mais = sincronizarVendaDoOrcamento(o, v1, { recebidoTotalCentavos: "5000", formas: ["credito"], idPagamento: ID(6), agora, hoje });
    expect(mais.pagamentos.map((p) => p.valorCentavos)).toEqual(["3000", "2000"]);
    // sem informar recebimento (só salvou): pagamentos preservados
    expect(sincronizarVendaDoOrcamento(o, mais, { agora, hoje }).pagamentos).toHaveLength(2);
  });

  it("não deixa o total do orçamento ficar abaixo do já recebido", () => {
    const o = orcamento([{ descricao: "Vaso", quantidade: "1", preco: "100" }]);
    const v = sincronizarVendaDoOrcamento(o, null, { recebidoTotalCentavos: "8000", idPagamento: ID(2), idVenda: ID(3), agora, hoje });
    const menor = orcamento([{ descricao: "Vaso", quantidade: "1", preco: "50" }]);
    expect(() => sincronizarVendaDoOrcamento(menor, v, { agora, hoje })).toThrow(/já recebido/);
    expect(() => sincronizarVendaDoOrcamento(o, null, { recebidoTotalCentavos: "20000", idVenda: ID(3), agora, hoje })).toThrow(/passar do total/);
  });
});

describe("pagamentos", () => {
  const base = () => montarVendaManual({ descricao: "Chaveiros", valor: "100", data: hoje }, { id: ID(7), agora });

  it("impede receber acima do saldo e depois de quitado", () => {
    const v = registrarPagamento(base(), { valor: "60", formas: ["pix", "dinheiro"] }, { id: ID(8), agora, hoje });
    expect(() => registrarPagamento(v, { valor: "50" }, { id: ID(9), agora, hoje })).toThrow(/falta receber \(R\$ 40,00\)/);
    const q = registrarPagamento(v, { valor: "40" }, { id: ID(9), agora, hoje });
    expect(situacaoVenda(q)).toBe("quitado");
    expect(() => registrarPagamento(q, { valor: "1" }, { id: ID(10), agora, hoje })).toThrow(/quitada/);
  });

  it("produção é independente do pagamento", () => {
    const v = { ...base(), producao: "finalizado" };
    expect(fin.validarVenda(v).producao).toBe("finalizado");
    expect(situacaoVenda(v)).toBe("pendente");
  });

  it("venda manual tem custo desconhecido, não zero", () => {
    expect(base().custoCentavos).toBeNull();
    expect(lucroVenda(base())).toBeNull();
  });

  it("recusa valores e datas inválidos", () => {
    expect(() => montarVendaManual({ descricao: "x", valor: "0", data: hoje }, { id: ID(7), agora })).toThrow(/maior que zero/);
    expect(() => montarDespesa({ descricao: "Filamento", valor: "10", data: "2026-02-30" }, { id: ID(7), agora })).toThrow(/data/i);
    expect(() => registrarPagamento(base(), { valor: "10", formas: ["boleto"] }, { id: ID(8), agora, hoje })).toThrow(/Débito/);
  });
});

describe("indicadores do painel", () => {
  it("vendas, recebido, despesas, a receber, lucro e caixa", () => {
    const o = orcamento([{ descricao: "Vaso", quantidade: "1", preco: "100", custoUnitarioCentavos: "4000" }]);
    const v1 = sincronizarVendaDoOrcamento(o, null, { recebidoTotalCentavos: "3000", idPagamento: ID(2), idVenda: ID(3), agora, hoje });
    // venda antiga, fora do período, ainda devendo
    const antiga = { ...montarVendaManual({ descricao: "Antiga", valor: "50", data: "2026-01-10" }, { id: ID(11), agora }) };
    const semCusto = montarVendaManual({ descricao: "Avulsa", valor: "20", data: hoje }, { id: ID(12), agora });
    const negativa = { ...montarVendaManual({ descricao: "Prejuízo", valor: "10", data: hoje }, { id: ID(13), agora }), custoCentavos: "1500" };
    const desp = montarDespesa({ descricao: "Filamento", valor: "25", data: hoje }, { id: ID(14), agora });
    const r = resumoFinanceiro([v1, antiga, semCusto, negativa], [desp], periodoDe("30", hoje));
    expect(r.vendas).toBe(13000n);
    expect(r.recebido).toBe(3000n);
    expect(r.despesas).toBe(2500n);
    expect(r.aReceber).toBe(7000n + 5000n + 2000n + 1000n);
    expect(r.lucro).toBe(6000n - 500n); // venda sem custo fica fora e é contada
    expect(r.vendasSemCusto).toBe(1);
    expect(r.caixa).toBe(500n);
    expect(r.porDia).toEqual([{ dia: hoje, recebido: 3000n, despesas: 2500n }]);
  });

  it("períodos: 30, 90 dias e todo o histórico", () => {
    expect(periodoDe("30", "2026-11-11")).toEqual({ inicio: "2026-10-13", fim: "2026-11-11" });
    expect(periodoDe("90", "2026-11-11").inicio).toBe("2026-08-14");
    expect(periodoDe("tudo", "2026-11-11")).toEqual({ inicio: null, fim: "2026-11-11" });
  });

  it("orçamentos antigos sem venda, fora rascunhos e cancelados", () => {
    const lista = [
      { id: "a1", situacao: "enviado" },
      { id: "a2", situacao: "rascunho" },
      { id: "a3", situacao: "recusado" },
      { id: "a4", situacao: "aprovado" },
    ];
    expect(orcamentosSemVenda(lista, [{ orcamentoId: "a4" }]).map((o) => o.id)).toEqual(["a1"]);
  });
});

describe("sinal do orçamento", () => {
  it("em reais ou porcentagem sobre o total com desconto", () => {
    const o = orcamento([{ descricao: "Vaso", quantidade: "1", preco: "200" }], { desconto: "100", cobrarSinal: true, sinal: { tipo: "percentual", valor: "30" } });
    expect(valorSinal(o)).toBe(3000n);
    expect(sinalParaTexto(o.sinal)).toBe("30");
    const r = orcamento([{ descricao: "Vaso", quantidade: "1", preco: "200" }], { cobrarSinal: true, sinal: { tipo: "reais", valor: "50,00" } });
    expect(valorSinal(r)).toBe(5000n);
    expect(sinalParaTexto(r.sinal)).toBe("50,00");
    expect(valorSinal({ ...r, cobrarSinal: false })).toBe(0n);
    expect(() => orcamento([{ descricao: "V", quantidade: "1", preco: "1" }], { sinal: { tipo: "percentual", valor: "150" } })).toThrow(/100%/);
  });

  it("número escolhido precisa ser único e a numeração pode começar em outro valor", () => {
    const existentes = [{ id: "outro-orc-1", numero: 40592 }];
    const o = montarOrcamento({ itens: [{ descricao: "V", quantidade: "1", preco: "1" }], proximoNumero: 40000 }, { id: ID(1), existentes, agora });
    expect(o.numero).toBe(40593);
    const n = montarOrcamento({ itens: [{ descricao: "V", quantidade: "1", preco: "1" }], proximoNumero: 50000 }, { id: ID(1), existentes, agora });
    expect(n.numero).toBe(50000);
    expect(() => montarOrcamento({ itens: [{ descricao: "V", quantidade: "1", preco: "1" }], numero: "40592" }, { id: ID(1), existentes, agora })).toThrow(/Já existe/);
  });
});
