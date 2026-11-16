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

// Um ponto bem dentro da parte: corta a parte com algumas linhas horizontais e pega o meio do trecho
// interno mais largo. Só JavaScript (encolher a seção com o Manifold era lento em partes grandes).
export function pontoInterno(lacos) {
  const externo = lacos.reduce((a, b) => (Math.abs(areaComSinal(b)) > Math.abs(areaComSinal(a)) ? b : a));
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of externo) (y0 = Math.min(y0, p[1])), (y1 = Math.max(y1, p[1]));
  let melhor = null;
  for (const f of [0.5, 0.37, 0.63, 0.25, 0.75, 0.15, 0.85]) {
    const y = y0 + (y1 - y0) * f;
    const xs = [];
    for (const laco of lacos)
      for (let i = 0, j = laco.length - 1; i < laco.length; j = i++) {
        const [xi, yi] = laco[i];
        const [xj, yj] = laco[j];
        if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const largura = xs[k + 1] - xs[k];
      if (!melhor || largura > melhor.largura) melhor = { largura, ponto: [(xs[k] + xs[k + 1]) / 2, y] };
    }
  }
  return melhor ? melhor.ponto : [externo[0][0], externo[0][1]];
}

const FOLGA = 0.05; // arte (≈ 0,05 mm na peça de 100 mm): engole as lascas entre bordas quase iguais

// Seções por cor na arte (100 de largura). Como no SVG, o que vem depois fica por cima: a parte
// visível de uma cor é ela menos as cores seguintes. Assim nenhuma cor se sobrepõe a outra.
// O vetorizador desenha as cores em camadas empilhadas, e a mesma divisa entre duas cores aparece em
// duas camadas com traçados quase iguais: a diferença vira milhares de lascas finíssimas. Por isso
// cada camada de cima cresce FOLGA para dentro das de baixo (só onde já havia desenho) antes de recortar.
function secoesPorCor(M, guardar, cores) {
  const C = M.CrossSection;
  const furosArte = cores.find((c) => c.cor === COR_FURO)?.formas ?? [];
  const furos = furosArte.length ? guardar(C.union(furosArte.map((l) => guardar(new C(l, "EvenOdd"))))) : null;
  const camadas = [];
  let abaixo = null;
  for (const { cor, formas } of cores.filter((c) => c.cor !== COR_FURO)) {
    if (!formas.length) continue;
    let camada = guardar(C.union(formas.map((l) => guardar(new C(l, "EvenOdd")))));
    if (furos) camada = guardar(camada.subtract(furos));
    if (abaixo) camada = guardar(guardar(camada.offset(FOLGA, "Miter", 2)).intersect(guardar(abaixo.add(camada))));
    abaixo = abaixo ? guardar(abaixo.add(camada)) : camada;
    camadas.push({ cor, camada });
  }
  let acima = null;
  const secoes = [];
  for (const { cor, camada } of camadas.reverse()) {
    const secao = acima ? guardar(camada.subtract(acima)) : camada;
    acima = acima ? guardar(acima.add(camada)) : camada;
    if (secao.area() > 0) secoes.unshift({ cor, secao });
  }
  return secoes;
}

const RESIDUO = 0.01; // mm²: sobra numérica das contas (fiapos sem largura): some

// Distância do ponto p ao segmento a-b.
function distanciaAoSegmento(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c = dx * dx + dy * dy;
  const t = c ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / c)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// Quantos pontos da ilha ficam na borda da parte (até 0,02 mm): mede o contato sem contas do Manifold.
function contato(ilha, b, parte) {
  const tol = 0.02;
  let n = 0;
  for (const laco of parte.lacos)
    for (let i = 0, j = laco.length - 1; i < laco.length; j = i++) {
      const a = laco[j];
      const c = laco[i];
      if (Math.max(a[0], c[0]) < b.min[0] - tol || Math.min(a[0], c[0]) > b.max[0] + tol || Math.max(a[1], c[1]) < b.min[1] - tol || Math.min(a[1], c[1]) > b.max[1] + tol) continue;
      for (const laco2 of ilha) for (const p of laco2) if (distanciaAoSegmento(p, a, c) <= tol) n++;
    }
  return n;
}

