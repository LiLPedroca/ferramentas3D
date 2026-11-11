import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { beforeAll, describe, expect, it } from "vitest";
import { gerarChaveiro, gerarChaveiroComLarguraDoTexto, larguraNaFonte, validarOpcoesChaveiro } from "../src/renderer/modelos/chaveiro.js";
import { arrumarNaMesa, gerar3mfVarios, origemDaPlaca } from "../src/renderer/modelos/exportar.js";
import { geometriaDaMalha, posicionarNaOrigem } from "../src/renderer/modelos/geometria.js";
import { carregarManifold } from "../src/renderer/modelos/manifold.js";

const b = readFileSync(join(__dirname, "..", "src", "renderer", "assets", "fontes", "Lobster-Regular.ttf"));
const lobster = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

// Símbolo de teste (como sai do coresDoSvg: 100 de largura, Y para cima): losango branco com uma folha verde.
const losango = [[50, 0], [100, 50], [50, 100], [0, 50]];
const folha = [[50, 25], [65, 50], [50, 75], [35, 50]];
const CORES = [
  { cor: "#ffffff", formas: [[losango]] },
  { cor: "#1f9d3a", formas: [[folha]] },
];
const simbolo = (extra = {}) => ({ lado: "esquerda", dx: 0, dy: 0, tamanho: 100, relevo: ["#ffffff"], ...extra });
const area = (lacos) => lacos.reduce((s, l) => s + l.reduce((a, p, i) => a + (p[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * p[1]) / 2, 0), 0);

let M;
beforeAll(async () => {
  M = await carregarManifold();
});

describe("símbolo no chaveiro de nome", { timeout: 60000 }, () => {
  it("valida as opções do símbolo", () => {
    expect(validarOpcoesChaveiro({ simbolo: simbolo() }).simbolo).toEqual(simbolo());
    expect(() => validarOpcoesChaveiro({ simbolo: simbolo({ lado: "meio" }) })).toThrow(/Posição do símbolo/);
    expect(() => validarOpcoesChaveiro({ simbolo: simbolo({ tamanho: 10 }) })).toThrow(/Tamanho do símbolo/);
    expect(validarOpcoesChaveiro({}).simbolo).toBeNull();
  });

  it("à esquerda do nome, dentro da base, com a largura total pedida", () => {
    const sem = gerarChaveiro(M, lobster, { texto: "Damaris", largura: 80 });
    const com = gerarChaveiro(M, lobster, { texto: "Damaris", largura: 80, simbolo: simbolo() }, CORES);
    expect(com.dimensoes[0]).toBeCloseTo(80, 1);
    expect(com.malhas.map((m) => m.nome)).toEqual(["Base e argola", "Texto e símbolo"]);
    // o símbolo fica à esquerda do nome
    expect(com.simbolo.caixa.max[0]).toBeLessThan(com.simbolo.centro[0] + 100);
    expect(com.simbolo.centro[0]).toBeLessThan(com.caixa.min[0] + com.dimensoes[0] / 3);
    // o losango branco sobe junto com o texto (a folha verde fica só na base)
    expect(area(com.lacosTexto)).toBeGreaterThan(area(sem.lacosTexto) * 0.5);
    for (const m of com.malhas) expect(m.vertices.length).toBeGreaterThan(0);
  });

  it("sem cores marcadas, o símbolo fica só na base (plano)", () => {
    const so = gerarChaveiro(M, lobster, { texto: "Ana", largura: 60, simbolo: simbolo({ relevo: [] }) }, CORES);
    const relevoTodo = gerarChaveiro(M, lobster, { texto: "Ana", largura: 60, simbolo: simbolo({ relevo: ["#ffffff", "#1f9d3a"] }) }, CORES);
    expect(area(relevoTodo.lacosTexto)).toBeGreaterThan(area(so.lacosTexto));
  });

  it("lados e deslocamento mudam a posição", () => {
    const pos = (s) => gerarChaveiro(M, lobster, { texto: "Ana", largura: 70, simbolo: simbolo(s) }, CORES).simbolo.centro;
    const esq = pos({});
    const dir = pos({ lado: "direita" });
    const cima = pos({ lado: "acima" });
    expect(dir[0]).toBeGreaterThan(esq[0]);
    expect(cima[1]).toBeGreaterThan(esq[1]);
    const desceu = pos({ dy: -0.3 });
    expect(desceu[1]).toBeLessThan(esq[1]);
  });
});

describe("vários nomes num 3MF", { timeout: 60000 }, () => {
  it("mesma altura de letra: largura do nome proporcional ao comprimento na fonte", () => {
    const ref = gerarChaveiro(M, lobster, { texto: "Damaris", largura: 70 });
    const escala = ref.larguraTexto / larguraNaFonte(lobster, "Damaris");
    const curto = gerarChaveiroComLarguraDoTexto(M, lobster, { texto: "Ana", largura: 70 }, escala * larguraNaFonte(lobster, "Ana"));
    expect(curto.dimensoes[0]).toBeLessThan(ref.dimensoes[0]);
    // mesma altura de letra (a base acompanha)
    expect(curto.dimensoes[1]).toBeGreaterThan(ref.dimensoes[1] * 0.75);
  });

  it("arruma na mesa e abre placas novas quando não cabe", () => {
    const caixas = Array.from({ length: 30 }, () => ({ largura: 76, altura: 30 }));
    const pos = arrumarNaMesa(caixas, { mesa: [260, 260] });
    expect(pos[0]).toEqual({ placa: 0, x: 8, y: 8 });
    expect(Math.max(...pos.map((p) => p.placa))).toBe(1); // 3 por linha × 6 linhas = 18 na primeira placa
    expect(pos.filter((p) => p.placa === 0)).toHaveLength(18);
    for (const p of pos) expect(p.x + 76).toBeLessThanOrEqual(252);
    expect(() => arrumarNaMesa([{ largura: 300, altura: 20 }])).toThrow(/não cabe/);
    expect(origemDaPlaca(0, 2)).toEqual([0, 0]);
    expect(origemDaPlaca(1, 2)).toEqual([312, 0]);
    expect(origemDaPlaca(2, 3)).toEqual([0, -312]);
  });

  it("um objeto por nome, placas no model_settings e pausas em todas as placas", () => {
    const nomes = ["Ana", "Bia", "Caio"];
    const objetos = nomes.map((texto, i) => {
      const r = gerarChaveiro(M, lobster, { texto, largura: 60, simbolo: simbolo() }, CORES);
      const partes = r.malhas.map((m, k) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m), slot: 1 + k }));
      posicionarNaOrigem(partes.map((p) => p.geometria));
      return { nome: texto, partes, placa: i < 2 ? 0 : 1, posicao: [10 + i * 70, 10] };
    });
    const zip = unzipSync(gerar3mfVarios(objetos, { titulo: "Chaveiros", pausas: [2.6] }));
    const modelo = strFromU8(zip["3D/3dmodel.model"]);
    const config = strFromU8(zip["Metadata/model_settings.config"]);
    expect(modelo.match(/<item /g)).toHaveLength(3);
    expect(modelo).toContain('name="Caio"');
    expect(config.match(/<plate>/g)).toHaveLength(2);
    expect(config.match(/<model_instance>/g)).toHaveLength(3);
    expect(strFromU8(zip["Metadata/custom_gcode_per_layer.xml"]).match(/plate_info id="\d"/g)).toEqual(['plate_info id="1"', 'plate_info id="2"']);
  });
});
