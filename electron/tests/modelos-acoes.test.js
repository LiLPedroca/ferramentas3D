// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { carregarFilamentos } from "../src/renderer/filamentos-tela.js";
import { arquivoDeTexto, calcularCustoModelo, densidadeDoModelo, imagemComoTexto, iniciarNomeArquivo, mudarPrevia, salvarArquivoModelo, salvarModeloComo } from "../src/renderer/modelos-acoes.js";

describe("ações comuns dos modelos", () => {
  beforeEach(() => { document.body.innerHTML = '<button id="x-ver-2d"></button><button id="x-ver-3d"></button><div id="x-3d"></div>'; });

  it("reabre a imagem salva preservando bytes, tipo e nome", async () => {
    const arquivo = arquivoDeTexto("data:image/png;base64,AAEC/w==", "ação.png");
    expect(arquivo.name).toBe("ação.png");
    expect(arquivo.type).toBe("image/png");
    expect([...new Uint8Array(await arquivo.arrayBuffer())]).toEqual([0, 1, 2, 255]);
    expect(arquivoDeTexto("data:image/webp;base64,AA==").type).toBe("image/webp");
  });

  it("converte canvas fora da tela em uma imagem que pode ser reaberta", async () => {
    const texto = await imagemComoTexto({ convertToBlob: async () => new Blob([new Uint8Array([0, 1, 255])], { type: "image/png" }) });
    expect(texto).toBe("data:image/png;base64,AAH/");
  });

  it("troca a prévia sem recriar o 3D e mantém os botões sincronizados", () => {
    const previa = { mostrar() {} };
    mudarPrevia("x", "3d", { ativar() {} }, previa, []);
    expect(document.getElementById("x-ver-3d").getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("x-3d").hidden).toBe(false);
    expect(mudarPrevia("x", "2d", { ativar() {} }, previa, [])).toBe(previa);
    expect(document.getElementById("x-ver-2d").getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("x-3d").hidden).toBe(true);
  });

  // caixinha do nome + aviso "Arquivo salvo" (o resto do index.html não importa aqui)
  const montarDialogo = () => {
    document.body.innerHTML += '<dialog id="dialogo-nome-arquivo"><input id="na-nome"><p id="erro-nome-arquivo"></p><button id="na-cancelar"></button><button id="na-salvar"></button></dialog><div id="aviso" ></div><div id="aviso-salvo" hidden><div class="salvo-cartao"></div><p id="aviso-salvo-titulo"></p><span id="aviso-salvo-texto"></span><button id="aviso-salvo-pasta"></button></div>';
    iniciarNomeArquivo();
  };
  const responder = async (nome) => {
    await vi.waitFor(() => expect(document.getElementById("dialogo-nome-arquivo").open).toBe(true));
    if (nome === null) document.getElementById("na-cancelar").click();
    else {
      document.getElementById("na-nome").value = nome;
      document.getElementById("na-salvar").click();
    }
  };

  it("pergunta o nome antes de montar; cancelar a pergunta de impressão não salva arquivo", async () => {
    montarDialogo();
    const gravados = [];
    window.modelos = { gravar: async (...args) => { gravados.push(args); return { ok: true, dados: { caminho: "C:/x.3mf" } }; } };
    let recebido = null;
    const fim = salvarModeloComo("3mf", [{}], "Peça", async (nome) => { recebido = nome; return null; });
    await responder("Maria");
    await fim;
    expect(recebido).toBe("Maria - Criae3D");
    expect(gravados).toEqual([]);
  });

  it("cancelar a caixinha do nome não monta nem salva", async () => {
    montarDialogo();
    const gravados = [];
    window.modelos = { gravar: async (...args) => { gravados.push(args); return { ok: true, dados: { caminho: "C:/x.stl" } }; } };
    let montou = false;
    const fim = salvarModeloComo("3mf", [{}], "Peça", async () => { montou = true; return { bytes: new Uint8Array([1]) }; });
    await responder(null);
    await fim;
    expect(montou).toBe(false);
    expect(gravados).toEqual([]);
  });

  it("grava com o nome digitado + Criae3D e marca o STL por dentro", async () => {
    montarDialogo();
    const gravados = [];
    window.modelos = { gravar: async (...args) => { gravados.push(args); return { ok: true, dados: { caminho: "C:/Peça com acento - Criae3D.stl" } }; } };
    const stl = new Uint8Array(84 + 50);
    const fim = salvarArquivoModelo(stl, "Chaveiro", "stl");
    await responder("Peça com acento");
    await fim;
    expect(gravados).toHaveLength(1);
    const [bytes, nome, extensao] = gravados[0];
    expect(nome).toBe("Peça com acento - Criae3D");
    expect(extensao).toBe("stl");
    expect(new TextDecoder().decode(bytes.subarray(0, 7))).toBe("Criae3D");
    expect(bytes.length).toBe(stl.length);
    expect(document.getElementById("aviso-salvo").hidden).toBe(false);
  });

  it("nome vazio não fecha a caixinha", async () => {
    montarDialogo();
    window.modelos = { gravar: vi.fn() };
    const fim = salvarArquivoModelo(new Uint8Array(134), "X", "stl");
    await responder("   ");
    expect(document.getElementById("erro-nome-arquivo").textContent).toBe("Digite o nome do arquivo.");
    expect(document.getElementById("dialogo-nome-arquivo").open).toBe(true);
    document.getElementById("na-cancelar").click();
    await fim;
    expect(window.modelos.gravar).not.toHaveBeenCalled();
  });

  it("peso enviado à calculadora usa o material do rolo selecionado", async () => {
    document.body.innerHTML = readFileSync(join(__dirname, "../src/renderer/index.html"), "utf8").match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "");
    window.dados = { filamentos: { listar: async () => ({ ok: true, dados: [{ id: "rolo", marca: "Sunlu", material: "ABS", cor: "preto", pesoTotalG: 1000, restanteG: 500, precoCentavos: "10000", fechados: 0, posicao: null }] }) } };
    await carregarFilamentos();
    const campo = document.getElementById("rolo-calc");
    campo.innerHTML = '<option value="">Digitar o preço</option><option value="rolo">ABS</option>';
    campo.value = "rolo";
    expect(densidadeDoModelo("PETG")).toBe(1.05);
    calcularCustoModelo({ malhas: [{ nome: "Caneca", volume: 10000 }] }, "Caneca", densidadeDoModelo("PETG"));
    expect(document.getElementById("peso").value).toBe("10,5");
    campo.value = "";
    expect(densidadeDoModelo("PETG")).toBe(1.27);
    expect(densidadeDoModelo()).toBe(1.24);
  });
});

