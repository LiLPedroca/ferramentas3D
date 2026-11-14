// Peso de filamento estimado a partir do volume das partes (mm³), para levar à calculadora.
// Conta a peça maciça: em chaveiros e placas finas quase tudo é parede e camada sólida; o valor
// exato é o que o fatiador mostra.

export const DENSIDADE_PLA = 1.24; // g/cm³

// Valores típicos: variam com fabricante e aditivos. PLA/PETG seguem o padrão do programa;
// ABS/TPU: fichas Bambu Lab; ASA: https://prusament.com/wp-content/uploads/2022/10/ASA_Prusament_TDS_2022_16_EN.pdf
const DENSIDADES = { PLA: DENSIDADE_PLA, "PLA+": DENSIDADE_PLA, Silk: DENSIDADE_PLA, "PLA Silk": DENSIDADE_PLA, PETG: 1.27, ABS: 1.05, ASA: 1.07, TPU: 1.22 };
export const densidadeDoMaterial = (material) => DENSIDADES[material] ?? DENSIDADE_PLA;

// malhas: [{ nome, volume (mm³) }]. Devolve { partes: [{ nome, gramas }], total }.
export function pesoDasMalhas(malhas, densidade = DENSIDADE_PLA) {
  const partes = malhas.map((m) => ({ nome: m.nome, gramas: ((m.volume ?? 0) / 1000) * densidade }));
  return { partes, total: partes.reduce((s, p) => s + p.gramas, 0) };
}

const g = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 ? 1 : 0 });

// "≈ 4,8 g de filamento (Base e argola 3,1 g · Texto 1,7 g)"
export function textoDoPeso(peso) {
  const detalhe = peso.partes.length > 1 ? ` (${peso.partes.map((p) => `${p.nome} ${g(p.gramas)} g`).join(" · ")})` : "";
  return `≈ ${g(peso.total)} g de filamento${detalhe}`;
}

// "≈ 4,8 g" (para a linha de medidas da prévia)
export const pesoCurto = (malhas, densidade) => `≈ ${g(pesoDasMalhas(malhas, densidade).total)} g`;

// Volume (mm³) de uma BufferGeometry fechada (indexada ou não), pela soma dos tetraedros.
export function volumeDaGeometria(geometria) {
  const p = geometria.attributes.position.array;
  const ind = geometria.index?.array;
  const n = ind ? ind.length : p.length / 3;
  let v = 0;
  for (let t = 0; t < n; t += 3) {
    const a = (ind ? ind[t] : t) * 3;
    const b = (ind ? ind[t + 1] : t + 1) * 3;
    const c = (ind ? ind[t + 2] : t + 2) * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return Math.abs(v);
}
