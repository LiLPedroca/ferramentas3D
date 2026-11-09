// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { arquivoDeTexto, imagemComoTexto, mudarPrevia, salvarArquivoModelo, salvarModeloComo } from "../src/renderer/modelos-acoes.js";

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

  it("cancelar a pergunta de impressão não salva arquivo", async () => {
    const salvos = [];
    window.modelos = { salvar: async (...args) => { salvos.push(args); return { ok: true, dados: null }; } };
    await salvarModeloComo("3mf", [{}], "Peça", async () => null);
    expect(salvos).toEqual([]);
  });

  it("encaminha os bytes e o nome do arquivo sem modificar o conteúdo", async () => {
    const salvos = [];
    window.modelos = { salvar: async (...args) => { salvos.push(args); return { ok: true, dados: null }; } };
    await salvarArquivoModelo(new Uint8Array([1, 2, 3]), "Peça com acento", "3mf");
    expect(salvos).toEqual([[new Uint8Array([1, 2, 3]), "Peça com acento", "3mf"]]);
  });
});
