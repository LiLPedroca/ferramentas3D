import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { beforeAll, describe, expect, it } from "vitest";
import { camadaDaTroca, gerarChaveiro, validarOpcoesChaveiro } from "../src/renderer/modelos/chaveiro.js";
import { gerar3mf, gerarStl, malhaIndexada } from "../src/renderer/modelos/exportar.js";
import { FONTES } from "../src/renderer/modelos/fontes.js";
import { formasDoTexto, formasDosPoligonos, geometriaDaMalha } from "../src/renderer/modelos/geometria.js";
import { carregarManifold, pontoNoLaco } from "../src/renderer/modelos/manifold.js";

const pastaFontes = join(__dirname, "..", "src", "renderer", "assets", "fontes");
const fontes = new Map();
const carregar = (nome) => {
  if (!fontes.has(nome)) {
    const b = readFileSync(join(pastaFontes, `${nome}-Regular.ttf`));
    fontes.set(nome, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
  }
  return fontes.get(nome);
};

let M;
beforeAll(async () => {
  M = await carregarManifold();
});

// toda aresta em exatamente dois triângulos, percorrida uma vez em cada sentido, e volume positivo
function conferirFechada(vertices, triangulos) {
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
  const ruins = [...arestas.values()].filter(([n, s]) => n !== 2 || s !== 0).length;
  return { ruins, volume };
}

describe("contornos (Palavras decorativas)", () => {
  it("furo é o sentido oposto ao do contorno externo (fontes TrueType e CFF)", () => {
    const quadrado = (lado, horario) => {
      const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(lado, 0), new THREE.Vector2(lado, lado), new THREE.Vector2(0, lado)].map(
        (p) => new THREE.Vector2(p.x - lado / 2, p.y - lado / 2),
      );
      return horario ? pts.reverse() : pts;
    };
    for (const externoHorario of [true, false]) {
      const formas = formasDosPoligonos([quadrado(10, externoHorario), quadrado(6, !externoHorario), quadrado(2, externoHorario)]);
      expect(formas).toHaveLength(2);
      expect(formas[0].holes).toHaveLength(1);
      expect(formas[1].holes).toHaveLength(0);
    }
  });

  it("letras com miolo (o, a, e) ganham furo", () => {
    for (const letra of ["o", "a", "e"]) {
      const { formas } = formasDoTexto(carregar("Fredoka"), letra, 12);
      expect(formas.some((f) => f.holes.length > 0), letra).toBe(true);
    }
  });
});

