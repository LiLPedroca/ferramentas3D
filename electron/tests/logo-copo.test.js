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
