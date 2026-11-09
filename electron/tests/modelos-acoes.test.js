// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { carregarFilamentos } from "../src/renderer/filamentos-tela.js";
import { arquivoDeTexto, calcularCustoModelo, densidadeDoModelo, imagemComoTexto, mudarPrevia, salvarArquivoModelo, salvarModeloComo } from "../src/renderer/modelos-acoes.js";

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

  it("peso enviado à calculadora usa o material do rolo selecionado", async () => {
    document.body.innerHTML = readFileSync(join(__dirname, "../src/renderer/index.html"), "utf8").match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "");
    window.dados = { filamentos: { listar: async () => ({ ok: true, dados: [{ id: "rolo", material: "ABS", cor: "Preto", corHex: "#000000", marca: "", observacoes: "", pesoTotalG: 1000, restanteG: 500, precoKgCentavos: "10000" }] }) } };
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