describe("chaveiro de nome", () => {
  it("largura total exata (com base e argola) nos três estilos de base", () => {
    for (const estilo of ["contorno", "capsula", "retangular"]) {
      for (const largura of [40, 70, 120]) {
        const r = gerarChaveiro(M, carregar("Lobster"), { texto: "Pedro", estilo, largura });
        expect(r.dimensoes[0], `${estilo} ${largura}`).toBeCloseTo(largura, 1);
        expect(r.dimensoes[2]).toBeCloseTo(2.4 + 1.2, 5);
      }
    }
  });

  it("duas partes: base e argola de 0 até a base, texto em cima", () => {
    const r = gerarChaveiro(M, carregar("Fredoka"), { texto: "Ana", base: 3, relevo: 2 });
    expect(r.malhas.map((m) => m.nome)).toEqual(["Base e argola", "Texto"]);
    const zs = (m) => Array.from(m.vertices).filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs(r.malhas[0]))).toBeCloseTo(0, 5);
    expect(Math.max(...zs(r.malhas[0]))).toBeCloseTo(3, 5);
    expect(Math.min(...zs(r.malhas[1]))).toBeCloseTo(3, 5);
    expect(Math.max(...zs(r.malhas[1]))).toBeCloseTo(5, 5);
  });

  it("base de contorno vira uma peça só, mesmo com letras e acentos soltos", () => {
    // "i" e acentos ficam soltos: as pontes ligam tudo, e a base sai com um único contorno externo
    const r = gerarChaveiro(M, carregar("GreatVibes"), { texto: "Júlia Lima", estilo: "contorno" });
    const externos = r.lacosBase.filter((l) => {
      let s = 0;
      for (let i = 0; i < l.length; i++) s += l[i][0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * l[i][1];
      return s > 0;
    });
    expect(externos).toHaveLength(1);
  });

  it("argola segue a posição escolhida na borda; posição sobre o texto é recusada com explicação", () => {
    const fonte = carregar("Lobster");
    const auto = gerarChaveiro(M, fonte, { texto: "Pedro" });
    expect(auto.argola.centro[0]).toBeLessThan(auto.caixa.min[0] + auto.argola.raio * 2.5); // começa à esquerda
    let aceitas = 0;
    for (let t = 0; t < 1; t += 0.05) {
      try {
        const r = gerarChaveiro(M, fonte, { texto: "Pedro", argola: t });
        const { ponto } = pontoNoLaco(r.perimetro, t);
        expect(Math.hypot(r.argola.centro[0] - ponto[0], r.argola.centro[1] - ponto[1])).toBeLessThan(r.argola.raio + 0.01);
        expect(r.dimensoes[0]).toBeCloseTo(70, 1);
        aceitas++;
      } catch (erro) {
        expect(erro.message).toMatch(/argola|apoio/i);
      }
    }
    expect(aceitas).toBeGreaterThan(10);
  });

  it("valida as opções", () => {
    expect(() => validarOpcoesChaveiro({ texto: "  " })).toThrow(/nome/);
    expect(() => validarOpcoesChaveiro({ texto: "x".repeat(33) })).toThrow(/32/);
    expect(() => validarOpcoesChaveiro({ largura: 10 })).toThrow(/Largura total: use de 20 a 250/);
    expect(() => validarOpcoesChaveiro({ estilo: "estrela" })).toThrow(/base/);
    expect(validarOpcoesChaveiro({ base: "2,5" }).base).toBe(2.5);
  });

  it("caractere que a fonte não tem dá aviso claro", () => {
    expect(() => gerarChaveiro(M, carregar("Lobster"), { texto: "Ana ☃" })).toThrow(/não tem o caractere/);
  });

  it("todas as fontes geram malhas fechadas nos três estilos", () => {
    expect(FONTES).toHaveLength(29);
    const problemas = [];
    for (const { id } of FONTES) {
      for (const estilo of ["contorno", "capsula", "retangular"]) {
        try {
          const r = gerarChaveiro(M, carregar(id), { texto: "Ação Bg 2026", estilo });
          for (const m of r.malhas) {
            const { ruins, volume } = conferirFechada(m.vertices, m.triangulos);
            if (ruins || volume <= 0) problemas.push(`${id}/${estilo}/${m.nome}: ${ruins} arestas, volume ${volume}`);
          }
        } catch (erro) {
          problemas.push(`${id}/${estilo}: ${erro.message}`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });
});

describe("impressão sem AMS (pausa para troca manual)", () => {
  it("camada da troca bate com o que o Anycubic Slicer Next fatiou (Kobra X, base 2,4 mm)", () => {
    // valores conferidos fatiando de verdade: primeira camada do texto em cada altura de camada
    expect(camadaDaTroca(2.4, 0.2, 0.2).z).toBe(2.6);
    expect(camadaDaTroca(2.4, 0.12, 0.2).z).toBe(2.48);
    expect(camadaDaTroca(2.4, 0.16, 0.2).z).toBe(2.6);
    expect(camadaDaTroca(2.4, 0.2, 0.2).numero).toBe(13);
  });

  it("3MF sem AMS: as duas partes no filamento 1 e uma pausa na camada do texto", () => {
    const r = gerarChaveiro(M, carregar("Fredoka"), { texto: "Ana" });
    const partes = r.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m), slot: 1 }));
    const arquivos = unzipSync(gerar3mf(partes, { titulo: "Chaveiro Ana", pausas: [camadaDaTroca(r.opcoes.base).z] }));
    const pausas = strFromU8(arquivos["Metadata/custom_gcode_per_layer.xml"]);
    expect(pausas).toContain('<layer top_z="2.6" type="1"');
    expect(pausas).toContain('<plate_info id="1"/>');
    const config = strFromU8(arquivos["Metadata/model_settings.config"]);
    expect(config.match(/key="extruder" value="(\d+)"/g).every((x) => x.endsWith('"1"'))).toBe(true);
    // com AMS (sem pausas) o arquivo não leva o XML de pausas
    expect(unzipSync(gerar3mf(partes))["Metadata/custom_gcode_per_layer.xml"]).toBeUndefined();
  });
});

describe("exportação", () => {
  let partes;
  beforeAll(() => {
    const r = gerarChaveiro(M, carregar("Fredoka"), { texto: "ABg eao", corBase: "#112233", corTexto: "#ffffff" });
    partes = r.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
  });

  it("STL binário que o leitor do Three.js abre com o mesmo número de triângulos", () => {
    const lida = new STLLoader().parse(gerarStl(partes).buffer);
    const esperado = partes.reduce((s, p) => s + p.geometria.index.count / 3, 0);
    expect(lida.attributes.position.count / 3).toBe(esperado);
  });

  it("malhas exportadas continuam fechadas", () => {
    for (const p of partes) {
      const g = malhaIndexada(p.geometria);
      expect(conferirFechada(g.attributes.position.array, g.index.array).ruins).toBe(0);
    }
  });

  it("3MF com duas partes, cores e o filamento de cada parte (model_settings.config)", () => {
    const arquivos = unzipSync(gerar3mf(partes.map((p, i) => ({ ...p, slot: i ? 4 : 1 })), { titulo: "Chaveiro Ana" }));
    expect(Object.keys(arquivos).sort()).toEqual(["3D/3dmodel.model", "Metadata/model_settings.config", "[Content_Types].xml", "_rels/.rels"]);
    const xml = strFromU8(arquivos["3D/3dmodel.model"]);
    expect(xml.match(/<object /g)).toHaveLength(3);
    expect(xml).toContain('displaycolor="#112233FF"');
    expect(xml.match(/<item /g)).toHaveLength(1);
    const config = strFromU8(arquivos["Metadata/model_settings.config"]);
    expect(config).toContain('<object id="4">');
    expect(config).toMatch(/<part id="2"[^>]*>.*?key="extruder" value="1"/);
    expect(config).toMatch(/<part id="3"[^>]*>.*?key="extruder" value="4"/);
    expect(strFromU8(arquivos["[Content_Types].xml"])).toContain('Extension="config"');
  });

  it("sem slot escolhido, cada parte vai para o filamento da sua ordem", () => {
    const config = strFromU8(unzipSync(gerar3mf(partes))["Metadata/model_settings.config"]);
    expect(config).toMatch(/<part id="3"[^>]*>.*?key="extruder" value="2"/);
  });
});
