// Fontes incluídas no programa (licenças OFL/Apache junto dos arquivos em assets/fontes).
import * as opentype from "opentype.js";

export const FONTES = [
  { id: "Fredoka", nome: "Fredoka" },
  { id: "Baloo2", nome: "Baloo 2" },
  { id: "LilitaOne", nome: "Lilita One" },
  { id: "LuckiestGuy", nome: "Luckiest Guy" },
  { id: "Bangers", nome: "Bangers" },
  { id: "Righteous", nome: "Righteous" },
  { id: "Chewy", nome: "Chewy" },
  { id: "Pacifico", nome: "Pacifico (cursiva)" },
  { id: "Lobster", nome: "Lobster (cursiva)" },
  { id: "BlackOpsOne", nome: "Black Ops One" },
  { id: "Oswald", nome: "Oswald" },
  { id: "PermanentMarker", nome: "Permanent Marker" },
];

const cache = new Map();

export async function carregarFonte(id) {
  if (!cache.has(id)) {
    cache.set(
      id,
      (async () => {
        const resposta = await window.modelos.lerFonte(id);
        if (!resposta.ok) throw new Error(resposta.erro);
        const bytes = resposta.dados;
        return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      })(),
    );
  }
  try {
    return await cache.get(id);
  } catch (erro) {
    cache.delete(id);
    throw erro;
  }
}
