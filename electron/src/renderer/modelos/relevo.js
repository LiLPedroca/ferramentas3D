// 2D para 3D: a imagem vetorizada por cores vira uma peça SEM BASE. Cada parte (região ligada de uma cor)
// é um volume próprio, lado a lado com as vizinhas, todas começando na mesa. Cada parte pode ter a sua
// cor e a sua altura. As partes formam uma partição exata da silhueta: vizinhas dividem a mesma borda.
import { camadaDaTroca } from "./chaveiro.js";
import { areaComSinal, comEscopo, contornoExterno, maisPertoNoLaco, malhaDoSolido, pontoNoLaco, resolverLargura } from "./manifold.js";

export const PADRAO_RELEVO = { largura: 100, altura: 3, comArgola: false, argola: null, furo: 4, parede: 2 };
export const LIMITES_RELEVO = { largura: [20, 250], altura: [2, 10], furo: [3, 8], parede: [1.6, 5] };
const NOMES = { largura: "Largura", altura: "Altura das partes", furo: "Furo da argola", parede: "Parede da argola" };
const ILHA_MINIMA = 1.5; // mm²: menor que isso não imprime direito; vira a parte vizinha (ou some)
const COR_FURO = "#ff00ff";
const virgula = (n) => String(n).replace(".", ",");

function numero(valor, chave) {
  const [minimo, maximo] = LIMITES_RELEVO[chave];
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < minimo || n > maximo) throw new Error(`${NOMES[chave]}: use de ${virgula(minimo)} a ${virgula(maximo)} mm.`);
  return n;
}

export function validarOpcoesRelevo(entrada = {}) {
  const o = { ...PADRAO_RELEVO, ...entrada };
  const argola = o.argola === null || o.argola === undefined || o.argola === "" ? null : Number(o.argola);
  if (argola !== null && !(argola >= 0 && argola <= 1)) throw new Error("Posição da argola inválida.");
  const opcoes = { comArgola: o.comArgola === true, argola, semAms: o.semAms === true, ordem: Array.isArray(o.ordem) ? o.ordem.slice() : null };
  for (const chave of Object.keys(LIMITES_RELEVO)) opcoes[chave] = numero(o[chave], chave);
  return opcoes;
}