// Divide em partes (ilhas) já na escala da peça e junta as ilhas pequenas à vizinha de maior contato.
function partesNaEscala(M, guardar, secoes, s) {
  const C = M.CrossSection;
  const pecas = [];
  secoes.forEach(({ cor, secao }, ordemCor) => {
    for (const p of guardar(secao.scale([s, s])).decompose().map(guardar)) {
      const area = p.area();
      if (area >= RESIDUO) pecas.push({ cor, ordemCor, secao: p, area });
    }
  });
  const pequenas = pecas.filter((p) => p.area < ILHA_MINIMA);
  const grandes = pecas.filter((p) => p.area >= ILHA_MINIMA);
  for (const g of grandes) {
    g.caixa = g.secao.bounds();
    g.lacos = g.secao.toPolygons();
    g.juntar = [];
  }
  for (const ilha of pequenas) {
    const b = ilha.secao.bounds();
    const lacos = ilha.secao.toPolygons();
    let melhor = null;
    let maior = 0;
    for (const g of grandes) {
      const k = g.caixa;
      if (k.min[0] > b.max[0] + 0.1 || k.max[0] < b.min[0] - 0.1 || k.min[1] > b.max[1] + 0.1 || k.max[1] < b.min[1] - 0.1) continue;
      const n = contato(lacos, b, g);
      if (n > maior) (maior = n), (melhor = g);
    }
    melhor?.juntar.push(ilha.secao);
  }
  for (const g of grandes) {
    if (g.juntar.length) {
      g.secao = guardar(C.union([g.secao, ...g.juntar]));
      g.area = g.secao.area();
    }
    delete g.caixa;
    delete g.lacos;
    delete g.juntar;
  }
  return grandes.sort((a, b) => a.ordemCor - b.ordemCor || b.area - a.area);
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

const lacosDe = (secao) => secao.toPolygons().map((l) => l.map((q) => [q[0], q[1]]));

// Divisão da arte em partes, na escala da peça, só com dados (sem objetos do Manifold). É a parte cara;
// fica guardada enquanto a arte e as medidas não mudam (trocar cor ou altura de uma parte não refaz).
// Guarda as últimas divisões (e as que falharam, como a argola que não cabe), para não refazer a cada mudança.
let guardadas = []; // [{ cores, chave, dados | erro }]
export const estatisticasRelevo = { particoes: 0 };

function particao(M, cores, o) {
  const chave = JSON.stringify([o.largura, o.comArgola, o.argola, o.furo, o.parede]);
  const achada = guardadas.find((g) => g.cores === cores && g.chave === chave);
  if (achada?.erro) throw achada.erro;
  if (achada) return achada.dados;
  estatisticasRelevo.particoes += 1;
  const C = M.CrossSection;
  let dados;
  try {
    dados = calcularParticao(M, C, cores, o);
  } catch (erro) {
    guardadas = [{ cores, chave, erro }, ...guardadas.filter((g) => g.cores === cores)].slice(0, 3);
    throw erro;
  }
  guardadas = [{ cores, chave, dados }, ...guardadas.filter((g) => g.cores === cores)].slice(0, 3);
  return dados;
}

function calcularParticao(M, C, cores, o) {
  const dados = comEscopo(M, (guardar) => {
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
    // a arte pode não ocupar os 100 de largura (o fundo saiu): o chute já desconta isso
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const { secao } of secoes) {
      const b = secao.bounds();
      x0 = Math.min(x0, b.min[0]);
      x1 = Math.max(x1, b.max[0]);
    }
    const util = o.comArgola ? Math.max(5, o.largura - 2 * (o.furo / 2 + o.parede)) : o.largura;
    const r = resolverLargura(o.largura, (util * 100) / Math.max(1e-6, x1 - x0), gerarCom);
    return {
      s: r.s,
      caixa: r.caixa,
      dimensoes: r.dimensoes,
      partes: r.partes.map((p, id) => ({ id, cor: p.cor, area: p.area, lacos: lacosDe(p.secao), anel: r.presa?.alvo === id ? lacosDe(r.presa.secao) : null })),
      argola: r.presa?.argola ?? null,
      perimetro: r.presa?.perimetro ?? null,
    };
  });
  for (const p of dados.partes) p.ponto = pontoInterno(p.lacos).map((v) => v / dados.s);
  return dados;
}

// cores: resultado de coresDoSvg ([{ cor, formas }], arte com 100 de largura, Y para cima).
// escolhas: [{ ponto: [x, y] na arte, cor?, altura? }]; vale para a parte que contém o ponto (a última ganha).
export function gerarRelevo(M, cores, entrada = {}, escolhas = []) {
  const o = validarOpcoesRelevo(entrada);
  const C = M.CrossSection;
  const d = particao(M, cores, o);
  // corOriginal: a cor da parte antes das escolhas (a escolha só vale se a parte ainda for daquela cor)
  const partes = d.partes.map((p) => ({ id: p.id, cor: p.cor, corOriginal: p.cor, altura: o.altura, area: p.area, lacos: p.lacos, ponto: p.ponto }));
  for (const e of escolhas) {
    if (!e?.ponto) continue;
    const mm = [e.ponto[0] * d.s, e.ponto[1] * d.s];
    const p = partes.find((q) => pontoDentro(q.lacos, mm));
    if (!p || (e.corOriginal && e.corOriginal !== p.corOriginal)) continue;
    if (typeof e.cor === "string" && /^#[0-9a-f]{6}$/i.test(e.cor)) p.cor = e.cor.toLowerCase();
    const h = Number(e.altura);
    if (Number.isFinite(h) && h >= LIMITES_RELEVO.altura[0] && h <= LIMITES_RELEVO.altura[1]) p.altura = h;
  }
  return comEscopo(M, (guardar) => {
    // a parte com a argola leva o anel junto (mesma cor e mesma altura)
    const formaDa = (p) => {
      const anel = d.partes[p.id].anel;
      return anel ? guardar(new C([...p.lacos, ...anel], "NonZero")) : guardar(new C(p.lacos, "NonZero"));
    };
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
    } else
      malhas = coresUsadas.map((cor, i) => {
        const solidos = partes.filter((p) => p.cor === cor).map((p) => guardar(formaDa(p).extrude(p.altura)));
        // partes da mesma cor nunca se sobrepõem: juntar sem conta booleana (bem mais rápido)
        const solido = solidos.length === 1 ? solidos[0] : guardar(M.Manifold.compose(solidos));
        return { nome: `Cor ${i + 1}`, cor, ...malhaDoSolido(solido, `cor ${i + 1}`) };
      });
    const alturaMax = faixas ? faixas[faixas.length - 1].ate : Math.max(...partes.map((p) => p.altura));
    return {
      malhas,
      partes,
      camadas: partes.map((p) => ({ lacos: p.lacos, cor: p.cor, id: p.id })),
      cores: coresUsadas,
      faixas,
      caixa: d.caixa,
      escalaArte: d.s,
      dimensoes: [d.dimensoes[0], d.dimensoes[1], alturaMax],
      argola: d.argola,
      perimetro: d.perimetro,
      avisos: [],
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
