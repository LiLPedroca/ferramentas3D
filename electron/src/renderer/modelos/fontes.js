// Fontes incluídas no programa (licenças OFL/Apache junto dos arquivos em assets/fontes).
import * as opentype from "opentype.js";

export const CATEGORIAS_FONTES = [
  { nome: "Cursivas", fontes: ["Lobster", "DancingScript", "Pacifico", "Yellowtail", "GrandHotel", "Cookie", "GreatVibes", "Sacramento"] },
  { nome: "Divertidas", fontes: ["Fredoka", "Baloo2", "Chewy", "LuckiestGuy", "BubblegumSans", "Modak", "Sniglet", "Comfortaa", "Righteous"] },
  { nome: "Fortes", fontes: ["LilitaOne", "Bangers", "BebasNeue", "BlackOpsOne", "Oswald", "Rubik", "AbrilFatface"] },
  { nome: "Elegantes", fontes: ["Cinzel", "PlayfairDisplay"] },
  { nome: "Manuscritas", fontes: ["Caveat", "CaveatBrush", "PermanentMarker"] },
];

// "DancingScript" → "Dancing Script"; "Baloo2" → "Baloo 2"
const nomeDaFonte = (id) => id.replace(/([a-z])([A-Z0-9])/g, "$1 $2");

export const FONTES = CATEGORIAS_FONTES.flatMap((c) => c.fontes.map((id) => ({ id, nome: nomeDaFonte(id), categoria: c.nome })));

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

// Nome da família CSS para mostrar a fonte na tela (carrega o arquivo na primeira vez).
const registradas = new Set();
export function familiaCss(id) {
  const familia = `F3D-${id}`;
  if (!registradas.has(id) && typeof FontFace !== "undefined") {
    registradas.add(id);
    const face = new FontFace(familia, `url("assets/fontes/${id}-Regular.ttf")`);
    document.fonts.add(face);
    face.load().catch(() => {});
  }
  return `"${familia}", sans-serif`;
}
