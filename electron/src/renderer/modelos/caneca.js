// Caneca de chopp personalizada: corpo com boca lisa e arredondada, quatro faixas com texto em
// relevo (frente e verso), escada nas faixas de baixo, alça, textura de emblemas pequenos e o
// emblema grande separado (deitado, para moldar na curva e colar).
// As cores mudam só por altura (cada faixa é de uma cor), então dá para imprimir sem AMS, com
// pausas para trocar o filamento.
import { achatarCaminho, caminhoDoTexto, camadaDaTroca } from "./chaveiro.js";
import { formasDoEmblema, FORMATOS_EMBLEMA } from "./emblema.js";
import { comEscopo, malhaDoSolido } from "./manifold.js";

// Copo showroom (tubo com trava e argola): boca interna de 81,4 mm e 123 mm de altura.
export const COPO_SHOWROOM = { boca: 81.4, altura: 123 };

// faixas de cima para baixo
export const FAIXAS = [
  { id: "cima", nome: "Faixa de cima" },
  { id: "f1", nome: "Faixa 1" },
  { id: "f2", nome: "Faixa 2" },
  { id: "f3", nome: "Faixa 3" },
];

export const PADRAO_CANECA = {
  boca: COPO_SHOWROOM.boca,
  altura: COPO_SHOWROOM.altura,
  parede: 3,
  fundo: 3,
  faixa: 14,
  textos: {
    cimaFrente: "SEU TIME",
    cimaVerso: "DESDE 1990",
    f1Frente: "AQUI É",
    f2Frente: "SÓ",
    f3Frente: "PAIXÃO",
    f1Verso: "O MAIOR",
    f2Verso: "DO",
    f3Verso: "MUNDO",
  },
  fonte: "BebasNeue",
  letra: 7,
  relevo: 0.8,
  // "segunda" ou "principal"
  corFaixa: { cima: "segunda", f1: "segunda", f2: "principal", f3: "segunda" },
  corPrincipal: "#ffffff",
  corSegunda: "#2563eb",
  escada: 0.8,
  alca: true,
  textura: true,
  texturaAtras: false,
  texturaTamanho: 14,
  emblemaFormato: "contorno",
  emblemaTamanho: 50,
  aro: 1.5,
  limiar: 0.5,
  inverter: false,
};

// [mínimo, máximo] em mm
export const LIMITES_CANECA = {
  boca: [40, 150],
  altura: [60, 250],
  parede: [2, 6],
  fundo: [2, 8],
  faixa: [6, 30],
  letra: [3, 20],
  relevo: [0.4, 2],
  escada: [0, 3],
  texturaTamanho: [6, 30],
  emblemaTamanho: [20, 120],
  aro: [0, 5],
  limiar: [0.05, 0.95],
};

const NOMES = {
  boca: "Diâmetro interno da boca",
  altura: "Altura",
  parede: "Parede",
  fundo: "Fundo",
  faixa: "Altura das faixas",
  letra: "Tamanho das letras",
  relevo: "Relevo da escrita",
  escada: "Escada nas faixas de baixo",
  texturaTamanho: "Tamanho dos emblemas pequenos",
  emblemaTamanho: "Tamanho do emblema",
  aro: "Aro em volta do desenho",
  limiar: "Limiar do emblema",
};

export const BORDA_LISA = 3; // mm lisos na cor principal acima da faixa de cima (onde a boca encosta)
const ALCA = { abertura: 24, pega: 12, largura: 16 };
const EMBUTIR = 0.3; // relevos entram um pouco na parede para unir de verdade
const BASE_EMBLEMA = 1.6;
const DESENHO_EMBLEMA = 0.8;
const RELEVO_TEXTURA = 0.6;
const virgula = (n) => String(n).replace(".", ",");

function numero(valor, chave) {
  const [minimo, maximo] = LIMITES_CANECA[chave];
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < minimo || n > maximo) throw new Error(`${NOMES[chave]}: use de ${virgula(minimo)} a ${virgula(maximo)}${chave === "limiar" ? "" : " mm"}.`);
  return n;
}

