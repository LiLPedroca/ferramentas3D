import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { describe, expect, it } from "vitest";
import { gerarChaveiro, validarOpcoesChaveiro } from "../src/renderer/modelos/chaveiro.js";
import { gerar3mf, gerarStl, malhaIndexada } from "../src/renderer/modelos/exportar.js";
import { formasDoTexto, formasDosPoligonos } from "../src/renderer/modelos/geometria.js";

const pastaFontes = join(__dirname, "..", "src", "renderer", "assets", "fontes");
const carregar = (nome) => {
  const b = readFileSync(join(pastaFontes, `${nome}-Regular.ttf`));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

const opcoes = { texto: "Ana", alturaTexto: 12, espessuraBase: 3, alturaRelevo: 2, margem: 3, furo: 4.5, corBase: "#112233", corTexto: "#ffffff" };

describe("contornos", () => {
  it("furo é o sentido oposto ao do contorno externo (fontes TrueType e CFF)", () => {
    const quadrado = (lado, horario) => {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(lado, 0),
        new THREE.Vector2(lado, lado),
        new THREE.Vector2(0, lado),
      ].map((p) => new THREE.Vector2(p.x - lado / 2, p.y - lado / 2));
      return horario ? pts.reverse() : pts;
    };
    for (const externoHorario of [true, false]) {
      // quadrado grande, um furo (sentido oposto) e uma ilha dentro do furo (mesmo sentido do externo)
      const formas = formasDosPoligonos([quadrado(10, externoHorario), quadrado(6, !externoHorario), quadrado(2, externoHorario)]);
      expect(formas).toHaveLength(2);
      expect(formas[0].holes).toHaveLength(1);
      expect(formas[1].holes).toHaveLength(0);
    }
  });

  it("peças sobrepostas no mesmo sentido continuam sólidas (barra do A); sentido oposto é furo", () => {
    const ret = (x0, y0, x1, y1, horario) => {
      const pts = [new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1)];
      return horario ? pts.reverse() : pts;
    };
    const formas = formasDosPoligonos([
      ret(0, 0, 10, 10, false), // perna
      ret(2, 4, 14, 6, false), // barra sobreposta, mesmo sentido: sólido
      ret(3, 7, 5, 9, true), // furo de verdade, sentido oposto
    ]);
    expect(formas).toHaveLength(2);
    expect(formas.map((f) => f.holes.length).sort()).toEqual([0, 1]);
  });

  it("letras com miolo (o, a, e) ganham furo", () => {
    for (const letra of ["o", "a", "e"]) {
      const { formas } = formasDoTexto(carregar("Fredoka"), letra, 12);
      expect(formas.some((f) => f.holes.length > 0), letra).toBe(true);
    }
  });
});

describe("chaveiro", () => {
  it("gera base e texto com as medidas pedidas", () => {
    const r = gerarChaveiro(carregar("Fredoka"), opcoes);
    expect(r.partes.map((p) => p.nome)).toEqual(["Base", "Texto"]);
    expect(r.tamanho.y).toBeCloseTo(18, 1); // 12 de texto + 2 × 3 de margem
    expect(r.tamanho.z).toBeCloseTo(5, 3); // 3 de base + 2 de relevo
    expect(r.tamanho.x).toBeGreaterThan(30);
    const texto = r.partes[1].geometria;
    texto.computeBoundingBox();
    expect(texto.boundingBox.min.z).toBeCloseTo(3, 3); // relevo começa em cima da base
  });

  it("funciona com fontes diferentes, inclusive cursivas", () => {
    for (const nome of ["Pacifico", "Lobster", "BlackOpsOne", "LuckiestGuy"]) {
      const r = gerarChaveiro(carregar(nome), { ...opcoes, texto: "Pedro" });
      expect(r.partes[1].geometria.attributes.position.count).toBeGreaterThan(100);
    }
  });

  it("valida as opções", () => {
    expect(() => validarOpcoesChaveiro({ ...opcoes, texto: "  " })).toThrow(/texto/);
    expect(() => validarOpcoesChaveiro({ ...opcoes, texto: "x".repeat(21) })).toThrow(/20/);
    expect(() => validarOpcoesChaveiro({ ...opcoes, alturaTexto: "3" })).toThrow(/Altura das letras/);
    expect(validarOpcoesChaveiro({ ...opcoes, espessuraBase: "2,5" }).espessuraBase).toBe(2.5);
  });
});

describe("exportação", () => {
  // texto com letras difíceis: A (barra sobreposta), g/e/a/o (miolos), B (dois miolos)
  const r = gerarChaveiro(carregar("Fredoka"), { ...opcoes, texto: "ABg eao" });

  it("STL binário que o leitor do Three.js abre com o mesmo número de triângulos", () => {
    const stl = gerarStl(r.partes);
    const lida = new STLLoader().parse(stl.buffer);
    const esperado = r.partes.reduce((s, p) => s + p.geometria.attributes.position.count / 3, 0);
    expect(lida.attributes.position.count / 3).toBe(esperado);
  });

  it("malhas fechadas: toda aresta é compartilhada por exatamente dois triângulos", () => {
    for (const parte of r.partes) {
      const g = malhaIndexada(parte.geometria);
      const indices = g.index.array;
      const arestas = new Map();
      for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
        for (const [x, y] of [[a, b], [b, c], [c, a]]) {
          const chave = x < y ? `${x}-${y}` : `${y}-${x}`;
          arestas.set(chave, (arestas.get(chave) ?? 0) + 1);
        }
      }
      const abertas = [...arestas.values()].filter((n) => n !== 2).length;
      expect(abertas, `${parte.nome} tem arestas abertas`).toBe(0);
    }
  });

  it("todas as fontes incluídas geram malhas fechadas, com acentos, números e símbolos", () => {
    const fontes = ["Fredoka", "Baloo2", "LilitaOne", "LuckiestGuy", "Bangers", "Righteous", "Chewy", "Pacifico", "Lobster", "BlackOpsOne", "Oswald", "PermanentMarker"];
    const problemas = [];
    for (const nome of fontes) {
      const modelo = gerarChaveiro(carregar(nome), { ...opcoes, texto: "Ação 2026 BgR&é" });
      for (const parte of modelo.partes) {
        const g = malhaIndexada(parte.geometria);
        const idx = g.index.array;
        const arestas = new Map();
        for (let i = 0; i < idx.length; i += 3) {
          for (const [x, y] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
            const chave = x < y ? `${x}-${y}` : `${y}-${x}`;
            arestas.set(chave, (arestas.get(chave) ?? 0) + 1);
          }
        }
        const abertas = [...arestas.values()].filter((n) => n !== 2).length;
        if (abertas) problemas.push(`${nome}/${parte.nome}: ${abertas}`);
      }
    }
    expect(problemas).toEqual([]);
  });

  it("3MF com duas partes, cores e um item no build", () => {
    const arquivos = unzipSync(gerar3mf(r.partes, { titulo: "Chaveiro Ana" }));
    expect(Object.keys(arquivos).sort()).toEqual(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]);
    const xml = strFromU8(arquivos["3D/3dmodel.model"]);
    expect(xml.match(/<object /g)).toHaveLength(3);
    expect(xml).toContain('displaycolor="#112233FF"');
    expect(xml.match(/<item /g)).toHaveLength(1);
    expect(xml.match(/<triangle /g).length).toBeGreaterThan(100);
  });
});
