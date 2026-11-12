// Estrutura comum: navegação entre telas, cabeçalho, menu lateral, tema, avisos,
// verificação de atualizações e a pergunta do nome na primeira abertura.
import { DESTAQUES, FERRAMENTAS, GRUPOS } from "../core/ferramentas.js";
import { gruposVisiveis } from "../core/inicio.js";
import { novidadeDaTela } from "../core/novidades.js";
import { icone } from "./icones.js";

const $ = (id) => document.getElementById(id);

// Telas fixas. Ferramentas ganham "pai" = página do seu grupo.
const TELAS = {
  inicio: { elemento: "tela-inicio", titulo: "Início", pai: null },
  configuracoes: { elemento: "tela-configuracoes", titulo: "Configurações", pai: "inicio" },
  calculadora: { elemento: "tela-calculadora" },
  visualizador: { elemento: "tela-visualizador" },
  impressoes: { elemento: "tela-impressoes" },
  produtos: { elemento: "tela-produtos" },
  clientes: { elemento: "tela-clientes" },
  encaixes: { elemento: "tela-encaixes" },
  orcamentos: { elemento: "tela-orcamentos" },
  detector: { elemento: "tela-detector" },
  stl: { elemento: "tela-stl" },
  chaveiro: { elemento: "tela-chaveiro" },
  logo: { elemento: "tela-logo" },
  caneca: { elemento: "tela-caneca" },
  "caneca-legado": { elemento: "tela-caneca-legado", titulo: "Modelo anterior", pai: "projetos" },
  projetos: { elemento: "tela-projetos" },
  svg: { elemento: "tela-svg" },
  backup: { elemento: "tela-backup" },
  financeiro: { elemento: "tela-financeiro", titulo: "Gestão financeira", pai: "inicio" },
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

// Caminho percorrido: o Voltar refaz de trás para frente. aoVoltar reabre o que estava aberto (ex.: uma janela).
const historico = []; // [{ tela, aoVoltar }]
let aoVoltarPendente = null;

// Chamar logo antes de irPara(...) quando, ao voltar, a tela de origem deve reabrir algo.
export function lembrarAoVoltar(funcao) {
  aoVoltarPendente = funcao;
}

function voltar() {
  const entrada = historico.pop();
  if (!entrada) return irPara($("voltar").dataset.destino || "inicio", { voltando: true });
  irPara(entrada.tela, { voltando: true });
  entrada.aoVoltar?.();
}

// destino: "inicio", "configuracoes", uma ferramenta ("calculadora") ou "grupo:<id>".
export function irPara(destino, { voltando = false } = {}) {
  let info;
  let elemento;
  // Grupo com tela própria (Gestão financeira abre o painel).
  const comTela = String(destino).startsWith("grupo:") && GRUPOS.find((g) => `grupo:${g.id}` === destino)?.tela;
  if (comTela) destino = comTela;
  if (String(destino).startsWith("grupo:")) {
    const grupo = grupos().find((g) => `grupo:${g.id}` === destino);
    if (!grupo) return irPara("inicio", { voltando });
    info = { titulo: grupo.titulo, pai: "inicio" };
    elemento = "tela-grupo";
    aoAbrir.get("grupo")?.(grupo);
  } else {
    info = TELAS[destino];
    if (!info || !info.titulo) return irPara("inicio", { voltando });
    elemento = info.elemento;
  }

  if (destino === "inicio") historico.length = 0;
  else if (!voltando && telaAtual !== destino) {
    historico.push({ tela: telaAtual, aoVoltar: aoVoltarPendente });
    if (historico.length > 40) historico.shift();
  }
  aoVoltarPendente = null;
  telaAtual = destino;
  for (const id of ELEMENTOS) $(id).classList.toggle("oculta", id !== elemento);
  $("titulo-tela").textContent = info.titulo;
  $("voltar").hidden = !info.pai && !historico.length;
  $("voltar").dataset.destino = info.pai ?? "";
  $(elemento).scrollTop = 0;
  marcarMenuAtivo();
  fecharMenu();
  aoAbrir.get(destino)?.();
  mostrarNovidade(destino);
}

// ---------- Aviso de novidade ----------
let novidadeAberta = null;

function mostrarNovidade(tela) {
  const versao = typeof __VERSAO__ === "undefined" ? "0.0.0" : __VERSAO__; // testes rodam sem o bundle
  const n = novidadeDaTela(tela, estado.config, versao);
  if (!n || $("dialogo-novidade").open) return;
  novidadeAberta = n;
  $("novidade-icone").innerHTML = icone(n.icone, 28);
  $("novidade-titulo").textContent = n.titulo;
  $("novidade-texto").textContent = n.texto;
  $("novidade-itens").replaceChildren(
    ...n.itens.map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    }),
  );
  $("novidade-ocultar").checked = false;
  $("novidade-ok").textContent = `${n.botao} →`;
  $("dialogo-novidade").showModal();
}

