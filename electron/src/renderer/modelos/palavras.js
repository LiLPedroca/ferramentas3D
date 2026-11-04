// Palavras decorativas: até 3 linhas centralizadas, cada uma com sua fonte e tamanho.
// "placa": texto em relevo sobre uma base (contorno, retangular ou cápsula).
// "letreiro": letras com a espessura toda, ligadas entre si e a uma barra embaixo (fica em pé).
// Geometria com o Manifold (união real, pontes entre partes soltas) e largura total exata.
import { secaoDoTexto } from "./chaveiro.js";
import { comEscopo, malhaDoSolido, resolverLargura, unirIlhas } from "./manifold.js";

export const ESTILOS_PLACA = ["contorno", "retangular", "capsula"];

export const PADRAO_PALAVRAS = {
  modo: "placa",
  estilo: "contorno",
  linhas: [
    { texto: "Lar", fonte: "Pacifico", tamanho: 100 },
    { texto: "doce lar", fonte: "Fredoka", tamanho: 55 },
  ],
  largura: 90,
  espacamento: 3,
  borda: 3,
  espessura: 3,
  relevo: 1.6,
  ligacao: 2.4,
  corBase: "#ffffff",
  corTexto: "#2563eb",
};

export const LIMITES_PALAVRAS = {
  linhas: 3,
  texto: 30,
  tamanho: [20, 200], // % do tamanho da primeira linha
  largura: [30, 300],
  espacamento: [0, 30],
  borda: [1.2, 15],
  espessura: [1.2, 12],
  relevo: [0.4, 6],
  ligacao: [1.2, 6],
};

const NOMES = {
  largura: "Largura total",
  espacamento: "Espaço entre linhas",
  borda: "Borda",
  espessura: "Espessura",
  relevo: "Relevo",
  ligacao: "Ligação das letras",
};
const virgula = (n) => String(n).replace(".", ",");

function numero(valor, nome, [minimo, maximo], unidade = "mm") {
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < minimo || n > maximo) throw new Error(`${nome}: use de ${virgula(minimo)} a ${virgula(maximo)} ${unidade}.`);
  return n;
}

const cor = (c, padrao) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : padrao);

export function validarOpcoesPalavras(entrada = {}) {
  const o = { ...PADRAO_PALAVRAS, ...entrada };
  const linhas = (o.linhas ?? [])
    .map((l, i) => ({ ...l, texto: String(l.texto ?? "").normalize("NFC").replace(/\s+/g, " ").trim(), indice: i + 1 }))
    .filter((l) => l.texto);
  if (linhas.length === 0) throw new Error("Digite pelo menos uma palavra.");
  if (linhas.length > LIMITES_PALAVRAS.linhas) throw new Error(`Use no máximo ${LIMITES_PALAVRAS.linhas} linhas.`);
  const opcoes = {
    modo: o.modo === "letreiro" ? "letreiro" : "placa",
    estilo: ESTILOS_PLACA.includes(o.estilo) ? o.estilo : "contorno",
    linhas: linhas.map((l) => {
      if ([...l.texto].length > LIMITES_PALAVRAS.texto) throw new Error(`Linha ${l.indice}: use no máximo ${LIMITES_PALAVRAS.texto} caracteres.`);
      return { texto: l.texto, fonte: String(l.fonte), tamanho: numero(l.tamanho ?? 100, `Tamanho da linha ${l.indice}`, LIMITES_PALAVRAS.tamanho, "%") };
    }),
    corBase: cor(o.corBase, PADRAO_PALAVRAS.corBase),
    corTexto: cor(o.corTexto, PADRAO_PALAVRAS.corTexto),
  };
  for (const chave of Object.keys(NOMES)) opcoes[chave] = numero(o[chave], NOMES[chave], LIMITES_PALAVRAS[chave]);
  return opcoes;
}

