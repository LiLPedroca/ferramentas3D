import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { describe, expect, it } from "vitest";
import { marcar3mf, marcarStl, nomeComMarca } from "../src/renderer/modelos/marca.js";
import { gerar3mf } from "../src/renderer/modelos/exportar.js";
import * as THREE from "three";

describe("marca Criae3D nos arquivos", () => {
  it("acrescenta a marca ao nome uma vez só", () => {
    expect(nomeComMarca("Maria")).toBe("Maria - Criae3D");
    expect(nomeComMarca("Maria - Criae3D")).toBe("Maria - Criae3D");
    expect(nomeComMarca("  ")).toBe("Modelo - Criae3D");
  });

  it("3MF: título, designer e direitos, sem duplicar e sem mexer nas malhas", () => {
    const geometria = new THREE.BoxGeometry(10, 10, 10);
    const bytes = gerar3mf([{ nome: "Cubo", cor: "#ffffff", geometria }], { titulo: "Velho", material: "PLA" });
    const marcado = marcar3mf(marcar3mf(bytes, "Primeiro - Criae3D"), "João & Maria - Criae3D");
    const antes = unzipSync(bytes);
    const depois = unzipSync(marcado);
    const modelo = strFromU8(depois["3D/3dmodel.model"]);
    expect(modelo).toContain('<metadata name="Title">João &amp; Maria - Criae3D</metadata>');
    expect(modelo).toContain('<metadata name="Designer">Criae3D</metadata>');
    expect(modelo.match(/name="Title"/g)).toHaveLength(1);
    expect(modelo.match(/name="Designer"/g)).toHaveLength(1);
    expect(modelo).not.toContain("Velho</metadata>");
    for (const nome of Object.keys(antes)) if (nome !== "3D/3dmodel.model") expect(depois[nome]).toEqual(antes[nome]);
  });

  it("STL: cabeçalho com a marca, sem começar com solid", () => {
    const stl = new Uint8Array(84 + 50);
    new DataView(stl.buffer).setUint32(80, 1, true);
    const marcado = marcarStl(stl, "Ação");
    const cabecalho = new TextDecoder().decode(marcado.subarray(0, 80)).trim();
    expect(cabecalho).toBe("Criae3D - Acao");
    expect(new DataView(marcado.buffer).getUint32(80, true)).toBe(1);
    expect(stl[0]).toBe(0); // original intacto
  });
});
