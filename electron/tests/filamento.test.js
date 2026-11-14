import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  MARCAS, MATERIAIS, abrirRoloNovo, acabando, corProntaDoHex, descontar, gramasEmEstoque, montarFilamento, pesar, planejarDesconto,
  precoKgCentavos, validarFilamento, valorEmEstoqueCentavos,
} = require("../src/core/filamento.cjs");
const { lerBackup, montarBackup } = require("../src/core/backup.cjs");
const { aplicarAlteracao, normalizarGravado } = require("../src/core/configuracoes.cjs");
const { criarServicoFilamentos } = require("../src/main/filamentos.cjs");

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const base = { marca: "Sunlu", material: "PLA", cor: "preto", peso: "1000", preco: "100" };
let n = 0;
const rolo = (v, extra = {}) => ({ ...montarFilamento({ ...base, ...v }, { id: `0f8fad5b-d9cb-469f-a165-7086772895${String(n++).padStart(2, "0")}` }), ...extra });

const pastas = [];
afterEach(() => pastas.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));

describe("estoque de filamentos: rolo", () => {
  it("só marcas, materiais e cores da lista; rolo novo começa cheio", () => {
    expect(MARCAS).toEqual(["Sunlu", "Masterprint", "Voolt3D", "Bambu Lab", "Elegoo", "Soleyin", "Multfila"]);
    expect(MATERIAIS).toEqual(["PLA", "PLA Silk", "PETG", "ABS", "TPU"]);
    const f = montarFilamento(base, { id: ID, agora: "2026-11-14T10:00:00.000Z" });
    expect(f).toMatchObject({ marca: "Sunlu", material: "PLA", cor: "preto", pesoTotalG: 1000, restanteG: 1000, precoCentavos: "10000", fechados: 0, posicao: null });
    expect(validarFilamento(f)).toBe(true);
    expect(() => montarFilamento({ ...base, marca: "Outra" }, { id: ID })).toThrow(/marca/);
    expect(() => montarFilamento({ ...base, material: "Madeira" }, { id: ID })).toThrow(/material/);
    expect(() => montarFilamento({ ...base, cor: "azul-bebe" }, { id: ID })).toThrow(/cor/);
    expect(() => montarFilamento({ ...base, peso: "0" }, { id: ID })).toThrow(/Peso do rolo/);
    expect(() => montarFilamento({ ...base, preco: "" }, { id: ID })).toThrow(/Preço do rolo/);
  });

  it("preço por kg sai do preço e do peso do rolo (500 g por R$ 60 = R$ 120/kg)", () => {
    expect(precoKgCentavos(rolo({ peso: "500", preco: "60" }))).toBe(12000n);
    expect(precoKgCentavos(rolo({}))).toBe(10000n);
    expect(precoKgCentavos(rolo({ peso: "750", preco: "89,90" }))).toBe(11987n);
  });

  it("editar mantém o que resta; não passa do peso do rolo", () => {
    const f = descontar(rolo({}), 300);
    const editado = montarFilamento({ ...base, preco: "110" }, { id: f.id, anterior: f });
    expect(editado.restanteG).toBe(700);
    expect(montarFilamento({ ...base, peso: "500" }, { id: f.id, anterior: f }).restanteG).toBe(500);
  });

  it("desconta e devolve sem passar de 0 nem do total; avisa quando acaba", () => {
    const f = rolo({}, { restanteG: 300 });
    expect(descontar(f, 3.8).restanteG).toBe(296.2);
    expect(descontar(f, 500).restanteG).toBe(0);
    expect(descontar(f, -900).restanteG).toBe(1000);
    expect(acabando(f)).toBe(false);
    expect(acabando(descontar(f, 160))).toBe(true); // 140 g < 15% de 1 kg
  });

  it("pesar na balança: bruto menos o carretel vazio", () => {
    const f = rolo({});
    expect(pesar(f, "870", "250").restanteG).toBe(620);
    expect(pesar(f, "1500", "250").restanteG).toBe(1000); // não passa do rolo
    expect(() => pesar(f, "200", "250")).toThrow(/menos que o carretel/);
  });

  it("abrir rolo novo e valor em estoque (aberto + fechados)", () => {
    const f = rolo({}, { restanteG: 250, fechados: 2 });
    expect(gramasEmEstoque(f)).toBe(2250);
    expect(valorEmEstoqueCentavos(f)).toBe(22500n); // R$ 25 do aberto + 2 × R$ 100
    const novo = abrirRoloNovo(f);
    expect(novo).toMatchObject({ fechados: 1, restanteG: 1000 });
    expect(() => abrirRoloNovo(novo.fechados ? abrirRoloNovo(novo) : novo)).toThrow(/fechado/);
  });

  it("entra no backup", () => {
    const f = montarFilamento(base, { id: ID });
    const { dados, resumo } = lerBackup(JSON.stringify(montarBackup({ filamentos: [f] }, { versaoApp: "0.52.0" })));
    expect(dados.filamentos).toEqual([f]);
    expect(resumo.filamentos).toBe(1);
  });
});

