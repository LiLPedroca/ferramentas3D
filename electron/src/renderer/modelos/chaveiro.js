// Chaveiro de nome: base (contorno, cápsula ou retangular) com argola + texto em relevo, em duas
// partes fechadas (duas cores). Geometria em milímetros com o Manifold: o texto é unido pela regra
// "nonzero" das fontes, a base é um contorno de verdade e a argola é unida à base.
import { comEscopo, malhaDoSolido, prenderArgola, resolverLargura, unirIlhas } from "./manifold.js";

export const ESTILOS_BASE = ["contorno", "capsula", "retangular"];

export const PADRAO_CHAVEIRO = {
  texto: "Personalize",
  fonte: "Lobster",
  largura: 70,
  borda: 2.4,
  base: 2.4,
  relevo: 1.2,
  furo: 4,
  parede: 2,
  estilo: "contorno",
  argola: null, // posição ao longo da borda (0 a 1); null = automática, no meio do lado esquerdo
  corBase: "#ffffff",
  corTexto: "#2563eb",
};

export const MODELOS_PRONTOS = {
  delicado: { nome: "Delicado", borda: 2, base: 2, relevo: 1 },
  classico: { nome: "Clássico", borda: 2.4, base: 2.4, relevo: 1.2 },
  robusto: { nome: "Robusto", borda: 3, base: 3, relevo: 1.6 },
};

// [mínimo, máximo] em mm
export const LIMITES_CHAVEIRO = {
  texto: 32,
  largura: [20, 250],
  borda: [1.2, 8],
  base: [1.2, 8],
  relevo: [0.4, 5],
  furo: [3, 8],
  parede: [1.6, 5],
};

const NOMES = { largura: "Largura total", borda: "Borda", base: "Base", relevo: "Relevo", furo: "Furo da argola", parede: "Parede da argola" };
const virgula = (n) => String(n).replace(".", ",");

function numero(valor, chave) {
  const [minimo, maximo] = LIMITES_CHAVEIRO[chave];
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < minimo || n > maximo) throw new Error(`${NOMES[chave]}: use de ${virgula(minimo)} a ${virgula(maximo)} mm.`);
  return n;
}

export function validarOpcoesChaveiro(entrada = {}) {
  const o = { ...PADRAO_CHAVEIRO, ...entrada };
  const texto = String(o.texto ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!texto) throw new Error("Digite o nome do chaveiro.");
  if ([...texto].length > LIMITES_CHAVEIRO.texto) throw new Error(`Use no máximo ${LIMITES_CHAVEIRO.texto} caracteres.`);
  if (!ESTILOS_BASE.includes(o.estilo)) throw new Error("Estilo de base inválido.");
  const argola = o.argola === null || o.argola === undefined || o.argola === "" ? null : Number(o.argola);
  if (argola !== null && !(argola >= 0 && argola <= 1)) throw new Error("Posição da argola inválida.");
  const cor = (c, padrao) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : padrao);
  return {
    texto,
    fonte: String(o.fonte),
    largura: numero(o.largura, "largura"),
    borda: numero(o.borda, "borda"),
    base: numero(o.base, "base"),
    relevo: numero(o.relevo, "relevo"),
    furo: numero(o.furo, "furo"),
    parede: numero(o.parede, "parede"),
    estilo: o.estilo,
    argola,
    corBase: cor(o.corBase, PADRAO_CHAVEIRO.corBase),
    corTexto: cor(o.corTexto, PADRAO_CHAVEIRO.corTexto),
  };
}

// ---------- Texto ----------
// Letra a letra (com kerning), sem o motor de composição do opentype.js, que falha em algumas fontes.
export function caminhoDoTexto(fonte, texto) {
  const tamanho = 100;
  const escala = tamanho / fonte.unitsPerEm;
  let caminho = null;
  let x = 0;
  let anterior = null;
  for (const caractere of texto) {
    const glifo = fonte.charToGlyph(caractere);
    if (anterior) x += fonte.getKerningValue(anterior, glifo) * escala;
    const parte = glifo.getPath(x, 0, tamanho);
    if (caminho) caminho.commands.push(...parte.commands);
    else caminho = parte;
    x += (glifo.advanceWidth ?? 0) * escala;
    anterior = glifo;
  }
  return caminho;
}

