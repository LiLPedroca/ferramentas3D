// Tela do 2D para 3D (antes Criador de logos): imagem -> recorte e cores automáticos (nas cores prontas)
// -> peça SEM BASE, uma parte por região de cor, lado a lado -> correção à mão direto na peça (2D ou 3D).
//
// As "cores do logo" são cores-alvo (mapa-logo.js): "×" tira uma (os pixels vão para a mais parecida),
// "+ Cor" põe outra (pega os pixels mais perto dela). O que foi corrigido à mão fica guardado na máscara
// "manual" e não muda quando as cores ou a limpeza mudam.
import { conferirMedidas, densidadeDoModelo, calcularCustoModelo, salvarModeloComo, enviarModeloAoFatiador, mudarPrevia, zoomPrevia, ajustarPrevia, arquivoDeTexto, imagemComoTexto } from "./modelos-acoes.js";
import { perguntarImpressao, registrarAbridor } from "./modelos-ui.js";
import { pesoCurto } from "./modelos/estimativa.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { coresDoSvg } from "./modelos/logo.js";
import { faixasDoRelevo, gerarRelevo, LIMITES_RELEVO, PADRAO_RELEVO, pontoDentro, trocasDoRelevo } from "./modelos/relevo.js";
import { gerar3mf } from "./modelos/exportar.js";
import {
  CORES_LOGO, VAZIO, alvoDaCor, aplicarCorrecoes, coresAutomaticas, encher, juntarManual, mapaPorAlvos, mapaVazio,
  mascaraDeFuros, mascaraDoFundo, pintarTraco, rgbaDasCorrecoes, svgDoMapa,
} from "./modelos/mapa-logo.js";
import { motorDaTela } from "./modelos/manifold.js";
import { criarPrevia2d, miniatura } from "./modelos/previa2d.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el, ligarZonaArquivos } from "./util-tela.js";
import { abrirImagem } from "./imagem-arquivo.js";

const $ = (id) => document.getElementById(id);
const LADO = 2000; // resolução máxima do mapa (lado maior); a borda sai com fração de pixel pelo meio-tom
const AMPLIAR = 4; // imagem pequena é ampliada até 4 vezes (mais que isso só gasta memória)
const PEQUENA = 600; // imagem menor que isso (lado maior): avisa que as bordas podem sair menos lisas
const MEDIDAS = { "lg-largura": "largura", "lg-altura": "altura" };
const LIMPEZA = { tirarFundo: true, areasInternas: false }; // só o fundo ligado à borda sai
const LIMITE_HISTORICO = 30;

const ICONES = {
  lapis: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  seta: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  ajustar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  cadeado: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
};

// ---------- Estado ----------
let imagem = null; // { width, height, data, nome } (a imagem no tamanho do mapa)
let tamanhoOriginal = null; // { w, h, svg }
let vazio = null; // máscara do fundo (1 = sai)
let fundo = null; // cor do fundo achada na borda da imagem
let alvos = []; // cores do logo: [{ cor, ref }]
let auto = null; // mapa automático com os alvos atuais (a ferramenta Restaurar volta para ele)
let mapa = null; // mapa atual: automático + correções
let manual = null; // Uint8Array: 1 = pixel corrigido à mão
let historico = [];
let refazer = [];
let opcoes = { ...PADRAO_RELEVO };
let escolhas = []; // [{ ponto: [x, y] em pixels do mapa, cor?, altura? }]: o que foi mudado em cada parte
let modelo = null;
let partes = null;
let vinculo = null; // { k, minX, maxY, desloc } liga a peça mostrada ao mapa (mm <-> pixel)
let modo = "2d";
let previa2d = null;
let previa3d = null;
let temporizador = null;
let geracao = 0;
let entrada = null; // { cores, naArte } da última peça (refaz a peça sem AMS na hora de exportar)
let versaoMapa = 0; // muda quando o mapa ou as cores mudam (trocar cor/altura de uma parte não muda)
let coresGuardadas = null; // { versao, largura, cores }: a vetorização só é refeita quando precisa
let projetoAtual = null; // { id, nome } quando está em Meus modelos
let nomeProjeto = "";
let sujo = false;
let painelCor = null; // null | "adicionar" | índice da cor sendo trocada

const formatar = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const formatar1 = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

// tipo: "pronto" | "trabalhando" | "erro"
function status(texto, tipo = "pronto") {
  const s = $("lg-status");
  s.textContent = texto;
  s.title = texto;
  s.className = `lg-estado ${tipo}`;
}

// ---------- Botões de cor (as cores prontas, sem seletor livre) ----------
function botaoCor(c, aoEscolher, classe = "im-cor") {
  const b = el("button", classe);
  b.type = "button";
  b.title = c.nome;
  b.setAttribute("aria-label", c.nome);
  b.dataset.cor = c.hex;
  b.style.setProperty("--cor", c.hex);
  b.addEventListener("click", () => aoEscolher(c));
  return b;
}

function marcarCores(caixa, hex) {
  for (const b of caixa.querySelectorAll("[data-cor]")) b.setAttribute("aria-pressed", String(b.dataset.cor === hex));
}

// ---------- Projeto (nome e "Salvo") ----------
function mostrarSelo() {
  const selo = $("lg-selo");
  const salvo = projetoAtual && !sujo;
  selo.textContent = salvo ? "Salvo" : projetoAtual ? "Alterações não salvas" : "Não salvo";
  selo.className = `lg-selo ${salvo ? "salvo" : "pendente"}`;
}

function marcarSujo() {
  sujo = true;
  mostrarSelo();
}

function mostrarNome() {
  $("lg-projeto-nome").textContent = nomeProjeto;
}

function renomear() {
  const campo = $("lg-projeto-campo");
  campo.value = nomeProjeto;
  campo.hidden = false;
  $("lg-projeto-nome").hidden = true;
  $("lg-renomear").hidden = true;
  campo.focus();
  campo.select();
}

function terminarRenomear(aceitar) {
  const campo = $("lg-projeto-campo");
  if (campo.hidden) return;
  const novo = campo.value.trim().slice(0, 80);
  campo.hidden = true;
  $("lg-projeto-nome").hidden = false;
  $("lg-renomear").hidden = false;
  if (aceitar && novo && novo !== nomeProjeto) {
    nomeProjeto = novo;
    mostrarNome();
    marcarSujo();
  }
}

