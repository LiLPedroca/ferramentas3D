// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { iniciarCalculadora } from "../src/renderer/calculadora-tela.js";

const $ = (id) => document.getElementById(id);
const digitar = (id, valor) => {
  $(id).value = valor;
  $(id).dispatchEvent(new Event("input"));
};
const texto = (id) => $(id).textContent.replace(/\s/g, " ");

beforeAll(() => {
  document.body.innerHTML = readFileSync(join(__dirname, "../src/renderer/index.html"), "utf8").match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "");
  globalThis.Option = function (t, v) { const o = document.createElement("option"); o.textContent = t; o.value = v; return o; };
  window.dados = { filamentos: { listar: async () => ({ ok: true, dados: [] }) } };
  iniciarCalculadora();
}, 30000); // ler o index.html inteiro demora quando a suíte toda roda junto

describe("Calculadora: mão de obra e conta do preço", () => {
  it("caixinha começa desligada: R$ 15 de mão de obra com 100% de lucro dá R$ 15", () => {
    for (const [id, v] of [["peso", "0"], ["horas", "0"], ["minutos", "0"], ["mao-obra", "15"], ["quantidade", "1"]]) digitar(id, v);
    digitar("lucro", "100");
    expect($("lucro-mao-obra").checked).toBe(false);
    expect(texto("preco-unitario")).toBe("R$ 15,00");
    expect(texto("lucro-texto")).toBe("Lucro (100% sobre R$ 0,00, sem a mão de obra)");
    expect(texto("lucro-lote")).toBe("+ R$ 0,00");
    expect(texto("preco-lote")).toBe("R$ 15,00");
  });

  it("ligada: o lucro vale também sobre a mão de obra (R$ 30) e a conta mostra de onde veio", () => {
    $("lucro-mao-obra").checked = true;
    $("lucro-mao-obra").dispatchEvent(new Event("change"));
    expect(texto("preco-unitario")).toBe("R$ 30,00");
    expect(texto("lucro-texto")).toBe("Lucro (100% sobre R$ 15,00)");
    expect(texto("lucro-lote")).toBe("+ R$ 15,00");
    expect(texto("preco-lote")).toBe("R$ 30,00");
  });

  it("Valor da peça: o custo sem a mão de obra (R$ 20 de custo e R$ 15 de mão de obra = R$ 5)", () => {
    for (const [id, v] of [["peso", "50"], ["preco-kg", "100"], ["horas", "0"], ["minutos", "0"], ["mao-obra", "15"], ["quantidade", "1"]]) digitar(id, v);
    expect(texto("custo-unitario")).toBe("R$ 20,00");
    expect(texto("valor-unitario")).toBe("R$ 5,00");
  });
});