// Curvas viram segmentos até o erro ficar abaixo da tolerância (Y para cima).
export function achatarCaminho(comandos, tolerancia) {
  const lacos = [];
  let laco = [];
  let p = [0, 0];
  let inicio = p;
  const adicionar = (q) => {
    const u = laco[laco.length - 1];
    if (!u || Math.hypot(u[0] - q[0], u[1] - q[1]) > 1e-7) laco.push(q);
    p = q;
  };
  const curva = (pts, nivel = 0) => {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const comp = Math.hypot(dx, dy);
    let erro = 0;
    for (const q of pts.slice(1, -1)) {
      const d = comp ? Math.abs(dy * q[0] - dx * q[1] + b[0] * a[1] - b[1] * a[0]) / comp : Math.hypot(q[0] - a[0], q[1] - a[1]);
      erro = Math.max(erro, d);
    }
    if (erro <= tolerancia || nivel >= 12) return adicionar(b);
    // de Casteljau: divide a curva ao meio
    const esquerda = [a];
    const direita = [b];
    let nivelAtual = pts;
    while (nivelAtual.length > 1) {
      const proximo = nivelAtual.slice(1).map((v, i) => [(v[0] + nivelAtual[i][0]) / 2, (v[1] + nivelAtual[i][1]) / 2]);
      esquerda.push(proximo[0]);
      direita.unshift(proximo[proximo.length - 1]);
      nivelAtual = proximo;
    }
    curva(esquerda, nivel + 1);
    curva(direita, nivel + 1);
  };
  const fechar = () => {
    if (laco.length > 2) {
      const a = laco[0];
      const b = laco[laco.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) laco.pop();
      if (laco.length > 2) lacos.push(laco);
    }
    laco = [];
  };
  for (const c of comandos) {
    const q = [c.x, -c.y];
    if (c.type === "M") {
      fechar();
      inicio = q;
      adicionar(q);
    } else if (c.type === "L") adicionar(q);
    else if (c.type === "Q") curva([p, [c.x1, -c.y1], q]);
    else if (c.type === "C") curva([p, [c.x1, -c.y1], [c.x2, -c.y2], q]);
    else if (c.type === "Z") {
      adicionar(inicio);
      fechar();
    }
  }
  fechar();
  return lacos;
}

// Seção do texto com a largura pedida, começando em (0, 0).
export function secaoDoTexto(M, guardar, fonte, texto, largura) {
  for (const ch of texto) {
    if (ch.trim() && fonte.charToGlyphIndex(ch) === 0) throw new Error(`A fonte não tem o caractere “${ch}”. Escolha outra fonte.`);
  }
  const caminho = caminhoDoTexto(fonte, texto);
  const cx = caminho.getBoundingBox();
  const escala = largura / (cx.x2 - cx.x1);
  if (!Number.isFinite(escala) || escala <= 0) throw new Error("O texto não tem letras desenháveis nesta fonte.");
  const lacos = achatarCaminho(caminho.commands, 0.02 / escala).map((l) => l.map(([x, y]) => [(x - cx.x1) * escala, (y + cx.y2) * escala]));
  if (!lacos.length) throw new Error("O texto não tem letras desenháveis nesta fonte.");
  return guardar(new M.CrossSection(lacos, "NonZero"));
}