// fontes: Map(id da fonte → fonte do opentype.js).
export function gerarPalavras(M, fontes, entrada) {
  const o = validarOpcoesPalavras(entrada);
  const C = M.CrossSection;
  for (const l of o.linhas) if (!fontes.get(l.fonte)) throw new Error("Fonte não carregada.");

  return comEscopo(M, (guardar) => {
    // cada linha uma vez, com 100 de largura; depois só muda de escala
    const base = o.linhas.map((l) => {
      const secao = secaoDoTexto(M, guardar, fontes.get(l.fonte), l.texto, 100);
      const b = secao.bounds();
      return { secao, altura: b.max[1] - b.min[1], tamanho: l.tamanho };
    });

    // u = altura (mm) da linha de tamanho 100%
    const gerarCom = (u) => {
      const avisos = [];
      let topo = 0;
      const linhas = base.map((l) => {
        const k = ((l.tamanho / 100) * u) / l.altura;
        let s = guardar(l.secao.scale([k, k]));
        const b = s.bounds();
        s = guardar(s.translate([-(b.min[0] + b.max[0]) / 2, topo - b.max[1]]));
        const nb = s.bounds();
        topo = nb.min[1] - o.espacamento;
        return { secao: s, caixa: nb };
      });
      let texto = guardar(C.union(linhas.map((l) => l.secao)));

      let partes;
      if (o.modo === "placa") {
        const ct = texto.bounds();
        let placa;
        if (o.estilo === "contorno") {
          placa = unirIlhas(M, guardar, guardar(texto.offset(o.borda, "Round", 2, 64)), Math.max(2.4, o.borda * 1.2));
        } else if (o.estilo === "capsula") {
          const altura = ct.max[1] - ct.min[1];
          const meio = (ct.min[1] + ct.max[1]) / 2;
          placa = guardar(guardar(C.square([ct.max[0] - ct.min[0], 0.01]).translate([ct.min[0], meio])).offset(altura / 2 + o.borda, "Round", 2, 96));
        } else {
          placa = guardar(guardar(C.square([ct.max[0] - ct.min[0], ct.max[1] - ct.min[1]]).translate(ct.min)).offset(o.borda, "Round", 2, 64));
        }
        if (o.espessura < 1.6 || o.relevo < 0.6) avisos.push("Estrutura delicada: confira a resistência no fatiador.");
        partes = {
          baixo: { nome: "Placa", cor: o.corBase, secao: placa, z: [0, o.espessura] },
          cima: { nome: "Texto", cor: o.corTexto, secao: texto, z: [o.espessura, o.relevo] },
        };
      } else {
        // barra embaixo da última linha, um pouco mais larga, entrando um pouco nas letras
        const ult = linhas[linhas.length - 1].caixa;
        const alturaLinha = ult.max[1] - ult.min[1];
        const alturaBarra = Math.max(2.4, alturaLinha * 0.16);
        const barra = guardar(
          guardar(C.square([ult.max[0] - ult.min[0] + 2, alturaBarra]).translate([ult.min[0] - 1, ult.min[1] - alturaBarra * 0.45])).offset(0.6, "Round", 2, 24),
        );
        // tudo numa peça só: pontes entre letras soltas, acentos e linhas
        const inteira = unirIlhas(M, guardar, guardar(texto.add(barra)), o.ligacao);
        texto = guardar(inteira.subtract(barra));
        if (o.ligacao < 1.6) avisos.push("Ligações finas: confira se as letras ficam firmes no fatiador.");
        partes = {
          baixo: { nome: "Barra", cor: o.corBase, secao: barra, z: [0, o.espessura] },
          cima: { nome: "Letras", cor: o.corTexto, secao: texto, z: [0, o.espessura] },
        };
      }
      const todas = guardar(partes.baixo.secao.add(partes.cima.secao));
      const cb = todas.bounds();
      const altura = o.modo === "placa" ? o.espessura + o.relevo : o.espessura;
      return { partes, avisos, caixa: { min: cb.min, max: cb.max }, dimensoes: [cb.max[0] - cb.min[0], cb.max[1] - cb.min[1], altura] };
    };

    const r = resolverLargura(o.largura, 20, gerarCom);
    const malhas = [r.partes.baixo, r.partes.cima].map((p) => ({
      nome: p.nome,
      cor: p.cor,
      ...malhaDoSolido(guardar(guardar(p.secao.extrude(p.z[1])).translate([0, 0, p.z[0]])), p.nome.toLowerCase()),
    }));
    return {
      malhas,
      camadas: [
        { lacos: r.partes.baixo.secao.toPolygons(), cor: r.partes.baixo.cor },
        { lacos: r.partes.cima.secao.toPolygons(), cor: r.partes.cima.cor },
      ],
      perimetro: null,
      argola: null,
      caixa: r.caixa,
      dimensoes: r.dimensoes,
      avisos: r.avisos,
      opcoes: o,
    };
  });
}
