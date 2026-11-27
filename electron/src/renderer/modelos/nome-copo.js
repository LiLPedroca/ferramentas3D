// Nome no copo: o nome do cliente em relevo sobre uma base decorativa, em duas partes fechadas (base e
// letras). Sem argola nem furo: a peça sai reta na mesa e é moldada no copo. Geometria em mm com o Manifold.
// Detalhes decorativos (moldura, sombra) saem na cor das letras.
import { secaoDoTexto } from "./chaveiro.js";
import { comEscopo, malhaDoSolido, resolverLargura, unirIlhas } from "./manifold.js";
import { corPronta } from "./cores-prontas.js";

// A ordem é a numeração mostrada na escolha ("Base 1", "Base 2"...): não mudar a ordem, só acrescentar no fim.
export const BASES_NOME = [
  { id: "contorno", nome: "Contorno" },
  { id: "capsula", nome: "Cápsula" },
  { id: "moldura", nome: "Placa com moldura" },
  { id: "faixa", nome: "Faixa" },
  { id: "medalhao", nome: "Medalhão oval" },
  { id: "etiqueta", nome: "Etiqueta" },
  { id: "nuvem", nome: "Nuvem" },
  { id: "coracoes", nome: "Corações" },
  { id: "bico", nome: "Bico" },
  { id: "ondas", nome: "Ondas" },
  { id: "sombra", nome: "Sombra" },
];

export const numeroDaBase = (id) => BASES_NOME.findIndex((b) => b.id === id) + 1;

export const PADRAO_NOME_COPO = {
  texto: "Nome",
  fonte: "Lobster",
  estilo: "contorno",
  largura: 60,
  borda: 2.4,
  base: 1.6,
  relevo: 1,
  corBase: "#f4f4f4",
  corTexto: "#1b1b1b",
};

export const LIMITES_NOME_COPO = { texto: 24, largura: [25, 140] };

export function validarOpcoesNomeCopo(entrada = {}) {
  const o = { ...PADRAO_NOME_COPO, ...entrada };
  const texto = String(o.texto ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!texto) throw new Error("Digite o nome.");
  if ([...texto].length > LIMITES_NOME_COPO.texto) throw new Error(`Use no máximo ${LIMITES_NOME_COPO.texto} letras.`);
  if (!BASES_NOME.some((b) => b.id === o.estilo)) throw new Error("Base inválida.");
  const largura = Number(String(o.largura).replace(",", "."));
  const [min, max] = LIMITES_NOME_COPO.largura;
  if (!(largura >= min && largura <= max)) throw new Error(`Largura: use de ${min} a ${max} mm.`);
  const cor = (c, padrao) => corPronta(c, padrao);
  return {
    texto,
    fonte: String(o.fonte),
    estilo: o.estilo,
    largura,
    borda: PADRAO_NOME_COPO.borda,
    base: PADRAO_NOME_COPO.base,
    relevo: PADRAO_NOME_COPO.relevo,
    corBase: cor(o.corBase, PADRAO_NOME_COPO.corBase),
    corTexto: cor(o.corTexto, PADRAO_NOME_COPO.corTexto),
  };
}

// Coração de altura 1 (centro na origem), pela curva clássica.
function pontosDoCoracao(n = 72) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    p.push([16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
  }
  const ys = p.map((q) => q[1]);
  const meio = (Math.max(...ys) + Math.min(...ys)) / 2;
  const alt = Math.max(...ys) - Math.min(...ys);
  return p.map(([x, y]) => [x / alt, (y - meio) / alt]);
}

