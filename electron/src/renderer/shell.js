// Estrutura comum: navegação entre telas, cabeçalho, menu lateral, tema, avisos,
// verificação de atualizações e a pergunta do nome na primeira abertura.
import { FERRAMENTAS, GRUPOS } from "../core/ferramentas.js";
import { gruposVisiveis } from "../core/inicio.js";
import { icone } from "./icones.js";

const $ = (id) => document.getElementById(id);

// Telas fixas. Ferramentas ganham "pai" = página do seu grupo.
const TELAS = {
  inicio: { elemento: "tela-inicio", titulo: "Início", pai: null },
  configuracoes: { elemento: "tela-configuracoes", titulo: "Configurações", pai: "inicio" },
  calculadora: { elemento: "tela-calculadora" },
  visualizador: { elemento: "tela-visualizador" },
  produtos: { elemento: "tela-produtos" },
  clientes: { elemento: "tela-clientes" },
  filamentos: { elemento: "tela-filamentos" },
  etiquetas: { elemento: "tela-etiquetas" },
  encaixes: { elemento: "tela-encaixes" },
  orcamentos: { elemento: "tela-orcamentos" },
  metadados: { elemento: "tela-metadados" },
  detector: { elemento: "tela-detector" },
  stl: { elemento: "tela-stl" },
  chaveiro: { elemento: "tela-chaveiro" },
  logo: { elemento: "tela-logo" },
  palavras: { elemento: "tela-palavras" },
  caneca: { elemento: "tela-caneca" },
  projetos: { elemento: "tela-projetos" },
  svg: { elemento: "tela-svg" },
  backup: { elemento: "tela-backup" },
  orcamento: { elemento: "tela-orcamento", titulo: "Orçamento", pai: "orcamentos" },
};
for (const f of FERRAMENTAS) {
  if (TELAS[f.tela]) Object.assign(TELAS[f.tela], { titulo: f.titulo, pai: `grupo:${f.grupo}` });
}

const ELEMENTOS = [...new Set([...Object.values(TELAS).map((t) => t.elemento), "tela-grupo"])];
const aoAbrir = new Map(); // tela -> função chamada ao entrar
let telaAtual = "inicio";
export const estado = { config: { nome: "", nomePerguntado: true } };

export function registrarAoAbrir(tela, funcao) {
  aoAbrir.set(tela, funcao);
}

export function grupos() {
  return gruposVisiveis(GRUPOS, FERRAMENTAS);
}

// destino: "inicio", "configuracoes", uma ferramenta ("calculadora") ou "grupo:<id>".
export function irPara(destino) {
  let info;
  let elemento;
  if (String(destino).startsWith("grupo:")) {
    const grupo = grupos().find((g) => `grupo:${g.id}` === destino);
    if (!grupo) return irPara("inicio");
    info = { titulo: grupo.titulo, pai: "inicio" };
    elemento = "tela-grupo";
    aoAbrir.get("grupo")?.(grupo);
  } else {
    info = TELAS[destino];
    if (!info || !info.titulo) return irPara("inicio");
    elemento = info.elemento;
  }

  telaAtual = destino;
  for (const id of ELEMENTOS) $(id).classList.toggle("oculta", id !== elemento);
  $("titulo-tela").textContent = info.titulo;
  $("voltar").hidden = !info.pai;
  $("voltar").dataset.destino = info.pai ?? "";
  $(elemento).scrollTop = 0;
  marcarMenuAtivo();
  fecharMenu();
  aoAbrir.get(destino)?.();
}

// ---------- Menu lateral ----------
function itemMenu(destino, texto, nomeIcone, classe = "") {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = `menu-item ${classe}`.trim();
  botao.dataset.destino = destino;
  botao.innerHTML = icone(nomeIcone, 18);
  botao.append(document.createTextNode(texto));
  botao.addEventListener("click", () => irPara(destino));
  return botao;
}

const ICONE_GRUPO = { financeiro: "orcamentos", ferramentas: "medidas", modelos: "chaveiro" };

