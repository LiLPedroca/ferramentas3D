// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { coresDosSlots, gerar3mf } from "../src/renderer/modelos/exportar.js";
import { guardarMaterial, materialAtual, projetoDoFatiador } from "../src/renderer/modelos/projeto-fatiador.js";

const triangulo = () => {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], 3));
  g.setIndex([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]);
  return g;
};

describe("Projeto completo do Anycubic (cores certas no fatiador)", () => {
  it("uma cor por filamento, impressora Kobra X 0.4, perfil 0.20 Standard", () => {
    const p = projetoDoFatiador(["#1b1b1b", "#f4f4f4", "#c9a23a"], "PLA");
    expect(p.filament_colour).toEqual(["#1B1B1B", "#F4F4F4", "#C9A23A"]);
    expect(p.filament_colour_info).toEqual(p.filament_colour);
    expect(p.printer_settings_id).toBe("Anycubic Kobra X 0.4 nozzle");
    expect(p.print_settings_id).toBe("0.20mm Standard @Anycubic Kobra X 0.4 nozzle");
    expect(p.filament_settings_id).toEqual(Array(3).fill("Anycubic PLA @Anycubic Kobra X 0.4 nozzle"));
    expect(p.filament_type).toEqual(["PLA", "PLA", "PLA"]);
    expect(p.flush_volumes_matrix).toHaveLength(9);
    expect(Object.keys(p).length).toBeGreaterThan(500);
  });

  it("PETG troca o perfil e a temperatura do filamento", () => {
    const pla = projetoDoFatiador(["#000000"], "PLA");
    const petg = projetoDoFatiador(["#000000"], "PETG");
    expect(petg.filament_settings_id).toEqual(["Anycubic PETG @Anycubic Kobra X 0.4 nozzle"]);
    expect(petg.filament_type).toEqual(["PETG"]);
    expect(petg.nozzle_temperature).not.toEqual(pla.nozzle_temperature);
  });

  it("não guarda nada pessoal", () => {
    const texto = JSON.stringify(projetoDoFatiador(["#000000"]));
    expect(texto).not.toMatch(/Pedro|Users|C:\\\\|@gmail/);
  });

  it("o material lembra a última escolha (PLA na primeira vez)", () => {
    localStorage.clear();
    expect(materialAtual()).toBe("PLA");
    guardarMaterial("PETG");
    expect(materialAtual()).toBe("PETG");
    guardarMaterial("xyz");
    expect(materialAtual()).toBe("PETG");
  });

  it("cor de cada filamento vem da parte naquela posição; posição sem parte fica cinza", () => {
    expect(coresDosSlots([{ cor: "#111111" }, { cor: "#eeeeee" }], [3, 1])).toEqual(["#eeeeee", "#808080", "#111111"]);
  });

  it("o 3MF leva o projeto completo com as cores das partes e o material escolhido", () => {
    const bytes = gerar3mf(
      [
        { nome: "Cor 1", cor: "#1b1b1b", geometria: triangulo() },
        { nome: "Cor 2", cor: "#f4f4f4", geometria: triangulo() },
      ],
      { titulo: "Santos", material: "PETG" },
    );
    const zip = unzipSync(bytes);
    const projeto = JSON.parse(strFromU8(zip["Metadata/project_settings.config"]));
    expect(projeto.filament_colour).toEqual(["#1B1B1B", "#F4F4F4"]);
    expect(projeto.filament_type).toEqual(["PETG", "PETG"]);
    expect(strFromU8(zip["3D/3dmodel.model"])).toContain("BambuStudio:3mfVersion");
  });
});