// ---------- Campos ----------
function preencherCampos() {
  for (const [id, chave] of Object.entries(MEDIDAS)) if (document.activeElement !== $(id)) $(id).value = formatar(opcoes[chave]);
  $("lg-com-argola").checked = opcoes.comArgola === true;
}

function mudar(mudancas) {
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  marcarSujo();
  gerar();
}

// ---------- Mapa (recorte, cores-alvo e correções) ----------
const limpeza = () => LIMPEZA;
const copiaAlvos = (lista) => lista.map((a) => ({ cor: a.cor, ref: a.ref.slice() }));

// Refaz o recorte automático. achar: acha as cores de novo (imagem nova ou limpeza mudou).
function refazerAutomatico({ achar = false } = {}) {
  ({ vazio, fundo } = mascaraDoFundo(imagem, limpeza()));
  if (achar || !alvos.length) alvos = coresAutomaticas(imagem, vazio, fundo);
  auto = mapaPorAlvos(imagem, vazio, alvos, fundo);
  if (!mapa || !manual) {
    mapa = { largura: auto.largura, altura: auto.altura, idx: auto.idx.slice() };
    manual = new Uint8Array(auto.idx.length);
  } else juntarManual(auto, mapa, manual);
}

const copiaEscolhas = () => escolhas.map((e) => ({ ...e, ponto: e.ponto.slice() }));
const instantaneo = () => ({ idx: mapa.idx.slice(), manual: manual.slice(), alvos: copiaAlvos(alvos), escolhas: copiaEscolhas() });

// soEscolhas: a mudança foi só de cor/altura de partes (guarda só as escolhas, sem copiar o mapa)
function guardarParaDesfazer({ soEscolhas = false } = {}) {
  historico.push(soEscolhas ? { soEscolhas: true, escolhas: copiaEscolhas() } : instantaneo());
  if (historico.length > LIMITE_HISTORICO) historico.shift();
  refazer = [];
  atualizarDesfazer();
}

function atualizarDesfazer() {
  $("lg-desfazer").disabled = !historico.length;
  $("lg-refazer").disabled = !refazer.length;
}

function voltarEdicao(de, para) {
  if (!de.length || !mapa) return;
  const e = de.pop();
  if (e.soEscolhas) {
    para.push({ soEscolhas: true, escolhas: copiaEscolhas() });
    escolhas = e.escolhas;
    fecharBalao();
    mapaMudou({ soEscolhas: true });
    return;
  }
  para.push(instantaneo());
  alvos = e.alvos;
  escolhas = e.escolhas ?? [];
  fecharBalao();
  auto = mapaPorAlvos(imagem, vazio, alvos, fundo);
  mapa.idx = e.idx;
  manual = e.manual;
  preencherCampos();
  mapaMudou();
}

// Depois de qualquer mudança no mapa: lista de cores, desfazer, e a peça é refeita.
function mapaMudou({ espera = 120, soEscolhas = false } = {}) {
  if (!soEscolhas) versaoMapa += 1;
  marcarSujo();
  mostrarCores();
  atualizarDesfazer();
  agendar(espera);
}

function tirarCor(cor) {
  if (alvos.length <= 1) return;
  guardarParaDesfazer();
  alvos = alvos.filter((a) => a.cor !== cor);
  painelCor = null;
  refazerAutomatico();
  mapaMudou();
}

function porCor(cor) {
  if (alvos.some((a) => a.cor === cor)) return;
  guardarParaDesfazer();
  alvos = [...alvos, alvoDaCor(cor)];
  painelCor = null;
  refazerAutomatico();
  mapaMudou();
}

// Troca a cor pronta de um alvo (a parte continua a mesma, só muda a tinta). Correções feitas com a
// cor antiga também passam para a nova.
function trocarCor(de, para) {
  painelCor = null;
  if (de === para) return mostrarCores();
  guardarParaDesfazer();
  const ja = alvos.find((a) => a.cor === para);
  if (ja) alvos = alvos.filter((a) => a.cor !== de); // a nova já era cor do logo: as duas viram uma
  else alvos = alvos.map((a) => (a.cor === de ? { cor: para, ref: a.ref } : a));
  for (let p = 0; p < mapa.idx.length; p++) if (manual[p] && mapa.idx[p] === de) mapa.idx[p] = para;
  refazerAutomatico();
  mapaMudou();
}

function mostrarCores() {
  const lista = $("lg-cores-lista");
  const chips = alvos.map((a) => {
    const c = CORES_LOGO[a.cor];
    const chip = el("span", `lg-chip${painelCor === a.cor ? " trocando" : ""}`);
    const nome = el("button", "lg-chip-nome");
    nome.type = "button";
    nome.title = `Trocar ${c.nome} por outra cor`;
    const bola = el("span", "im-bolinha");
    bola.style.setProperty("--cor", c.hex);
    nome.append(bola, c.nome);
    nome.addEventListener("click", () => {
      painelCor = painelCor === a.cor ? null : a.cor;
      mostrarCores();
    });
    const tirar = el("button", "lg-chip-tirar", "×");
    tirar.type = "button";
    tirar.disabled = alvos.length <= 1;
    tirar.title = alvos.length <= 1 ? "O logo precisa de pelo menos uma cor" : `Tirar ${c.nome}`;
    tirar.setAttribute("aria-label", `Tirar ${c.nome}`);
    tirar.addEventListener("click", () => tirarCor(a.cor));
    chip.append(nome, tirar);
    return chip;
  });
  const mais = el("button", "lg-mais-cor", "+ Cor");
  mais.type = "button";
  mais.setAttribute("aria-expanded", String(painelCor === "adicionar"));
  mais.disabled = alvos.length >= CORES_LOGO.length;
  mais.addEventListener("click", () => {
    painelCor = painelCor === "adicionar" ? null : "adicionar";
    mostrarCores();
  });
  lista.replaceChildren(...chips, mais);

  const painel = $("lg-adicionar-cor");
  if (typeof painelCor === "number" && !alvos.some((a) => a.cor === painelCor)) painelCor = null;
  painel.hidden = painelCor === null;
  if (painelCor === null) return;
  const trocando = painelCor !== "adicionar";
  $("lg-adicionar-titulo").textContent = trocando ? `Trocar ${CORES_LOGO[painelCor].nome} por` : "Adicionar cor";
  const usadas = new Set(alvos.map((a) => a.cor));
  $("lg-cores-novas").replaceChildren(
    ...CORES_LOGO.map((c, i) => {
      const b = botaoCor(c, () => (trocando ? trocarCor(painelCor, i) : porCor(i)));
      if (!trocando && usadas.has(i)) {
        b.disabled = true;
        b.title = `${c.nome} (já está no logo)`;
      }
      return b;
    }),
  );
  if (trocando) marcarCores($("lg-cores-novas"), CORES_LOGO[painelCor].hex);
}