async function fecharNovidade() {
  const n = novidadeAberta;
  novidadeAberta = null;
  if ($("dialogo-novidade").open) $("dialogo-novidade").close();
  if (!n) return;
  const alteracao = { novidadesVistas: [...(estado.config.novidadesVistas ?? []), n.id] };
  if ($("novidade-ocultar").checked) alteracao.ocultarNovidades = true;
  await salvarConfig(alteracao);
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

// Grupos recolhíveis: só o grupo da tela atual (ou o que a pessoa abriu) mostra as ferramentas.
const gruposAbertos = new Set();
const ehDestaque = (id) => DESTAQUES.some((d) => d.id === id);

function grupoDoMenu(g) {
  const caixa = document.createElement("div");
  caixa.className = "menu-secao";
  caixa.dataset.grupo = g.id;
  const cabeca = document.createElement("button");
  cabeca.type = "button";
  cabeca.className = "menu-cabeca";
  cabeca.setAttribute("aria-expanded", "false");
  cabeca.append(document.createTextNode(g.titulo));
  cabeca.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
  const filhos = document.createElement("div");
  filhos.className = "menu-filhos";
  // Grupo com tela própria (Gestão financeira): o painel é o primeiro item.
  if (g.tela) filhos.append(itemMenu(g.tela, "Painel", "taxas", "menu-filho"));
  for (const f of g.ferramentas) if (!ehDestaque(f.id)) filhos.append(itemMenu(f.tela, f.curto ?? f.titulo, f.id, "menu-filho"));
  cabeca.addEventListener("click", () => {
    if (gruposAbertos.has(g.id)) gruposAbertos.delete(g.id);
    else gruposAbertos.add(g.id);
    abrirGruposDoMenu();
  });
  caixa.append(cabeca, filhos);
  return caixa;
}

function abrirGruposDoMenu() {
  for (const caixa of document.querySelectorAll("#menu-itens .menu-secao")) {
    const aberto = gruposAbertos.has(caixa.dataset.grupo);
    caixa.classList.toggle("aberta", aberto);
    caixa.querySelector(".menu-cabeca").setAttribute("aria-expanded", String(aberto));
  }
}

// Ao abrir o menu: abre o grupo da tela atual.
function grupoDaTelaAtual() {
  const f = FERRAMENTAS.find((x) => x.tela === telaAtual);
  if (f && !ehDestaque(f.id)) return f.grupo;
  const g = GRUPOS.find((x) => x.tela === telaAtual || `grupo:${x.id}` === telaAtual);
  return g?.id ?? null;
}

function montarMenu() {
  const itens = [itemMenu("inicio", "Início", "inicio")];
  for (const d of DESTAQUES) {
    const f = FERRAMENTAS.find((x) => x.id === d.id && x.disponivel);
    if (f) itens.push(itemMenu(f.tela, f.titulo, f.id));
  }
  for (const g of grupos()) itens.push(grupoDoMenu(g));
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
  gruposAbertos.clear();
  const atual = grupoDaTelaAtual();
  if (atual) gruposAbertos.add(atual);
  abrirGruposDoMenu();
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
  // Primeira abertura registrada: quem já usava (nome já perguntado) vê as novidades desde o início.
  if (!estado.config.primeiraVersao) await salvarConfig({ primeiraVersao: estado.config.nomePerguntado ? "0.0.0" : __VERSAO__ });
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
  $("voltar").addEventListener("click", voltar);
  $("alternar-tema").addEventListener("click", () => {
    aplicarTema(document.documentElement.dataset.theme === "escuro" ? "claro" : "escuro");
  });
  $("verificar-atualizacao").addEventListener("click", verificarAtualizacao);
  $("atualizacao-ok").addEventListener("click", () => $("dialogo-atualizacao").close());
  $("novidade-ok").addEventListener("click", fecharNovidade);
  $("dialogo-novidade").addEventListener("cancel", (ev) => {
    ev.preventDefault();
    fecharNovidade();
  });

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