export function validarOpcoesCaneca(entrada = {}) {
  const o = { ...PADRAO_CANECA, ...entrada };
  const textos = {};
  for (const chave of Object.keys(PADRAO_CANECA.textos)) {
    const t = String(o.textos?.[chave] ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
    if ([...t].length > 30) throw new Error("Use no máximo 30 caracteres em cada faixa.");
    textos[chave] = t;
  }
  const corFaixa = {};
  for (const { id } of FAIXAS) corFaixa[id] = o.corFaixa?.[id] === "principal" ? "principal" : "segunda";
  const cor = (c, padrao) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : padrao);
  const v = {
    boca: numero(o.boca, "boca"),
    altura: numero(o.altura, "altura"),
    parede: numero(o.parede, "parede"),
    fundo: numero(o.fundo, "fundo"),
    faixa: numero(o.faixa, "faixa"),
    textos,
    fonte: String(o.fonte),
    letra: numero(o.letra, "letra"),
    relevo: numero(o.relevo, "relevo"),
    corFaixa,
    corPrincipal: cor(o.corPrincipal, PADRAO_CANECA.corPrincipal),
    corSegunda: cor(o.corSegunda, PADRAO_CANECA.corSegunda),
    escada: numero(o.escada, "escada"),
    alca: Boolean(o.alca),
    textura: Boolean(o.textura),
    texturaAtras: Boolean(o.texturaAtras),
    texturaTamanho: numero(o.texturaTamanho, "texturaTamanho"),
    emblemaFormato: FORMATOS_EMBLEMA.includes(o.emblemaFormato) ? o.emblemaFormato : "contorno",
    emblemaTamanho: numero(o.emblemaTamanho, "emblemaTamanho"),
    aro: numero(o.aro, "aro"),
    limiar: numero(o.limiar, "limiar"),
    inverter: Boolean(o.inverter),
  };
  if (v.letra > v.faixa - 1) throw new Error("As letras precisam ser pelo menos 1 mm menores que a altura das faixas.");
  if (v.fundo >= v.altura / 2) throw new Error("O fundo ficou grosso demais para essa altura.");
  if (alturaDoCorpo(v) < 10) throw new Error("A caneca ficou baixa para quatro faixas. Diminua a altura das faixas ou aumente a altura.");
  return v;
}

// ---------- Medidas ----------
const raios = (o) => {
  const ri = o.boca / 2;
  const r0 = ri + o.parede;
  return { ri, r0, r: [r0, r0 + o.escada, r0 + 2 * o.escada, r0 + 3 * o.escada] }; // r[k]: faixa de cima, 1, 2, 3
};
const alturaDoCorpo = (o) => o.altura - BORDA_LISA - 4 * o.faixa;

// Trechos de altura de cada faixa e do corpo (z0 < z1), de baixo para cima.
function trechos(o) {
  const f = o.faixa;
  const topo = o.altura - BORDA_LISA;
  return [
    { id: "f3", z0: 0, z1: f },
    { id: "f2", z0: f, z1: 2 * f },
    { id: "f1", z0: 2 * f, z1: 3 * f },
    { id: "corpo", z0: 3 * f, z1: topo - f },
    { id: "cima", z0: topo - f, z1: topo },
    { id: "borda", z0: topo, z1: o.altura },
  ];
}

// Regiões de cor de baixo para cima, juntando vizinhas da mesma cor: [{ z0, z1, cor }].
export function regioesDeCor(entrada) {
  const o = validarOpcoesCaneca(entrada);
  const regioes = [];
  for (const t of trechos(o)) {
    const cor = t.id === "corpo" || t.id === "borda" ? "principal" : o.corFaixa[t.id];
    const ultima = regioes[regioes.length - 1];
    if (ultima && ultima.cor === cor) ultima.z1 = t.z1;
    else regioes.push({ z0: t.z0, z1: t.z1, cor });
  }
  return regioes;
}

// Trocas de filamento para imprimir sem AMS: a primeira camada de cada região nova.
// Devolve [{ z, numero, cor }] (cor = a que entra na troca).
export function trocasDeCor(entrada, camada = 0.2, primeira = 0.2) {
  return regioesDeCor(entrada)
    .slice(1)
    .map((r) => ({ ...camadaDaTroca(r.z0, camada, primeira), cor: r.cor }));
}

