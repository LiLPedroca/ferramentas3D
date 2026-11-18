import { describe, expect, it } from "vitest";
import laserMod from "../src/core/laser.cjs";
import orcMod from "../src/core/orcamento.cjs";

const { calcularLaser, itemDoOrcamento } = laserMod;
const { itensNaVersao, montarOrcamento, versoesDo } = orcMod;

const base = { nome: "Copo térmico personalizado", quantidade: "10", valorProduto: "25,00" };
const ID = "11111111-2222-3333-4444-555555555555";
const PID = "aaaaaaaa-2222-3333-4444-555555555555";

describe("conta da gravação a laser", () => {
  it("produto + gravação = valor por peça; × quantidade = total (o desenho do Pedro)", () => {
    const c = calcularLaser({ ...base, valorFrente: "5", valorFrenteVerso: "8,00" });
    expect(c.opcoes.map((o) => o.id)).toEqual(["frente", "frenteVerso"]);
    const fv = c.opcoes[1];
    expect(fv.porPecaCentavos).toBe(3300n);
    expect(fv.totalCentavos).toBe(33000n);
    expect(fv.descricao).toBe("Copo térmico personalizado (gravação frente e verso)");
    expect(c.opcoes[0].totalCentavos).toBe(30000n);
  });

  it("só um valor preenchido: uma opção só", () => {
    const c = calcularLaser({ ...base, valorFrenteVerso: "8" });
    expect(c.opcoes).toHaveLength(1);
    expect(c.opcoes[0].id).toBe("frenteVerso");
  });

  it("sem gravação, sem valor do produto ou quantidade errada: mensagem clara", () => {
    expect(() => calcularLaser(base)).toThrow(/valor da gravação/);
    expect(() => calcularLaser({ ...base, valorProduto: "", valorFrente: "5" })).toThrow(/Valor do produto/);
    expect(() => calcularLaser({ ...base, quantidade: "0", valorFrente: "5" })).toThrow(/Quantidade/);
  });
});

describe("item com duas versões no orçamento", () => {
  const c = calcularLaser({ ...base, valorFrente: "5", valorFrenteVerso: "8" });

  it("leva a escolhida, guarda as duas e o produto", () => {
    const item = itemDoOrcamento(c, "frente", PID);
    expect(item).toMatchObject({ descricao: "Copo térmico personalizado (gravação frente)", quantidade: 10, precoUnitarioCentavos: "3000", produtoId: PID, opcao: 0 });
    expect(item.opcoes.map((o) => o.rotulo)).toEqual(["Frente", "Frente e verso"]);
    const so = itemDoOrcamento(calcularLaser({ ...base, valorFrente: "5" }), "frente");
    expect(so.opcoes).toBeUndefined();
  });

  it("o orçamento grava as versões e troca de uma para a outra", () => {
    const item = itemDoOrcamento(c, "frenteVerso");
    const o = montarOrcamento(
      { cliente: null, itens: [{ ...item, preco: "33,00" }, { descricao: "Outro", quantidade: "1", preco: "10" }] },
      { id: ID, agora: "2026-11-18T10:00:00.000Z" },
    );
    expect(o.itens[0].opcao).toBe(1);
    expect(o.itens[1].opcoes).toBeUndefined();
    expect(versoesDo(o.itens)).toEqual(["Frente", "Frente e verso"]);
    const frente = itensNaVersao(o.itens, 0);
    expect(frente[0]).toMatchObject({ opcao: 0, precoUnitarioCentavos: "3000", descricao: "Copo térmico personalizado (gravação frente)" });
    expect(frente[1]).toBe(o.itens[1]);
    // formulário (preço em texto)
    expect(itensNaVersao([{ ...item, preco: "33,00" }], 0)[0].preco).toBe("30,00");
  });

  it("recusa versões malformadas", () => {
    expect(() =>
      montarOrcamento({ cliente: null, itens: [{ descricao: "X", quantidade: "1", preco: "1", opcoes: [{ rotulo: "A" }] }] }, { id: ID }),
    ).toThrow(/versões inválidas/);
  });
});
