import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  acharFurosEPinos,
  ajustarCirculo,
  arestaReta,
  arestasMarcantes,
  autovetores3,
  formatarMedida,
  medirCamada,
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

// Copo: Ø 74 por fora, Ø 70 por dentro, 95 de altura, fundo de 3 mm (eixo Y para cima).
// cônico: embaixo Ø 60 por fora e Ø 56 por dentro, alargando até a boca.
function copo({ conico = false } = {}) {
  const [fb, db] = conico ? [30, 28] : [37, 35];
  const perfil = [V(0, 0, 0), V(fb, 0, 0), V(37, 95, 0), V(35, 95, 0), V(db, 3, 0), V(0, 3, 0)].map((p) => new THREE.Vector2(p.x, p.y));
  return new THREE.LatheGeometry(perfil, 96).toNonIndexed().attributes.position.array;
}
const CIMA = V(0, 1, 0);

describe("paquímetro por camada (passar o mouse)", () => {
  it("na boca do copo: Ø de dentro e Ø de fora", () => {
    const r = medirCamada(copo(), V(36, 95, 0), V(0, 1, 0), CIMA);
    expect(r.interno.raio * 2).toBeCloseTo(70, 0);
    expect(r.externo.raio * 2).toBeCloseTo(74, 0);
  });

  it("nas paredes de dentro e de fora do copo", () => {
    for (const [ponto, normal] of [
      [V(0, 50, 35), V(0, 0, -1)],
      [V(37, 40, 0), V(1, 0, 0)],
    ]) {
      const r = medirCamada(copo(), ponto, normal, CIMA);
      expect(r.interno.raio * 2).toBeCloseTo(70, 0);
      expect(r.externo.raio * 2).toBeCloseTo(74, 0);
    }
  });

  it("copo cônico: a medida acompanha a altura do mouse", () => {
    const pos = copo({ conico: true });
    // parede de fora: raio vai de 30 (y=0) a 37 (y=95)
    const raioFora = (y) => 30 + (7 * y) / 95;
    const normal = V(95, -7, 0).normalize();
    for (const y of [10, 50, 90]) {
      const r = medirCamada(pos, V(raioFora(y), y, 0), normal, CIMA);
      expect(r.externo.raio).toBeCloseTo(raioFora(y), 1);
      // parede de dentro: raio vai de 28 (y=3) a 35 (y=95)
      expect(r.interno.raio).toBeCloseTo(28 + (7 * (y - 3)) / 92, 1);
    }
  });

  it("no fundo de dentro do copo: o Ø de dentro", () => {
    const r = medirCamada(copo(), V(10, 3, 5), V(0, 1, 0), CIMA);
    expect(r.interno.raio * 2).toBeCloseTo(70, 0);
  });

  it("na face de cima da placa, perto do furo e longe dele", () => {
    const pos = posicoes(placaComFuro());
    const cima = V(0, 0, 1);
    const perto = medirCamada(pos, V(4.2, 0, 10), V(0, 0, 1), cima);
    expect(perto.interno.raio * 2).toBeCloseTo(8, 1);
    expect(perto.externo).toBeNull();
    expect(medirCamada(pos, V(12, 12, 10), V(0, 0, 1), cima)).toBeNull();
    expect(medirCamada(pos, V(20, 0, 5), V(1, 0, 0), cima)).toBeNull(); // lateral reta da placa
  });

  it("ponta e lateral de um pino", () => {
    const pos = posicoes(new THREE.CylinderGeometry(6, 6, 20, 64));
    for (const [ponto, normal] of [
      [V(1, 10, 1), V(0, 1, 0)],
      [V(6, 3, 0), V(1, 0, 0)],
    ]) {
      const r = medirCamada(pos, ponto, normal, CIMA);
      expect(r.externo.raio * 2).toBeCloseTo(12, 1);
      expect(r.interno).toBeNull();
    }
  });
});

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

  it("furo cônico vira um item só, com o diâmetro menor e o maior", () => {
    // tronco de cone oco: furo de Ø 10 embaixo a Ø 11 em cima, dentro de um cilindro de Ø 30
    const pontos = [new THREE.Vector2(5, 0), new THREE.Vector2(15, 0), new THREE.Vector2(15, 20), new THREE.Vector2(5.5, 20)];
    const geo = new THREE.LatheGeometry([...pontos, pontos[0]], 64);
    const r = acharFurosEPinos(posicoes(geo)).filter((x) => x.tipo === "furo");
    expect(r).toHaveLength(1);
    expect(r[0].raioMin * 2).toBeLessThan(10.4);
    expect(r[0].raioMax * 2).toBeGreaterThan(10.6);
    expect(r[0].profundidade).toBeGreaterThan(15);
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

  it("arestas reais: segue a aresta reta inteira", () => {
    // caixa 30 × 10 × 10 com muitos pedaços na aresta de 30
    const pos = posicoes(new THREE.BoxGeometry(30, 10, 10, 6, 1, 1));
    const reais = arestasMarcantes(pos);
    const r = arestaReta(reais, V(-5, 5, 5), V(0, 5, 5));
    expect(r.comprimento).toBeCloseTo(30, 3);
  });

  it("formata em mm e polegadas", () => {
    expect(formatarMedida(25.4)).toBe("25,40 mm");
    expect(formatarMedida(25.4, "pol")).toBe("1,000″");
  });
});
