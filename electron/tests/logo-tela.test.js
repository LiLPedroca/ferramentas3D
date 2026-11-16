// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FERRAMENTAS } from "../src/core/ferramentas.js";
import { iniciarLogo } from "../src/renderer/logo-tela.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";
import { irPara } from "../src/renderer/shell.js";

// O DOM de testes não tem canvas/WebGL; geração e estado da tela continuam reais.
vi.mock("../src/renderer/modelos/previa2d.js", () => ({
  criarPrevia2d: () => ({ mostrar() {}, ajustar() {}, nivel: () => 1, destacar() {}, paraModelo: () => null, mmPorPixel: () => 0.1 }),
  miniatura: () => "",
}));
vi.mock("../src/renderer/modelos/manifold.js", async (original) => {
  const real = await original();
  return { ...real, motorDaTela: () => real.carregarManifold() };
});

const $ = (id) => document.getElementById(id);

// Imagem de teste: fundo branco, quadrado preto com um círculo vermelho dentro, e uma estrela amarela solta.
function imagemTeste(w = 200, h = 160) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = [255, 255, 255];
      if (x >= 20 && x < 120 && y >= 30 && y < 130) c = Math.hypot(x - 70, y - 80) < 30 ? [229, 57, 53] : [17, 17, 17];
      if (Math.hypot(x - 160, y - 60) < 18) c = [255, 214, 0];
      data.set([...c, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

beforeAll(async () => {
  document.body.innerHTML = readFileSync(join(__dirname, "../src/renderer/index.html"), "utf8").match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "");
  await carregarManifold();
  iniciarLogo();
  irPara("logo");
});

describe("2D para 3D: tela", () => {
  it("catálogo: título e descrição novos", () => {
    const f = FERRAMENTAS.find((x) => x.tela === "logo");
    expect(f.titulo).toBe("2D para 3D");
    expect(f.descricao).toBe("Sua imagem vira peça 3D, pronta para imprimir.");
  });

  it("sem base, borda, relevo, estilos, pincel nem balde", () => {
    for (const id of ["lg-base", "lg-borda", "lg-relevo", "lg-paleta-base", "lg-cores-pincel", "lg-fundo", "lg-fundo-dentro"]) expect($(id), id).toBeNull();
    expect(document.querySelector("[data-lg-estilo]")).toBeNull();
    expect(document.querySelector('[data-ferramenta="pincel"]')).toBeNull();
    expect(document.querySelector('[data-ferramenta="balde"]')).toBeNull();
    expect(document.querySelector('[data-ferramenta="borracha"]')).not.toBeNull();
    expect(document.querySelector('[data-ferramenta="varinha"]')).not.toBeNull();
  });

  it("medidas: largura 100, altura das partes 3, argola desligada", () => {
    expect($("lg-largura").value).toBe("100");
    expect($("lg-altura").value).toBe("3");
    expect($("lg-com-argola").checked).toBe(false);
  });

  it("imagem vira peça sem base: linha de informação com medidas e partes", async () => {
    await window.__logoTeste.usarImagem(imagemTeste(), { nome: "teste.png", w: 200, h: 160 });
    await vi.waitFor(() => expect($("lg-3mf").disabled).toBe(false), { timeout: 20000 });
    const m = window.__logoTeste.modelo();
    expect(m.partes.length).toBe(3); // preto (com furo), vermelho, amarelo
    expect(m.dimensoes[0]).toBeCloseTo(100, 1);
    expect($("lg-info").textContent).toMatch(/^100,0 × \d+,\d mm · 3 partes · altura 3 mm$/);
  }, 30000);
});

describe("2D para 3D: balão da parte", () => {
  const tecla = (key, extra = {}) => document.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, ...extra }));
  const pronto = () => vi.waitFor(() => expect($("lg-3mf").disabled).toBe(false), { timeout: 20000 });
  const parteDa = (cor) => window.__logoTeste.modelo().partes.find((p) => p.cor === cor);

  it("clicar numa parte abre o balão com as cores prontas e a altura", async () => {
    await pronto();
    const vermelha = window.__logoTeste.modelo().partes.find((p) => p.cor !== "#ffd600" && p.area < 3000);
    window.__logoTeste.abrirBalao(vermelha.id, 100, 100);
    expect($("lg-balao").hidden).toBe(false);
    expect($("lg-balao-cores").querySelectorAll("[data-cor]").length).toBe(13) // as cores prontas com tinta (CORES_LOGO);
    expect($("lg-balao-altura").value).toBe("3");
  });

  it("mudar a altura vale só para aquela parte; Ctrl+Z desfaz", async () => {
    const m0 = window.__logoTeste.modelo();
    const alvo = m0.partes[1];
    window.__logoTeste.abrirBalao(alvo.id, 100, 100);
    $("lg-balao-altura").value = "6";
    $("lg-balao-altura").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(window.__logoTeste.modelo().partes.find((p) => p.id === alvo.id).altura).toBe(6), { timeout: 20000 });
    const m = window.__logoTeste.modelo();
    expect(m.partes.filter((p) => p.id !== alvo.id).every((p) => p.altura === 3)).toBe(true);
    expect($("lg-info").textContent).toMatch(/alturas 3 a 6 mm$/);
    tecla("z");
    await vi.waitFor(() => expect(window.__logoTeste.modelo().partes.every((p) => p.altura === 3)).toBe(true), { timeout: 20000 });
    tecla("y");
    await vi.waitFor(() => expect(window.__logoTeste.modelo().partes.find((p) => p.id === alvo.id).altura).toBe(6), { timeout: 20000 });
  }, 60000);

  it("altura fora de 2 a 10 mostra erro e não muda a peça", () => {
    const alvo = window.__logoTeste.modelo().partes[0];
    window.__logoTeste.abrirBalao(alvo.id, 100, 100);
    const antes = window.__logoTeste.escolhas().length;
    $("lg-balao-altura").value = "12";
    $("lg-balao-altura").dispatchEvent(new Event("change"));
    expect($("lg-balao-erro").textContent).toMatch(/2 a 10/);
    expect(window.__logoTeste.escolhas().length).toBe(antes);
  });

  it("trocar a cor com \"Todas desta cor\" muda todas as partes daquela cor", async () => {
    await pronto();
    const preta = parteDa("#111111") ?? window.__logoTeste.modelo().partes[0];
    const corAntes = preta.cor;
    const iguais = window.__logoTeste.modelo().partes.filter((p) => p.cor === corAntes).length;
    window.__logoTeste.abrirBalao(preta.id, 100, 100);
    $("lg-balao-todas").checked = true;
    const verde = [...$("lg-balao-cores").querySelectorAll("[data-cor]")].find((b) => b.dataset.cor !== corAntes);
    verde.click();
    await vi.waitFor(() => expect(window.__logoTeste.modelo().partes.filter((p) => p.cor === verde.dataset.cor).length).toBeGreaterThanOrEqual(iguais), { timeout: 20000 });
    expect(window.__logoTeste.modelo().partes.some((p) => p.cor === corAntes)).toBe(false);
  }, 30000);

  it("escolha cuja parte deixou de existir é descartada", async () => {
    await pronto();
    const total = window.__logoTeste.escolhas().length;
    window.__logoTeste.adicionarEscolha({ ponto: [-500, -500], altura: 9 });
    await window.__logoTeste.gerar();
    expect(window.__logoTeste.escolhas().length).toBe(total);
  }, 30000);
});
