// "Real × modelo": compara o que foi medido na peça impressa com o modelo e resume, por filamento,
// quanto os furos, os pinos e as medidas externas costumam sair diferentes.
// Furos e pinos: diferença em mm (a impressora erra uma quantidade fixa nas paredes curvas).
// Medidas externas: diferença em % (contração do material ao esfriar).

// Tipo da calibração a partir da medida do paquímetro.
export function tipoDaCalibracao(medida) {
  if (medida.tipo === "diametro") return medida.furo.tipo === "pino" ? "pino" : "furo";
  if (medida.tipo === "redondo") return medida.interno ? "furo" : "pino";
  return "externa";
}

const media = (lista) => lista.reduce((s, x) => s + x, 0) / lista.length;

// calibracoes: [{ filamento, tipo, modelo, real }]. Devolve { furo, pino, externa } com
// { diferenca (mm) | percentual, n } ou null quando não há medidas daquele tipo.
export function resumoCalibracao(calibracoes, filamento) {
  const doFilamento = (calibracoes ?? []).filter((c) => c.filamento === filamento);
  const resumo = { furo: null, pino: null, externa: null };
  for (const tipo of ["furo", "pino"]) {
    const l = doFilamento.filter((c) => c.tipo === tipo);
    if (l.length) resumo[tipo] = { diferenca: media(l.map((c) => c.real - c.modelo)), n: l.length };
  }
  const ext = doFilamento.filter((c) => c.tipo === "externa");
  if (ext.length) resumo.externa = { percentual: media(ext.map((c) => (c.real / c.modelo - 1) * 100)), n: ext.length };
  return resumo;
}

// Quanto deve sair na impressão, com base no resumo (null se não houver calibração daquele tipo).
export function previsaoImpressa(tipo, valorModelo, resumo) {
  if (tipo === "externa") return resumo.externa ? valorModelo * (1 + resumo.externa.percentual / 100) : null;
  return resumo[tipo] ? valorModelo + resumo[tipo].diferenca : null;
}

const mmTexto = (n) => `${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`;
const pctTexto = (n) => `${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
const vezes = (n) => `${n} ${n === 1 ? "medida" : "medidas"}`;

// "Furos saem 0,15 mm menores (3 medidas) · …"
export function textoDoResumo(resumo) {
  const partes = [];
  const lado = (d, maior, menor) => (Math.abs(d) < 0.005 ? "na medida" : `${mmTexto(d)} ${d > 0 ? maior : menor}`);
  if (resumo.furo) partes.push(`furos saem ${lado(resumo.furo.diferenca, "maiores", "menores")} (${vezes(resumo.furo.n)})`);
  if (resumo.pino) partes.push(`pinos saem ${lado(resumo.pino.diferenca, "mais grossos", "mais finos")} (${vezes(resumo.pino.n)})`);
  if (resumo.externa) {
    const p = resumo.externa.percentual;
    partes.push(`medidas externas ${Math.abs(p) < 0.05 ? "na medida" : `${pctTexto(p)} ${p > 0 ? "maiores" : "menores"}`} (${vezes(resumo.externa.n)})`);
  }
  if (!partes.length) return "";
  const texto = partes.join(" · ");
  return texto[0].toUpperCase() + texto.slice(1) + ".";
}

// Texto curto de uma conferência: "−0,15 mm (−1,9%)"
export function textoDiferenca(modelo, real) {
  const d = real - modelo;
  const sinal = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sinal}${mmTexto(d)} (${sinal}${pctTexto((d / modelo) * 100)})`;
}
