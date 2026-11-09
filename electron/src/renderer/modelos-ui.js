// Peças de tela comuns aos modelos personalizados (chaveiros e palavras): paleta de cores e
// janela de escolha de fonte.
import { CATEGORIAS_FONTES, familiaCss, FONTES } from "./modelos/fontes.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);

export const PALETA = [
  ["#2563eb", "Azul"],
  ["#dc2626", "Vermelho"],
  ["#facc15", "Amarelo"],
  ["#f472b6", "Rosa"],
  ["#7e22ce", "Roxo"],
  ["#15803d", "Verde"],
  ["#f59e0b", "Laranja"],
  ["#ffffff", "Branco"],
  ["#111111", "Preto"],
  ["#8a8f98", "Cinza"],
  ["#8b4513", "Marrom"],
];

// Bolinhas de cor + "Cor personalizada". aoEscolher(cor, final): final = false enquanto arrasta
// no seletor de cor personalizada.
export function criarPaleta(caixa, aoEscolher) {
  const botoes = PALETA.map(([cor, nome]) => {
    const b = el("button", "ch-cor");
    b.type = "button";
    b.style.background = cor;
    b.dataset.cor = cor;
    b.title = nome;
    b.setAttribute("aria-label", nome);
    b.addEventListener("click", () => aoEscolher(cor, true));
    return b;
  });
  const personalizada = el("label", "ch-cor-personalizada");
  const seletor = el("input");
  seletor.type = "color";
  seletor.addEventListener("input", () => aoEscolher(seletor.value, false));
  seletor.addEventListener("change", () => aoEscolher(seletor.value, true));
  personalizada.append(seletor, el("span", "", "Cor personalizada"));
  caixa.replaceChildren(...botoes, personalizada);
}

export function marcarPaleta(caixa, cor) {
  let achou = false;
  for (const b of caixa.querySelectorAll(".ch-cor")) {
    const igual = b.dataset.cor === cor;
    achou ||= igual;
    b.setAttribute("aria-pressed", String(igual));
  }
  const personalizada = caixa.querySelector(".ch-cor-personalizada");
  personalizada.classList.toggle("ativa", !achou);
  personalizada.querySelector("input").value = cor;
}

// ---------- Escolha de fonte ----------
let escolher = null; // resolve da janela aberta
let atual = null;

function listarFontes() {
  const busca = $("fontes-busca").value.trim().toLowerCase();
  const grupos = [];
  for (const categoria of CATEGORIAS_FONTES) {
    const itens = FONTES.filter((f) => f.categoria === categoria.nome && (!busca || f.nome.toLowerCase().includes(busca)));
    if (!itens.length) continue;
    grupos.push(el("h3", "fontes-categoria", categoria.nome));
    for (const f of itens) {
      const b = el("button", "fontes-item", f.nome);
      b.type = "button";
      b.style.fontFamily = familiaCss(f.id);
      b.setAttribute("aria-pressed", String(f.id === atual));
      b.addEventListener("click", () => fechar(f.id));
      grupos.push(b);
    }
  }
  if (!grupos.length) grupos.push(el("p", "ajuda", "Nenhuma fonte com esse nome."));
  $("fontes-lista").replaceChildren(...grupos);
}

function fechar(id) {
  if ($("dialogo-fontes").open) $("dialogo-fontes").close();
  const r = escolher;
  escolher = null;
  r?.(id);
}

// Abre a janela de fontes; devolve o id escolhido ou null.
export function escolherFonte(fonteAtual) {
  fechar(null);
  atual = fonteAtual;
  $("fontes-busca").value = "";
  listarFontes();
  $("dialogo-fontes").showModal();
  $("fontes-busca").focus();
  return new Promise((r) => {
    escolher = r;
  });
}

// Botão que mostra o nome da fonte escrito nela mesma.
export function mostrarFonte(botao, id) {
  botao.textContent = FONTES.find((f) => f.id === id)?.nome ?? id;
  botao.style.fontFamily = familiaCss(id);
}

// ---------- Com ou sem AMS ----------
let responderImpressao = null;
let calcularTroca = null;

function resumoImpressao() {
  const manual = document.querySelector('input[name="imp-modo"]:checked')?.value === "manual";
  $("imp-camadas").hidden = !manual;
  $("erro-impressao").textContent = "";
  if (!manual) return null;
  const camada = Number($("imp-camada").value);
  const primeira = Number(String($("imp-primeira").value).replace(",", "."));
  if (!(primeira >= 0.05 && primeira <= 0.5)) {
    $("imp-resumo").textContent = "";
    $("erro-impressao").textContent = "Primeira camada: use de 0,05 a 0,5 mm.";
    return undefined;
  }
  const troca = calcularTroca(camada, primeira);
  // várias trocas (caneca com faixas): lista de { z, numero }
  if (Array.isArray(troca)) {
    const numeros = troca.map((t) => t.numero);
    const lista = numeros.length > 1 ? `${numeros.slice(0, -1).join(", ")} e ${numeros[numeros.length - 1]}` : String(numeros[0]);
    $("imp-resumo").textContent = `São ${troca.length} pausas para trocar o filamento, antes das camadas ${lista}. No fatiador, confira na pré-visualização.`;
    return { ams: false, camada, primeira, trocas: troca };
  }
  const mm = troca.z.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  $("imp-resumo").textContent = `A pausa fica antes da camada ${troca.numero} (${mm} mm), a primeira só com a cor de cima. No fatiador, confira na pré-visualização.`;
  return { ams: false, camada, primeira, ...troca };
}

