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

export function iniciarModelosUi() {
  $("fontes-busca").addEventListener("input", listarFontes);
  $("fontes-fechar").addEventListener("click", () => fechar(null));
  $("dialogo-fontes").addEventListener("close", () => fechar(null));
}