// Volume interno até a boca, em ml (o canto do fundo é arredondado).
export function capacidadeMl(entrada) {
  const o = validarOpcoesCaneca(entrada);
  const ri = o.boca / 2;
  const rf = Math.min(4, ri / 3);
  const cilindro = Math.PI * ri * ri * (o.altura - o.fundo);
  // o arredondado tira um "canto" de área (1 − π/4)·rf², girando a ~0,22·rf da parede
  const canto = 2 * Math.PI * (ri - 0.2234 * rf) * (1 - Math.PI / 4) * rf * rf;
  return (cilindro - canto) / 1000;
}

// ---------- Texto ----------
// Seção do texto com a altura das maiúsculas = "letra", base em y = 0 e centrada em x = 0.
function secaoDoTexto(M, guardar, fonte, texto, letra) {
  for (const ch of texto) {
    if (ch.trim() && fonte.charToGlyphIndex(ch) === 0) throw new Error(`A fonte não tem o caractere “${ch}”. Escolha outra fonte.`);
  }
  const caminho = caminhoDoTexto(fonte, texto);
  const capitular = (fonte.tables.os2?.sCapHeight || fonte.charToGlyph("H").getBoundingBox().y2 || fonte.unitsPerEm * 0.7) * (100 / fonte.unitsPerEm);
  const escala = letra / capitular;
  const lacos = achatarCaminho(caminho.commands, 0.02 / escala).map((l) => l.map(([x, y]) => [x * escala, y * escala]));
  if (!lacos.length) return null;
  const secao = guardar(new M.CrossSection(lacos, "NonZero"));
  const b = secao.bounds();
  return guardar(secao.translate([-(b.min[0] + b.max[0]) / 2, 0]));
}

// Seção plana (x = comprimento ao redor da caneca, y = altura) → relevo colado na parede de raio R.
// x = 0 fica na frente (−Y); x = πR fica atrás.
function envolver(M, guardar, secao, R, relevo) {
  let s = guardar(guardar(secao.extrude(relevo + EMBUTIR)).translate([0, 0, -EMBUTIR]));
  s = guardar(s.refineToLength(3));
  return guardar(
    s.warp((v) => {
      const [x, y, z] = v;
      const r = R + z;
      const t = x / R;
      v[0] = r * Math.sin(t);
      v[1] = -r * Math.cos(t);
      v[2] = y;
    }),
  );
}

// ---------- Corpo ----------
// Perfil (raio, altura) girado em volta do eixo: fundo com canto arredondado, faixas de baixo em
// escada, boca lisa e arredondada.
function perfilDoCorpo(o) {
  const { ri, r } = raios(o);
  const f = o.faixa;
  const meia = o.parede / 2;
  const chanfro = 0.5; // contra o "pé de elefante" da primeira camada
  const rf = Math.min(4, ri / 3);
  const pts = [
    [0, 0],
    [r[3] - chanfro, 0],
    [r[3], chanfro],
    [r[3], f],
    [r[2], f],
    [r[2], 2 * f],
    [r[1], 2 * f],
    [r[1], 3 * f],
    [r[0], 3 * f],
    [r[0], o.altura - meia],
  ];
  for (let i = 1; i < 32; i++) {
    const a = (Math.PI * i) / 32;
    pts.push([ri + meia + meia * Math.cos(a), o.altura - meia + meia * Math.sin(a)]);
  }
  pts.push([ri, o.altura - meia], [ri, o.fundo + rf]);
  for (let i = 1; i < 12; i++) {
    const a = (-Math.PI / 2) * (i / 12);
    pts.push([ri - rf + rf * Math.cos(a), o.fundo + rf + rf * Math.sin(a)]);
  }
  pts.push([ri - rf, o.fundo], [0, o.fundo]);
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
}

