// Abre imagens escolhidas pelo usuário. PNG, JPEG e WebP o Chromium abre sozinho; HEIC/HEIF (fotos do
// iPhone) é decodificado pelo processo principal (window.imagens) e volta como pixels RGBA.
import { ehHeic } from "../core/metadados.js";

// Confere pelos bytes do começo (no Windows o arquivo HEIC às vezes chega sem tipo).
export async function arquivoEhHeic(arquivo) {
  return ehHeic(new Uint8Array(await arquivo.slice(0, 256).arrayBuffer()));
}

async function pixelsDoHeic(arquivo) {
  const resposta = await window.imagens.heicParaRgba(new Uint8Array(await arquivo.arrayBuffer()));
  if (!resposta.ok) throw new Error(resposta.erro);
  const { largura, altura, rgba } = resposta.dados;
  return new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), largura, altura);
}

// ImageBitmap de um arquivo PNG, JPEG, WebP ou HEIC.
export async function abrirImagem(arquivo) {
  if (await arquivoEhHeic(arquivo)) return createImageBitmap(await pixelsDoHeic(arquivo));
  return createImageBitmap(arquivo);
}

async function blobDoBitmap(bitmap, tipo, qualidade) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (tipo === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: tipo, quality: qualidade });
}

const semExtensaoHeic = (nome) => nome.replace(/\.(heic|heif)$/i, "");

// Arquivo que o navegador consegue mostrar (<img>, URL): HEIC vira PNG; os outros voltam iguais.
export async function arquivoLegivel(arquivo) {
  if (!(await arquivoEhHeic(arquivo))) return arquivo;
  const blob = await blobDoBitmap(await abrirImagem(arquivo), "image/png");
  return new File([blob], `${semExtensaoHeic(arquivo.name || "foto")}.png`, { type: "image/png" });
}

// Cópia em JPEG de uma foto HEIC (sai sem metadados, porque os pixels são regravados).
export async function jpegDoHeic(arquivo, qualidade = 0.92) {
  const blob = await blobDoBitmap(await abrirImagem(arquivo), "image/jpeg", qualidade);
  return new Uint8Array(await blob.arrayBuffer());
}

export const nomeJpeg = (nome) => `${semExtensaoHeic(nome)}.jpg`;
