// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { coresDoSvg } from "../src/renderer/modelos/logo.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";
import { gerarRelevo, PADRAO_RELEVO, trocasDoRelevo, validarOpcoesRelevo } from "../src/renderer/modelos/relevo.js";

// SVG real gerado pelo Conversor SVG (logo de teste: círculo azul, triângulo laranja, "3D" vazado).
const svg = readFileSync(join(__dirname, "dados", "logo-teste.svg"), "utf8");

let M;
let cores;
beforeAll(async () => {
  M = await carregarManifold();
  cores = coresDoSvg(svg);
});

// toda aresta em dois triângulos, uma vez em cada sentido, e volume positivo
function fechada({ vertices, triangulos }) {
  const arestas = new Map();
  let volume = 0;
  for (let i = 0; i < triangulos.length; i += 3) {
    const t = [triangulos[i], triangulos[i + 1], triangulos[i + 2]];
    for (let k = 0; k < 3; k++) {
      const a = t[k];
      const b = t[(k + 1) % 3];
      const chave = a < b ? `${a}-${b}` : `${b}-${a}`;
      const e = arestas.get(chave) ?? [0, 0];
      e[0]++;
      e[1] += a < b ? 1 : -1;
      arestas.set(chave, e);
    }
    const [p, q, r] = t.map((k) => [vertices[k * 3], vertices[k * 3 + 1], vertices[k * 3 + 2]]);
    volume += (p[0] * (q[1] * r[2] - q[2] * r[1]) + p[1] * (q[2] * r[0] - q[0] * r[2]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
  }
  return [...arestas.values()].every(([n, s]) => n === 2 && s === 0) && volume > 0;
}

const secao = (p) => new M.CrossSection(p.lacos, "EvenOdd");

function areaDaUniao(r) {
  const s = r.partes.map(secao);
  const u = M.CrossSection.union(s);
  const a = u.area();
  u.delete();
  s.forEach((x) => x.delete());
  return a;
}

function areaDasIntersecoes(r) {
  const s = r.partes.map(secao);
  let total = 0;
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) {
      const x = s[i].intersect(s[j]);
      total += x.area();
      x.delete();
    }
  s.forEach((x) => x.delete());
  return total;
}

const zMin = ({ vertices }) => {
  let m = Infinity;
  for (let i = 2; i < vertices.length; i += 3) m = Math.min(m, vertices[i]);
  return m;
};

// arte de 100 de largura, Y para cima: quadrado grande preto, quadradinho vermelho colado nele (1 mm²
// na peça de 100 mm) e outro vermelho solto, longe.
const quadrado = (x, y, l) => [[x, y], [x + l, y], [x + l, y + l], [x, y + l]];
const comIlhas = [
  { cor: "#111111", formas: [[quadrado(0, 0, 80)]] },
  { cor: "#e53935", formas: [[quadrado(80, 10, 1)], [quadrado(99, 99, 1)], [quadrado(85, 40, 10)]] },
];

describe("2D para 3D: peça sem base", () => {
  it("padrões do desenho: 100 mm de largura, 3 mm de altura, sem argola", () => {
    expect(PADRAO_RELEVO).toMatchObject({ largura: 100, altura: 3, chaveiro: "nenhum" });
  });

  it("partes formam partição exata: soma das áreas = área da união, sem sobreposição", () => {
    const r = gerarRelevo(M, cores, { largura: 100 });
    const soma = r.partes.reduce((s, p) => s + p.area, 0);
    expect(soma).toBeCloseTo(areaDaUniao(r), 1);
    expect(areaDasIntersecoes(r)).toBeLessThan(0.01);
  });

  it("cada malha é fechada; a cor de maior área é a base (de z=0) e as outras só no topo (0,6 mm)", () => {
    const r = gerarRelevo(M, cores, {});
    expect(r.malhas.length).toBe(new Set(r.partes.map((p) => p.cor)).size);
    const area = new Map();
    for (const p of r.partes) area.set(p.cor, (area.get(p.cor) ?? 0) + p.area);
    const base = [...area].sort((a, b) => b[1] - a[1])[0][0];
    expect(r.malhas[0].cor).toBe(base);
    for (const m of r.malhas) {
      expect(fechada(m), m.nome).toBe(true);
      expect(zMin(m), m.nome).toBeCloseTo(m.cor === base ? 0 : 3 - 0.6, 5);
    }
  });

  it("volume: a base sobe por baixo de todas as partes; as outras cores têm só 0,6 mm", () => {
    const r = gerarRelevo(M, cores, {});
    const volume = ({ vertices, triangulos }) => {
      let v = 0;
      for (let i = 0; i < triangulos.length; i += 3) {
        const [p, q, s] = [0, 1, 2].map((k) => [0, 1, 2].map((e) => vertices[triangulos[i + k] * 3 + e]));
        v += (p[0] * (q[1] * s[2] - q[2] * s[1]) + p[1] * (q[2] * s[0] - q[0] * s[2]) + p[2] * (q[0] * s[1] - q[1] * s[0])) / 6;
      }
      return v;
    };
    const base = r.malhas[0].cor;
    const areaBase = r.partes.filter((p) => p.cor === base).reduce((s, p) => s + p.area, 0);
    const areaOutras = r.partes.filter((p) => p.cor !== base).reduce((s, p) => s + p.area, 0);
    expect(volume(r.malhas[0])).toBeCloseTo(areaBase * 3 + areaOutras * 2.4, 0);
    const outras = r.malhas.slice(1).reduce((s, m) => s + volume(m), 0);
    expect(outras).toBeCloseTo(areaOutras * 0.6, 0);
  });

  it("parte mais alta de outra cor: base até a altura dela − 0,6", () => {
    const r0 = gerarRelevo(M, cores, {});
    const base = r0.malhas[0].cor;
    const outra = r0.partes.find((p) => p.cor !== base);
    const r = gerarRelevo(M, cores, {}, [{ ponto: outra.ponto, altura: 6 }]);
    const malha = r.malhas.find((m) => m.cor === outra.cor);
    let zMax = -Infinity;
    for (let i = 2; i < malha.vertices.length; i += 3) zMax = Math.max(zMax, malha.vertices[i]);
    expect(zMax).toBeCloseTo(6, 5);
    expect(fechada(r.malhas[0])).toBe(true);
  });

  it("altura padrão 3 mm; escolha muda só a parte do ponto", () => {
    const r0 = gerarRelevo(M, cores, {});
    const alvo = r0.partes[0];
    const r = gerarRelevo(M, cores, {}, [{ ponto: alvo.ponto, altura: 7.4 }]);
    expect(r.partes.find((p) => p.id === alvo.id).altura).toBe(7.4);
    expect(r.partes.filter((p) => p.id !== alvo.id).every((p) => p.altura === 3)).toBe(true);
    expect(r.dimensoes[2]).toBeCloseTo(7.4, 5);
  });

  it("escolha de cor muda só aquela parte", () => {
    const r0 = gerarRelevo(M, cores, {});
    const alvo = r0.partes[0];
    const r = gerarRelevo(M, cores, {}, [{ ponto: alvo.ponto, cor: "#e53935" }]);
    expect(r.partes.find((p) => p.id === alvo.id).cor).toBe("#e53935");
    for (const p of r.partes.filter((q) => q.id !== alvo.id)) expect(p.cor).toBe(r0.partes.find((q) => q.id === p.id).cor);
    expect(r.malhas.some((m) => m.cor === "#e53935")).toBe(true);
  });

  it("ponto fora de qualquer parte é ignorado sem erro", () => {
    const r = gerarRelevo(M, cores, {}, [{ ponto: [-50, -50], altura: 9 }]);
    expect(r.partes.every((p) => p.altura === 3)).toBe(true);
  });

  it("ilha menor que 1,5 mm² some ou vira a vizinha", () => {
    const r = gerarRelevo(M, comIlhas, { largura: 100 });
    // o quadradinho colado vira preto; o solto some; sobram o preto e o vermelho de 10 × 10
    expect(r.partes).toHaveLength(2);
    expect(r.partes.every((p) => p.area >= 1.5)).toBe(true);
    const preto = r.partes.find((p) => p.cor === "#111111");
    expect(preto.area).toBeCloseTo(6401 * (100 / 95) ** 2, 0);
  });

  it("largura pedida é respeitada (±0,05 mm)", () => {
    for (const largura of [40, 100, 180]) expect(gerarRelevo(M, cores, { largura }).dimensoes[0]).toBeCloseTo(largura, 1);
  });

  it("altura fora de 2 a 10 dá erro em pt-BR", () => {
    expect(() => validarOpcoesRelevo({ altura: 12 })).toThrow("Altura");
    expect(() => validarOpcoesRelevo({ altura: 1 })).toThrow("Altura");
  });

  it("arte vazia dá erro em pt-BR", () => {
    expect(() => gerarRelevo(M, [], {})).toThrow(/vazia/);
  });

  it("com argola: argola na malha da cor que encosta, peça fechada e largura total certa", () => {
    const r = gerarRelevo(M, cores, { comArgola: true, largura: 60 });
    expect(r.argola).not.toBeNull();
    expect(r.dimensoes[0]).toBeCloseTo(60, 1);
    for (const m of r.malhas) expect(fechada(m), m.nome).toBe(true);
    const sem = gerarRelevo(M, cores, { largura: 60 });
    expect(r.malhas.length).toBe(sem.malhas.length);
  });
});

describe("2D para 3D: degraus por cor sem AMS", () => {
  it("uma faixa por cor, empilhadas de 1 em 1 mm, cor de maior área embaixo", () => {
    const comum = gerarRelevo(M, cores, {});
    const areas = new Map();
    for (const p of comum.partes) areas.set(p.cor, (areas.get(p.cor) ?? 0) + p.area);
    const maior = [...areas].sort((a, b) => b[1] - a[1])[0][0];
    const r = gerarRelevo(M, cores, { semAms: true });
    expect(r.faixas).toHaveLength(areas.size);
    expect(r.faixas.map((f) => [f.de, f.ate])).toEqual(r.faixas.map((_, k) => [k ? 3 + (k - 1) : 0, 3 + k]));
    expect(r.faixas[0].cor).toBe(maior);
    expect(r.malhas.map((m) => m.cor)).toEqual(r.faixas.map((f) => f.cor));
    expect(r.dimensoes[2]).toBeCloseTo(3 + areas.size - 1, 5);
  });

  it("ordem escolhida é respeitada", () => {
    const comum = gerarRelevo(M, cores, {});
    const ordem = [...new Set(comum.partes.map((p) => p.cor))].reverse();
    const r = gerarRelevo(M, cores, { semAms: true, ordem });
    expect(r.faixas.map((f) => f.cor)).toEqual(ordem);
  });

  it("trocas na primeira camada de cada faixa", () => {
    const faixas = [{ cor: "#111111", de: 0, ate: 3 }, { cor: "#ffffff", de: 3, ate: 4 }, { cor: "#ffd600", de: 4, ate: 5 }];
    expect(trocasDoRelevo(faixas, 0.2, 0.2)).toEqual([{ z: 3.2, numero: 16 }, { z: 4.2, numero: 21 }]);
  });

  it("malhas fechadas e começando onde a faixa começa", () => {
    const r = gerarRelevo(M, cores, { semAms: true });
    r.malhas.forEach((m, k) => {
      expect(fechada(m), m.nome).toBe(true);
      expect(zMin(m)).toBeCloseTo(r.faixas[k].de, 5);
    });
  });
});


describe("2D para 3D: escolhas e cache", () => {
  it("escolha feita numa parte de outra cor (a parte sumiu e virou vizinha) é ignorada", () => {
    const r0 = gerarRelevo(M, cores, {});
    const alvo = r0.partes[0];
    const outra = r0.partes.find((p) => p.cor !== alvo.corOriginal).corOriginal;
    const r = gerarRelevo(M, cores, {}, [{ ponto: alvo.ponto, altura: 8, corOriginal: outra }]);
    expect(r.partes.find((p) => p.id === alvo.id).altura).toBe(3);
    expect(gerarRelevo(M, cores, {}, [{ ponto: alvo.ponto, altura: 8, corOriginal: alvo.corOriginal }]).partes.find((p) => p.id === alvo.id).altura).toBe(8);
  });

  it("argola que não cabe: a falha fica guardada e não refaz a divisão a cada mudança", async () => {
    const { estatisticasRelevo } = await import("../src/renderer/modelos/relevo.js");
    // furo grande demais para a parede da arte fina: a argola não cabe em lugar nenhum
    const fino = [{ cor: "#111111", formas: [[[[0, 0], [100, 0], [100, 0.8], [0, 0.8]]]] }];
    expect(() => gerarRelevo(M, fino, { comArgola: true, largura: 100, furo: 8 })).toThrow();
    const antes = estatisticasRelevo.particoes;
    expect(() => gerarRelevo(M, fino, { comArgola: true, largura: 100, furo: 8 }, [{ ponto: [50, 0.4], altura: 5 }])).toThrow();
    expect(estatisticasRelevo.particoes).toBe(antes);
  });
});

describe("2D para 3D: relevo por cor", () => {
  it("cor com relevo sobe N camadas de 0,2 mm; as outras não mudam", () => {
    const r0 = gerarRelevo(M, cores, {});
    const cor = r0.partes[0].cor;
    const r = gerarRelevo(M, cores, { relevos: { [cor]: 2 } });
    for (const p of r.partes) expect(p.altura).toBeCloseTo(p.cor === cor ? 3.4 : 3, 6);
    expect(r.dimensoes[2]).toBeCloseTo(3.4, 6);
    for (const m of r.malhas) expect(fechada(m), m.nome).toBe(true);
  });

  it("relevo fora de 0 a 10 camadas dá erro em pt-BR", () => {
    expect(() => validarOpcoesRelevo({ relevos: { "#111111": 11 } })).toThrow(/Relevo/);
    expect(() => validarOpcoesRelevo({ relevos: { "#111111": -1 } })).toThrow(/Relevo/);
  });
});

describe("2D para 3D: chaveiro (argola ou furo)", () => {
  const areaTotal = (r) => r.partes.reduce((s, p) => s + p.area, 0);

  it("furo para chaveiro: atravessa a peça perto da borda, sem mudar a largura", () => {
    const sem = gerarRelevo(M, cores, { largura: 60 });
    const r = gerarRelevo(M, cores, { largura: 60, chaveiro: "furo", furo: 5 });
    expect(r.dimensoes[0]).toBeCloseTo(60, 1);
    expect(r.argola).not.toBeNull();
    expect(r.argola.furo).toBeCloseTo(2.5, 6);
    // o furo tira a área de um círculo de 5 mm
    expect(areaTotal(sem) - areaTotal(r)).toBeCloseTo(Math.PI * 2.5 * 2.5, 0);
    // o centro do furo fica dentro da peça
    expect(r.partes.some((p) => pontoDentroDe(p, r.argola.centro))).toBe(false);
    for (const m of r.malhas) expect(fechada(m), m.nome).toBe(true);
  });

  it("argola para chaveiro: o tamanho do furo muda o tamanho da argola", () => {
    const pequena = gerarRelevo(M, cores, { largura: 60, chaveiro: "argola", furo: 3 });
    const grande = gerarRelevo(M, cores, { largura: 60, chaveiro: "argola", furo: 7 });
    expect(grande.argola.raio).toBeGreaterThan(pequena.argola.raio);
    expect(grande.argola.furo).toBeCloseTo(3.5, 6);
  });

  it("comArgola antigo ainda vale como argola", () => {
    expect(validarOpcoesRelevo({ comArgola: true }).chaveiro).toBe("argola");
    expect(validarOpcoesRelevo({}).chaveiro).toBe("nenhum");
  });
});

function pontoDentroDe(parte, [x, y]) {
  let dentro = false;
  for (const laco of parte.lacos)
    for (let i = 0, j = laco.length - 1; i < laco.length; j = i++) {
      const [xi, yi] = laco[i];
      const [xj, yj] = laco[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  return dentro;
}
