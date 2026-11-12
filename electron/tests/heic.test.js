// Fotos HEIC: reconhecer o formato, ler metadados (EXIF/GPS) e decodificar os pixels no main.
// As fotos de teste foram geradas por script: desenho simples, câmera e GPS fictícios.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { analisarImagem, detectarFormato, ehHeic, limparImagem } from "../src/core/metadados.js";
import { detectarIA } from "../src/core/detector-ia.js";

const require = createRequire(import.meta.url);
const { heicParaRgba } = require("../src/main/heic.cjs");
const ler = (nome) => new Uint8Array(readFileSync(new URL(`./dados/${nome}`, import.meta.url)));

const ftyp = (marca, compativeis = []) => {
  const texto = [marca, "\0\0\0\0", ...compativeis].join("");
  const b = new Uint8Array(8 + texto.length);
  new DataView(b.buffer).setUint32(0, b.length);
  b.set([..."ftyp"].map((c) => c.charCodeAt(0)), 4);
  b.set([...texto].map((c) => c.charCodeAt(0)), 8);
  return b;
};

describe("HEIC", () => {
  it("reconhece HEIC pela caixa ftyp e deixa AVIF de fora", () => {
    expect(ehHeic(ler("foto-teste.heic"))).toBe(true);
    expect(detectarFormato(ler("foto-teste.heic"))).toBe("heic");
    expect(ehHeic(ftyp("heic"))).toBe(true);
    expect(ehHeic(ftyp("mif1", ["mif1", "heic"]))).toBe(true);
    expect(ehHeic(ftyp("avif", ["mif1", "avif"]))).toBe(false);
    expect(ehHeic(ftyp("mif1", ["mif1", "avif"]))).toBe(false);
    expect(ehHeic(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it("lê câmera e GPS do EXIF", () => {
    const r = analisarImagem(ler("foto-teste.heic"));
    expect(r.itens.map((i) => i.tipo)).toEqual(["gps", "camera"]);
    expect(r.itens[1].detalhe).toBe("Apple iPhone Teste");
    expect(detectarIA(ler("foto-teste.heic")).nivel).toBe("nenhum");
    expect(analisarImagem(ler("alfa-teste.heic")).itens).toEqual([]);
  });

  it("não tenta limpar HEIC nos bytes (a tela salva em JPEG)", () => {
    expect(() => limparImagem(ler("foto-teste.heic"))).toThrow(/JPEG/);
  });

  it("arquivo cortado vira erro em português", () => {
    expect(() => analisarImagem(ler("foto-teste.heic").slice(0, 200))).toThrow(/danificado/);
  });

  it("decodifica os pixels no processo principal", async () => {
    const { largura, altura, rgba } = await heicParaRgba(ler("foto-teste.heic"));
    expect([largura, altura]).toEqual([400, 300]);
    expect(rgba.length).toBe(400 * 300 * 4);
    const px = (x, y) => [...rgba.subarray((y * largura + x) * 4, (y * largura + x) * 4 + 4)];
    expect(px(5, 5)).toEqual([255, 255, 255, 255].map((v) => expect.closeTo(v, -1.5)));
    const centro = px(200, 60); // verde do losango
    expect(centro[1]).toBeGreaterThan(centro[0] + 50);
    const alfa = await heicParaRgba(ler("alfa-teste.heic"));
    expect(alfa.rgba[3]).toBe(0); // canto transparente
    expect(alfa.rgba[(100 * 200 + 100) * 4 + 3]).toBe(255);
  });

  it("recusa arquivo que não é HEIC com mensagem clara", async () => {
    await expect(heicParaRgba(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/HEIC/);
    await expect(heicParaRgba(null)).rejects.toThrow(/vazio/);
  });
});
