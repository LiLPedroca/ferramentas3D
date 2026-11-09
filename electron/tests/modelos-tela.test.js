// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { iniciarChaveiro } from "../src/renderer/chaveiro-tela.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";
import { irPara } from "../src/renderer/shell.js";

// O DOM de testes não tem canvas/WebGL; geração e estado da tela continuam reais.
vi.mock("../src/renderer/modelos/previa2d.js", () => ({ criarPrevia2d: () => ({ mostrar() {} }), miniatura: () => "" }));
vi.mock("../src/renderer/modelos/manifold.js", async (original) => {
  const real = await original();
  return { ...real, motorDaTela: () => real.carregarManifold() };
});

const $ = (id) => document.getElementById(id);
const digitar = (id, valor) => {
  $(id).value = valor;
  $(id).dispatchEvent(new Event("input"));
};

describe("exportação durante alterações do modelo", () => {
  beforeAll(async () => {
    document.body.innerHTML = readFileSync(join(__dirname, "../src/renderer/index.html"), "utf8").match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "");
    globalThis.Option = function (texto, valor) {
      const opcao = document.createElement("option");
      opcao.textContent = texto;
      opcao.value = valor;
      return opcao;
    };
    window.modelos = { lerFonte: async (id) => ({ ok: true, dados: readFileSync(join(__dirname, `../src/renderer/assets/fontes/${id}-Regular.ttf`)) }) };
    await carregarManifold();
    iniciarChaveiro();
    irPara("chaveiro");
    await vi.waitFor(() => expect($("ch-stl").disabled).toBe(false));
  });

  it("bloqueia exportação assim que o texto muda e libera só após gerar", async () => {
    digitar("ch-texto", "Nova peça");
    expect($("ch-stl").disabled).toBe(true);
    expect($("ch-custo").disabled).toBe(true);
    await vi.waitFor(() => expect($("ch-stl").disabled).toBe(false));
  });

  it("medida inválida cancela geração agendada e mantém exportação bloqueada", async () => {
    digitar("ch-largura", "80");
    digitar("ch-largura", "0");
    await new Promise((r) => setTimeout(r, 400));
    expect($("ch-stl").disabled).toBe(true);
    expect($("ch-status").classList.contains("erro")).toBe(true);
  });

  it("texto em campo numérico também bloqueia exportação", async () => {
    digitar("ch-largura", "80");
    await vi.waitFor(() => expect($("ch-stl").disabled).toBe(false));
    digitar("ch-largura", "abc");
    expect($("ch-stl").disabled).toBe(true);
    expect($("ch-status").classList.contains("erro")).toBe(true);
  });
});
