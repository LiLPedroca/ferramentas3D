import { describe, expect, it } from "vitest";
import { detectarIA } from "../src/core/detector-ia.js";

const txt = (s) => [...new TextEncoder().encode(s)];
const u16be = (n) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16le = (n) => [n & 0xff, (n >> 8) & 0xff];
const u32le = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

const segmento = (m, dados) => [0xff, m, ...u16be(dados.length + 2), ...dados];
const fimJpeg = [...segmento(0xda, [1, 1, 0, 0, 63, 0]), 0x11, 0x22, 0xff, 0xd9];

function jpeg(...segmentos) {
  return new Uint8Array([0xff, 0xd8, ...segmentos.flat(), ...fimJpeg]);
}

function exifSoftware(nome) {
  const valor = txt(`${nome}\0`);
  const tiff = [...txt("II"), ...u16le(42), ...u32le(8), ...u16le(1), ...u16le(0x0131), ...u16le(2), ...u32le(valor.length), ...u32le(26), ...u32le(0), ...valor];
  return segmento(0xe1, [...txt("Exif\0\0"), ...tiff]);
}

function png(chave, texto) {
  const bloco = (tipo, d) => [...u32be(d.length), ...txt(tipo), ...d, 0, 0, 0, 0];
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...bloco("IHDR", new Array(13).fill(0)),
    ...bloco("tEXt", [...txt(chave), 0, ...txt(texto)]),
    ...bloco("IDAT", [1]),
    ...bloco("IEND", []),
  ]);
}

describe("Detector de IA", () => {
  it("imagem sem metadados: nenhum indício", () => {
    const r = detectarIA(jpeg());
    expect(r.nivel).toBe("nenhum");
    expect(r.evidencias).toEqual([]);
  });

  it("XMP com DigitalSourceType de IA", () => {
    const xmp = segmento(0xe1, [...txt("http://ns.adobe.com/xap/1.0/\0"), ...txt('<x Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>')]);
    const r = detectarIA(jpeg(xmp));
    expect(r.nivel).toBe("forte");
    expect(r.evidencias[0].rotulo).toBe("Imagem gerada por IA");
  });

  it("EXIF citando o gerador", () => {
    const r = detectarIA(jpeg(exifSoftware("Adobe Firefly")));
    expect(r.nivel).toBe("forte");
    expect(r.evidencias.some((e) => e.detalhe.includes("Adobe Firefly"))).toBe(true);
  });

  it("parâmetros do Stable Diffusion em PNG", () => {
    const r = detectarIA(png("parameters", "a cat\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 123"));
    expect(r.nivel).toBe("forte");
    expect(r.evidencias.map((e) => e.rotulo)).toContain("Parâmetros de geração");
  });

  it("fluxo do ComfyUI em PNG", () => {
    const r = detectarIA(png("prompt", '{"3": {"class_type": "KSampler"}}'));
    expect(r.evidencias.map((e) => e.rotulo)).toContain("Fluxo do ComfyUI");
  });

  it("C2PA sem marca de IA: só registro de origem", () => {
    const c2pa = segmento(0xeb, [...txt("JP"), 0, 1, ...txt("jumbc2pa manifest")]);
    const r = detectarIA(jpeg(c2pa));
    expect(r.nivel).toBe("credenciais");
  });

  it("palavras soltas não viram falso positivo", () => {
    // "gemini" sem "google" e "firefly" sem "adobe" não contam
    const r = detectarIA(jpeg(exifSoftware("Gemini Firefly Camera")));
    expect(r.nivel).toBe("nenhum");
  });

  it("formato desconhecido avisa", () => {
    expect(() => detectarIA(new Uint8Array([1, 2, 3]))).toThrow(/Formato/);
  });
});