// ---------- Peça ----------
function gerarComLarguraDoTexto(M, fonte, o, larguraTexto) {
  const C = M.CrossSection;
  return comEscopo(M, (guardar) => {
    const avisos = [];
    const texto = secaoDoTexto(M, guardar, fonte, o.texto, larguraTexto);
    if (texto.area() < 1) throw new Error("O nome ficou pequeno demais. Aumente a largura.");
    const cx = texto.bounds();
    const altura = cx.max[1] - cx.min[1];
    if (altura > 200) throw new Error("O nome ficou alto demais. Reduza a largura.");
    if (altura < 4) avisos.push("O nome está baixo. Confira os traços finos antes de imprimir.");

    let base;
    if (o.estilo === "contorno") {
      base = guardar(texto.offset(o.borda, "Round", 2, 64));
      base = unirIlhas(M, guardar, base, Math.max(2.4, o.borda * 1.4));
    } else {
      const meio = (cx.min[1] + cx.max[1]) / 2;
      const capsula = o.estilo === "capsula";
      const miolo = guardar(C.square([cx.max[0] - cx.min[0], capsula ? 0.01 : altura]).translate([cx.min[0], capsula ? meio : cx.min[1]]));
      base = guardar(miolo.offset(capsula ? altura / 2 + o.borda : o.borda, "Round", 2, 80));
    }

    // argola na borda externa, na posição pedida (ou no meio do lado esquerdo)
    const presa = prenderArgola(M, guardar, base, texto, o, o.argola, [-1e4, (cx.min[1] + cx.max[1]) / 2]);
    base = presa.base;
    if (o.base < 1.6 || o.borda < 1.6 || o.relevo < 0.6) avisos.push("Estrutura delicada: confira a resistência e a largura de linha do bico.");

    const solidoBase = guardar(base.extrude(o.base));
    const solidoTexto = guardar(guardar(texto.extrude(o.relevo)).translate([0, 0, o.base]));
    const cb = base.bounds();
    const lacosBase = base.toPolygons();
    const lacosTexto = texto.toPolygons();
    return {
      malhas: [
        { nome: "Base e argola", cor: o.corBase, ...malhaDoSolido(solidoBase, "base") },
        { nome: "Texto", cor: o.corTexto, ...malhaDoSolido(solidoTexto, "texto") },
      ],
      // para a prévia 2D: camadas de baixo para cima
      camadas: [
        { lacos: lacosBase, cor: o.corBase },
        { lacos: lacosTexto, cor: o.corTexto },
      ],
      lacosBase,
      lacosTexto,
      perimetro: presa.perimetro,
      argola: presa.argola,
      caixa: { min: cb.min, max: cb.max },
      dimensoes: [cb.max[0] - cb.min[0], cb.max[1] - cb.min[1], o.base + o.relevo],
      avisos,
    };
  });
}

// Impressão sem AMS: altura (print_z) da primeira camada do texto, onde entra a pausa para trocar o
// filamento. O fatiador corta cada camada no meio dela: a primeira camada cujo meio passa da base
// já é só texto. camada/primeira = altura de camada e da primeira camada no fatiador (mm).
// O Anycubic Slicer Next prende a pausa à camada mais próxima do valor: devolvemos a altura exata.
export function camadaDaTroca(base, camada = 0.2, primeira = 0.2) {
  if (!(camada > 0) || !(primeira > 0)) throw new Error("Altura de camada inválida.");
  let k = 0;
  let z = primeira;
  let altura = primeira;
  while (z - altura / 2 <= base + 1e-9) {
    k += 1;
    z = primeira + k * camada;
    altura = camada;
  }
  return { z: Math.round(z * 10000) / 10000, numero: k + 1 };
}

// Gera a peça com a LARGURA TOTAL pedida (base e argola incluídas). Borda, espessuras e argola
// continuam em mm; só o texto muda de tamanho.
export function gerarChaveiro(M, fonte, entrada) {
  const o = validarOpcoesChaveiro(entrada);
  const chute = Math.max(5, o.largura - 2 * o.borda - 2 * (o.furo / 2 + o.parede));
  const r = resolverLargura(o.largura, chute, (w) => gerarComLarguraDoTexto(M, fonte, o, w));
  return { ...r, opcoes: o };
}