describe("filamento de cada cor = posição do rolo na impressora", () => {
  it("cada cor vai para a posição do rolo daquela cor; sem rolo, para uma posição livre", async () => {
    const { slotsDaImpressora } = await import("../src/renderer/modelos-acoes.js");
    const rolos = [
      { cor: "preto", posicao: 1 },
      { cor: "verde", posicao: 2 },
      { cor: "branco", posicao: 3 },
      { cor: "amarelo", posicao: null },
    ];
    const partes = [
      { nome: "Cor 1", cor: "#1b1b1b" },
      { nome: "Cor 2", cor: "#f4f4f4" },
      { nome: "Cor 3", cor: "#c9a23a" },
    ];
    expect(slotsDaImpressora(partes, rolos).map((p) => p.slot)).toEqual([1, 3, 4]);
  });

  it("sem posições cadastradas fica como estava; slot já escolhido (sem AMS) não muda", async () => {
    const { slotsDaImpressora } = await import("../src/renderer/modelos-acoes.js");
    const partes = [{ cor: "#f4f4f4" }, { cor: "#1b1b1b", slot: 1 }];
    expect(slotsDaImpressora(partes, [{ cor: "branco", posicao: null }])).toEqual(partes);
    expect(slotsDaImpressora(partes, [{ cor: "branco", posicao: 3 }]).map((p) => p.slot)).toEqual([3, 1]);
  });
});