describe("estoque de filamentos: de qual rolo sai", () => {
  it("cor do 3MF vira a cor pronta mais perto", () => {
    expect(corProntaDoHex("#000000")).toBe("preto");
    expect(corProntaDoHex("#FFFFFF")).toBe("branco");
    expect(corProntaDoHex("#D4AF37")).toBe("dourado");
    expect(corProntaDoHex("xyz")).toBeNull();
  });

  it("prefere o rolo da impressora, depois a mesma cor e material, depois a cor", () => {
    const pretoGuardado = rolo({}, { restanteG: 900 });
    const pretoNaImpressora = rolo({ marca: "Elegoo" }, { restanteG: 400, posicao: 2 });
    const brancoPetg = rolo({ cor: "branco", material: "PETG" });
    const rolos = [pretoGuardado, pretoNaImpressora, brancoPetg];
    const plano = planejarDesconto(rolos, [
      { cor: "preto", material: "PLA", gramas: 18 },
      { cor: "branco", material: "PLA", gramas: 6 }, // não há branco PLA: usa o branco PETG
      { cor: "vermelho", gramas: 3 },
    ]);
    expect(plano.itens).toEqual([{ id: pretoNaImpressora.id, gramas: 18 }, { id: brancoPetg.id, gramas: 6 }]);
    expect(plano.semRolo.map((u) => u.cor)).toEqual(["vermelho"]);
    // sem saber a cor: o rolo da posição
    expect(planejarDesconto(rolos, [{ posicao: 2, gramas: 10 }]).itens).toEqual([{ id: pretoNaImpressora.id, gramas: 10 }]);
    expect(planejarDesconto(rolos, [{ posicao: 1, gramas: 10 }]).semRolo).toHaveLength(1);
  });
});

describe("estoque de filamentos: serviço", () => {
  it("desconta vários (tudo ou nada), desfaz, pesa, abre rolo e põe na impressora", async () => {
    const pasta = mkdtempSync(path.join(os.tmpdir(), "estoque Ação "));
    pastas.push(pasta);
    const s = criarServicoFilamentos(pasta);
    const a = await s.salvar(base);
    const b = await s.salvar({ ...base, cor: "branco" });
    await s.descontarVarios([{ id: a.id, gramas: 18 }, { id: b.id, gramas: 6 }]);
    let lista = await s.listar();
    expect(lista.find((f) => f.id === a.id).restanteG).toBe(982);
    await expect(s.descontarVarios([{ id: a.id, gramas: 5 }, { id: "nao-existe", gramas: 1 }])).rejects.toThrow(/não existe/);
    expect((await s.listar()).find((f) => f.id === a.id).restanteG).toBe(982); // nada mudou
    await s.descontarVarios([{ id: a.id, gramas: -18 }]); // desfazer
    expect((await s.listar()).find((f) => f.id === a.id).restanteG).toBe(1000);
    expect((await s.pesar(a.id, "700", "200")).restanteG).toBe(500);
    await s.posicionar(a.id, 1);
    await s.posicionar(b.id, 1); // o branco entra; o preto sai da posição 1
    lista = await s.listar();
    expect(lista.find((f) => f.id === b.id).posicao).toBe(1);
    expect(lista.find((f) => f.id === a.id).posicao).toBeNull();
    await expect(s.posicionar(a.id, 5)).rejects.toThrow(/Posição/);
    await s.salvar({ ...base, fechados: 1 }, a.id);
    expect(await s.abrirRoloNovo(a.id)).toMatchObject({ fechados: 0, restanteG: 1000 });
  });
});

describe("estoque de filamentos: configurações", () => {
  it("posições da impressora e carretel vazio por marca", () => {
    expect(normalizarGravado({}).estoque).toEqual({ posicoes: 4, carretelG: {} });
    let c = aplicarAlteracao({}, { estoque: { posicoes: 1 } });
    c = aplicarAlteracao(c, { estoque: { carretelG: { Sunlu: 240 } } });
    c = aplicarAlteracao(c, { estoque: { carretelG: { Elegoo: 200 } } });
    expect(c.estoque).toEqual({ posicoes: 1, carretelG: { Sunlu: 240, Elegoo: 200 } });
    expect(() => aplicarAlteracao({}, { estoque: { posicoes: 3 } })).toThrow(/Posições/);
    expect(() => aplicarAlteracao({}, { estoque: { carretelG: { Sunlu: -1 } } })).toThrow(/Carretel/);
  });
});
