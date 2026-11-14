// Gasto de filamento por cor lido do 3MF fatiado (slice_info.config), para descontar do estoque.
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { filamentosDo3mf } from "../src/renderer/impressoes-arquivo.js";

const config = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <filament id="1" tray_info_idx="GFL99" type="PLA" color="#000000" used_m="6.05" used_g="18.04" />
    <filament id="2" tray_info_idx="GFL99" type="PLA" color="#D4AF37" used_m="1.99" used_g="5.93" />
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <filament id="1" type="PLA" color="#000000" used_g="2" />
  </plate>
</config>`;

describe("3MF fatiado: filamento por cor", () => {
  it("soma as placas por filamento e guarda a cor e o tipo", () => {
    const bytes = zipSync({ "Metadata/slice_info.config": strToU8(config), "3D/3dmodel.model": strToU8("<model/>") });
    expect(filamentosDo3mf(bytes)).toEqual([
      { hex: "#000000", tipo: "PLA", gramas: 20.04 },
      { hex: "#D4AF37", tipo: "PLA", gramas: 5.93 },
    ]);
  });

  it("3MF sem fatiar ou arquivo estranho: lista vazia", () => {
    expect(filamentosDo3mf(zipSync({ "3D/3dmodel.model": strToU8("<model/>") }))).toEqual([]);
    expect(filamentosDo3mf(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});
