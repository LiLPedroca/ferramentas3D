// Palavras decorativas: até 3 linhas centralizadas, como placa (relevo sobre base) ou letreiro
// (letras grossas unidas por uma barra, para ficar em pé).
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { extrudar, formasDoTexto, moverFormas, placaArredondada, posicionarNaOrigem, retangulo } from "./geometria.js";

export const LIMITES_PALAVRAS = { linhas: 3, texto: 30, altura: [6, 60], espessura: [1.2, 12], relevo: [0.4, 6], espacamento: [0, 30] };

function numero(valor, nome, [minimo, maximo]) {
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < minimo || n > maximo) {
    throw new Error(`${nome}: use um valor entre ${String(minimo).replace(".", ",")} e ${String(maximo).replace(".", ",")} mm.`);
  }
  return n;
}

const cor = (c, padrao) => (/^#[0-9a-f]{6}$/i.test(c) ? c : padrao);

export function validarOpcoesPalavras(o) {
  const linhas = (o.linhas ?? [])
    .map((l, i) => ({ ...l, texto: String(l.texto ?? "").replace(/\s+/g, " ").trim(), indice: i + 1 }))
    .filter((l) => l.texto);
  if (linhas.length === 0) throw new Error("Digite pelo menos uma palavra.");
  if (linhas.length > LIMITES_PALAVRAS.linhas) throw new Error(`Use no máximo ${LIMITES_PALAVRAS.linhas} linhas.`);
  return {
    modo: o.modo === "letreiro" ? "letreiro" : "placa",
    linhas: linhas.map((l) => {
      if (l.texto.length > LIMITES_PALAVRAS.texto) throw new Error(`Linha ${l.indice}: use no máximo ${LIMITES_PALAVRAS.texto} caracteres.`);
      return { texto: l.texto, fonte: l.fonte, altura: numero(l.altura, `Altura da linha ${l.indice}`, LIMITES_PALAVRAS.altura) };
    }),
    espacamento: numero(o.espacamento ?? 4, "Espaço entre linhas", LIMITES_PALAVRAS.espacamento),
    espessura: numero(o.espessura, "Espessura", LIMITES_PALAVRAS.espessura),
    relevo: numero(o.relevo, "Relevo", LIMITES_PALAVRAS.relevo),
    corBase: cor(o.corBase, "#1f2937"),
    corTexto: cor(o.corTexto, "#f8fafc"),
  };
}

// fontes: Map(id da fonte -> fonte do opentype.js). Devolve { partes, tamanho, opcoes }.
export function gerarPalavras(fontes, opcoes) {
  const o = validarOpcoesPalavras(opcoes);

  // monta as linhas de cima para baixo, centralizadas em x = 0
  const linhas = o.linhas.map((l) => {
    const fonte = fontes.get(l.fonte);
    if (!fonte) throw new Error("Fonte não carregada.");
    const { formas, caixa } = formasDoTexto(fonte, l.texto, l.altura);
    return { formas, largura: caixa.maxX, altura: l.altura };
  });
  let y = 0;
  const posicionadas = linhas.map((l) => {
    const topo = y;
    y -= l.altura + o.espacamento;
    const dx = -l.largura / 2;
    const dy = topo - l.altura / 2;
    return { formas: moverFormas(l.formas, dx, dy), minX: dx, maxX: dx + l.largura, minY: dy - l.altura / 2, maxY: dy + l.altura / 2 };
  });
  const caixa = {
    minX: Math.min(...posicionadas.map((l) => l.minX)),
    maxX: Math.max(...posicionadas.map((l) => l.maxX)),
    minY: Math.min(...posicionadas.map((l) => l.minY)),
    maxY: Math.max(...posicionadas.map((l) => l.maxY)),
  };
  const todasFormas = posicionadas.flatMap((l) => l.formas);

  let partes;
  if (o.modo === "placa") {
    const { forma } = placaArredondada(caixa, { margem: 5, raio: 5 });
    const base = extrudar(forma, o.espessura, 0);
    const texto = extrudar(todasFormas, o.relevo, o.espessura);
    partes = [
      { nome: "Placa", cor: o.corBase, geometria: base },
      { nome: "Texto", cor: o.corTexto, geometria: texto },
    ];
  } else {
    // letreiro: letras com a espessura toda + uma barra fina na base de cada linha, ligando as letras
    const texto = extrudar(todasFormas, o.espessura, 0);
    const barras = posicionadas.map((l, i) => {
      const alturaBarra = Math.max(2, o.linhas[i].altura * 0.18);
      return extrudar(retangulo(l.minX - 1, l.minY - alturaBarra * 0.5, l.maxX + 1, l.minY + alturaBarra * 0.5), o.espessura, 0);
    });
    partes = [
      { nome: "Letras", cor: o.corTexto, geometria: texto },
      { nome: "Barra", cor: o.corBase, geometria: barras.length > 1 ? mergeGeometries(barras) : barras[0] },
    ];
  }
  const tamanho = posicionarNaOrigem(partes.map((p) => p.geometria));
  return { partes, tamanho, opcoes: o };
}
