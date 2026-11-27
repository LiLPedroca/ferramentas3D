import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { lerPacoteCopo } from "../src/renderer/modelos/copos.js";

// A assinatura Criae3D do fundo só aparece no arquivo exportado: na prévia o fundo fica liso, na cor principal.
const pasta = new URL("../src/renderer/assets/copos/", import.meta.url);
const lerPreviaCrua = (id) => {
  const b = gunzipSync(readFileSync(new URL(`${id}.bin.gz`, pasta)));
  const n = b.readUInt32LE(0);
  const info = JSON.parse(b.subarray(4, 4 + n).toString());
  return info.partes.map((p) => p.count / 9);
};

describe("prévia dos copos sem a assinatura do fundo", () => {
  it.each([1, 2, 3, 4])("copo %i: nenhum triângulo some e o fundo fica de uma cor só", (id) => {
    const antes = lerPreviaCrua(id);
    const pacote = lerPacoteCopo(new Uint8Array(gunzipSync(readFileSync(new URL(`${id}.bin.gz`, pasta)))));
    const depois = pacote.partes.map((p) => p.geometria.attributes.position.count / 3);
    expect(depois.reduce((s, x) => s + x, 0)).toBe(antes.reduce((s, x) => s + x, 0));
    const comFundo = pacote.partes.filter((p) => {
      const a = p.geometria.attributes.position.array;
      for (let i = 0; i < a.length; i += 9) if (a[i + 2] <= 0.01 && a[i + 5] <= 0.01 && a[i + 8] <= 0.01) return true;
      return false;
    });
    expect(comFundo).toHaveLength(1);
  }, 60000);
});