// ---------- Peça ----------
async function gerar() {
  invalidar();
  if (!mapa) return;
  if (mapaVazio(mapa)) {
    modelo = null;
    vinculo = null;
    status("A peça ficou vazia. Desfaça a última correção.", "erro");
    mostrarDados();
    previa2d.mostrar(null);
    return;
  }
  const minha = ++geracao;
  status("Atualizando a peça…", "trabalhando");
  try {
    conferirMedidas(MEDIDAS, LIMITES_RELEVO);
    const refs = Object.fromEntries(alvos.map((a) => [a.cor, a.ref]));
    // passo: curvas amostradas a cada 0,05 mm na peça final (a arte tem 100 de largura); depois saem os
    // pontos que desviam menos de 0,005 mm (trechos retos ficam leves, curvas continuam lisas)
    if (coresGuardadas?.versao !== versaoMapa || coresGuardadas.largura !== opcoes.largura) {
      const passo = (0.05 * 100) / opcoes.largura;
      const tolerancia = (0.005 * mapa.largura) / opcoes.largura;
      const svg = svgDoMapa(mapa, { suave: { imagem, refs, fundo, manual }, furos: mascaraDeFuros(mapa, vazio, manual) });
      coresGuardadas = { versao: versaoMapa, largura: opcoes.largura, cores: coresDoSvg(svg, { juntar: false, passo, tolerancia }) };
    }
    const cores = coresGuardadas.cores;
    const q = cores.quadro;
    const naArte = escolhas.map((e) => ({ ...e, ponto: [(e.ponto[0] - q.minX) * q.escala, (q.maxY - e.ponto[1]) * q.escala] }));
    const M = await motorDaTela();
    if (minha !== geracao) return;
    let novo;
    let semArgola = null; // a argola não coube em nenhum ponto: mostra a peça sem ela (sem exportar)
    try {
      novo = gerarRelevo(M, cores, opcoes, naArte);
    } catch (erro) {
      if (!opcoes.comArgola || !/argola/i.test(erro.message)) throw erro;
      novo = gerarRelevo(M, cores, { ...opcoes, comArgola: false }, naArte);
      semArgola = opcoes.argola === null ? "A argola não coube em nenhum ponto da borda. Desligue a argola ou mude o desenho." : erro.message;
    }
    const novasPartes = novo.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
    // canto da peça antes de ir para a origem (o 3D é mostrado deslocado; o clique precisa voltar)
    const desloc = [Infinity, Infinity];
    for (const p of novasPartes) {
      p.geometria.computeBoundingBox();
      desloc[0] = Math.min(desloc[0], p.geometria.boundingBox.min.x);
      desloc[1] = Math.min(desloc[1], p.geometria.boundingBox.min.y);
    }
    posicionarNaOrigem(novasPartes.map((p) => p.geometria));
    modelo = novo;
    partes = novasPartes;
    entrada = { cores, naArte };
    // escolhas cujo ponto não cai mais em nenhuma parte (a parte sumiu) são descartadas
    escolhas = escolhas.filter((e, i) => {
      const [x, y] = naArte[i].ponto;
      const p = novo.partes.find((q) => pontoDentro(q.lacos, [x * novo.escalaArte, y * novo.escalaArte]));
      return p && (!e.corOriginal || e.corOriginal === p.corOriginal);
    });
    vinculo = { k: cores.quadro.escala * novo.escalaArte, minX: cores.quadro.minX, maxY: cores.quadro.maxY, desloc };
    if (modo === "3d") previa3d?.mostrar(partes);
    if (semArgola) {
      status(semArgola, "erro");
      habilitar(false);
    } else {
      status(modelo.avisos.join(" ") || "Pronto para exportar", "pronto");
      habilitar(true);
    }
  } catch (erro) {
    if (minha !== geracao) return;
    modelo = null;
    vinculo = null;
    status(erro.message, "erro");
    habilitar(false);
  }
  mostrarDados();
  previa2d.mostrar(modelo);
  pincel.limparTraco();
  // a divisão pode ter sido refeita (largura, borracha): o balão segue a parte pelo ponto dela
  if (balao) {
    const p = modelo?.partes.find((q) => q.corOriginal === balao.corOriginal && pontoDentro(q.lacos, [balao.ponto[0] * modelo.escalaArte, balao.ponto[1] * modelo.escalaArte]));
    if (!p) fecharBalao();
    else {
      balao.id = p.id;
      previa2d?.destacar?.(p.id);
      if (document.activeElement !== $("lg-balao-altura")) $("lg-balao-altura").value = formatar(p.altura);
      marcarCores($("lg-balao-cores"), p.cor);
    }
  }
}

// ---------- Balão da parte (cor e altura de cada parte) ----------
let balao = null; // { id, ponto (arte), corOriginal } da parte escolhida

// Ponto da parte (arte, 100 de largura) -> pixel do mapa, onde a escolha fica guardada.
function pixelDaParte(parte) {
  const { k, minX, maxY } = vinculo;
  const mm = [parte.ponto[0] * modelo.escalaArte, parte.ponto[1] * modelo.escalaArte];
  return [mm[0] / k + minX, maxY - mm[1] / k];
}

function fecharBalao() {
  balao = null;
  $("lg-balao").hidden = true;
  previa2d?.destacar?.(null);
}

// x, y: posição (px CSS) no palco onde o balão aparece.
function abrirBalao(id, x, y) {
  const parte = modelo?.partes.find((p) => p.id === id);
  if (!parte) return fecharBalao();
  balao = { id, ponto: parte.ponto.slice(), corOriginal: parte.corOriginal };
  const caixa = $("lg-balao");
  caixa.hidden = false;
  $("lg-balao-erro").textContent = "";
  $("lg-balao-altura").value = formatar(parte.altura);
  marcarCores($("lg-balao-cores"), parte.cor);
  const area = caixa.parentElement.getBoundingClientRect();
  const largura = caixa.offsetWidth || 232;
  const altura = caixa.offsetHeight || 170;
  caixa.style.left = `${Math.max(8, Math.min(x + 12, (area.width || x + largura + 20) - largura - 8))}px`;
  caixa.style.top = `${Math.max(8, Math.min(y + 12, (area.height || y + altura + 20) - altura - 8))}px`;
  previa2d?.destacar?.(id);
}