// Alça do lado esquerdo (−X): braço de cima na faixa de cima, braço de baixo na faixa 1 e a pega
// descendo até a mesa — os dois braços viram pontes, sem precisar de suporte.
function alca(M, guardar, o) {
  const C = M.CrossSection;
  const { r } = raios(o);
  const f = o.faixa;
  const topo = o.altura - BORDA_LISA;
  const dentro = r[0] - 1;
  const fora = r[1] + ALCA.abertura + ALCA.pega;
  const inicio = r[0] - 12; // começa dentro da parede: os cantos arredondados de lá são cortados
  const retangulo = (x0, z0, x1, z1, raio) => guardar(guardar(guardar(C.square([x1 - x0, z1 - z0]).translate([x0, z0])).offset(-raio, "Round", 2, 32)).offset(raio, "Round", 2, 32));
  const externo = guardar(retangulo(inicio, -20, fora, topo, 6).intersect(guardar(C.square([fora + 1, topo + 1]))));
  const vaoMeio = retangulo(inicio, 3 * f, r[1] + ALCA.abertura, topo - f, 4);
  const vaoBaixo = retangulo(inicio, -10, r[1] + ALCA.abertura, 2 * f, 4);
  const corte = guardar(C.square([fora - dentro + 1, topo + 2]).translate([dentro, -1]));
  const secao = guardar(guardar(guardar(externo.subtract(vaoMeio)).subtract(vaoBaixo)).intersect(corte));
  return guardar(guardar(guardar(guardar(secao.extrude(ALCA.largura)).translate([0, 0, -ALCA.largura / 2])).rotate([90, 0, 0])).rotate([0, 0, 180]));
}

