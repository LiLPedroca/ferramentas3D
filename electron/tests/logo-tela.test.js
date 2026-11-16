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
    expect(document.querySelector('input[name="lg-chaveiro"]:checked').value).toBe("nenhum");
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

describe("2D para 3D: Meus modelos e impressão", () => {
  it("modelo antigo (versão 2, com base) abre sem base, com a argola e a largura dele", async () => {
    const { opcoesDoSalvo } = await import("../src/renderer/logo-tela.js");
    const o = opcoesDoSalvo({ versao: 2, largura: 60, base: 2.4, relevo: 1.2, estilo: "contorno", comArgola: true, argola: 0.3, corBase: "#f4f4f4" });
    expect(o).toMatchObject({ largura: 60, altura: 3, chaveiro: "argola", argola: 0.3 });
    expect(o).not.toHaveProperty("base");
    expect(opcoesDoSalvo({ versao: 3, largura: 80, altura: 5.4, comArgola: false })).toMatchObject({ largura: 80, altura: 5.4, chaveiro: "nenhum" });
    expect(opcoesDoSalvo({ largura: 999 }).largura).toBe(100);
  });

  it("sem AMS: 3MF com faixas no filamento 1 e uma pausa por troca", async () => {
    await vi.waitFor(() => expect($("lg-3mf").disabled).toBe(false), { timeout: 20000 });
    const arq = await window.__logoTeste.pecaParaImprimir({ ams: false, camada: 0.2, primeira: 0.2 });
    const n = window.__logoTeste.modelo().cores.length;
    expect(arq.partes).toHaveLength(n);
    expect(arq.partes.every((p) => p.slot === 1)).toBe(true);
    expect(arq.pausas).toHaveLength(n - 1);
    expect(arq.pausas[0]).toBeCloseTo(3.2, 5);
    expect(arq.aviso).toMatch(/^ Comece com/);
  }, 30000);

  it("com AMS: as partes da peça, sem pausas", async () => {
    const arq = await window.__logoTeste.pecaParaImprimir({ ams: true });
    expect(arq.pausas).toEqual([]);
    expect(arq.partes.length).toBe(window.__logoTeste.modelo().cores.length);
  });
});

describe("2D para 3D: correções da revisão", () => {
  it("modelo salvo reabre no tamanho em que foi salvo (correções e escolhas continuam no lugar)", async () => {
    const { escalaDoMapa } = await import("../src/renderer/logo-tela.js");
    expect(escalaDoMapa(800, 600, { svg: false, salvo: true })).toBe(1);
    expect(escalaDoMapa(447, 447, { svg: false, salvo: false })).toBeCloseTo(1788 / 447, 6);
    expect(escalaDoMapa(6000, 3000, { svg: false, salvo: false })).toBeCloseTo(2000 / 6000, 6);
    expect(escalaDoMapa(100, 50, { svg: true, salvo: false })).toBe(20);
  });

  it("várias mudanças na mesma parte viram uma escolha só; desfazer escolha não refaz a vetorização", async () => {
    await vi.waitFor(() => expect($("lg-3mf").disabled).toBe(false), { timeout: 20000 });
    const t = window.__logoTeste;
    const alvo = t.modelo().partes[0];
    const antes = t.escolhas().length;
    t.abrirBalao(alvo.id, 50, 50);
    $("lg-balao-todas").checked = false;
    $("lg-balao-altura").value = "5";
    $("lg-balao-altura").dispatchEvent(new Event("change"));
    $("lg-balao-altura").value = "7";
    $("lg-balao-altura").dispatchEvent(new Event("change"));
    expect(t.escolhas().length).toBeLessThanOrEqual(antes + 1);
    const ultima = t.escolhas()[t.escolhas().length - 1];
    expect(ultima.altura).toBe(7);
    expect(ultima.corOriginal).toBe(alvo.corOriginal);
    const versao = t.versaoMapa();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(t.versaoMapa()).toBe(versao);
    await vi.waitFor(() => expect(t.modelo().partes.find((p) => p.id === alvo.id).altura).toBe(5), { timeout: 20000 });
  }, 30000);

  it("balão continua na mesma parte depois de mudar a largura", async () => {
    const t = window.__logoTeste;
    await vi.waitFor(() => expect($("lg-3mf").disabled).toBe(false), { timeout: 20000 });
    const alvo = [...t.modelo().partes].sort((a, b) => a.area - b.area)[0];
    t.abrirBalao(alvo.id, 50, 50);
    $("lg-largura").value = "60";
    $("lg-largura").dispatchEvent(new Event("input"));
    await vi.waitFor(() => expect(t.modelo().dimensoes[0]).toBeCloseTo(60, 1), { timeout: 20000 });
    await vi.waitFor(() => expect($("lg-3mf").disabled).toBe(false), { timeout: 20000 });
    const agora = t.modelo().partes.find((p) => p.id === t.balao()?.id);
    if (agora) expect(agora.corOriginal).toBe(alvo.corOriginal);
    if (agora) expect(agora.area).toBeCloseTo(alvo.area * 0.36, 0);
    else expect($("lg-balao").hidden).toBe(true);
  }, 30000);
});