// Muda a parte do balão (ou todas da mesma cor). mudanca: { cor } | { altura }.
function mudarParte(mudanca) {
  const parte = modelo?.partes.find((p) => p.id === balao?.id);
  if (!parte || !vinculo) return;
  const alvo = $("lg-balao-todas").checked ? modelo.partes.filter((p) => p.cor === parte.cor) : [parte];
  if (alvo.every((p) => (mudanca.cor === undefined || p.cor === mudanca.cor) && (mudanca.altura === undefined || p.altura === mudanca.altura))) return;
  guardarParaDesfazer({ soEscolhas: true });
  const { k, minX, maxY } = vinculo;
  const parteDoPixel = (e) => modelo.partes.find((q) => pontoDentro(q.lacos, [(e.ponto[0] - minX) * k, (maxY - e.ponto[1]) * k]));
  for (const p of alvo) {
    // uma escolha por parte: junta com a que já existia (cor de uma vez, altura de outra)
    const antigas = escolhas.filter((e) => parteDoPixel(e)?.id === p.id);
    const junta = Object.assign({}, ...antigas, mudanca, { ponto: pixelDaParte(p), corOriginal: p.corOriginal });
    escolhas = escolhas.filter((e) => !antigas.includes(e));
    escolhas.push(junta);
  }
  if (mudanca.cor) marcarCores($("lg-balao-cores"), mudanca.cor);
  mapaMudou({ espera: 0, soEscolhas: true });
}

function alturaDoBalao() {
  const n = Number(String($("lg-balao-altura").value).replace(",", "."));
  const [minimo, maximo] = LIMITES_RELEVO.altura;
  if (!Number.isFinite(n) || n < minimo || n > maximo) {
    $("lg-balao-erro").textContent = `Use de ${formatar(minimo)} a ${formatar(maximo)} mm.`;
    return;
  }
  $("lg-balao-erro").textContent = "";
  const altura = Math.round(n * 5) / 5; // passo de 0,2 mm (uma camada)
  $("lg-balao-altura").value = formatar(altura);
  mudarParte({ altura });
}

// Clique (sem arrastar) na peça: abre o balão da parte. Não vale com uma ferramenta de correção ligada.
function ligarCliqueNaParte() {
  const palco = $("lg-palco");
  let inicio = null;
  palco.addEventListener("pointerdown", (ev) => {
    inicio = ev.button === 0 && !pincel.ligado() ? { x: ev.clientX, y: ev.clientY } : null;
  });
  palco.addEventListener("pointerup", (ev) => {
    if (!inicio || !modelo || !vinculo || pincel.ligado()) return;
    const parado = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 4;
    inicio = null;
    if (!parado) return;
    let mm = null;
    if (modo === "3d") {
      const p = previa3d?.pontoNaPeca(ev.clientX, ev.clientY);
      if (p) mm = [p[0] + vinculo.desloc[0], p[1] + vinculo.desloc[1]];
    } else mm = previa2d.paraModelo(ev.clientX, ev.clientY);
    const parte = mm && modelo.partes.find((p) => pontoDentro(p.lacos, mm));
    if (!parte) return fecharBalao();
    const r = palco.getBoundingClientRect();
    abrirBalao(parte.id, ev.clientX - r.left, ev.clientY - r.top);
  });
}

function mostrarDados() {
  $("lg-info").textContent = modelo ? linhaDeInformacao(modelo) : "";
  $("lg-peso").textContent = modelo ? pesoCurto(modelo.malhas, densidadeDoModelo()) : "—";
  const n = modelo ? modelo.cores.length : 0;
  $("lg-partes").textContent = modelo ? `${n} ${n === 1 ? "cor" : "cores"}` : "—";
  $("lg-partes").title = modelo ? "No 3MF, cada cor vai num filamento (1, 2, 3…)." : "";
  if (modelo && document.activeElement !== $("lg-alto")) $("lg-alto").value = formatar1(modelo.dimensoes[1]);
}

const umaCasa = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// "100,0 × 120,5 mm · 52 partes · alturas 3 a 10 mm"
export function linhaDeInformacao(m) {
  const n = m.partes.length;
  const alturas = m.partes.map((p) => p.altura);
  const menor = Math.min(...alturas);
  const maior = Math.max(...alturas);
  const altura = menor === maior ? `altura ${formatar(menor)} mm` : `alturas ${formatar(menor)} a ${formatar(maior)} mm`;
  return `${umaCasa(m.dimensoes[0])} × ${umaCasa(m.dimensoes[1])} mm · ${n} ${n === 1 ? "parte" : "partes"} · ${altura}`;
}

// Cancela pedidos antigos e impede exportar a peça anterior enquanto há alterações.
function invalidar() {
  clearTimeout(temporizador);
  geracao += 1;
  habilitar(false);
}

function agendar(espera = 250) {
  invalidar();
  status("Atualizando a peça…", "trabalhando");
  temporizador = setTimeout(gerar, espera);
}

function habilitar(pronto) {
  for (const id of ["lg-3mf", "lg-exportar-mais", "lg-fatiador", "lg-custo", "lg-salvar-modelo"]) $(id).disabled = !pronto;
  if (!pronto) fecharMenuExportar();
}

async function argolaSolta(t) {
  const anterior = opcoes.argola;
  opcoes = { ...opcoes, argola: t };
  marcarSujo();
  await gerar();
  if ($("lg-status").classList.contains("erro")) {
    const motivo = $("lg-status").textContent;
    opcoes = { ...opcoes, argola: anterior };
    await gerar();
    status(motivo, "erro");
  }
}