function montarMenu() {
  const itens = [itemMenu("inicio", "Início", "inicio")];
  for (const g of grupos()) {
    itens.push(itemMenu(`grupo:${g.id}`, g.titulo, ICONE_GRUPO[g.id] ?? "visualizador", "menu-grupo"));
    for (const f of g.ferramentas) itens.push(itemMenu(f.tela, f.titulo, f.id, "menu-filho"));
  }
  $("menu-itens").replaceChildren(...itens);

  const config = $("menu-config");
  config.innerHTML = icone("configuracoes", 18);
  config.append(document.createTextNode("Configurações"));
  config.dataset.destino = "configuracoes";
  config.addEventListener("click", () => irPara("configuracoes"));
}

function marcarMenuAtivo() {
  document.querySelectorAll(".menu-lateral [data-destino]").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.destino === telaAtual);
  });
}

function abrirMenu() {
  const menu = $("menu-lateral");
  menu.classList.add("aberto");
  menu.inert = false;
  menu.setAttribute("aria-hidden", "false");
  $("menu-fundo").classList.add("visivel");
  $("abrir-menu").setAttribute("aria-expanded", "true");
  (menu.querySelector(".menu-item.ativo") ?? menu.querySelector(".menu-item"))?.focus();
}

function fecharMenu() {
  const menu = $("menu-lateral");
  if (!menu.classList.contains("aberto")) return;
  menu.classList.remove("aberto");
  menu.inert = true;
  menu.setAttribute("aria-hidden", "true");
  $("menu-fundo").classList.remove("visivel");
  $("abrir-menu").setAttribute("aria-expanded", "false");
}

// ---------- Tema ----------
function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;
  const interruptor = $("alternar-tema");
  interruptor.setAttribute("aria-checked", String(tema === "escuro"));
  interruptor.setAttribute("aria-label", tema === "escuro" ? "Tema escuro ativado" : "Tema claro ativado");
  try {
    localStorage.setItem("tema", tema);
  } catch {
    // Sem armazenamento disponível: o tema só vale nesta abertura.
  }
}

function temaSalvo() {
  try {
    return localStorage.getItem("tema");
  } catch {
    return null;
  }
}

// ---------- Avisos ----------
let temporizadorAviso = null;

export function mostrarAviso(texto) {
  const aviso = $("aviso");
  aviso.textContent = texto;
  aviso.classList.add("visivel");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.remove("visivel"), 2600);
}

// ---------- Confirmação genérica ----------
// Abre a janela de confirmação e devolve true (confirmou) ou false (cancelou).
export function confirmar({ titulo, texto, botao = "Confirmar" }) {
  return new Promise((resolve) => {
    const dialogo = $("dialogo-confirmar");
    const sim = $("confirmar-sim");
    const nao = $("confirmar-nao");
    $("confirmar-titulo").textContent = titulo;
    $("confirmar-texto").textContent = texto;
    sim.textContent = botao;

    const terminar = (resultado) => {
      sim.removeEventListener("click", aoSim);
      nao.removeEventListener("click", aoNao);
      dialogo.removeEventListener("cancel", aoCancelar);
      if (dialogo.open) dialogo.close();
      resolve(resultado);
    };
    const aoSim = () => terminar(true);
    const aoNao = () => terminar(false);
    const aoCancelar = (ev) => {
      ev.preventDefault();
      terminar(false);
    };
    sim.addEventListener("click", aoSim);
    nao.addEventListener("click", aoNao);
    dialogo.addEventListener("cancel", aoCancelar);
    dialogo.showModal();
    nao.focus();
  });
}