function responder(valor) {
  if ($("dialogo-impressao").open) $("dialogo-impressao").close();
  const r = responderImpressao;
  responderImpressao = null;
  r?.(valor);
}

// Pergunta se a impressão é com AMS. calcular(camada, primeira) → { z, numero } da troca.
// Devolve { ams: true } | { ams: false, z, numero, camada, primeira } | null (cancelado).
export function perguntarImpressao(calcular) {
  responder(null);
  calcularTroca = calcular;
  resumoImpressao();
  $("dialogo-impressao").showModal();
  return new Promise((r) => {
    responderImpressao = r;
  });
}

// ---------- Meus modelos ----------
// Cada ferramenta registra como abrir um modelo salvo do seu tipo (chaveiro, logo, palavras).
const abridores = new Map();
export function registrarAbridor(tipo, abrir) {
  abridores.set(tipo, abrir);
}
export function abridorDe(tipo) {
  return abridores.get(tipo);
}

let pedidoSalvar = null; // { tipo, atual, montar, resolver }

function fecharSalvar(valor) {
  if ($("dialogo-salvar-modelo").open) $("dialogo-salvar-modelo").close();
  const p = pedidoSalvar;
  pedidoSalvar = null;
  p?.resolver(valor);
}

async function confirmarSalvar(comoNovo) {
  const p = pedidoSalvar;
  if (!p) return;
  const nome = $("sm-nome").value.trim();
  if (!nome) {
    $("erro-salvar-modelo").textContent = "Dê um nome ao modelo.";
    return;
  }
  $("sm-salvar").disabled = $("sm-novo").disabled = true;
  try {
    const valores = await p.montar();
    const id = comoNovo ? undefined : p.atual?.id;
    const resposta = await window.dados.projetos.salvar({ tipo: p.tipo, nome, ...valores }, id);
    if (!resposta.ok) {
      $("erro-salvar-modelo").textContent = resposta.erro;
      return;
    }
    fecharSalvar({ id: resposta.dados.id, nome: resposta.dados.nome });
  } catch (erro) {
    $("erro-salvar-modelo").textContent = erro.message;
  } finally {
    $("sm-salvar").disabled = $("sm-novo").disabled = false;
  }
}

// Pede o nome e salva em Meus modelos. atual: { id, nome } quando o modelo veio de lá (salvar
// atualiza o mesmo; "Salvar como novo" cria outro). montar(): { opcoes, miniatura, imagem? }.
// Devolve { id, nome } ou null (cancelado).
export function salvarEmMeusModelos({ tipo, atual, nomePadrao, montar }) {
  fecharSalvar(null);
  $("sm-nome").value = atual?.nome ?? nomePadrao;
  $("sm-novo").hidden = !atual;
  $("sm-salvar").textContent = atual ? "Salvar alterações" : "Salvar";
  $("erro-salvar-modelo").textContent = "";
  $("dialogo-salvar-modelo").showModal();
  $("sm-nome").select();
  return new Promise((resolver) => {
    pedidoSalvar = { tipo, atual, montar, resolver };
  });
}

export function iniciarModelosUi() {
  $("sm-salvar").addEventListener("click", () => confirmarSalvar(false));
  $("sm-novo").addEventListener("click", () => confirmarSalvar(true));
  $("sm-cancelar").addEventListener("click", () => fecharSalvar(null));
  $("dialogo-salvar-modelo").addEventListener("close", () => fecharSalvar(null));
  $("sm-nome").addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmarSalvar(false);
  });
  for (const el of document.querySelectorAll('input[name="imp-modo"], #imp-camada, #imp-primeira')) el.addEventListener("input", resumoImpressao);
  $("imp-cancelar").addEventListener("click", () => responder(null));
  $("dialogo-impressao").addEventListener("close", () => responder(null));
  $("imp-continuar").addEventListener("click", () => {
    const escolha = resumoImpressao();
    if (escolha === undefined) return; // dado inválido: a mensagem já está na janela
    responder(escolha ?? { ams: true });
  });

  $("fontes-busca").addEventListener("input", listarFontes);
  $("fontes-fechar").addEventListener("click", () => fechar(null));
  $("dialogo-fontes").addEventListener("close", () => fechar(null));
}