// Ponto dentro do polígono (par-ímpar sobre todos os laços).
export function pontoDentro(lacos, [x, y]) {
  let dentro = false;
  for (const laco of lacos)
    for (let i = 0, j = laco.length - 1; i < laco.length; j = i++) {
      const [xi, yi] = laco[i];
      const [xj, yj] = laco[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  return dentro;
}

// Um ponto bem dentro da seção (longe da borda): encolhe a seção até sobrar pouco e pega um vértice.
function pontoInterno(guardar, secao) {
  let d = Math.sqrt(secao.area()) / 4;
  for (let i = 0; i < 12; i++, d /= 2) {
    const miolo = guardar(secao.offset(-d, "Round", 2, 16));
    const lacos = miolo.toPolygons().filter((l) => areaComSinal(l) > 0);
    if (lacos.length) return [lacos[0][0][0], lacos[0][0][1]];
  }
  const l = secao.toPolygons()[0];
  return [l[0][0], l[0][1]];
}

// Seções por cor na arte (100 de largura). Como no SVG, o que vem depois fica por cima: a parte
// visível de uma cor é ela menos as cores seguintes. Assim nenhuma cor se sobrepõe a outra.
function secoesPorCor(M, guardar, cores) {
  const C = M.CrossSection;
  const furosArte = cores.find((c) => c.cor === COR_FURO)?.formas ?? [];
  const furos = furosArte.length ? guardar(C.union(furosArte.map((l) => guardar(new C(l, "EvenOdd"))))) : null;
  let acumulado = null;
  const secoes = [];
  for (const { cor, formas } of cores.filter((c) => c.cor !== COR_FURO).reverse()) {
    if (!formas.length) continue;
    let secao = guardar(C.union(formas.map((l) => guardar(new C(l, "EvenOdd")))));
    if (furos) secao = guardar(secao.subtract(furos));
    const inteira = secao;
    if (acumulado) secao = guardar(secao.subtract(acumulado));
    acumulado = acumulado ? guardar(acumulado.add(inteira)) : inteira;
    if (secao.area() > 0) secoes.unshift({ cor, secao });
  }
  return secoes;
}

// Divide em partes (ilhas) já na escala da peça e junta as ilhas pequenas à vizinha de maior contato.
function partesNaEscala(M, guardar, secoes, s) {
  const pecas = [];
  secoes.forEach(({ cor, secao }, ordemCor) => {
    for (const p of guardar(secao.scale([s, s])).decompose().map(guardar)) pecas.push({ cor, ordemCor, secao: p, area: p.area() });
  });
  const pequenas = pecas.filter((p) => p.area < ILHA_MINIMA);
  let grandes = pecas.filter((p) => p.area >= ILHA_MINIMA);
  for (const ilha of pequenas) {
    const borda = guardar(ilha.secao.offset(0.05, "Square", 2, 8));
    let melhor = null;
    let contato = 1e-6;
    for (const g of grandes) {
      const a = guardar(borda.intersect(g.secao)).area();
      if (a > contato) (contato = a), (melhor = g);
    }
    if (melhor) {
      melhor.secao = guardar(melhor.secao.add(ilha.secao));
      melhor.area = melhor.secao.area();
    }
  }
  grandes = grandes.sort((a, b) => a.ordemCor - b.ordemCor || b.area - a.area);
  return grandes;
}

// Argola presa na borda do contorno externo da peça; o anel é só a parte fora do desenho e se junta à
// parte que ele mais toca. Devolve { secao (anel), alvo (índice da parte), argola } ou lança erro em pt-BR.
function argolaEm(M, guardar, arte, partes, o, posicao) {
  const C = M.CrossSection;
  const perimetro = contornoExterno(arte);
  const ancora = pontoNoLaco(perimetro, posicao);
  const raio = o.furo / 2 + o.parede;
  const afastamento = raio - Math.min(o.parede, 2);
  const centro = [ancora.ponto[0] + ancora.normal[0] * afastamento, ancora.ponto[1] + ancora.normal[1] * afastamento];
  const disco = guardar(guardar(C.circle(raio, 96)).translate(centro));
  const furo = guardar(guardar(C.circle(o.furo / 2, 80)).translate(centro));
  if (guardar(arte.intersect(furo)).area() > 0.001) throw new Error("A argola ficou sobre o desenho. Arraste-a para outra posição na borda.");
  if (guardar(disco.intersect(guardar(arte.offset(-0.5)))).area() < 1) throw new Error("A ligação da argola ficou fina. Arraste-a para outra posição na borda.");
  const anel = guardar(guardar(disco.subtract(furo)).subtract(arte));
  let alvo = 0;
  let maior = -1;
  partes.forEach((p, i) => {
    const a = guardar(disco.intersect(p.secao)).area();
    if (a > maior) (maior = a), (alvo = i);
  });
  const junta = guardar(partes[alvo].secao.add(anel));
  if (junta.decompose().map(guardar).length > partes[alvo].secao.decompose().map(guardar).length) throw new Error("A argola precisa ficar ligada à peça. Escolha outra posição.");
  return { secao: anel, alvo, argola: { t: posicao, centro, raio, furo: o.furo / 2, afastamento }, perimetro };
}

function prenderArgola(M, guardar, arte, partes, o) {
  if (o.argola !== null) return argolaEm(M, guardar, arte, partes, o, o.argola);
  const perimetro = contornoExterno(arte);
  const inicio = maisPertoNoLaco(perimetro, [0, 1e4]).t; // padrão: em cima
  let erro = null;
  for (let k = 0; k <= 24; k++)
    for (const sinal of k ? [1, -1] : [1]) {
      try {
        return argolaEm(M, guardar, arte, partes, o, (((inicio + sinal * k * 0.015) % 1) + 1) % 1);
      } catch (e) {
        erro ??= e;
      }
    }
  throw erro;
}

// cores: resultado de coresDoSvg ([{ cor, formas }], arte com 100 de largura, Y para cima).
// escolhas: [{ ponto: [x, y] na arte, cor?, altura? }]; vale para a parte que contém o ponto (a última ganha).
export function gerarRelevo(M, cores, entrada = {}, escolhas = []) {
  const o = validarOpcoesRelevo(entrada);
  const C = M.CrossSection;
  return comEscopo(M, (guardar) => {
    const secoes = secoesPorCor(M, guardar, cores);
    if (!secoes.length) throw new Error("A imagem ficou vazia depois da conversão. Tente outra imagem.");

    const gerarCom = (larguraArte) => {
      const s = larguraArte / 100;
      const partes = partesNaEscala(M, guardar, secoes, s);
      if (!partes.length) throw new Error("O desenho ficou pequeno demais para imprimir. Aumente a largura.");
      const arte = guardar(C.union(partes.map((p) => p.secao)));
      const presa = o.comArgola ? prenderArgola(M, guardar, arte, partes, o) : null;
      const total = presa ? guardar(arte.add(presa.secao)) : arte;
      const b = total.bounds();
      return { s, partes, presa, caixa: { min: b.min, max: b.max }, dimensoes: [b.max[0] - b.min[0], b.max[1] - b.min[1], 0] };
    };
    const chute = o.comArgola ? Math.max(5, o.largura - 2 * (o.furo / 2 + o.parede)) : o.largura;
    const r = resolverLargura(o.largura, chute, gerarCom);

    const partes = r.partes.map((p, id) => {
      const lacos = p.secao.toPolygons().map((l) => l.map((q) => [q[0], q[1]]));
      return { id, cor: p.cor, altura: o.altura, area: p.area, lacos, ponto: pontoInterno(guardar, p.secao).map((v) => v / r.s), secao: p.secao };
    });
    for (const e of escolhas) {
      if (!e?.ponto) continue;
      const mm = [e.ponto[0] * r.s, e.ponto[1] * r.s];
      const p = partes.find((q) => pontoDentro(q.lacos, mm));
      if (!p) continue;
      if (typeof e.cor === "string" && /^#[0-9a-f]{6}$/i.test(e.cor)) p.cor = e.cor.toLowerCase();
      const h = Number(e.altura);
      if (Number.isFinite(h) && h >= LIMITES_RELEVO.altura[0] && h <= LIMITES_RELEVO.altura[1]) p.altura = h;
    }
    if (r.presa) r.partes[r.presa.alvo].anel = r.presa.secao;

    const formaDa = (p) => (r.partes[p.id].anel ? guardar(p.secao.add(r.partes[p.id].anel)) : p.secao);
    let coresUsadas = [...new Set(partes.map((p) => p.cor))];
    let faixas = null;
    let malhas;
    if (o.semAms) {
      // sem AMS: cada cor numa faixa de altura própria, uma acima da outra. A faixa k cobre todas as
      // partes das cores k em diante; assim, de cima, cada parte mostra a cor da sua faixa.
      faixas = faixasDoRelevo(partes, o.altura, o.ordem);
      coresUsadas = faixas.map((f) => f.cor);
      malhas = faixas.map((f, k) => {
        const secoes = partes.filter((p) => coresUsadas.indexOf(p.cor) >= k).map(formaDa);
        const secao = secoes.length === 1 ? secoes[0] : guardar(C.union(secoes));
        const solido = guardar(guardar(secao.extrude(f.ate - f.de)).translate([0, 0, f.de]));
        return { nome: `Cor ${k + 1}`, cor: f.cor, ...malhaDoSolido(solido, `cor ${k + 1}`) };
      });
    } else malhas = coresUsadas.map((cor, i) => {
      const solidos = partes
        .filter((p) => p.cor === cor)
        .map((p) => guardar(formaDa(p).extrude(p.altura)));
      const solido = solidos.length === 1 ? solidos[0] : guardar(M.Manifold.union(solidos));
      return { nome: `Cor ${i + 1}`, cor, ...malhaDoSolido(solido, `cor ${i + 1}`) };
    });
    const alturaMax = faixas ? faixas[faixas.length - 1].ate : Math.max(...partes.map((p) => p.altura));
    const avisos = [];
    return {
      malhas,
      partes: partes.map(({ secao: _s, ...p }) => p),
      camadas: partes.map((p) => ({ lacos: p.lacos, cor: p.cor, id: p.id })),
      cores: coresUsadas,
      faixas,
      caixa: r.caixa,
      escalaArte: r.s,
      dimensoes: [r.dimensoes[0], r.dimensoes[1], alturaMax],
      argola: r.presa?.argola ?? null,
      perimetro: r.presa?.perimetro ?? null,
      avisos,
      opcoes: o,
    };
  });
}

// Sem AMS: uma faixa de altura por cor, a de maior área embaixo (ou na ordem pedida). A primeira faixa vai
// de 0 até a altura das partes; cada uma das seguintes tem 1 mm.
export function faixasDoRelevo(partes, altura, ordem = null) {
  const area = new Map();
  for (const p of partes) area.set(p.cor, (area.get(p.cor) ?? 0) + p.area);
  const pedida = (ordem ?? []).filter((c) => area.has(c));
  const cores = [...new Set([...pedida, ...[...area].sort((a, b) => b[1] - a[1]).map(([c]) => c)])];
  return cores.map((cor, k) => ({ cor, de: k ? altura + k - 1 : 0, ate: altura + k }));
}

// Pausas para trocar o filamento (sem AMS): uma no começo de cada faixa, a partir da segunda.
// camada/primeira: altura de camada e da primeira camada no fatiador (mm).
export function trocasDoRelevo(faixas, camada = 0.2, primeira = 0.2) {
  return (faixas ?? []).slice(1).map((f) => camadaDaTroca(f.de, camada, primeira));
}