// ---------- Atualizações ----------
const SVG = (d) =>
  `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONE_OK = SVG('<path d="m5 12.5 4.5 4.5L19 7.5"/>');
const ICONE_ALERTA = SVG('<path d="M12 7.5v6M12 17h.01"/><circle cx="12" cy="12" r="9"/>');
const ICONE_BAIXANDO = SVG('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>');

const MENSAGENS_ATUALIZACAO = {
  atualizado: (r) => ["ok", ICONE_OK, "Tudo atualizado", `Você está na versão mais recente (${r.versao}).`],
  baixando: () => ["info", ICONE_BAIXANDO, "Atualização em andamento", "A nova versão está sendo baixada. Quando terminar, o programa avisa."],
  indisponivel: () => ["alerta", ICONE_ALERTA, "Verificação indisponível", "A verificação de atualizações só funciona no programa instalado."],
  erro: () => ["alerta", ICONE_ALERTA, "Não foi possível verificar", "Confira sua conexão com a internet e tente de novo."],
};

function mostrarMensagemAtualizacao(resultado) {
  const montar = MENSAGENS_ATUALIZACAO[resultado.estado];
  if (!montar) return; // "disponivel" e "pronta": o programa já abre a pergunta de atualizar.
  const [tipo, svg, titulo, texto] = montar(resultado);
  const iconeEl = $("atualizacao-icone");
  iconeEl.className = `mensagem-icone ${tipo}`;
  iconeEl.innerHTML = svg;
  $("atualizacao-titulo").textContent = titulo;
  $("atualizacao-texto").textContent = texto;
  $("dialogo-atualizacao").showModal();
  $("atualizacao-ok").focus();
}

async function verificarAtualizacao() {
  const botao = $("verificar-atualizacao");
  if (botao.disabled) return;
  const rotulo = botao.querySelector(".rotulo-topo");
  botao.disabled = true;
  rotulo.textContent = "Verificando…";
  try {
    mostrarMensagemAtualizacao(await window.atualizacao.verificar());
  } catch {
    mostrarMensagemAtualizacao({ estado: "erro" });
  } finally {
    botao.disabled = false;
    rotulo.textContent = "Verificar atualizações";
  }
}

// ---------- Nome (primeira abertura) ----------
const ouvintesConfig = [];

export function aoMudarConfig(funcao) {
  ouvintesConfig.push(funcao);
}

export async function salvarConfig(alteracao) {
  const resposta = await window.dados.config.salvar(alteracao);
  if (resposta.ok) {
    estado.config = resposta.dados;
    ouvintesConfig.forEach((f) => f(estado.config));
  }
  return resposta;
}

function perguntarNome() {
  const dialogo = $("dialogo-boas-vindas");
  $("bv-nome").value = "";
  $("erro-bv").textContent = "";
  dialogo.showModal();
  $("bv-nome").focus();
}

async function aoEnviarNome(ev) {
  ev.preventDefault();
  const nome = $("bv-nome").value.trim();
  if (!nome) {
    $("erro-bv").textContent = "Digite seu nome ou clique em \"Agora não\".";
    return;
  }
  const resposta = await salvarConfig({ nome, nomePerguntado: true });
  if (!resposta.ok) {
    $("erro-bv").textContent = resposta.erro;
    return;
  }
  $("dialogo-boas-vindas").close();
}

async function pularNome() {
  await salvarConfig({ nomePerguntado: true });
  $("dialogo-boas-vindas").close();
}

export async function carregarConfig() {
  const resposta = await window.dados.config.ler();
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  estado.config = resposta.dados;
  ouvintesConfig.forEach((f) => f(estado.config));
  if (!estado.config.nomePerguntado) perguntarNome();
}

// ---------- Início ----------
export function iniciarShell() {
  $("versao").textContent = `Versão ${__VERSAO__}`;
  aplicarTema(temaSalvo() ?? (matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro"));

  const menu = $("menu-lateral");
  menu.inert = true;
  menu.querySelectorAll("[tabindex]").forEach((el) => el.removeAttribute("tabindex"));
  montarMenu();

  $("abrir-menu").addEventListener("click", abrirMenu);
  $("fechar-menu").addEventListener("click", fecharMenu);
  $("menu-fundo").addEventListener("click", fecharMenu);
  $("voltar").addEventListener("click", () => irPara($("voltar").dataset.destino || "inicio"));
  $("alternar-tema").addEventListener("click", () => {
    aplicarTema(document.documentElement.dataset.theme === "escuro" ? "claro" : "escuro");
  });
  $("verificar-atualizacao").addEventListener("click", verificarAtualizacao);
  $("atualizacao-ok").addEventListener("click", () => $("dialogo-atualizacao").close());

  $("form-boas-vindas").addEventListener("submit", aoEnviarNome);
  $("bv-pular").addEventListener("click", pularNome);
  $("dialogo-boas-vindas").addEventListener("cancel", (ev) => {
    ev.preventDefault(); // Esc conta como "Agora não"
    pularNome();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && $("menu-lateral").classList.contains("aberto")) {
      fecharMenu();
      $("abrir-menu").focus();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      irPara("inicio");
      $("busca").focus();
      $("busca").select();
    }
  });

  window.irPara = irPara; // usado também pelo modo de captura de tela dos testes
}
