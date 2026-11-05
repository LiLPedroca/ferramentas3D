// Peso de filamento estimado a partir do volume das partes (mm³), para levar à calculadora.
// Conta a peça maciça: em chaveiros e placas finas quase tudo é parede e camada sólida; o valor
// exato é o que o fatiador mostra.

export const DENSIDADE_PLA = 1.24; // g/cm³

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
export const pesoCurto = (malhas) => `≈ ${g(pesoDasMalhas(malhas).total)} g`;
