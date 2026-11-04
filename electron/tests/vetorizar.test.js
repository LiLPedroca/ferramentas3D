import { describe, expect, it } from "vitest";
import { vetorizar } from "../src/renderer/vetorizar.js";

// 40×40: fundo branco, quadrado vermelho no meio e um círculo azul.
function imagemExemplo() {
  const width = 40;
  const height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let cor = [255, 255, 255];
      if (x >= 8 && x < 20 && y >= 8 && y < 20) cor = [220, 30, 30];
      if ((x - 28) ** 2 + (y - 28) ** 2 < 36) cor = [30, 60, 220];
      data.set([...cor, 255], i);
    }
  }
  return { width, height, data };
}

describe("vetorizar", () => {
  it("gera um SVG com viewBox e caminhos", () => {
    const r = vetorizar(imagemExemplo(), { modo: "cores", cores: 4, detalhe: "alto" });
    expect(r.svg).toMatch(/^<svg/);
    expect(r.svg).toContain("viewBox");
    expect(r.caminhos).toBeGreaterThan(0);
  });

  it("remover fundo tira a camada branca", () => {
    const com = vetorizar(imagemExemplo(), { modo: "cores", cores: 4, detalhe: "alto" });
    const sem = vetorizar(imagemExemplo(), { modo: "cores", cores: 4, detalhe: "alto", removerFundo: true });
    expect(sem.cores).toBe(com.cores - 1);
    expect(sem.svg).not.toMatch(/fill="rgb\(25[0-5],25[0-5],25[0-5]\)"/);
  });

  it("remover fundo tira também tons quase iguais ao fundo (borda serrilhada)", () => {
    const img = imagemExemplo();
    // metade do fundo levemente acinzentada: a quantização cria dois "brancos"
    for (let y = 0; y < img.height; y++) {
      for (let x = 20; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (img.data[i] === 255 && img.data[i + 1] === 255) img.data.set([238, 238, 238], i);
      }
    }
    const r = vetorizar(img, { modo: "cores", cores: 8, detalhe: "alto", removerFundo: true });
    expect(r.svg).not.toMatch(/fill="rgb\((2[3-5]\d),(2[3-5]\d),(2[3-5]\d)\)"/);
    expect(r.cores).toBeGreaterThanOrEqual(2); // vermelho e azul continuam
  });

  it("silhueta: só formas escuras, sem o branco", () => {
    const r = vetorizar(imagemExemplo(), { modo: "silhueta", detalhe: "medio" });
    expect(r.cores).toBe(1);
    expect(r.svg).toContain("rgb(0,0,0)");
    expect(r.svg).not.toContain("rgb(255,255,255)");
  });
});
