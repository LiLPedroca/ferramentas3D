import { describe, expect, it } from "vitest";
import { analisarImagem, detectarFormato, lerExif, limparImagem } from "../src/core/metadados.js";

const txt = (s) => [...new TextEncoder().encode(s)];
const u16be = (n) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16le = (n) => [n & 0xff, (n >> 8) & 0xff];
const u32le = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

// TIFF "II" com IFD0: Make, Model, Software e ponteiro para um IFD de GPS com 1 entrada.
function tiffExemplo() {
  const textos = { 0x010f: "Canon\0", 0x0110: "EOS R6\0", 0x0131: "Photoshop\0" };
  const entradas = Object.keys(textos).length + 1;
  const ifd = 8;
  const dadosInicio = ifd + 2 + entradas * 12 + 4;
  const corpo = [];
  let dadosOffset = dadosInicio;
  const dados = [];
  const linhas = [];
  for (const [tag, valor] of Object.entries(textos)) {
    const b = txt(valor);
    linhas.push([...u16le(Number(tag)), ...u16le(2), ...u32le(b.length), ...u32le(dadosOffset)]);
    dados.push(...b);
    dadosOffset += b.length;
  }
  const gpsOffset = dadosOffset;
  linhas.push([...u16le(0x8825), ...u16le(4), ...u32le(1), ...u32le(gpsOffset)]);
  corpo.push(...txt("II"), ...u16le(42), ...u32le(ifd), ...u16le(entradas));
  linhas.forEach((l) => corpo.push(...l));
  corpo.push(...u32le(0), ...dados);
  // IFD de GPS: 1 entrada qualquer
  corpo.push(...u16le(1), ...u16le(0x0001), ...u16le(2), ...u32le(2), ...txt("S\0\0\0"), ...u32le(0));
  return corpo;
}

function segmento(marcador, dados) {
  return [0xff, marcador, ...u16be(dados.length + 2), ...dados];
}

function jpegExemplo() {
  return new Uint8Array([
    0xff, 0xd8,
    ...segmento(0xe0, [...txt("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segmento(0xe1, [...txt("Exif\0\0"), ...tiffExemplo()]),
    ...segmento(0xe2, [...txt("ICC_PROFILE\0"), 1, 1, 9, 9]),
    ...segmento(0xfe, txt("feito no celular")),
    ...segmento(0xdb, [0, ...new Array(64).fill(1)]),
    ...segmento(0xda, [1, 1, 0, 0, 63, 0]),
    0x12, 0x34, 0x56,
    0xff, 0xd9,
  ]);
}

function blocoPng(tipo, dados) {
  return [...u32be(dados.length), ...txt(tipo), ...dados, 0, 0, 0, 0]; // CRC não é conferido aqui
}

function pngExemplo() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...blocoPng("IHDR", new Array(13).fill(0)),
    ...blocoPng("tEXt", [...txt("parameters"), 0, ...txt("a cat, Steps: 20")]),
    ...blocoPng("iCCP", [...txt("icc"), 0, 0, 1, 2]),
    ...blocoPng("IDAT", [1, 2, 3]),
    ...blocoPng("IEND", []),
  ]);
}

function webpExemplo() {
  const vp8x = [...txt("VP8X"), ...u32le(10), 0x08 | 0x04 | 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const iccp = [...txt("ICCP"), ...u32le(2), 7, 7];
  const vp8 = [...txt("VP8 "), ...u32le(4), 1, 2, 3, 4];
  const exif = [...txt("EXIF"), ...u32le(tiffExemplo().length), ...tiffExemplo()];
  if (exif.length % 2) exif.push(0);
  const xmp = [...txt("XMP "), ...u32le(4), ...txt("<x/>")];
  const corpo = [...txt("WEBP"), ...vp8x, ...iccp, ...vp8, ...exif, ...xmp];
  return new Uint8Array([...txt("RIFF"), ...u32le(corpo.length), ...corpo]);
}

describe("formatos", () => {
  it("detecta pelo conteúdo", () => {
    expect(detectarFormato(jpegExemplo())).toBe("jpeg");
    expect(detectarFormato(pngExemplo())).toBe("png");
    expect(detectarFormato(webpExemplo())).toBe("webp");
    expect(detectarFormato(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("EXIF", () => {
  it("lê câmera, programa e a presença de GPS", () => {
    const r = lerExif(new Uint8Array(tiffExemplo()));
    expect(r.campos).toMatchObject({ fabricante: "Canon", modelo: "EOS R6", programa: "Photoshop" });
    expect(r.temGps).toBe(true);
  });

  it("não quebra com EXIF truncado", () => {
    expect(lerExif(new Uint8Array(tiffExemplo().slice(0, 20)))).toMatchObject({ temGps: false });
  });
});

describe("JPEG", () => {
  it("encontra GPS, câmera, programa e comentário", () => {
    const r = analisarImagem(jpegExemplo());
    const tipos = r.itens.map((i) => i.tipo);
    expect(tipos).toEqual(expect.arrayContaining(["gps", "camera", "programa", "comentario"]));
    expect(r.temIcc).toBe(true);
  });

  it("limpa metadados e mantém a imagem e o perfil de cor", () => {
    const limpo = limparImagem(jpegExemplo());
    expect(analisarImagem(limpo).itens).toEqual([]);
    expect(analisarImagem(limpo).temIcc).toBe(true);
    // dados da imagem (depois do SOS) intactos
    expect([...limpo.slice(-5)]).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
    expect(limpo.length).toBeLessThan(jpegExemplo().length);
  });

  it("sem manter cor, tira também o ICC", () => {
    expect(analisarImagem(limparImagem(jpegExemplo(), { manterCor: false })).temIcc).toBe(false);
  });

  it("arquivo danificado avisa", () => {
    expect(() => analisarImagem(jpegExemplo().slice(0, 30))).toThrow(/danificado/);
  });
});

describe("PNG", () => {
  it("encontra texto embutido e limpa", () => {
    const r = analisarImagem(pngExemplo());
    expect(r.itens[0]).toMatchObject({ tipo: "texto" });
    expect(r.textos[0]).toContain("Steps: 20");
    const limpo = limparImagem(pngExemplo());
    expect(analisarImagem(limpo).itens).toEqual([]);
    expect(analisarImagem(limpo).temIcc).toBe(true);
  });
});

describe("WebP", () => {
  it("remove EXIF e XMP, corrige sinalizadores e o tamanho do RIFF", () => {
    const original = webpExemplo();
    expect(analisarImagem(original).itens.map((i) => i.tipo)).toEqual(expect.arrayContaining(["gps", "xmp"]));
    const limpo = limparImagem(original);
    expect(analisarImagem(limpo).itens).toEqual([]);
    const visao = new DataView(limpo.buffer);
    expect(visao.getUint32(4, true)).toBe(limpo.length - 8);
    expect(limpo[20] & 0x0c).toBe(0); // sinalizadores EXIF/XMP desligados
    expect(limpo[20] & 0x20).toBe(0x20); // ICC mantido
  });
});
