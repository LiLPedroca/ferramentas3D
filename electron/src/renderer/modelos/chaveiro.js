// Chaveiro de nome: base com argola + texto em relevo, em duas partes (duas cores).
import { baseComArgola, extrudar, formasDoTexto, posicionarNaOrigem } from "./geometria.js";

export const LIMITES_CHAVEIRO = {
  texto: 20,
  alturaTexto: [6, 40],
  espessuraBase: [1.2, 8],
  alturaRelevo: [0.4, 6],
  margem: [1.5, 10],
  furo: [2.5, 10],
};

function numero(valor, nome, [minimo, maximo]) {
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < minimo || n > maximo) {
    throw new Error(`${nome}: use um valor entre ${String(minimo).replace(".", ",")} e ${String(maximo).replace(".", ",")} mm.`);
  }
  return n;
}

export function validarOpcoesChaveiro(o) {
  const texto = String(o.texto ?? "").replace(/\s+/g, " ").trim();
  if (!texto) throw new Error("Digite o texto do chaveiro.");
  if (texto.length > LIMITES_CHAVEIRO.texto) throw new Error(`Use no máximo ${LIMITES_CHAVEIRO.texto} caracteres.`);
  return {
    texto,
    alturaTexto: numero(o.alturaTexto, "Altura das letras", LIMITES_CHAVEIRO.alturaTexto),
    espessuraBase: numero(o.espessuraBase, "Espessura da base", LIMITES_CHAVEIRO.espessuraBase),
    alturaRelevo: numero(o.alturaRelevo, "Altura do relevo", LIMITES_CHAVEIRO.alturaRelevo),
    margem: numero(o.margem, "Margem", LIMITES_CHAVEIRO.margem),
    furo: numero(o.furo, "Furo da argola", LIMITES_CHAVEIRO.furo),
    espacamento: Number(o.espacamento) || 0,
    corBase: /^#[0-9a-f]{6}$/i.test(o.corBase) ? o.corBase : "#1f2937",
    corTexto: /^#[0-9a-f]{6}$/i.test(o.corTexto) ? o.corTexto : "#f8fafc",
  };
}

// fonte: fonte do opentype.js. Devolve { partes, tamanho: Vector3 (mm) }.
export function gerarChaveiro(fonte, opcoes) {
  const o = validarOpcoesChaveiro(opcoes);
  const { formas, caixa } = formasDoTexto(fonte, o.texto, o.alturaTexto, { espacamento: o.espacamento });
  const { forma } = baseComArgola(caixa, { margem: o.margem, furo: o.furo });
  const base = extrudar(forma, o.espessuraBase, 0);
  const relevo = extrudar(formas, o.alturaRelevo, o.espessuraBase);
  const tamanho = posicionarNaOrigem([base, relevo]);
  return {
    partes: [
      { nome: "Base", cor: o.corBase, geometria: base },
      { nome: "Texto", cor: o.corTexto, geometria: relevo },
    ],
    tamanho,
    opcoes: o,
  };
}
