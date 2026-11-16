// @vitest-environment happy-dom
// Criador de logos: recorte automático, cores-alvo (× e + Cor), correção à mão, borda com fração de
// pixel e o caminho até o 3D.
import { beforeAll, describe, expect, it } from "vitest";
import {
  CORES_LOGO, VAZIO, alvoDaCor, mascaraDeFuros, aplicarCorrecoes, corMaisProxima, coresAutomaticas, coresUsadas, encher, juntarManual,
  limparSerrilhado, mapaPorAlvos, mapaVazio, mascaraDoFundo, pintarDisco, pintarTraco, recorteAutomatico, rgbaDasCorrecoes, svgDoMapa,
} from "../src/renderer/modelos/mapa-logo.js";
import { coresDoSvg, gerarLogo } from "../src/renderer/modelos/logo.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";

const indice = (nome) => CORES_LOGO.findIndex((c) => c.nome === nome);
const nomes = (lista) => lista.map((i) => CORES_LOGO[i].nome).sort();

// Logo de teste 120×100: fundo branco "sujo", losango verde-musgo, círculo branco dentro, barra preta.
// Bordas com meio-tom (anti-serrilhado), como numa imagem de verdade.
function imagemTeste() {
  const w = 120;
  const h = 100;
  const data = new Uint8ClampedArray(w * h * 4);
  const misturar = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let cor = [250, 248, 245];
      const losango = 1 - (Math.abs(x + 0.5 - 50) / 35 + Math.abs(y + 0.5 - 50) / 40); // > 0 dentro
      if (losango > 0) cor = misturar(cor, [70, 110, 60], Math.min(1, losango * 30));
      const circulo = 12 - Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
      if (circulo > 0) cor = misturar(cor, [250, 248, 245], Math.min(1, circulo));
      if (x >= 95 && x < 110 && y >= 20 && y < 80) cor = [20, 20, 25];
      data.set([...cor.map(Math.round), 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

// Círculo preto com borda suave (8×8 amostras por pixel) num fundo branco.
function circulo(w, raio, cx, cy) {
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      let dentro = 0;
      for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) if (Math.hypot(x + (sx + 0.5) / 8 - cx, y + (sy + 0.5) / 8 - cy) < raio) dentro++;
      const v = Math.round(250 - (230 * dentro) / 64);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: w, data };
}

// pontos finais dos trechos do caminho SVG
const pontosDoSvg = (svg) =>
  [...svg.matchAll(/[ML]([\d.-]+) ([\d.-]+)|C[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ ([\d.-]+) ([\d.-]+)/g)].map((m) => (m[1] ? [+m[1], +m[2]] : [+m[3], +m[4]]));

let M;
beforeAll(async () => {
  M = await carregarManifold();
});

describe("criador de logos: cores", () => {
  it("cores da imagem viram as cores prontas mais próximas", () => {
    expect(CORES_LOGO.some((c) => c.nome === "Transparente")).toBe(false);
    expect(CORES_LOGO[corMaisProxima([70, 110, 60])].nome).toBe("Verde");
    expect(CORES_LOGO[corMaisProxima([250, 248, 245])].nome).toBe("Branco");
    expect(CORES_LOGO[corMaisProxima([20, 20, 25])].nome).toBe("Preto");
    expect(CORES_LOGO[corMaisProxima([205, 165, 60])].nome).toBe("Dourado");
  });

  it("acha as cores sozinho, sem os tons de borda", () => {
    const { mapa, alvos } = recorteAutomatico(imagemTeste());
    // o miolo branco fica (não está ligado ao fundo da borda): o branco é cor do logo
    expect(nomes(alvos.map((a) => a.cor))).toEqual(["Branco", "Preto", "Verde"]);
    const em = (x, y) => mapa.idx[y * mapa.largura + x];
    expect(em(2, 2)).toBe(VAZIO);
    expect(em(50, 25)).toBe(indice("Verde"));
    expect(em(100, 50)).toBe(indice("Preto"));
    expect(em(50, 50)).toBe(indice("Branco"));
  });

  it("Remover áreas internas tira também o fundo preso dentro do logo", () => {
    const { mapa, alvos } = recorteAutomatico(imagemTeste(), { areasInternas: true });
    expect(mapa.idx[50 * mapa.largura + 50]).toBe(VAZIO);
    expect(nomes(alvos.map((a) => a.cor))).toEqual(["Preto", "Verde"]);
  });

  it("sem remover o fundo, nada fica vazio", () => {
    const { mapa } = recorteAutomatico(imagemTeste(), { tirarFundo: false });
    expect(mapa.idx.includes(VAZIO)).toBe(false);
  });

  it("× tira a cor (vai para a mais parecida) e + Cor separa os pixels mais perto dela", () => {
    const img = imagemTeste();
    const { vazio, fundo } = mascaraDoFundo(img);
    const alvos = coresAutomaticas(img, vazio, fundo);
    // sem o Verde, o losango vai para a cor restante mais parecida com o verde-musgo
    const semVerde = mapaPorAlvos(img, vazio, alvos.filter((a) => a.cor !== indice("Verde")));
    expect(coresUsadas(semVerde)).not.toContain(indice("Verde"));
    expect(semVerde.idx[25 * 120 + 50]).not.toBe(VAZIO);
    // com só o Preto, + Verde devolve o losango ao verde e a barra continua preta
    const so = alvos.filter((a) => a.cor === indice("Preto"));
    const comVerde = mapaPorAlvos(img, vazio, [...so, alvoDaCor(indice("Verde"))]);
    expect(comVerde.idx[25 * 120 + 50]).toBe(indice("Verde"));
    expect(comVerde.idx[50 * 120 + 100]).toBe(indice("Preto"));
  });

  it("correção à mão não muda quando as cores mudam", () => {
    const img = imagemTeste();
    const { vazio, fundo } = mascaraDoFundo(img);
    const alvos = coresAutomaticas(img, vazio, fundo);
    const auto = mapaPorAlvos(img, vazio, alvos);
    const mapa = { ...auto, idx: auto.idx.slice() };
    const manual = new Uint8Array(mapa.idx.length);
    pintarTraco(mapa, 96, 30, 96, 70, 1, indice("Vermelho"), auto, manual);
    const outro = mapaPorAlvos(img, vazio, alvos.filter((a) => a.cor !== indice("Preto")));
    juntarManual(outro, mapa, manual);
    expect(mapa.idx[50 * 120 + 96]).toBe(indice("Vermelho")); // corrigido: ficou
    expect(mapa.idx[50 * 120 + 104]).not.toBe(indice("Preto")); // automático: seguiu as cores
  });
});

describe("criador de logos: correção à mão", () => {
  it("borracha, restaurar, pincel, varinha e balde marcam a máscara manual", () => {
    const { mapa: origem } = recorteAutomatico(imagemTeste());
    const mapa = { ...origem, idx: origem.idx.slice() };
    const manual = new Uint8Array(mapa.idx.length);
    const em = (x, y) => mapa.idx[y * mapa.largura + x];
    expect(pintarDisco(mapa, 100, 50, 3, VAZIO, origem, manual)).toBe(true); // borracha
    expect(em(100, 50)).toBe(VAZIO);
    expect(manual[50 * 120 + 100]).toBe(1);
    pintarDisco(mapa, 100, 50, 3, "restaurar", origem, manual);
    expect(em(100, 50)).toBe(indice("Preto"));
    expect(manual[50 * 120 + 100]).toBe(0); // restaurar volta ao automático
    pintarTraco(mapa, 96, 30, 96, 70, 1, indice("Vermelho")); // pincel
    expect(em(96, 50)).toBe(indice("Vermelho"));
    expect(encher(mapa, 50, 25, indice("Azul"), manual)).toBe(true); // balde: a região inteira
    expect(em(50, 75)).toBe(indice("Azul"));
    expect(manual[75 * 120 + 50]).toBe(1);
    expect(em(100, 50)).toBe(indice("Preto")); // outra região não muda
    encher(mapa, 100, 50, VAZIO); // varinha
    expect(em(100, 50)).toBe(VAZIO);
    expect(encher(mapa, 500, 500, VAZIO)).toBe(false); // fora da imagem
    for (let y = 0; y < mapa.altura; y++) for (let x = 0; x < mapa.largura; x++) pintarDisco(mapa, x, y, 1, VAZIO);
    expect(mapaVazio(mapa)).toBe(true);
  });

  it("as correções salvas voltam iguais (Meus modelos)", () => {
    const { mapa: auto } = recorteAutomatico(imagemTeste());
    const mapa = { ...auto, idx: auto.idx.slice() };
    const manual = new Uint8Array(mapa.idx.length);
    pintarDisco(mapa, 100, 50, 4, VAZIO, auto, manual);
    pintarDisco(mapa, 30, 50, 3, indice("Rosa"), auto, manual);
    const rgba = rgbaDasCorrecoes(mapa, manual);
    const volta = { ...auto, idx: auto.idx.slice() };
    const manualVolta = new Uint8Array(mapa.idx.length);
    expect(aplicarCorrecoes({ width: 120, height: 100, data: rgba }, volta, manualVolta)).toBe(true);
    expect(volta.idx).toEqual(mapa.idx);
    expect(manualVolta).toEqual(manual);
  });
});

describe("2D para 3D: meio-tom da borda não vira outra cor", () => {
  it("borda suave entre preto e branco (imagem ampliada) não vira dourado", () => {
    // quadrado preto em branco com borda em degradê de 6 pixels (como uma imagem pequena ampliada 4 vezes),
    // e uma faixa dourada de verdade
    const w = 120;
    const h = 80;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const fora = Math.max(20 - x, x - 70, 20 - y, y - 60, 0);
        const v = Math.round(Math.min(1, fora / 6) * 255);
        let c = [v, v, v];
        if (x >= 90 && x < 110 && y >= 20 && y < 60) c = [201, 162, 58];
        data.set([...c, 255], (y * w + x) * 4);
      }
    const img = { width: w, height: h, data };
    const vazio = new Uint8Array(w * h);
    const alvos = [indice("Preto"), indice("Branco"), indice("Dourado")].map(alvoDaCor);
    const mapa = mapaPorAlvos(img, vazio, alvos);
    const dourado = indice("Dourado");
    let fora = 0;
    let dentro = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (mapa.idx[y * w + x] !== dourado) continue;
        if (x >= 90 && x < 110 && y >= 20 && y < 60) dentro++;
        else fora++;
      }
    expect(fora).toBe(0);
    expect(dentro).toBe(20 * 40);
  });
});

