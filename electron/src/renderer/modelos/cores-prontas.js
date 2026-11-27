// Cores prontas dos modelos: as 13 com tinta de Minhas Impressões (Transparente fica de fora).
// Toda cor de modelo é uma delas; uma cor antiga fora da lista vira a mais parecida.
import modeloImpressao from "../../core/impressao.cjs";

export const CORES_PRONTAS = modeloImpressao.CORES.filter((c) => c.hex);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const RGB = CORES_PRONTAS.map((c) => rgb(c.hex));

// Distância "redmean" (a mesma do criador de logos).
function distancia(a, b) {
  const r = (a[0] + b[0]) / 2;
  const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  return (2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db;
}

// "#rrggbb" -> hex da cor pronta mais parecida; valor inválido -> padrao.
export function corPronta(hex, padrao = CORES_PRONTAS[0].hex) {
  if (!/^#[0-9a-f]{6}$/i.test(String(hex ?? ""))) return padrao;
  const alvo = rgb(hex);
  let melhor = 0;
  let menor = Infinity;
  RGB.forEach((c, i) => {
    const d = distancia(alvo, c);
    if (d < menor) [menor, melhor] = [d, i];
  });
  return CORES_PRONTAS[melhor].hex;
}

export const HEX = Object.fromEntries(CORES_PRONTAS.map((c) => [c.id, c.hex]));