describe("2D para 3D: abas Peça e Personalizar", () => {
  it("sem o link Corrigir, a barra de cima e o Concluir; duas abas no painel", () => {
    for (const id of ["lg-corrigir", "lg-concluir", "lg-ferramentas"]) expect($(id), id).toBeNull();
    const abas = [...document.querySelectorAll("#tela-logo [data-lg-aba]")].map((b) => b.textContent.trim());
    expect(abas).toEqual(["Peça", "Personalizar"]);
  });

  it("aba Personalizar mostra as ferramentas e liga a correção; voltar para Peça desliga", () => {
    const aba = (nome) => document.querySelector(`#tela-logo [data-lg-aba="${nome}"]`);
    aba("personalizar").click();
    const secao = document.querySelector('#tela-logo [data-lg-secao="personalizar"]');
    expect(secao.hidden).toBe(false);
    expect(secao.querySelector('[data-ferramenta="borracha"]')).not.toBeNull();
    expect(secao.querySelector('[data-ferramenta="varinha"]')).not.toBeNull();
    expect(document.querySelector('#tela-logo [data-lg-secao="peca"]').hidden).toBe(true);
    expect(window.__logoTeste.corrigindo()).toBe(true);
    aba("peca").click();
    expect(window.__logoTeste.corrigindo()).toBe(false);
    expect(secao.hidden).toBe(true);
  });
});

describe("2D para 3D: relevo nos chips de cor", () => {
  it("+ sobe a cor uma camada e mostra em mm; − volta", async () => {
    const t = window.__logoTeste;
    document.querySelector('#tela-logo [data-lg-aba="peca"]').click();
    await vi.waitFor(() => expect($("lg-3mf").disabled).toBe(false), { timeout: 20000 });
    const linha = document.querySelector("#lg-cores-lista .lg-relevo");
    const mais = linha.querySelector("[data-relevo='mais']");
    const cor = linha.dataset.cor;
    mais.click();
    mais.click();
    expect(linha.querySelector(".lg-relevo-mm").textContent).toBe("+0,4 mm");
    await vi.waitFor(() => expect(t.modelo().partes.filter((p) => p.cor === cor).every((p) => Math.abs(p.altura - (t.modelo().opcoes.altura + 0.4)) < 1e-6)).toBe(true), { timeout: 20000 });
    linha.querySelector("[data-relevo='menos']").click();
    expect(document.querySelector("#lg-cores-lista .lg-relevo .lg-relevo-mm").textContent).toBe("+0,2 mm");
  }, 40000);
});

describe("2D para 3D: argola ou furo para chaveiro", () => {
  it("três opções com nomes claros e o tamanho do furo só quando precisa", async () => {
    document.querySelector('#tela-logo [data-lg-aba="peca"]').click();
    const nomes = [...document.querySelectorAll('input[name="lg-chaveiro"]')].map((r) => r.closest("label").textContent.trim());
    expect(nomes).toEqual(["Nenhum", "Argola para chaveiro", "Furo para chaveiro"]);
    expect($("lg-furo-campo").hidden).toBe(true);
    const furo = document.querySelector('input[name="lg-chaveiro"][value="furo"]');
    furo.checked = true;
    furo.dispatchEvent(new Event("change", { bubbles: true }));
    expect($("lg-furo-campo").hidden).toBe(false);
    expect($("lg-furo").value).toBe("4");
    await vi.waitFor(() => expect(window.__logoTeste.modelo()?.argola?.furo).toBe(2), { timeout: 20000 });
    $("lg-furo").value = "6";
    $("lg-furo").dispatchEvent(new Event("input"));
    await vi.waitFor(() => expect(window.__logoTeste.modelo()?.argola?.furo).toBe(3), { timeout: 20000 });
  }, 40000);
});

describe("2D para 3D: Trazer de volta", () => {
  it("a aba Personalizar tem Trazer de volta no lugar de Restaurar", () => {
    const b = document.querySelector('#tela-logo [data-ferramenta="trazer"]');
    expect(b).not.toBeNull();
    expect(b.textContent).toMatch(/^Trazer de volta/);
    expect(b.textContent).toMatch(/imagem original/);
    expect(document.querySelector('#tela-logo [data-ferramenta="restaurar"]')).toBeNull();
  });
});

describe("2D para 3D: cor apagada sai de Cores", () => {
  it("quando não sobra nenhum pixel de uma cor, o chip dela some", async () => {
    const t = window.__logoTeste;
    document.querySelector('#tela-logo [data-lg-aba="peca"]').click();
    await vi.waitFor(() => expect($("lg-3mf").disabled).toBe(false), { timeout: 20000 });
    const nomes = () => [...document.querySelectorAll("#lg-cores-lista .lg-chip-nome")].map((b) => b.textContent.trim());
    const alvo = t.alvos().find((a) => t.mapa().idx.includes(a.cor));
    const mapa = t.mapa();
    const manual = t.manual();
    const antes = nomes().length;
    for (let p = 0; p < mapa.idx.length; p++) if (mapa.idx[p] === alvo.cor) (mapa.idx[p] = -1), (manual[p] = 1);
    t.mapaMudou();
    expect(nomes().length).toBe(antes - 1);
  }, 40000);
});
