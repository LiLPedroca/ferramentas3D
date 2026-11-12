// Fotos HEIC/HEIF (padrão do iPhone): o Chromium não abre, então o processo principal decodifica
// com o libheif (WASM, pelo pacote heic-decode) e devolve os pixels RGBA para a tela.
const { ErroValidacao } = require("../core/validacao.cjs");

const LIMITE_BYTES = 100 * 1024 * 1024;
const LIMITE_PIXELS = 100_000_000; // 100 MP

let decodificador = null;

async function heicParaRgba(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new ErroValidacao("Arquivo HEIC vazio.");
  if (bytes.length > LIMITE_BYTES) throw new ErroValidacao("Foto HEIC maior que 100 MB.");
  decodificador ??= require("heic-decode");
  let imagem;
  try {
    imagem = await decodificador({ buffer: bytes });
  } catch {
    throw new ErroValidacao("Não foi possível ler esta foto HEIC. Ela pode estar danificada.");
  }
  const { width, height, data } = imagem;
  if (!width || !height || width * height > LIMITE_PIXELS) throw new ErroValidacao("Foto HEIC grande demais.");
  return { largura: width, altura: height, rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

module.exports = { heicParaRgba };