// Base (o que fica embaixo) e detalhes (na cor das letras, sobem com elas) de cada estilo.
// arte: seção do texto; cx: caixa dele. Devolve { base, detalhe (ou null), sombra (ou null) }.
function formaDaBase(M, guardar, arte, cx, o) {
  const C = M.CrossSection;
  const b = o.borda;
  const w = cx.max[0] - cx.min[0];
  const h = cx.max[1] - cx.min[1];
  const meio = [(cx.min[0] + cx.max[0]) / 2, (cx.min[1] + cx.max[1]) / 2];
  const ret = (x0, y0, x1, y1) => guardar(guardar(C.square([x1 - x0, y1 - y0])).translate([x0, y0]));
  const arredondar = (s, r) => guardar(guardar(s.offset(-r, "Round", 2, 32)).offset(r, "Round", 2, 32));
  const circulo = (c, r) => guardar(guardar(C.circle(r, 64)).translate(c));
  const poligono = (pts) => guardar(new C([pts], "NonZero"));
  const capsula = (x0, x1, y0, y1) => {
    const r = (y1 - y0) / 2;
    return guardar(ret(x0 + r, (y0 + y1) / 2, x1 - r, (y0 + y1) / 2 + 0.01).offset(r, "Round", 2, 80));
  };
  const anel = (forma, de, ate) => guardar(guardar(forma.offset(-de, "Round", 2, 64)).subtract(guardar(forma.offset(-ate, "Round", 2, 64))));
  // caixa com folga em volta do nome
  const x0 = cx.min[0] - b;
  const x1 = cx.max[0] + b;
  const y0 = cx.min[1] - b;
  const y1 = cx.max[1] + b;
  const H = y1 - y0;

  switch (o.estilo) {
    case "contorno": {
      const base = unirIlhas(M, guardar, guardar(arte.offset(b, "Round", 2, 64)), Math.max(2.4, b * 1.4));
      return { base };
    }
    case "capsula":
      return { base: capsula(x0 - H * 0.15, x1 + H * 0.15, y0, y1) };
    case "moldura": {
      const f = 2.4; // espaço para o filete
      const base = arredondar(ret(x0 - f, y0 - f, x1 + f, y1 + f), 2.2);
      return { base, detalhe: anel(base, 1, 2) };
    }
    case "faixa": {
      const d = H * 0.38;
      const base = arredondar(poligono([[x0 - d, y0], [x1 + d, y0], [x1, meio[1]], [x1 + d, y1], [x0 - d, y1], [x0, meio[1]]]), 0.6);
      return { base };
    }
    case "medalhao": {
      const a = (x1 - x0) / 2 + 1.6;
      const c = (y1 - y0) / 2 + 1.6;
      // elipse que contém a caixa do nome (e a moldura): (1/1,25)² + (1/1,75)² < 1
      const base = guardar(guardar(guardar(C.circle(1, 128)).scale([a * 1.25, c * 1.75])).translate(meio));
      return { base, detalhe: anel(base, 1, 2) };
    }
    case "etiqueta": {
      const f = 1.6;
      const r = Math.min(5, (H + 2 * f) * 0.24);
      let base = ret(x0 - f - r * 0.6, y0 - f, x1 + f + r * 0.6, y1 + f);
      const cb = base.bounds();
      for (const c of [[cb.min[0], cb.min[1]], [cb.max[0], cb.min[1]], [cb.min[0], cb.max[1]], [cb.max[0], cb.max[1]]]) base = guardar(base.subtract(circulo(c, r)));
      return { base };
    }
    case "nuvem": {
      const r = H * 0.3;
      const partes = [ret(x0, y0, x1, y1), circulo([x0, meio[1]], H * 0.5), circulo([x1, meio[1]], H * 0.5)];
      const n = Math.max(2, Math.round((x1 - x0) / (r * 1.6)));
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        partes.push(circulo([x, y1], r), circulo([x, y0], r));
      }
      return { base: guardar(C.union(partes)) };
    }
    case "coracoes": {
      const base = capsula(x0, x1, y0, y1);
      const alt = H * 1.05;
      const coracao = pontosDoCoracao();
      const em = (cx2) => poligono(coracao.map(([x, y]) => [cx2 + x * alt, meio[1] + y * alt]));
      return { base: guardar(C.union([base, em(x0 - alt * 0.12), em(x1 + alt * 0.12)])) };
    }
    case "bico": {
      const d = H * 0.42;
      const base = arredondar(poligono([[x0, y0], [x1, y0], [x1 + d, meio[1]], [x1, y1], [x0, y1], [x0 - d, meio[1]]]), 0.8);
      return { base };
    }
    case "ondas": {
      const amp = Math.max(1.2, H * 0.16);
      const passo = Math.max(6, H * 0.6);
      const ondas = Math.max(3, Math.round((x1 - x0) / passo));
      const n = ondas * 16;
      const cima = [];
      const baixo = [];
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const y = (amp * (1 - Math.cos((2 * Math.PI * i * ondas) / n))) / 2;
        cima.push([x, y1 + y]);
        baixo.push([x, y0 - y]);
      }
      const miolo = poligono([...baixo, ...cima.reverse()]);
      return { base: guardar(C.union([miolo, circulo([x0, meio[1]], H / 2), circulo([x1, meio[1]], H / 2)])) };
    }
    case "sombra": {
      const base = unirIlhas(M, guardar, guardar(arte.offset(b, "Round", 2, 64)), Math.max(2.4, b * 1.4));
      const s = Math.max(1.2, b * 0.7);
      const sombra = guardar(guardar(base.translate([s, -s])).subtract(base));
      const pedacos = sombra.decompose().map(guardar).filter((p) => p.area() >= 0.6);
      return { base, sombra: pedacos.length ? guardar(C.compose(pedacos)) : null };
    }
    default:
      throw new Error("Base inválida.");
  }
}

