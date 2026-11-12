// Meu fatiador: fatiadores cadastrados neste computador, um ativo, e abrir modelos nele.
import { aoMudarConfig, estado, mostrarAviso, salvarConfig } from "./shell.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);

const OUTRO = "__outro";
let aoEscolher = null; // pedido de abrir um modelo que esperava um fatiador ativo
const icones = new Map(); // caminho -> data URL (ou null)

const mesmo = (a, b) => a?.caminho?.toLowerCase() === b?.caminho?.toLowerCase();
const cadastrados = () => estado.config.fatiadores ?? [];
const ativo = () => (estado.config.fatiador?.caminho ? estado.config.fatiador : null);

function erro(texto) {
  $("erro-fatiador").textContent = texto ?? "";
}

async function urlDoIcone(f) {
  if (!icones.has(f.caminho)) {
    const r = await window.fatiador.icone(f.caminho);
    icones.set(f.caminho, r.ok ? r.dados : null);
  }
  return icones.get(f.caminho);
}

// Botão "Meu fatiador" do topo: mostra o ícone do fatiador ativo (sem fatiador, fica o cubo).
let cuboDoTopo = null;
async function atualizarBotaoTopo() {
  const botao = $("meu-fatiador");
  cuboDoTopo ??= botao.querySelector("svg");
  const a = ativo();
  const url = a ? await urlDoIcone(a) : null;
  if (ativo()?.caminho !== a?.caminho) return; // mudou enquanto buscava o ícone
  const atualIcone = botao.querySelector(".fatiador-topo-icone, svg");
  if (url) {
    const img = el("img", "fatiador-topo-icone");
    img.src = url;
    img.alt = "";
    atualIcone.replaceWith(img);
  } else if (atualIcone !== cuboDoTopo) {
    atualIcone.replaceWith(cuboDoTopo);
  }
  botao.title = a ? `Meu fatiador: ${a.nome}` : "Abrir meu fatiador";
}

async function iconeDe(f, alvo) {
  const url = await urlDoIcone(f);
  if (!url || !alvo.isConnected) return;
  const img = el("img");
  img.src = url;
  img.alt = "";
  alvo.replaceWith(img);
}

function opcaoFatiador(f) {
  const rotulo = el("label", "fatiador-opcao");
  const radio = el("input");
  radio.type = "radio";
  radio.name = "fatiador";
  radio.checked = mesmo(f, ativo());
  radio.addEventListener("change", () => tornarAtivo(f));
  const icone = el("span", "fatiador-icone");
  const texto = el("span", "fatiador-texto");
  texto.append(el("strong", "", f.nome), el("span", "cliente-sub", "Cadastrado neste computador"));
  rotulo.title = f.caminho;
  rotulo.append(radio, icone, texto);
  iconeDe(f, icone);
  return rotulo;
}

function mostrar() {
  const lista = cadastrados();
  $("fatiador-lista").replaceChildren(
    ...(lista.length ? lista.map(opcaoFatiador) : [el("p", "ajuda", "Nenhum fatiador cadastrado. Localize abaixo.")]),
  );
  $("fatiador-dica").hidden = lista.length < 2;
  const a = ativo();
  $("fatiador-abrir").hidden = !a;
  $("fatiador-abrir").textContent = a ? `Abrir ${a.nome}` : "";
}

// Grava a lista e o ativo; a tela só muda depois de gravar com sucesso.
async function gravar(fatiadores, fatiador, aviso) {
  const r = await salvarConfig({ fatiadores, fatiador });
  if (!r.ok) {
    erro(r.erro);
    mostrar();
    return false;
  }
  erro("");
  mostrar();
  if (aviso) mostrarAviso(aviso);
  return true;
}

// Havia um modelo esperando um fatiador: abre nele agora.
function continuarPedido() {
  const depois = aoEscolher;
  aoEscolher = null;
  if (!depois) return;
  $("dialogo-fatiador").close();
  depois();
}

async function tornarAtivo(f) {
  if (await gravar(cadastrados(), f, `Fatiador ativo: ${f.nome}.`)) continuarPedido();
}

async function localizarAutomaticamente() {
  $("fatiador-localizar").disabled = true;
  try {
    const r = await window.fatiador.detectar();
    if (!r.ok) return erro(r.erro);
    const novos = r.dados.filter((f) => !cadastrados().some((c) => mesmo(c, f)));
    if (!novos.length) {
      mostrarAviso(r.dados.length ? "Nenhum fatiador novo encontrado." : "Nenhum fatiador encontrado nas pastas padrão. Localize manualmente.");
      return;
    }
    const aviso = novos.length === 1 ? `${novos[0].nome} cadastrado.` : `${novos.length} fatiadores cadastrados.`;
    const tinhaAtivo = Boolean(ativo());
    if ((await gravar([...cadastrados(), ...novos], ativo() ?? novos[0], aviso)) && !tinhaAtivo) continuarPedido();
  } finally {
    $("fatiador-localizar").disabled = false;
  }
}

async function localizarManualmente() {
  const r = await window.fatiador.procurar();
  if (!r.ok) return erro(r.erro);
  if (!r.dados) return;
  const nome = $("fatiador-nome").value === OUTRO || !$("fatiador-nome").value ? r.dados.nome : $("fatiador-nome").value;
  const f = { nome, caminho: r.dados.caminho };
  const lista = cadastrados().filter((c) => !mesmo(c, f));
  if (await gravar([...lista, f], f, `${f.nome} cadastrado e ativo.`)) continuarPedido();
}

async function preencherNomes() {
  if ($("fatiador-nome").options.length) return;
  const r = await window.fatiador.nomes();
  const nomes = r.ok ? r.dados : [];
  $("fatiador-nome").replaceChildren(...nomes.map((n) => new Option(n, n)), new Option("Outro", OUTRO));
}

// Abre a janela. depois: chamado quando houver um fatiador ativo (pedido de abrir um modelo).
export async function abrirSeletorFatiador(depois) {
  aoEscolher = depois ?? null;
  erro("");
  mostrar();
  if (!$("dialogo-fatiador").open) $("dialogo-fatiador").showModal();
  await preencherNomes();
}

// Abre o fatiador ativo (com um modelo, se houver). Sem fatiador, pede para escolher e tenta de novo.
export async function abrirNoFatiador(bytes, nome, extensao) {
  const resposta = await window.fatiador.abrir(bytes, nome, extensao);
  if (resposta.ok) {
    mostrarAviso(`Abrindo ${resposta.dados}…`);
    return;
  }
  if (resposta.erro === "SEM_FATIADOR") {
    abrirSeletorFatiador(() => abrirNoFatiador(bytes, nome, extensao));
    return;
  }
  mostrarAviso(resposta.erro);
}

export function iniciarFatiador() {
  aoMudarConfig(() => atualizarBotaoTopo());
  $("meu-fatiador").addEventListener("click", () => abrirSeletorFatiador());
  $("fatiador-abrir").addEventListener("click", async () => {
    const r = await window.fatiador.abrir();
    if (!r.ok) return erro(r.erro === "SEM_FATIADOR" ? "Escolha um fatiador." : r.erro);
    $("dialogo-fatiador").close();
    mostrarAviso(`Abrindo ${r.dados}…`);
  });
  $("fatiador-localizar").addEventListener("click", localizarAutomaticamente);
  $("fatiador-procurar").addEventListener("click", localizarManualmente);
  $("fatiador-fechar").addEventListener("click", () => $("dialogo-fatiador").close());
  $("dialogo-fatiador").addEventListener("close", () => {
    aoEscolher = null;
  });
}
