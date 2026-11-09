import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import { beforeAll, describe, expect, it } from "vitest";
import { capacidadeMl, COPO_SHOWROOM, gerarCaneca, PADRAO_CANECA, regioesDeCor, trocasDeCor, validarOpcoesCaneca } from "../src/renderer/modelos/caneca.js";
import { lacosDoEmblema } from "../src/renderer/modelos/emblema.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";

const b = readFileSync(join(__dirname, "..", "src", "renderer", "assets", "fontes", "BebasNeue-Regular.ttf"));
const fonte = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

// emblema de teste: disco escuro com um quadrado claro no meio, em fundo branco ou transparente
function imagem({ transparente = false } = {}) {
  const w = 120;
  const h = 120;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dentro = Math.hypot(x - 60, y - 60) < 50;
      const furo = Math.abs(x - 60) < 15 && Math.abs(y - 60) < 15;
      const escuro = dentro && !furo;
      data[i] = data[i + 1] = data[i + 2] = escuro ? 20 : 250;
      data[i + 3] = transparente && !dentro ? 0 : 255;
    }
  }
  return { width: w, height: h, data };
}

let M;
beforeAll(async () => {
  M = await carregarManifold();
});

function fechada({ vertices, triangulos }) {
  const arestas = new Map();
  for (let i = 0; i < triangulos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangulos[i + k];
      const c = triangulos[i + ((k + 1) % 3)];
      const chave = a < c ? `${a}-${c}` : `${c}-${a}`;
      const e = arestas.get(chave) ?? [0, 0];
      e[0]++;
      e[1] += a < c ? 1 : -1;
      arestas.set(chave, e);
    }
  }
  return [...arestas.values()].every(([n, s]) => n === 2 && s === 0);
}

const caixa = (malhas) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of malhas) {
    for (let i = 0; i < m.vertices.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], m.vertices[i + k]);
        max[k] = Math.max(max[k], m.vertices[i + k]);
      }
    }
  }
  return { min, max };
};

describe("caneca de chopp", () => {
  it("usa a boca interna e a altura do copo showroom como padrão", () => {
    const o = validarOpcoesCaneca({});
    expect(COPO_SHOWROOM).toEqual({ boca: 81.4, altura: 123 });
    expect(o.boca).toBe(81.4);
    expect(o.altura).toBe(123);
    // cilindro de 40,7 mm de raio por 120 mm (sem o fundo), menos o canto arredondado
    expect(capacidadeMl({})).toBeGreaterThan(615);
    expect(capacidadeMl({})).toBeLessThan(625);
  });

  it("aceita medidas manuais e recusa as fora do limite", () => {
    expect(validarOpcoesCaneca({ boca: "70,5", altura: 140 }).boca).toBe(70.5);
    expect(() => validarOpcoesCaneca({ boca: 20 })).toThrow(/boca/);
    expect(() => validarOpcoesCaneca({ altura: 50 })).toThrow(/Altura/);
    expect(() => validarOpcoesCaneca({ letra: 14 })).toThrow(/letras/);
    expect(() => validarOpcoesCaneca({ altura: 60, faixa: 14 })).toThrow(/baixa/);
  });

  it("cores por altura: faixas, corpo e borda lisa, com as trocas para imprimir sem AMS", () => {
    const regioes = regioesDeCor({});
    expect(regioes.map((r) => r.cor)).toEqual(["segunda", "principal", "segunda", "principal", "segunda", "principal"]);
    expect(regioes[0]).toMatchObject({ z0: 0, z1: 14 });
    expect(regioes[5]).toMatchObject({ z0: 120, z1: 123 });
    const trocas = trocasDeCor({}, 0.2, 0.2);
    expect(trocas).toHaveLength(5);
    // primeira camada acima de 14 mm: 14,2 mm, camada 71
    expect(trocas[0]).toMatchObject({ z: 14.2, numero: 71, cor: "principal" });
    // faixas vizinhas da mesma cor não pedem troca
    const iguais = { corFaixa: { cima: "segunda", f1: "segunda", f2: "segunda", f3: "segunda" } };
    expect(regioesDeCor(iguais).map((r) => r.cor)).toEqual(["segunda", "principal", "segunda", "principal"]);
  });

  it("gera caneca e emblema fechados, com a boca interna e a altura pedidas", () => {
    const r = gerarCaneca(M, fonte, lacosDoEmblema(imagem()), {});
    expect(r.malhas.map((m) => m.nome)).toEqual(["Caneca — cor principal", "Caneca — 2ª cor", "Emblema — base", "Emblema — desenho"]);
    for (const m of r.malhas) expect(fechada(m)).toBe(true);
    const caneca = r.malhas.filter((m) => m.peca === "caneca");
    const c = caixa(caneca);
    expect(c.min[2]).toBeCloseTo(0, 3);
    expect(c.max[2]).toBeCloseTo(123, 3);
    // menor raio perto da boca (entre 110 e 121 mm de altura) = raio interno
    let menor = Infinity;
    for (const m of caneca) {
      for (let i = 0; i < m.vertices.length; i += 3) {
        const z = m.vertices[i + 2];
        if (z > 110 && z < 121) menor = Math.min(menor, Math.hypot(m.vertices[i], m.vertices[i + 1]));
      }
    }
    expect(menor).toBeGreaterThan(40.6);
    expect(menor).toBeLessThan(40.71);
    // alça do lado esquerdo
    expect(c.min[0]).toBeLessThan(-70);
    // emblema deitado à direita, com o tamanho pedido
    const e = caixa(r.malhas.filter((m) => m.peca === "emblema"));
    expect(e.max[0] - e.min[0]).toBeCloseTo(50, 0);
    expect(e.min[0]).toBeGreaterThan(c.max[0]);
    expect(e.max[2]).toBeCloseTo(2.4, 3);
  }, 60000);

  it("muda as medidas à mão: boca e altura novas", () => {
    const r = gerarCaneca(M, fonte, null, { boca: 70, altura: 110, alca: false, textura: false });
    const c = caixa(r.malhas);
    expect(c.max[2]).toBeCloseTo(110, 3);
    expect(r.malhas.every((m) => m.peca === "caneca")).toBe(true);
  }, 60000);

  it("avisa quando o texto não cabe na faixa", () => {
    expect(() =>
      gerarCaneca(M, fonte, null, { letra: 12, textos: { ...PADRAO_CANECA.textos, f2Frente: "WWWWWWWWWWWWWWWWWWWWWWWWW" } }),
    ).toThrow(/não cabe/);
  }, 60000);

  it("emblema: escuro vira desenho; PNG transparente dá o contorno", () => {
    const branco = lacosDoEmblema(imagem());
    expect(branco.silhueta).toBeNull();
    expect(branco.desenho.length).toBe(2); // disco e o furo quadrado
    expect(lacosDoEmblema(imagem({ transparente: true })).silhueta.length).toBeGreaterThan(0);
    expect(() => lacosDoEmblema(imagem(), { limiar: 0.05 })).toThrow(/parte escura/);
  });
});
