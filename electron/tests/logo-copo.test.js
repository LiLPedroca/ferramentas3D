import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { anguloDaNovaCopia, caixaDaLogo, limitarAltura, limitarNoCopo, logoMaiorQueOTubo, logoNaCurva, logosNaMesa, medirTubo, passaDoTubo, raioEm } from "../src/renderer/modelos/logo-copo.js";

// anel de pontos (cilindro) de raio r entre as alturas z0 e z1
function anel(r, z0, z1) {
  const pos = [];
  for (let z = z0; z <= z1; z += 0.5) for (let k = 0; k < 36; k++) pos.push(r * Math.cos((k * Math.PI) / 18), r * Math.sin((k * Math.PI) / 18), z);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
}

// copo de mentira: corpo preto de 0 a 145 (raio 42), base branca mais larga até 30 e borda branca de 125 a 145
const copo = [{ geometria: anel(42, 0, 145) }, { geometria: (() => {
  const a = anel(44, 0, 30).attributes.position.array;
  const b = anel(44, 125, 145).attributes.position.array;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([...a, ...b], 3));
  return g;
})() }];

describe("Logo no copo", () => {
  it("o tubo é a faixa em que só a cor principal está por fora (sem base nem borda)", () => {
    const t = medirTubo(copo);
    expect(t.z0).toBeGreaterThanOrEqual(30);
    expect(t.z0).toBeLessThanOrEqual(33);
    expect(t.z1).toBeGreaterThanOrEqual(122);
    expect(t.z1).toBeLessThanOrEqual(125);
    expect(raioEm(t, 70)).toBeCloseTo(42, 0);
    expect(t.centro[0]).toBeCloseTo(0, 3);
  });

  it("a logo nunca sai do tubo: a altura do centro é limitada", () => {
    const t = { z0: 30, z1: 120 };
    expect(limitarAltura(200, 40, t)).toBe(100);
    expect(limitarAltura(0, 40, t)).toBe(50);
    expect(limitarAltura(70, 40, t)).toBe(70);
    expect(limitarAltura(10, 100, t)).toBe(75); // maior que o tubo: fica no meio
    expect(logoMaiorQueOTubo(100, t)).toBe(true);
  });

  it("posição livre: sobe e desce pelo copo inteiro; fora do tubo só avisa", () => {
    const t = { z0: 80, z1: 125, altura: 145 };
    expect(limitarNoCopo(10, 60, t)).toBe(30);
    expect(limitarNoCopo(200, 60, t)).toBe(115);
    expect(limitarNoCopo(60, 60, t)).toBe(60);
    expect(passaDoTubo(60, 60, t)).toBe(true);
    expect(passaDoTubo(100, 40, t)).toBe(false);
    expect(medirTubo(copo).altura).toBeCloseTo(145, 3);
  });

  it("a primeira cópia vai atrás (180°); as outras no maior espaço livre; sem espaço, não cabe", () => {
    expect(anguloDaNovaCopia([], 0.5)).toBe(0);
    expect(anguloDaNovaCopia([0], 0.5)).toBeCloseTo(Math.PI, 6);
    expect(anguloDaNovaCopia([0, Math.PI], 0.5)).toBeCloseTo(Math.PI / 2, 6);
    expect(anguloDaNovaCopia([0, Math.PI, Math.PI / 2], 0.5)).toBeCloseTo((3 * Math.PI) / 2, 6);
    expect(anguloDaNovaCopia([0, Math.PI], 2)).toBeNull();
  });

  it("na prévia a logo fica encostada na superfície do tubo, dobrada na curva", () => {
    const t = medirTubo(copo);
    // logo plana de 40 × 20 mm, 1 mm de espessura (só a face de baixo, z = 0)
    const malha = { vertices: [0, 0, 0, 40, 0, 0, 40, 20, 0, 0, 20, 0], triangulos: [0, 1, 2, 0, 2, 3] };
    const caixa = caixaDaLogo([malha]);
    const pos = logoNaCurva(malha, caixa, { angulo: 0, z: 70 }, t);
    expect(pos.length / 9).toBeGreaterThan(20); // dividida para seguir a curva
    for (let i = 0; i < pos.length; i += 3) {
      expect(Math.hypot(pos[i], pos[i + 1])).toBeCloseTo(42.25, 1);
      expect(pos[i + 2]).toBeGreaterThanOrEqual(60 - 1e-6);
      expect(pos[i + 2]).toBeLessThanOrEqual(80 + 1e-6);
    }
    // de frente (ângulo 0): o meio da logo fica em -Y
    const meio = logoNaCurva({ vertices: [19.9, 9.9, 0, 20.1, 9.9, 0, 20, 10.1, 0], triangulos: [0, 1, 2] }, caixa, { angulo: 0, z: 70 }, t);
    expect(meio[1]).toBeLessThan(-40);
  });

  it("em parte ondulada do copo a peça fica num cilindro só, encostada no ponto mais saliente", () => {
    // copo de raio 42 com uma ondulação forte embaixo (até 48 mm de raio, na frente e atrás)
    const pos = [];
    for (let z = 0; z <= 145; z += 0.5) {
      for (let k = 0; k < 180; k++) {
        const a = (k * Math.PI) / 90;
        const onda = z < 40 ? 6 * Math.max(0, Math.abs(Math.cos(a)) - 0.5) * 2 * (1 - z / 40) : 0;
        pos.push((42 + onda) * Math.sin(a), -(42 + onda) * Math.cos(a), z);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    const t = medirTubo([{ geometria: g }]);
    const malha = { vertices: [0, 0, 0, 40, 0, 0, 40, 20, 0, 0, 20, 0], triangulos: [0, 1, 2, 0, 2, 3] };
    const caixa = caixaDaLogo([malha]);
    // de frente, embaixo (onde a onda é maior): todos os pontos no mesmo raio, por fora da onda
    const frente = logoNaCurva(malha, caixa, { angulo: 0, z: 15 }, t);
    const raios = [];
    for (let i = 0; i < frente.length; i += 3) raios.push(Math.hypot(frente[i] - t.centro[0], frente[i + 1] - t.centro[1]));
    expect(Math.max(...raios) - Math.min(...raios)).toBeLessThan(0.05);
    expect(Math.min(...raios)).toBeGreaterThan(44);
    // do lado (sem onda) fica no raio do copo
    const lado = logoNaCurva(malha, caixa, { angulo: Math.PI / 2, z: 15 }, t);
    expect(Math.hypot(lado[0] - t.centro[0], lado[1] - t.centro[1])).toBeLessThan(43);
  });

  it("vizinhos são divididos nos mesmos pontos (sem frestas) e paredes verticais não somem", () => {
    const t = medirTubo(copo);
    // quadrado de 40 × 20 mm em dois triângulos (diagonal comum)
    const quadrado = { vertices: [0, 0, 0, 40, 0, 0, 40, 20, 0, 0, 20, 0], triangulos: [0, 1, 2, 0, 2, 3] };
    const caixa = caixaDaLogo([quadrado]);
    const pos = logoNaCurva(quadrado, caixa, { angulo: 0, z: 70 }, t);
    const chave = (i) => `${pos[i].toFixed(4)},${pos[i + 1].toFixed(4)},${pos[i + 2].toFixed(4)}`;
    const arestas = new Map();
    for (let i = 0; i < pos.length; i += 9) {
      const v = [i, i + 3, i + 6];
      for (let k = 0; k < 3; k++) {
        const a = chave(v[k]);
        const b = chave(v[(k + 1) % 3]);
        const c = a < b ? `${a}|${b}` : `${b}|${a}`;
        arestas.set(c, (arestas.get(c) ?? 0) + 1);
      }
    }
    // aresta só de um lado tem que estar na borda do quadrado (em cima, embaixo ou nas pontas)
    const angulo = (q) => Math.atan2(q[0] - t.centro[0], -(q[1] - t.centro[1]));
    const naBorda = (p, q) => (Math.abs(p[2] - q[2]) < 1e-3 && (Math.abs(p[2] - 60) < 1e-3 || Math.abs(p[2] - 80) < 1e-3)) || Math.abs(angulo(p) - angulo(q)) < 1e-4;
    for (const [c, n] of arestas) {
      if (n === 2) continue;
      const [p, q] = c.split("|").map((x) => x.split(",").map(Number));
      expect(naBorda(p, q)).toBe(true);
    }
    // parede vertical exatamente numa linha de corte (u = 0 do centro) não some
    const parede = { vertices: [20, 0, 0, 20, 20, 0, 20, 0, 2], triangulos: [0, 1, 2] };
    expect(logoNaCurva(parede, caixa, { angulo: 0, z: 70 }, t).length).toBe(9);
  });

  it("as normais da prévia seguem a curva: a face de cima aponta para fora do copo", () => {
    const t = medirTubo(copo);
    const malha = { vertices: [0, 0, 1, 40, 0, 1, 40, 20, 1, 0, 20, 1], triangulos: [0, 1, 2, 0, 2, 3] };
    const caixa = caixaDaLogo([malha]);
    const normais = [];
    const pos = logoNaCurva(malha, caixa, { angulo: 0.7, z: 70 }, t, { normais });
    expect(normais.length).toBe(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const fora = [pos[i] - t.centro[0], pos[i + 1] - t.centro[1]];
      const l = Math.hypot(...fora);
      expect(normais[i] * (fora[0] / l) + normais[i + 1] * (fora[1] / l)).toBeCloseTo(1, 5);
      expect(normais[i + 2]).toBeCloseTo(0, 6);
    }
  });

  it("na mesa as logos ficam ao lado do copo; se não couberem, avisa", () => {
    const copoNaMesa = { min: [86, 86], max: [174, 174] };
    const caixa = { largura: 50, altura: 40 };
    const r = logosNaMesa(2, caixa, copoNaMesa);
    expect(r.cabem).toBe(true);
    expect(r.lugares[0].x).toBeGreaterThanOrEqual(174);
    expect(r.lugares[1].y).toBeGreaterThan(r.lugares[0].y + 40);
    expect(logosNaMesa(20, caixa, copoNaMesa).cabem).toBe(false);
  });
});