// ---------- Peça ----------
// fonte: opentype; emblema: lacosDoEmblema(imagem) ou null (sem emblema e sem textura).
export function gerarCaneca(M, fonte, emblema, entrada) {
  const o = validarOpcoesCaneca(entrada);
  const C = M.CrossSection;
  const Mf = M.Manifold;
  return comEscopo(M, (guardar) => {
    const avisos = [];
    const { r } = raios(o);
    const f = o.faixa;
    const topo = o.altura - BORDA_LISA;
    const solidos = [guardar(guardar(new C([perfilDoCorpo(o)], "Positive")).revolve(256))];

    // textos das faixas (frente em x = 0, verso em x = πR)
    const linhas = [
      ["cima", r[0], topo - f],
      ["f1", r[1], 2 * f],
      ["f2", r[2], f],
      ["f3", r[3], 0],
    ];
    const folgaAlca = o.alca ? ALCA.largura / 2 + 3 : 2;
    for (const [id, R, z0] of linhas) {
      const pecas = [];
      for (const [lado, deslocamento] of [["Frente", 0], ["Verso", Math.PI * R]]) {
        const texto = o.textos[`${id}${lado}`];
        if (!texto) continue;
        const s = secaoDoTexto(M, guardar, fonte, texto, o.letra);
        if (!s) continue;
        const b = s.bounds();
        if (b.max[0] - b.min[0] > Math.PI * R - 2 * folgaAlca) {
          throw new Error(`“${texto}” não cabe na ${FAIXAS.find((x) => x.id === id).nome.toLowerCase()}. Diminua as letras ou o texto.`);
        }
        pecas.push(guardar(s.translate([deslocamento, z0 + (f - o.letra) / 2])));
      }
      if (pecas.length) solidos.push(envolver(M, guardar, guardar(C.union(pecas)), R, o.relevo));
    }

    // emblema separado e textura de emblemas pequenos
    const corpo0 = 3 * f;
    const corpo1 = topo - f;
    let emblemaPeca = null;
    if (emblema) {
      const grande = formasDoEmblema(M, guardar, emblema, { tamanho: o.emblemaTamanho, formato: o.emblemaFormato, aro: o.aro });
      emblemaPeca = grande;
      if (o.emblemaTamanho > corpo1 - corpo0) avisos.push("O emblema é maior que a área lisa entre as faixas: ele vai encostar nelas ao colar.");
      if (o.textura) {
        const d = o.texturaTamanho;
        const pequeno = formasDoEmblema(M, guardar, emblema, { tamanho: d, formato: o.emblemaFormato, aro: Math.min(o.aro, 0.8) });
        const anel = guardar(pequeno.base.subtract(guardar(pequeno.base.offset(-0.8, "Round", 2, 32))));
        // detalhe menor que 0,05 mm não aparece na impressão: simplificar deixa a caneca bem mais leve
        const marca = guardar(guardar(anel.add(pequeno.desenho)).simplify(0.05));
        const alturaCorpo = corpo1 - corpo0;
        const fileiras = Math.floor((alturaCorpo - 2) / (d + 5));
        const colunas = Math.floor((2 * Math.PI * r[0]) / (d + 7));
        const zMeio = (corpo0 + corpo1) / 2;
        const copias = [];
        for (let i = 0; i < fileiras; i++) {
          const z = corpo0 + (alturaCorpo / fileiras) * (i + 0.5);
          for (let j = 0; j < colunas; j++) {
            const x = ((j + (i % 2) * 0.5) / colunas) * 2 * Math.PI * r[0] - Math.PI * r[0];
            if (!o.texturaAtras && Math.abs(x) < o.emblemaTamanho / 2 + d / 2 + 1 && Math.abs(z - zMeio) < o.emblemaTamanho / 2 + d / 2 + 1) continue;
            copias.push(guardar(marca.translate([x, z])));
          }
        }
        if (copias.length) solidos.push(envolver(M, guardar, guardar(C.union(copias)), r[0], RELEVO_TEXTURA));
      }
    }

    if (o.alca) solidos.push(alca(M, guardar, o));
    const caneca = guardar(Mf.union(solidos));

    // uma peça por cor: cada região de altura vai para a cor da sua faixa
    const porCor = { principal: [], segunda: [] };
    for (const reg of regioesDeCor(o)) {
      porCor[reg.cor].push(guardar(guardar(caneca.trimByPlane([0, 0, 1], reg.z0)).trimByPlane([0, 0, -1], -reg.z1)));
    }
    const malhas = [];
    const cores = { principal: o.corPrincipal, segunda: o.corSegunda };
    const nomes = { principal: "Caneca — cor principal", segunda: "Caneca — 2ª cor" };
    for (const chave of ["principal", "segunda"]) {
      if (!porCor[chave].length) continue;
      const solido = porCor[chave].length > 1 ? guardar(Mf.union(porCor[chave])) : porCor[chave][0];
      malhas.push({ nome: nomes[chave], cor: cores[chave], slot: chave === "principal" ? 1 : 2, peca: "caneca", ...malhaDoSolido(solido, nomes[chave]) });
    }

    // emblema deitado ao lado da caneca (lado direito, +X)
    if (emblemaPeca) {
      const b = emblemaPeca.base.bounds();
      const dx = r[3] + 10 - b.min[0];
      const base = guardar(guardar(emblemaPeca.base.extrude(BASE_EMBLEMA)).translate([dx, 0, 0]));
      const desenho = guardar(guardar(emblemaPeca.desenho.extrude(DESENHO_EMBLEMA)).translate([dx, 0, BASE_EMBLEMA]));
      malhas.push({ nome: "Emblema — base", cor: o.corPrincipal, slot: 1, peca: "emblema", ...malhaDoSolido(base, "emblema") });
      if (emblemaPeca.desenho.area() > 0.01) {
        malhas.push({ nome: "Emblema — desenho", cor: o.corSegunda, slot: 2, peca: "emblema", ...malhaDoSolido(desenho, "desenho do emblema") });
      }
    }

    if (o.relevo < 0.6) avisos.push("Relevo baixo: a escrita pode sumir com camadas grossas.");
    const larguraTotal = 2 * r[3] + (o.alca ? ALCA.abertura + ALCA.pega + (r[1] - r[3]) : 0);
    return {
      malhas,
      dimensoes: [larguraTotal, 2 * r[3], o.altura],
      capacidade: capacidadeMl(o),
      regioes: regioesDeCor(o),
      avisos,
      opcoes: o,
    };
  });
}

// Troca do emblema impresso sozinho sem AMS: a primeira camada do desenho.
export const trocaDoEmblema = (camada, primeira) => camadaDaTroca(BASE_EMBLEMA, camada, primeira);
