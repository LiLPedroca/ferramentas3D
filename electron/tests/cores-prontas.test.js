// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { CORES_PRONTAS, corPronta } from "../src/renderer/modelos/cores-prontas.js";
import { criarPaleta, marcarPaleta } from "../src/renderer/modelos-ui.js";
import { validarOpcoesChaveiro } from "../src/renderer/modelos/chaveiro.js";

describe("cores prontas dos modelos", () => {
  it("são as 13 cores com tinta de Minhas Impressões", () => {
    expect(CORES_PRONTAS.map((c) => c.nome)).toEqual(["Branco", "Preto", "Cinza", "Prata", "Vermelho", "Laranja", "Amarelo", "Dourado", "Verde", "Azul", "Roxo", "Rosa", "Marrom"]);
  });

  it("cor fora da lista vira a mais parecida; inválida vira o padrão", () => {
    expect(corPronta("#ff0000")).toBe("#d6322f");
    expect(corPronta("#ffffff")).toBe("#f4f4f4");
    expect(corPronta("#2463d8")).toBe("#2463d8");
    expect(corPronta("azul", "#1b1b1b")).toBe("#1b1b1b");
  });

  it("paleta só tem os botões das cores prontas, sem cor livre", () => {
    const caixa = document.createElement("div");
    const escolhidas = [];
    criarPaleta(caixa, (cor) => escolhidas.push(cor));
    expect(caixa.querySelectorAll("button.ch-cor")).toHaveLength(13);
    expect(caixa.querySelector("input")).toBeNull();
    caixa.querySelector('[data-cor="#2e9d4f"]').click();
    expect(escolhidas).toEqual(["#2e9d4f"]);
    marcarPaleta(caixa, "#00ff00");
    expect(caixa.querySelector('[aria-pressed="true"]').dataset.cor).toBe("#2e9d4f");
  });

  it("projeto antigo com cor livre abre com a cor pronta mais parecida", () => {
    const o = validarOpcoesChaveiro({ texto: "Ana", corBase: "#ffffff", corTexto: "#ff0000" });
    expect([o.corBase, o.corTexto]).toEqual(["#f4f4f4", "#d6322f"]);
  });
});