// ---------- Correção à mão, direto na peça (2D e 3D) ----------
const pincel = (() => {
  let ligado = false;
  let ferramenta = "borracha";
  let ponteiro = null; // { x, y } em px (CSS) no palco
  let tracando = null; // último ponto do traço no mapa { x, y, raio }
  let marcas = []; // traço desenhado por cima até a peça ser refeita: [{ x, y, r }] em px (CSS)

  const palco = () => $("lg-palco");
  const camada = () => $("lg-camada");
  const usaDisco = () => ["borracha", "restaurar"].includes(ferramenta);
  const raioTela = () => Number($("lg-pincel").value) / 2;

  // evento -> { mapa: [x, y] (pixels do mapa), raio (pixels do mapa) } ou null (fora da peça)
  function ondeNoMapa(ev) {
    if (!vinculo) return null;
    let mm;
    let mmPorPx;
    if (modo === "3d") {
      const p = previa3d?.pontoNaPeca(ev.clientX, ev.clientY);
      if (!p) return null;
      mm = [p[0] + vinculo.desloc[0], p[1] + vinculo.desloc[1]];
      mmPorPx = previa3d.mmPorPixel(p);
    } else {
      mm = previa2d.paraModelo(ev.clientX, ev.clientY);
      if (!mm) return null;
      mmPorPx = previa2d.mmPorPixel();
    }
    const { k, minX, maxY } = vinculo;
    return { x: mm[0] / k + minX, y: maxY - mm[1] / k, raio: Math.max(0.5, (raioTela() * mmPorPx) / k) };
  }

  const valor = () => (ferramenta === "restaurar" ? "restaurar" : VAZIO);

  function corDoTraco() {
    if (ferramenta === "restaurar") return "rgba(91, 141, 239, 0.55)";
    return "rgba(255, 80, 80, 0.5)";
  }

  function desenhar() {
    const c = camada();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return; // sem canvas (testes)
    ctx.clearRect(0, 0, c.width, c.height);
    if (!ligado) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    if (marcas.length) {
      ctx.fillStyle = corDoTraco();
      ctx.beginPath();
      for (const m of marcas) {
        ctx.moveTo(m.x + m.r, m.y);
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    if (ponteiro && usaDisco()) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(ponteiro.x, ponteiro.y, raioTela(), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function noPalco(ev) {
    const r = palco().getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function escolher(nova) {
    ferramenta = nova;
    for (const b of document.querySelectorAll("#lg-ferramentas [data-ferramenta]")) b.setAttribute("aria-pressed", String(b.dataset.ferramenta === nova));
    $("lg-tamanho-campo").hidden = !usaDisco();
    palco().classList.toggle("mira", !usaDisco());
    desenhar();
  }

  function ligar(sim) {
    ligado = sim;
    $("lg-ferramentas").hidden = !sim;
    $("lg-corrigir").setAttribute("aria-pressed", String(sim));
    $("lg-corrigir").textContent = sim ? "Corrigindo na peça… (Concluir)" : "Corrigir na peça";
    palco().classList.toggle("corrigindo", sim);
    previa3d?.modoPintura?.(sim && modo === "3d");
    mostrarDica();
    tracando = null;
    marcas = [];
    desenhar();
  }

  function iniciar() {
    for (const b of document.querySelectorAll("#lg-ferramentas [data-ferramenta]")) b.addEventListener("click", () => escolher(b.dataset.ferramenta));
    escolher("borracha");
    $("lg-pincel").addEventListener("input", desenhar);

    const p = palco();
    // fase de captura: com a correção ligada, o botão esquerdo é do pincel (não gira o 3D nem move a argola)
    p.addEventListener(
      "pointerdown",
      (ev) => {
        if (!ligado || ev.button !== 0) return;
        ev.stopPropagation();
        ev.preventDefault();
        const ponto = ondeNoMapa(ev);
        if (!ponto) return;
        if (usaDisco()) {
          try {
            p.setPointerCapture(ev.pointerId);
          } catch {
            // ponteiro já solto: o traço termina no pointerup do palco
          }
          guardarParaDesfazer();
          tracando = ponto;
          pintarTraco(mapa, ponto.x, ponto.y, ponto.x, ponto.y, ponto.raio, valor(), auto, manual);
          const t = noPalco(ev);
          marcas.push({ x: t.x, y: t.y, r: raioTela() });
          desenhar();
        } else {
          const antes = instantaneo();
          const v = valor();
          if (encher(mapa, ponto.x, ponto.y, v, manual)) {
            historico.push(antes);
            if (historico.length > LIMITE_HISTORICO) historico.shift();
            refazer = [];
            mapaMudou({ espera: 0 });
          }
        }
      },
      true,
    );
    p.addEventListener(
      "pointermove",
      (ev) => {
        if (!ligado) return;
        const t = noPalco(ev);
        ponteiro = t;
        if (tracando) {
          ev.stopPropagation();
          const ponto = ondeNoMapa(ev);
          if (ponto) {
            pintarTraco(mapa, tracando.x, tracando.y, ponto.x, ponto.y, ponto.raio, valor(), auto, manual);
            // marcas na tela a cada meio raio, para o traço aparecer contínuo
            const ultima = marcas[marcas.length - 1];
            const r = raioTela();
            const passos = ultima ? Math.max(1, Math.ceil(Math.hypot(t.x - ultima.x, t.y - ultima.y) / Math.max(1, r / 2))) : 1;
            for (let i = 1; i <= passos; i++) {
              const f = i / passos;
              marcas.push({ x: ultima ? ultima.x + (t.x - ultima.x) * f : t.x, y: ultima ? ultima.y + (t.y - ultima.y) * f : t.y, r });
            }
            tracando = ponto;
          }
        }
        desenhar();
      },
      true,
    );
    const soltar = (ev) => {
      if (!tracando) return;
      tracando = null;
      if (p.hasPointerCapture?.(ev.pointerId)) p.releasePointerCapture(ev.pointerId);
      mapaMudou({ espera: 0 });
    };
    p.addEventListener("pointerup", soltar, true);
    p.addEventListener("pointercancel", soltar, true);
    p.addEventListener("pointerleave", () => {
      ponteiro = null;
      desenhar();
    });
    if (typeof ResizeObserver === "function") new ResizeObserver(desenhar).observe(camada());
  }

  return {
    iniciar,
    ligar,
    ligado: () => ligado,
    desenhar,
    limparTraco() {
      if (tracando) return;
      marcas = [];
      desenhar();
    },
  };
})();

function mostrarDica() {
  const dica = $("lg-dica");
  dica.hidden = !pincel.ligado();
  dica.textContent = modo === "3d" ? "Botão esquerdo: corrigir · direito: girar · roda: zoom" : "Botão esquerdo: corrigir · direito: arrastar · roda: zoom";
}

// ---------- Prévia ----------
function atualizarZoom() {
  const nivel = modo === "3d" ? previa3d?.nivel?.() ?? 1 : previa2d.nivel();
  $("lg-zoom-valor").textContent = `${Math.round(nivel * 100)}%`;
  pincel.desenhar();
}

function mudarModo(novo) {
  modo = novo;
  if (novo === "3d" && !previa3d) {
    previa3d = criarPrevia($("lg-3d"), { luzExtra: true, mesa: [260, 260], cotas: true });
    previa3d.aoMudarVista = atualizarZoom;
  }
  previa3d = mudarPrevia("lg", modo, previa2d, previa3d, partes);
  previa3d?.modoPintura?.(pincel.ligado() && modo === "3d");
  mostrarDica();
  atualizarZoom();
}

// ---------- Abrir imagem ----------
const ehSvg = (arquivo) => arquivo.type === "image/svg+xml" || /\.svg$/i.test(arquivo.name || "");

// Imagem desenhável + tamanho. SVG é desenhado direto no tamanho do mapa (vetor: borda perfeita).
async function abrirDesenhavel(arquivo) {
  if (!ehSvg(arquivo)) {
    const bitmap = await abrirImagem(arquivo);
    return { fonte: bitmap, w: bitmap.width, h: bitmap.height, svg: false };
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    return { fonte: img, w, h, svg: true, url };
  } catch (erro) {
    URL.revokeObjectURL(url);
    throw erro;
  }
}

async function pixelsDe(dataUrl) {
  const bitmap = await createImageBitmap(arquivoDeTexto(dataUrl));
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

// Quanto a imagem é ampliada/reduzida para virar o mapa. Modelo salvo já guardou a imagem no tamanho do
// mapa: fica como está (as correções à mão e as escolhas das partes estão nesses pixels).
export function escalaDoMapa(w, h, { svg = false, salvo = false } = {}) {
  if (salvo) return 1;
  const maior = Math.max(w, h);
  return svg ? LADO / maior : Math.min(LADO, AMPLIAR * maior) / maior;
}

// salvo (opcional): modelo de Meus modelos sendo reaberto ({ id, nome, opcoes, correcoes }).
async function carregar([arquivo], salvo = null) {
  let aberta;
  try {
    aberta = await abrirDesenhavel(arquivo);
  } catch {
    mostrarAviso("Não foi possível abrir essa imagem. Use PNG, JPEG, WebP, HEIC ou SVG.");
    return;
  }
  try {
    // o lado maior vira até LADO: imagem grande é reduzida e pequena é ampliada com suavização
    // (o meio-tom ampliado ainda dá a borda com fração de pixel)
    const escala = escalaDoMapa(aberta.w, aberta.h, { svg: aberta.svg, salvo: Boolean(salvo) });
    const w = Math.max(1, Math.round(aberta.w * escala));
    const h = Math.max(1, Math.round(aberta.h * escala));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(aberta.fonte, 0, 0, w, h);
    $("lg-miniatura").src = await imagemComoTexto(canvas);
    await usarImagem({ width: w, height: h, data: ctx.getImageData(0, 0, w, h).data }, { nome: arquivo.name, w: aberta.w, h: aberta.h, svg: aberta.svg }, salvo);
  } finally {
    if (aberta.url) URL.revokeObjectURL(aberta.url);
  }
}

// Imagem já no tamanho do mapa ({ width, height, data }) -> recorte, cores e peça.
// info: { nome, w, h, svg } da imagem original. salvo: modelo de Meus modelos (opcional).
async function usarImagem(pixels, info, salvo = null) {
  versaoMapa += 1;
  imagem = { ...pixels, nome: info.nome };
  tamanhoOriginal = { w: info.w, h: info.h, svg: info.svg === true };
  $("lg-trabalho").hidden = false;
  $("lg-zona").hidden = true;
  painelCor = null;
  historico = [];
  refazer = [];
  mapa = null;
  manual = null;
  alvos = [];
  escolhas = [];
  const o = salvo?.opcoes ?? {};
  const nomeImagem = o.nomeImagem || info.nome;
  $("lg-nome").textContent = nomeImagem;
  const pequena = !tamanhoOriginal.svg && Math.max(tamanhoOriginal.w, tamanhoOriginal.h) < PEQUENA;
  $("lg-tamanho-imagem").textContent = tamanhoOriginal.svg
    ? "SVG (vetor)"
    : `${tamanhoOriginal.w} × ${tamanhoOriginal.h} px${pequena ? " · pequena: se tiver, use uma maior ou SVG" : ""}`;
  $("lg-tamanho-imagem").classList.toggle("aviso", pequena);

  if (salvo) {
    opcoes = opcoesDoSalvo(o);
    escolhas = Array.isArray(o.escolhas) ? o.escolhas.filter((e) => Array.isArray(e?.ponto) && e.ponto.length === 2 && e.ponto.every(Number.isFinite)) : [];
    const alvosSalvos = o.alvos;
    if ((o.versao === 2 || o.versao === 3) && Array.isArray(alvosSalvos)) {
      alvos = alvosSalvos
        .map((a) => ({ cor: CORES_LOGO.findIndex((c) => c.id === a.cor), ref: Array.isArray(a.ref) ? a.ref.slice(0, 3).map(Number) : null }))
        .filter((a) => a.cor >= 0 && a.ref?.length === 3 && a.ref.every(Number.isFinite));
    }
    projetoAtual = { id: salvo.id, nome: salvo.nome };
    nomeProjeto = salvo.nome;
  } else {
    opcoes = { ...PADRAO_RELEVO, largura: opcoes.largura, altura: opcoes.altura };
    projetoAtual = null;
    nomeProjeto = nomeImagem.replace(/\.[^.]+$/, "").slice(0, 80) || "Logo";
  }
  preencherCampos();
  refazerAutomatico({ achar: !alvos.length });
  if (salvo?.correcoes) {
    try {
      if (!aplicarCorrecoes(await pixelsDe(salvo.correcoes), mapa, manual)) throw new Error("tamanho");
    } catch {
      mostrarAviso("As correções à mão deste modelo não puderam ser lidas. O recorte automático foi refeito.");
    }
  }
  sujo = !salvo;
  mostrarNome();
  mostrarSelo();
  mostrarCores();
  atualizarDesfazer();
  previa2d.ajustar();
  agendar(0);
}

// Opções de um modelo salvo. Os do Criador de logos (versão 1 e 2) tinham base, borda e relevo: ficam
// guardados no arquivo, mas a peça agora sai sem base. Largura e argola continuam valendo.
export function opcoesDoSalvo(o = {}) {
  const pega = (chave) => {
    const n = Number(o[chave]);
    const [minimo, maximo] = LIMITES_RELEVO[chave];
    return Number.isFinite(n) && n >= minimo && n <= maximo ? n : PADRAO_RELEVO[chave];
  };
  const argola = o.argola === null || o.argola === undefined ? null : Number(o.argola);
  return {
    ...PADRAO_RELEVO,
    largura: pega("largura"),
    altura: o.versao === 3 ? pega("altura") : PADRAO_RELEVO.altura,
    // antes de 3, a argola vinha ligada quando não dizia nada
    comArgola: o.versao === 3 ? o.comArgola === true : o.comArgola !== false,
    argola: argola >= 0 && argola <= 1 ? argola : null,
    furo: pega("furo"),
    parede: pega("parede"),
  };
}

const nomeArquivo = () => nomeProjeto || "Peça";
const nomeDaCor = (hex) => CORES_LOGO.find((c) => c.hex.toLowerCase() === hex)?.nome.toLowerCase() ?? hex;

// Peça para o 3MF. Com AMS: as partes de sempre. Sem AMS: degraus por cor (uma faixa por cor), tudo no
// filamento 1, com uma pausa no começo de cada faixa.
async function pecaParaImprimir(escolha) {
  if (escolha.ams || !modelo || modelo.cores.length < 2) return { partes, pausas: [], aviso: "" };
  const M = await motorDaTela();
  const r = gerarRelevo(M, entrada.cores, { ...modelo.opcoes, semAms: true }, entrada.naArte);
  const pecas = r.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m), slot: 1 }));
  posicionarNaOrigem(pecas.map((p) => p.geometria));
  const trocas = trocasDoRelevo(r.faixas, escolha.camada, escolha.primeira);
  const passos = trocas.map((t, i) => `camada ${t.numero} → ${nomeDaCor(r.faixas[i + 1].cor)}`).join("; ");
  return { partes: pecas, pausas: trocas.map((t) => t.z), aviso: ` Comece com ${nomeDaCor(r.faixas[0].cor)}. Trocas: ${passos}.` };
}

// 3MF perguntando antes se a impressão é com AMS. null = cancelado.
async function montar3mf() {
  let escolha = { ams: true };
  if (modelo.cores.length > 1) {
    const faixas = faixasDoRelevo(modelo.partes, modelo.opcoes.altura);
    escolha = await perguntarImpressao((camada, primeira) => trocasDoRelevo(faixas, camada, primeira));
    if (!escolha) return null;
  }
  const a = await pecaParaImprimir(escolha);
  return { bytes: gerar3mf(a.partes, { titulo: nomeArquivo(), pausas: a.pausas }), aviso: a.aviso };
}

async function salvar(extensao) {
  fecharMenuExportar();
  if (!partes) return;
  await salvarModeloComo(extensao, partes, nomeArquivo(), montar3mf);
}

function fecharMenuExportar() {
  $("lg-menu-exportar").hidden = true;
  $("lg-exportar-mais").setAttribute("aria-expanded", "false");
}

// Imagem como data URL dentro do limite de Meus modelos (PNG; se passar, WebP).
async function imagemParaGuardar(rgba, w, h, limite = 1_900_000) {
  const c = new OffscreenCanvas(w, h);
  c.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
  const png = await imagemComoTexto(c);
  if (png.length <= limite) return png;
  for (const qualidade of [0.95, 0.85, 0.7]) {
    const blob = await c.convertToBlob({ type: "image/webp", quality: qualidade });
    const url = await new Promise((ok) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(leitor.result);
      leitor.readAsDataURL(blob);
    });
    if (url.length <= limite) return url;
  }
  throw new Error("A imagem do logo ficou grande demais para guardar.");
}

async function salvarProjeto() {
  if (!modelo || !mapa) return;
  terminarRenomear(true);
  $("lg-salvar-modelo").disabled = true;
  try {
    const temCorrecao = manual.some((v) => v);
    const valores = {
      tipo: "logo",
      nome: nomeProjeto || "Peça",
      opcoes: {
        ...opcoes,
        versao: 3,
        escolhas,
        alvos: alvos.map((a) => ({ cor: CORES_LOGO[a.cor].id, ref: a.ref.map(Math.round) })),
        nomeImagem: $("lg-nome").textContent,
      },
      miniatura: miniatura(modelo),
      imagem: await imagemParaGuardar(new Uint8ClampedArray(imagem.data), imagem.width, imagem.height),
      correcoes: temCorrecao ? await imagemParaGuardar(rgbaDasCorrecoes(mapa, manual), mapa.largura, mapa.altura, 1_400_000) : "",
    };
    const resposta = await window.dados.projetos.salvar(valores, projetoAtual?.id);
    if (!resposta.ok) {
      mostrarAviso(resposta.erro);
      return;
    }
    projetoAtual = { id: resposta.dados.id, nome: resposta.dados.nome };
    sujo = false;
    mostrarSelo();
    mostrarAviso(`"${resposta.dados.nome}" salvo em Meus modelos.`);
  } catch (erro) {
    mostrarAviso(erro.message);
  } finally {
    $("lg-salvar-modelo").disabled = !modelo;
  }
}

export function iniciarLogo() {
  ligarZonaArquivos($("lg-zona"), $("lg-entrada"), carregar);
  $("lg-trocar").addEventListener("click", () => $("lg-entrada").click());
  $("lg-renomear").innerHTML = ICONES.lapis;
  $("lg-exportar-mais").innerHTML = ICONES.seta;
  $("lg-ajustar").innerHTML = ICONES.ajustar;
  document.querySelector("#tela-logo .lg-cadeado").innerHTML = ICONES.cadeado;
  preencherCampos();
  pincel.iniciar();
  $("lg-balao-cores").replaceChildren(...CORES_LOGO.map((c) => botaoCor(c, () => mudarParte({ cor: c.hex }))));
  $("lg-balao-altura").addEventListener("change", alturaDoBalao);
  $("lg-balao-altura").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") alturaDoBalao();
  });
  $("lg-balao-fechar").addEventListener("click", fecharBalao);
  ligarCliqueNaParte();

  // projeto
  $("lg-renomear").addEventListener("click", renomear);
  $("lg-projeto-nome").addEventListener("dblclick", renomear);
  $("lg-projeto-campo").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") terminarRenomear(true);
    if (ev.key === "Escape") {
      ev.stopPropagation();
      terminarRenomear(false);
    }
  });
  $("lg-projeto-campo").addEventListener("blur", () => terminarRenomear(true));
  $("lg-salvar-modelo").addEventListener("click", salvarProjeto);

  // exportar (3MF; a seta abre o STL)
  $("lg-3mf").addEventListener("click", () => salvar("3mf"));
  $("lg-stl").addEventListener("click", () => salvar("stl"));
  $("lg-exportar-mais").addEventListener("click", (ev) => {
    ev.stopPropagation();
    const abrir = $("lg-menu-exportar").hidden;
    $("lg-menu-exportar").hidden = !abrir;
    $("lg-exportar-mais").setAttribute("aria-expanded", String(abrir));
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest?.(".lg-exportar")) fecharMenuExportar();
  });

  // cores do logo
  $("lg-adicionar-fechar").addEventListener("click", () => {
    painelCor = null;
    mostrarCores();
  });

  $("lg-corrigir").addEventListener("click", () => pincel.ligar(!pincel.ligado()));
  $("lg-concluir").addEventListener("click", () => pincel.ligar(false));

  // desfazer / refazer (botões e Ctrl+Z / Ctrl+Y nesta tela); Esc sai da correção
  $("lg-desfazer").addEventListener("click", () => voltarEdicao(historico, refazer));
  $("lg-refazer").addEventListener("click", () => voltarEdicao(refazer, historico));
  document.addEventListener("keydown", (ev) => {
    if ($("tela-logo").classList.contains("oculta") || !mapa) return;
    if (ev.target.closest?.("input, textarea, select") || document.querySelector("dialog[open]")) return;
    if (ev.key === "Escape" && pincel.ligado()) {
      pincel.ligar(false);
      return;
    }
    if (ev.key === "Escape" && balao) {
      fecharBalao();
      return;
    }
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const tecla = ev.key.toLowerCase();
    if (tecla === "z" && !ev.shiftKey) {
      ev.preventDefault();
      voltarEdicao(historico, refazer);
    } else if (tecla === "y" || (tecla === "z" && ev.shiftKey)) {
      ev.preventDefault();
      voltarEdicao(refazer, historico);
    }
  });

  // medidas
  for (const [id, chave] of Object.entries(MEDIDAS)) {
    $(id).addEventListener("input", () => {
      const valor = Number(String($(id).value).replace(",", "."));
      invalidar();
      const [minimo, maximo] = LIMITES_RELEVO[chave];
      if (!Number.isFinite(valor) || valor < minimo || valor > maximo) {
        status(`${chave === "largura" ? "Largura" : "Altura das partes"}: use de ${formatar(minimo)} a ${formatar(maximo)} mm.`, "erro");
        habilitar(false);
        return;
      }
      opcoes = { ...opcoes, [chave]: valor };
      marcarSujo();
      agendar();
    });
    $(id).addEventListener("change", () => {
      preencherCampos();
      gerar();
    });
  }
  // comprimento: muda a largura na mesma proporção da peça atual
  $("lg-alto").addEventListener("input", () => {
    const altura = Number(String($("lg-alto").value).replace(",", "."));
    if (!modelo || !(altura > 0)) return;
    const [minimo, maximo] = LIMITES_RELEVO.largura;
    const largura = Math.round(((altura * modelo.dimensoes[0]) / modelo.dimensoes[1]) * 10) / 10;
    invalidar();
    if (largura < minimo || largura > maximo) {
      status(`Com essa altura a largura ficaria ${formatar1(largura)} mm. Use de ${formatar(minimo)} a ${formatar(maximo)} mm de largura.`, "erro");
      return;
    }
    opcoes = { ...opcoes, largura };
    $("lg-largura").value = formatar(largura);
    marcarSujo();
    agendar();
  });
  $("lg-alto").addEventListener("change", () => mostrarDados());

  $("lg-com-argola").addEventListener("change", () => mudar({ comArgola: $("lg-com-argola").checked, argola: null }));

  // prévia
  previa2d = criarPrevia2d($("lg-2d"), {
    aoComecar: () => status("Posicione a argola. A peça é refeita ao soltar.", "trabalhando"),
    aoSoltar: argolaSolta,
  });
  previa2d.aoMudarVista = atualizarZoom;
  $("lg-ver-2d").addEventListener("click", () => mudarModo("2d"));
  $("lg-ver-3d").addEventListener("click", () => mudarModo("3d"));
  $("lg-zoom-menos").addEventListener("click", () => {
    zoomPrevia(modo, previa2d, previa3d, 1.25);
    atualizarZoom();
  });
  $("lg-zoom-mais").addEventListener("click", () => {
    zoomPrevia(modo, previa2d, previa3d, 0.8);
    atualizarZoom();
  });
  $("lg-ajustar").addEventListener("click", () => {
    ajustarPrevia(modo, previa2d, previa3d);
    atualizarZoom();
  });

  // acesso para os roteiros do modo de captura (como window.__visualizadorTeste)
  const abrirSalvo = (p) => carregar([arquivoDeTexto(p.imagem, p.opcoes.nomeImagem || `${p.nome}.png`)], p);
  window.__logoTeste = { previa2d: () => previa2d, previa3d: () => previa3d, vinculo: () => vinculo, mapa: () => mapa, manual: () => manual, alvos: () => alvos, modelo: () => modelo, escolhas: () => escolhas, versaoMapa: () => versaoMapa, balao: () => balao, abrirSalvo, usarImagem, abrirBalao, pecaParaImprimir, gerar, adicionarEscolha: (e) => escolhas.push(e) };

  registrarAbridor("logo", abrirSalvo);
  $("lg-custo").addEventListener("click", () => {
    if (!modelo) return;
    calcularCustoModelo(modelo, nomeArquivo());
  });
  $("lg-fatiador").addEventListener("click", () => {
    if (partes) enviarModeloAoFatiador(partes, nomeArquivo(), montar3mf);
  });
  registrarAoAbrir("logo", () => {
    mostrarDados();
    const nome = estado.config.fatiador?.nome;
    $("lg-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
  });
}
