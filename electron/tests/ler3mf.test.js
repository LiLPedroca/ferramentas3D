import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { strToU8, zipSync } from "three/examples/jsm/libs/fflate.module.js";
import { gerar3mf } from "../src/renderer/modelos/exportar.js";
import { filamentoDaPintura, ler3mf } from "../src/renderer/modelos/ler3mf.js";

const tri = (v1, v2, v3, extra = "") => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"${extra}/>`;
const malha = `<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="5"/></vertices><triangles>${tri(0, 2, 1)}${tri(0, 1, 3, ' paint_color="8"')}${tri(1, 2, 3)}${tri(0, 3, 2)}</triangles></mesh>`;

function caixa(posicoes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posicoes.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], posicoes[i + k]);
      max[k] = Math.max(max[k], posicoes[i + k]);
    }
  }
  return { min, max };
}

// 3MF no formato do Bambu: objeto em arquivo separado (extensão production), filamentos e placas.
function bambu({ placas = false } = {}) {
  const raiz =
    `<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">` +
    `<resources><object id="7" type="model"><components><component p:path="/3D/Objects/peca.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 100 50 0"/></components></object>` +
    `<object id="9" type="model"><components><component p:path="/3D/Objects/peca.model" objectid="1"/></components></object></resources>` +
    `<build><item objectid="7" transform="1 0 0 0 1 0 0 0 1 0 0 2"/><item objectid="9"/></build></model>`;
  const placasXml = placas
    ? `<plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Tampa"/><model_instance><metadata key="object_id" value="7"/></model_instance></plate>` +
      `<plate><metadata key="plater_id" value="2"/><metadata key="plater_name" value=""/><model_instance><metadata key="object_id" value="9"/></model_instance></plate>`
    : "";
  return zipSync({
    "_rels/.rels": strToU8(`<Relationships><Relationship Target="/3D/3dmodel.model" Id="rel0"/></Relationships>`),
    "3D/3dmodel.model": strToU8(raiz),
    "3D/Objects/peca.model": strToU8(`<model unit="millimeter"><resources><object id="1" type="model">${malha}</object></resources></model>`),
    "Metadata/model_settings.config": strToU8(
      `<config><object id="7"><metadata key="name" value="Tampa"/><metadata key="extruder" value="1"/><part id="1"><metadata key="name" value="Tampa"/></part></object>` +
        `<object id="9"><metadata key="extruder" value="2"/></object>${placasXml}</config>`,
    ),
    "Metadata/project_settings.config": strToU8(`{ "filament_colour": [ "#0A2989", "#D4AF37" ] }`),
  });
}

describe("ler3mf", () => {
  it("lê o 3MF que o próprio programa gera, com as cores de cada parte", () => {
    const base = new THREE.BoxGeometry(20, 10, 4);
    const texto = new THREE.BoxGeometry(5, 5, 2).translate(0, 0, 3);
    const r = ler3mf(gerar3mf([{ nome: "Base", cor: "#112233", geometria: base }, { nome: "Texto", cor: "#ffffff", geometria: texto }]));
    expect(r.pecas.map((p) => [p.nome, p.cor])).toEqual([["Base", "#112233"], ["Texto", "#ffffff"]]);
    expect(r.pecas[0].posicoes.length).toBe(12 * 9);
    const { min, max } = caixa(r.pecas[0].posicoes);
    expect(max[0] - min[0]).toBeCloseTo(20);
    expect(max[2] - min[2]).toBeCloseTo(4); // Z continua para cima
  });

  it("Bambu/Orca: componentes em outro arquivo, transformações, filamentos e pintura", () => {
    const r = ler3mf(bambu());
    expect(r.pecas).toHaveLength(2);
    const [tampa, outra] = r.pecas;
    expect(tampa.cor).toBe("#0a2989"); // filamento 1 do objeto 7
    expect(outra.cor).toBe("#d4af37"); // filamento 2 do objeto 9
    expect(tampa.coresTriangulos[1]).toBe("#d4af37"); // triângulo pintado com o filamento 2
    const { min } = caixa(tampa.posicoes);
    expect(min).toEqual([100, 50, 2]); // componente (100, 50, 0) + item (0, 0, 2)
  });

  it("projeto com várias placas mostra uma placa por vez", () => {
    const r = ler3mf(bambu({ placas: true }));
    expect(r.placas).toEqual([{ id: "1", nome: "Tampa" }, { id: "2", nome: "Placa 2" }]);
    expect(r.placa).toBe("1");
    expect(r.pecas).toHaveLength(1);
    expect(ler3mf(bambu({ placas: true }), { placa: "2" }).pecas[0].cor).toBe("#d4af37");
  });

  it("código de pintura: só triângulos inteiros", () => {
    expect([filamentoDaPintura("4"), filamentoDaPintura("8"), filamentoDaPintura("0C"), filamentoDaPintura("1C")]).toEqual([1, 2, 3, 4]);
    expect(filamentoDaPintura("4C38")).toBe(0);
    expect(filamentoDaPintura(undefined)).toBe(0);
  });

  it("unidade em polegadas vira milímetros", () => {
    const bytes = zipSync({
      "3D/3dmodel.model": strToU8(`<model unit="inch"><resources><object id="1">${malha}</object></resources><build><item objectid="1"/></build></model>`),
    });
    const { max } = caixa(ler3mf(bytes).pecas[0].posicoes);
    expect(max[0]).toBeCloseTo(254);
  });

  it("arquivo inválido avisa", () => {
    expect(() => ler3mf(new Uint8Array([1, 2, 3]))).toThrow(/danificado/);
    expect(() => ler3mf(zipSync({ "a.txt": strToU8("x") }))).toThrow(/modelo 3D/);
  });
});