describe("2D para 3D: meio-tom com o fundo", () => {
  it("borda suave entre o preto e o fundo branco não vira contorno branco", () => {
    const w = 100;
    const h = 100;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // quadrado preto de 20 a 80, borda em degradê de 6 px para fora; um quadrado branco dentro
        const fora = Math.max(20 - x, x - 80, 20 - y, y - 80, 0);
        let v = Math.round(Math.min(1, fora / 6) * 255);
        if (x >= 40 && x < 60 && y >= 40 && y < 60) v = 250;
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    const img = { width: w, height: h, data };
    const { mapa } = recorteAutomatico(img);
    const branco = indice("Branco");
    let anel = 0;
    let miolo = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (mapa.idx[y * w + x] !== branco) continue;
        if (x >= 40 && x < 60 && y >= 40 && y < 60) miolo++;
        else anel++;
      }
    expect(anel).toBe(0);
    expect(miolo).toBe(400);
  });
});

describe("criador de logos: qualidade da borda", () => {
  it("a borda segue o meio-tom da imagem com fração de pixel", () => {
    const cx = 60.37;
    const cy = 60.21;
    const raio = 40.3;
    const img = circulo(120, raio, cx, cy);
    const { mapa, alvos, fundo } = recorteAutomatico(img);
    const refs = Object.fromEntries(alvos.map((a) => [a.cor, a.ref]));
    const erroMedio = (svg) => {
      const pts = pontosDoSvg(svg);
      return pts.reduce((s, [x, y]) => s + Math.abs(Math.hypot(x - cx, y - cy) - raio), 0) / pts.length;
    };
    const semMeioTom = erroMedio(svgDoMapa(mapa));
    const comMeioTom = erroMedio(svgDoMapa(mapa, { suave: { imagem: img, refs, fundo, manual: null } }));
    expect(comMeioTom).toBeLessThan(0.12);
    // a borda com o fundo já sai pelo meio-tom (limparBordaDoFundo); o "suave" não pode piorar
    expect(comMeioTom).toBeLessThanOrEqual(semMeioTom);
  });

  it("curvas seguem a borda de perto: desvio máximo ao longo das curvas < 0,2 px", () => {
    const cx = 60.37;
    const cy = 60.21;
    const raio = 40.3;
    const img = circulo(120, raio, cx, cy);
    const { mapa, alvos, fundo } = recorteAutomatico(img);
    const refs = Object.fromEntries(alvos.map((a) => [a.cor, a.ref]));
    const svg = svgDoMapa(mapa, { suave: { imagem: img, refs, fundo, manual: null } });
    // pontos no meio de cada curva cúbica (o erro do ajuste aparece ali)
    let atual = null;
    let maior = 0;
    for (const m of svg.matchAll(/M([\d.-]+) ([\d.-]+)|L([\d.-]+) ([\d.-]+)|C([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)) {
      if (m[1]) atual = [+m[1], +m[2]];
      else if (m[3]) atual = [+m[3], +m[4]];
      else {
        const [x1, y1, x2, y2, x3, y3] = m.slice(5, 11).map(Number);
        for (const t of [0.25, 0.5, 0.75]) {
          const u = 1 - t;
          const x = u * u * u * atual[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
          const y = u * u * u * atual[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
          maior = Math.max(maior, Math.abs(Math.hypot(x - cx, y - cy) - raio));
        }
        atual = [x3, y3];
      }
    }
    expect(maior).toBeLessThan(0.2);
  });

  it("contorno de 1 pixel de outra cor some; manchas de verdade ficam", () => {
    const w = 20;
    const h = 20;
    const idx = new Int8Array(w * h).fill(VAZIO);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 12; x++) idx[y * w + x] = 1; // barra preta
    for (let y = 5; y < 15; y++) idx[y * w + 12] = 2; // fiapo cinza na borda
    for (let y = 1; y < 4; y++) for (let x = 15; x < 19; x++) idx[y * w + x] = 2; // mancha cinza de 3×4
    limparSerrilhado(idx, w, h);
    expect(idx[10 * w + 12]).not.toBe(2);
    expect(idx[2 * w + 16]).toBe(2);
    expect(idx[10 * w + 8]).toBe(1);
  });
});

describe("criador de logos: peça", () => {
  it("o que foi apagado dentro do logo vira furo na base (não fica tapado pela base)", () => {
    const img = imagemTeste();
    const { mapa: auto, vazio } = recorteAutomatico(img);
    const mapa = { ...auto, idx: auto.idx.slice() };
    const manual = new Uint8Array(mapa.idx.length);
    pintarDisco(mapa, 50, 50, 8, VAZIO, auto, manual); // apaga o miolo branco do losango
    const furos = mascaraDeFuros(mapa, vazio, manual);
    expect(furos[50 * 120 + 50]).toBe(1);
    expect(furos[2 * 120 + 2]).toBe(0); // fundo de fora não é furo
    const cores = coresDoSvg(svgDoMapa(mapa, { furos }), { juntar: false });
    const peca = gerarLogo(M, cores, { largura: 50, comArgola: false });
    expect(peca.cores).not.toContain("#ff00ff");
    expect(peca.malhas).toHaveLength(1 + peca.cores.length);
    // a base ganhou um furo: um laço a mais que a peça sem o furo
    const sem = gerarLogo(M, coresDoSvg(svgDoMapa(mapa), { juntar: false }), { largura: 50, comArgola: false });
    expect(peca.camadas[0].lacos.length).toBe(sem.camadas[0].lacos.length + 1);
    // sem nada apagado e sem áreas internas, não há furos
    expect(mascaraDeFuros(auto, vazio, new Uint8Array(mapa.idx.length))).toBeNull();
    // "Remover áreas internas": o miolo branco vira furo
    const internas = recorteAutomatico(img, { areasInternas: true });
    expect(mascaraDeFuros(internas.mapa, internas.vazio, null)[50 * 120 + 50]).toBe(1);
  });

  it("argola automática: se o topo é uma ponta fina, procura outro ponto da borda", () => {
    // quadrado com uma ponta fina saindo do meio de cima (onde a argola iria)
    const quadrado = [[0, 0], [100, 0], [100, 100], [52, 100], [50, 140], [48, 100], [0, 100]];
    const cores = [{ cor: "#1b1b1b", formas: [[quadrado]] }];
    const peca = gerarLogo(M, cores, { largura: 50 });
    expect(peca.argola).not.toBeNull();
    expect(peca.dimensoes[0]).toBeCloseTo(50, 0);
    // posição escolhida à mão continua valendo (e dá o erro de antes se não couber)
    expect(() => gerarLogo(M, cores, { largura: 50, argola: peca.argola.t })).not.toThrow();
  });

  it("mapa → SVG → peça 3D, com e sem argola, e o caminho de volta (mm → pixel)", () => {
    const img = imagemTeste();
    const { mapa, alvos, fundo } = recorteAutomatico(img, { areasInternas: true });
    const refs = Object.fromEntries(alvos.map((a) => [a.cor, a.ref]));
    const cores = coresDoSvg(svgDoMapa(mapa, { suave: { imagem: img, refs, fundo, manual: null } }), { juntar: false });
    expect(cores.map((c) => c.cor).sort()).toEqual([CORES_LOGO[indice("Preto")].hex, CORES_LOGO[indice("Verde")].hex].sort());
    const com = gerarLogo(M, cores, { largura: 50 });
    expect(com.argola).not.toBeNull();
    expect(com.malhas[0].nome).toBe("Base e argola");
    expect(com.dimensoes[0]).toBeCloseTo(50, 0);
    const sem = gerarLogo(M, cores, { largura: 50, comArgola: false });
    expect(sem.argola).toBeNull();
    expect(sem.perimetro).toBeNull();
    expect(sem.malhas[0].nome).toBe("Base");
    expect(sem.malhas).toHaveLength(3);
    // o meio da barra preta (pixel 102,50) na peça e de volta
    const k = cores.quadro.escala * sem.escalaArte;
    const mm = [(102.5 - cores.quadro.minX) * k, (cores.quadro.maxY - 50.5) * k];
    const volta = [mm[0] / k + cores.quadro.minX, cores.quadro.maxY - mm[1] / k];
    expect(volta[0]).toBeCloseTo(102.5, 6);
    expect(volta[1]).toBeCloseTo(50.5, 6);
    const preta = sem.camadas.find((c) => c.cor === CORES_LOGO[indice("Preto")].hex);
    const caixa = preta.lacos.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], y), Math.max(b[3], y)], [Infinity, -Infinity, Infinity, -Infinity]);
    expect(mm[0]).toBeGreaterThan(caixa[0]);
    expect(mm[0]).toBeLessThan(caixa[1]);
    expect(mm[1]).toBeGreaterThan(caixa[2]);
    expect(mm[1]).toBeLessThan(caixa[3]);
  });
});

