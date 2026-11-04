// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { coresDoSvg, gerarLogo, juntarCoresParecidas, validarOpcoesLogo } from "../src/renderer/modelos/logo.js";
import { carregarManifold, pontoNoLaco } from "../src/renderer/modelos/manifold.js";

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

describe("chaveiro de logo", () => {
  it("separa as cores do logo em partes, sobre a base", () => {
    const r = gerarLogo(M, cores, {});
    expect(r.malhas[0].nome).toBe("Base e argola");
    expect(r.cores.length).toBeGreaterThanOrEqual(2);
    expect(r.malhas).toHaveLength(r.cores.length + 1);
    expect(r.dimensoes[2]).toBeCloseTo(2.4 + 1.2, 5);
  });

  it("largura total exata e malhas fechadas nos três estilos", () => {
    for (const estilo of ["contorno", "circulo", "retangular"]) {
      for (const largura of [30, 50, 90]) {
        const r = gerarLogo(M, cores, { estilo, largura });
        expect(r.dimensoes[0], `${estilo} ${largura}`).toBeCloseTo(largura, 1);
        for (const m of r.malhas) expect(fechada(m), `${estilo} ${largura} ${m.nome}`).toBe(true);
      }
    }
  });

  it("aceita o texto SVG direto", () => {
    expect(gerarLogo(M, svg, { estilo: "circulo" }).malhas.length).toBeGreaterThan(1);
  });

  it("argola começa em cima e segue a posição escolhida na borda", () => {
    const auto = gerarLogo(M, cores, {});
    expect(auto.argola.centro[1]).toBeGreaterThan(auto.caixa.max[1] - auto.argola.raio * 2.5);
    let aceitas = 0;
    for (let t = 0; t < 1; t += 0.1) {
      try {
        const r = gerarLogo(M, cores, { argola: t });
        const { ponto } = pontoNoLaco(r.perimetro, t);
        expect(Math.hypot(r.argola.centro[0] - ponto[0], r.argola.centro[1] - ponto[1])).toBeLessThan(r.argola.raio + 0.01);
        aceitas++;
      } catch (erro) {
        expect(erro.message).toMatch(/argola|apoio/i);
      }
    }
    expect(aceitas).toBeGreaterThan(5);
  });

  it("valida as medidas", () => {
    expect(() => validarOpcoesLogo({ largura: "5" })).toThrow(/Largura total: use de 20 a 150/);
    expect(() => validarOpcoesLogo({ estilo: "estrela" })).toThrow(/base/);
    expect(validarOpcoesLogo({ relevo: "1,5" }).relevo).toBe(1.5);
  });
});

describe("cores do logo", () => {
  it("tons quase iguais (serrilhado) viram uma cor só; cores diferentes ficam", () => {
    const q = [[[0, 0], [1, 0], [1, 1]]];
    const r = juntarCoresParecidas([
      { cor: "#4068c0", formas: [q, q] },
      { cor: "#3060d0", formas: [q] },
      { cor: "#f08c28", formas: [q] },
    ]);
    expect(r.map((c) => c.cor)).toEqual(["#4068c0", "#f08c28"]);
    expect(r[0].formas).toHaveLength(3);
  });
});
