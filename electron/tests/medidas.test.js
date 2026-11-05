import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  acharFurosEPinos,
  ajustarCirculo,
  arestasMarcantes,
  autovetores3,
  formatarMedida,
  medirDiametro,
  medirDistancia,
  medirParedes,
  medirProfundidade,
} from "../src/renderer/modelos/medidas.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const posicoes = (geo) => (geo.index ? geo.toNonIndexed() : geo).attributes.position.array;

// Placa 40×40×10 com furo de Ø 8 no meio (cilindro com 48 lados), feita juntando triângulos.
function placaComFuro(lados = 48, raio = 4) {
  const forma = new THREE.Shape();
  forma.moveTo(-20, -20);
  forma.lineTo(20, -20);
  forma.lineTo(20, 20);
  forma.lineTo(-20, 20);
  const furo = new THREE.Path();
  furo.absarc(0, 0, raio, 0, Math.PI * 2, true);
  forma.holes.push(furo);
  return new THREE.ExtrudeGeometry(forma, { depth: 10, bevelEnabled: false, curveSegments: lados });
}

describe("álgebra", () => {
  it("círculo por mínimos quadrados", () => {
    const pts = Array.from({ length: 36 }, (_, i) => [5 + 3 * Math.cos(i / 5.73), -2 + 3 * Math.sin(i / 5.73)]);
    const c = ajustarCirculo(pts);
    expect(c.cx).toBeCloseTo(5, 6);
    expect(c.cy).toBeCloseTo(-2, 6);
    expect(c.r).toBeCloseTo(3, 6);
    expect(c.rms).toBeLessThan(1e-9);
  });

  it("autovetores de matriz simétrica", () => {
    const [a, b, c] = autovetores3([
      [2, 0, 0],
      [0, 5, 0],
      [0, 0, 1],
    ]);
    expect([a.valor, b.valor, c.valor]).toEqual([1, 2, 5]);
    expect(Math.abs(a.vetor.z)).toBeCloseTo(1);
  });
});

describe("paquímetro", () => {
  it("mede o furo clicando na parede dele", () => {
    const pos = posicoes(placaComFuro());
    // ponto na parede do furo (raio 4) a meia altura; normal da face aponta para o centro do furo
    const r = medirDiametro(pos, V(4, 0, 5), V(-1, 0, 0));
    expect(r.tipo).toBe("furo");
    expect(r.raio * 2).toBeGreaterThan(7.9);
    expect(r.raio * 2).toBeLessThan(8.01);
    expect(r.centro.x).toBeCloseTo(0, 1);
    expect(Math.abs(r.eixo.z)).toBeCloseTo(1, 3);
    expect(r.lados).toBe(96); // o Three.js usa 2 × curveSegments em arcos
  });

  it("mede um pino (cilindro por fora)", () => {
    const pos = posicoes(new THREE.CylinderGeometry(6, 6, 20, 64));
    const r = medirDiametro(pos, V(6, 3, 0), V(1, 0, 0));
    expect(r.tipo).toBe("pino");
    expect(r.raio * 2).toBeCloseTo(12, 1);
  });

  it("superfície plana não vira diâmetro", () => {
    expect(medirDiametro(posicoes(placaComFuro()), V(10, 10, 10), V(0, 0, 1))).toBeNull();
  });

  it("faces paralelas medem como os bicos do paquímetro", () => {
    const r = medirDistancia(V(0, 0, 0), V(0, 0, -1), V(7, 3, 10), V(0, 0, 1));
    expect(r.perpendicular).toBeCloseTo(10);
    expect(r.reta).toBeCloseTo(Math.hypot(7, 3, 10));
    expect(medirDistancia(V(0, 0, 0), V(0, 0, -1), V(1, 0, 0), V(1, 0, 0)).perpendicular).toBeNull();
  });

  it("faces viradas para o mesmo lado não contam como bicos", () => {
    const r = medirDistancia(V(0, 0, 10), V(0, 0, 1), V(40, 0, 10), V(0, 0, 1));
    expect(r.perpendicular).toBeNull();
    expect(r.reta).toBeCloseTo(40);
  });

  it("arestas reais: quinas sim, diagonais de face plana não", () => {
    const pos = posicoes(new THREE.BoxGeometry(10, 10, 10));
    const { arestas, vertices } = arestasMarcantes(pos);
    expect(arestas.size).toBe(12); // as 12 arestas do cubo; as 6 diagonais ficam de fora
    expect(vertices.size).toBe(8);
  });

  it("profundidade ao longo da normal da primeira face", () => {
    expect(medirProfundidade(V(0, 0, 10), V(0, 0, 1), V(3, 4, 2.5))).toBeCloseTo(7.5);
  });

  it("acha sozinho o furo da placa e o pino do cilindro, com a profundidade", () => {
    const furos = acharFurosEPinos(posicoes(placaComFuro()));
    expect(furos).toHaveLength(1);
    expect(furos[0].tipo).toBe("furo");
    expect(furos[0].raio * 2).toBeCloseTo(8, 1);
    expect(furos[0].profundidade).toBeCloseTo(10, 3);

    const pinos = acharFurosEPinos(posicoes(new THREE.CylinderGeometry(6, 6, 20, 64)));
    expect(pinos.map((p) => [p.tipo, p.eixoNome])).toEqual([["pino", "Z"]]);
    expect(pinos[0].profundidade).toBeCloseTo(20, 3);

    expect(acharFurosEPinos(posicoes(new THREE.BoxGeometry(10, 10, 10)))).toEqual([]);
  });

  it("mede a espessura das paredes", () => {
    // tubo: raio de fora 10, de dentro 9 → parede de 1 mm
    const forma = new THREE.Shape();
    forma.absarc(0, 0, 10, 0, Math.PI * 2, false);
    const furo = new THREE.Path();
    furo.absarc(0, 0, 9, 0, Math.PI * 2, true);
    forma.holes.push(furo);
    const geo = new THREE.ExtrudeGeometry(forma, { depth: 30, bevelEnabled: false, curveSegments: 32 }).toNonIndexed();
    const malha = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const raio = new THREE.Raycaster();
    const lancar = (origem, direcao) => {
      raio.set(origem, direcao);
      const h = raio.intersectObject(malha)[0];
      return h ? { distancia: h.distance, normal: h.face.normal } : null;
    };
    const r = medirParedes(geo.attributes.position.array, lancar, { amostras: 300 });
    expect(r.minima).toBeGreaterThan(0.95);
    expect(r.minima).toBeLessThan(1.01);
    expect(r.amostras.length).toBeGreaterThan(100);
  });

  it("formata em mm e polegadas", () => {
    expect(formatarMedida(25.4)).toBe("25,40 mm");
    expect(formatarMedida(25.4, "pol")).toBe("1,000″");
  });
});