function gerarComLarguraDoTexto(M, fonte, o, larguraTexto) {
  return comEscopo(M, (guardar) => {
    const avisos = [];
    const texto = secaoDoTexto(M, guardar, fonte, o.texto, larguraTexto);
    if (texto.area() < 1) throw new Error("O nome ficou pequeno demais. Aumente a largura.");
    const ct = texto.bounds();
    if (ct.max[1] - ct.min[1] < 5) avisos.push("As letras estão baixas. Confira os traços finos antes de imprimir.");
    const { base, detalhe = null, sombra = null } = formaDaBase(M, guardar, texto, ct, o);
    const relevo = detalhe ? guardar(texto.add(detalhe)) : texto;
    const solidoBase = guardar(base.extrude(o.base));
    let solidoLetras = guardar(guardar(relevo.extrude(o.relevo)).translate([0, 0, o.base]));
    if (sombra) solidoLetras = guardar(solidoLetras.add(guardar(sombra.extrude(o.base))));
    const cb = (sombra ? guardar(base.add(sombra)) : base).bounds();
    const lacosBase = [...base.toPolygons()];
    const camadas = [{ lacos: lacosBase, cor: o.corBase }];
    if (sombra) camadas.push({ lacos: sombra.toPolygons(), cor: o.corTexto });
    camadas.push({ lacos: relevo.toPolygons(), cor: o.corTexto });
    return {
      malhas: [
        { nome: "Base do nome", cor: o.corBase, ...malhaDoSolido(solidoBase, "base") },
        { nome: "Letras", cor: o.corTexto, ...malhaDoSolido(solidoLetras, "letras") },
      ],
      camadas,
      caixa: { min: cb.min, max: cb.max },
      dimensoes: [cb.max[0] - cb.min[0], cb.max[1] - cb.min[1], o.base + o.relevo],
      avisos,
    };
  });
}

// Peça do nome com a LARGURA TOTAL pedida (a base inteira). Só o tamanho das letras muda.
export function gerarNomeCopo(M, fonte, entrada) {
  const o = validarOpcoesNomeCopo(entrada);
  const chute = Math.max(5, o.largura * 0.7);
  let r;
  try {
    r = resolverLargura(o.largura, chute, (w) => gerarComLarguraDoTexto(M, fonte, o, w));
  } catch (erro) {
    if (/largura total/i.test(erro.message)) throw new Error("O nome não cabe nessa largura com esta base. Aumente a largura.");
    throw erro;
  }
  return { ...r, opcoes: o };
}
