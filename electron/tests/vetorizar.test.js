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

// ---------- Fidelidade (formas com serrilhado exato, 8×8 amostras por pixel) ----------
function desenhar(w, h, formas) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = [0, 0, 0];
      for (let sy = 0; sy < 8; sy++) {
        for (let sx = 0; sx < 8; sx++) {
          const px = x + (sx + 0.5) / 8;
          const py = y + (sy + 0.5) / 8;
          let c = [255, 255, 255];
          for (const f of formas) if (f.dentro(px, py)) c = f.cor;
          for (let k = 0; k < 3; k++) s[k] += c[k];
        }
      }
      data.set([s[0] / 64, s[1] / 64, s[2] / 64, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}
const bez = (c, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k]);
};
const pontosDa = (camada) => camada.curvas.flat().flatMap((c) => Array.from({ length: 9 }, (_, i) => bez(c, i / 8)));

describe("fidelidade do vetor", () => {
  it("círculo: contorno a menos de 0,2 px da forma real (detalhe alto)", () => {
    const cx = 60.3;
    const cy = 57.7;
    const r = 40;
    const img = desenhar(120, 120, [{ cor: [200, 30, 30], dentro: (x, y) => Math.hypot(x - cx, y - cy) < r }]);
    const v = vetorizar(img, { modo: "cores", cores: 2, detalhe: "alto", removerFundo: true });
    const erros = pontosDa(v.camadas[0]).map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r));
    expect(Math.max(...erros)).toBeLessThan(0.2);
  });

  it("quadrado girado: cantos vivos no lugar (menos de 0,2 px)", () => {
    const ang = (20 * Math.PI) / 180;
    const c = [60.2, 60.6];
    const L = 34;
    const local = (x, y) => [(x - c[0]) * Math.cos(ang) + (y - c[1]) * Math.sin(ang), -(x - c[0]) * Math.sin(ang) + (y - c[1]) * Math.cos(ang)];
    const img = desenhar(120, 120, [{ cor: [30, 60, 200], dentro: (x, y) => local(x, y).every((v) => Math.abs(v) < L) }]);
    const v = vetorizar(img, { modo: "cores", cores: 2, detalhe: "alto", removerFundo: true });
    const pts = pontosDa(v.camadas[0]);
    const cantos = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [c[0] + L * (a * Math.cos(ang) - b * Math.sin(ang)), c[1] + L * (a * Math.sin(ang) + b * Math.cos(ang))]);
    for (const k of cantos) expect(Math.min(...pts.map((p) => Math.hypot(p[0] - k[0], p[1] - k[1])))).toBeLessThan(0.2);
    expect(Math.max(...pts.map(([x, y]) => Math.abs(Math.max(...local(x, y).map(Math.abs)) - L)))).toBeLessThan(0.2);
  });

  it("pixel art: retângulo exato, com retas", () => {
    const w = 40;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(x >= 5 && x < 25 && y >= 4 && y < 20 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * w + x) * 4);
    const v = vetorizar({ width: w, height: h, data }, { modo: "cores", cores: 2, detalhe: "alto", removerFundo: true });
    expect(v.svg).toContain('d="M5 4L25 4L25 20L5 20L5 4Z"');
  });

  it("camadas empilhadas: a cor de baixo cobre também a de cima (sem frestas entre cores)", () => {
    // disco metade vermelho, metade azul: a camada de baixo deve ser o disco inteiro
    const cx = 50;
    const cy = 50;
    const r = 35;
    const img = desenhar(100, 100, [
      { cor: [200, 30, 30], dentro: (x, y) => Math.hypot(x - cx, y - cy) < r },
      { cor: [30, 60, 200], dentro: (x, y) => Math.hypot(x - cx, y - cy) < r && x > cx },
    ]);
    const v = vetorizar(img, { modo: "cores", cores: 3, detalhe: "alto", removerFundo: true });
    expect(v.camadas).toHaveLength(2);
    const erros = pontosDa(v.camadas[0]).map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r));
    // o pior ponto é onde as três cores se encontram (branco, vermelho e azul no mesmo pixel)
    expect(Math.max(...erros)).toBeLessThan(0.5);
    expect(erros.reduce((a, b) => a + b, 0) / erros.length).toBeLessThan(0.15);
  });

  it("imagem grande com ruído termina rápido", () => {
    const w = 600;
    const h = 600;
    const data = new Uint8ClampedArray(w * h * 4);
    let s = 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([x / 3 + rnd() * 30, y / 3 + rnd() * 30, 128 + rnd() * 30, 255], (y * w + x) * 4);
    const t = performance.now();
    const v = vetorizar({ width: w, height: h, data }, { modo: "cores", cores: 8, detalhe: "medio", suavizar: true });
    expect(v.cores).toBeGreaterThan(3);
    expect(performance.now() - t).toBeLessThan(8000);
  }, 20000);
});