describe("2D para 3D: cores intermediárias de verdade continuam", () => {
  const cinza = (v) => [v, v, v];
  function imagem(desenho, w = 120, h = 100) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...desenho(x, y), 255], (y * w + x) * 4);
    return { width: w, height: h, data };
  }
  const contar = (mapa, cor) => mapa.idx.reduce((n, v) => n + (v === cor ? 1 : 0), 0);

  it("cinza encostado no fundo branco não é apagado como meio-tom", () => {
    // bloco preto, linha cinza de 3 px e bloco cinza, tudo em fundo branco
    const img = imagem((x, y) => {
      if (y < 20 || y >= 80) return cinza(255);
      if (x >= 10 && x < 50) return cinza(17);
      if (x >= 50 && x < 53) return cinza(160);
      if (x >= 70 && x < 110) return cinza(160);
      return cinza(255);
    });
    const vazio = new Uint8Array(120 * 100);
    for (let p = 0; p < vazio.length; p++) if (img.data[p * 4] === 255) vazio[p] = 1;
    const alvos = [indice("Preto"), indice("Branco")].map(alvoDaCor).concat([{ cor: indice("Cinza"), ref: [160, 160, 160] }]);
    const mapa = mapaPorAlvos(img, vazio, alvos, [255, 255, 255]);
    expect(contar(mapa, indice("Cinza"))).toBeGreaterThanOrEqual(60 * 43 - 60);
  });

  it("cinza com ruído não vira pontos pretos e brancos", () => {
    const img = imagem((x, y) => cinza(128 + ((x + y) % 2 ? 25 : -25)));
    const vazio = new Uint8Array(120 * 100);
    const alvos = [indice("Preto"), indice("Branco")].map(alvoDaCor).concat([{ cor: indice("Cinza"), ref: [128, 128, 128] }]);
    const mapa = mapaPorAlvos(img, vazio, alvos);
    expect(contar(mapa, indice("Cinza"))).toBe(120 * 100);
  });
});
