// Janela "Nome no copo": o nome do cliente sobre uma base decorativa (sem argola). Escolhe texto, fonte,
// base (numeradas), largura e as duas cores; a prévia 2D mostra a peça como sai na mesa.
import modeloImpressao from "../core/impressao.cjs";
import { escolherFonte } from "./modelos-ui.js";
import { carregarFonte, familiaCss, FONTES, numeroDaFonte } from "./modelos/fontes.js";
import { motorDaTela } from "./modelos/manifold.js";
import { BASES_NOME, gerarNomeCopo, LIMITES_NOME_COPO, numeroDaBase, PADRAO_NOME_COPO, validarOpcoesNomeCopo } from "./modelos/nome-copo.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const CORES = modeloImpressao.CORES.filter((c) => c.hex);

// Desenhos pequenos de cada base (só para escolher; a peça de verdade aparece na prévia).
const ICONES_BASE = {
  contorno: '<path d="M8 20c-3 0-4-3-2-6l3-6c1-2 4-2 5 0l2 3 2-4c1-2 4-2 5 0l3 5 2-3c1-2 4-2 5 0l3 6 2-4c1-2 4-2 5 0l4 8c1 3 0 6-3 6z"/>',
  capsula: '<rect x="5" y="6" width="50" height="16" rx="8"/>',
  moldura: '<rect x="5" y="4" width="50" height="20" rx="3"/><rect x="8" y="7" width="44" height="14" rx="2" class="d"/>',
  faixa: '<path d="M3 6h54l-6 8 6 8H3l6-8z"/>',
  medalhao: '<ellipse cx="30" cy="14" rx="26" ry="11"/><ellipse cx="30" cy="14" rx="22" ry="8" class="d"/>',
  etiqueta: '<path d="M10 5h40a5 5 0 0 0 5 5v8a5 5 0 0 0-5 5H10a5 5 0 0 0-5-5v-8a5 5 0 0 0 5-5z"/>',
  nuvem: '<path d="M12 22a6 6 0 0 1-2-11 5 5 0 0 1 8-4 5 5 0 0 1 8-1 5 5 0 0 1 8 0 5 5 0 0 1 8 1 5 5 0 0 1 8 4 6 6 0 0 1-2 11 5 5 0 0 1-8 2 5 5 0 0 1-8 1 5 5 0 0 1-8 0 5 5 0 0 1-8-1 5 5 0 0 1-6-2z"/>',
  coracoes: '<rect x="14" y="8" width="32" height="12" rx="6"/><path d="M9 21C2 15 3 9 7 9c2 0 2 1 2 2 0-1 0-2 2-2 4 0 5 6-2 12zM51 21c-7-6-6-12-2-12 2 0 2 1 2 2 0-1 0-2 2-2 4 0 5 6-2 12z"/>',
  bico: '<path d="M12 6h36l8 8-8 8H12l-8-8z"/>',
  ondas: '<path d="M6 7q4-3 8 0t8 0 8 0 8 0 8 0 8 0q3 4 0 7 3 4 0 7-4 3-8 0t-8 0-8 0-8 0-8 0-8 0q-3-3 0-7-3-3 0-7z"/>',
  sombra: '<rect x="8" y="9" width="48" height="15" rx="7" class="s"/><rect x="5" y="5" width="48" height="15" rx="7"/>',
};

let pedido = null; // { resolver }
let opcoes = { ...PADRAO_NOME_COPO };
let resultado = null; // última peça gerada
let ticket = 0;
let temporizador = null;

const mm = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function botaoCor(c, aoEscolher) {
  const b = el("button", "im-cor");
  b.type = "button";
  b.title = c.nome;
  b.setAttribute("aria-label", c.nome);
  b.dataset.cor = c.hex;
  b.style.setProperty("--cor", c.hex);
  b.addEventListener("click", () => aoEscolher(c.hex));
  return b;
}

function marcar() {
  for (const b of $("nc-bases").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.base === opcoes.estilo));
  for (const [caixa, cor] of [["nc-cor-base", opcoes.corBase], ["nc-cor-texto", opcoes.corTexto]]) {
    for (const b of $(caixa).querySelectorAll("[data-cor]")) b.setAttribute("aria-pressed", String(b.dataset.cor === cor));
  }
  const fonte = FONTES.find((f) => f.id === opcoes.fonte);
  $("nc-fonte-numero").textContent = `Fonte ${numeroDaFonte(opcoes.fonte)}`;
  $("nc-fonte-nome").textContent = fonte?.nome ?? opcoes.fonte;
  $("nc-fonte-nome").style.fontFamily = familiaCss(opcoes.fonte);
}

function estado(texto, erro = false) {
  $("nc-estado").textContent = texto;
  $("nc-estado").classList.toggle("erro", erro);
}

// Prévia 2D: as camadas (base embaixo, sombra e letras por cima) num SVG.
const caixaDaVista = ({ min, max }, folga = 3) => `${min[0] - folga} ${-max[1] - folga} ${max[0] - min[0] + 2 * folga} ${max[1] - min[1] + 2 * folga}`;
const caminhoDosLacos = (lacos) => lacos.map((l) => `M${l.map((q) => `${q[0].toFixed(2)},${(-q[1]).toFixed(2)}`).join("L")}Z`).join("");
const contornoDa = (cor) => (cor.toLowerCase() === "#f4f4f4" ? "#bdbdbd" : "none");

function desenhar(r) {
  const svg = $("nc-svg");
  svg.setAttribute("viewBox", caixaDaVista(r.caixa));
  svg.replaceChildren(
    ...r.camadas.map((c) => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("fill", c.cor);
      p.setAttribute("stroke", contornoDa(c.cor));
      p.setAttribute("stroke-width", "0.15");
      p.setAttribute("d", caminhoDosLacos(c.lacos));
      return p;
    }),
  );
}

// Miniatura (SVG em data URL) para o cartão do painel.
export function miniaturaDoNome(r) {
  const caminhos = r.camadas.map((c) => `<path fill="${c.cor}" stroke="${contornoDa(c.cor)}" stroke-width="0.15" d="${caminhoDosLacos(c.lacos)}"/>`).join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${caixaDaVista(r.caixa)}">${caminhos}</svg>`)}`;
}

async function gerarAgora() {
  clearTimeout(temporizador);
  const meu = ++ticket;
  $("nc-usar").disabled = true;
  try {
    const o = validarOpcoesNomeCopo(opcoes);
    estado("Gerando…");
    const [M, fonte] = await Promise.all([motorDaTela(), carregarFonte(o.fonte)]);
    if (meu !== ticket) return null;
    const r = gerarNomeCopo(M, fonte, o);
    resultado = r;
    desenhar(r);
    $("nc-medidas").textContent = `${mm(r.dimensoes[0])} × ${mm(r.dimensoes[1])} mm`;
    estado(r.avisos.join(" "));
    $("nc-usar").disabled = false;
    return r;
  } catch (erro) {
    if (meu !== ticket) return null;
    resultado = null;
    $("nc-medidas").textContent = "";
    estado(erro.message, true);
    return null;
  }
}

function mudar(novo, imediato = true) {
  opcoes = { ...opcoes, ...novo };
  marcar();
  clearTimeout(temporizador);
  $("nc-usar").disabled = true;
  if (imediato) gerarAgora();
  else temporizador = setTimeout(gerarAgora, 350);
}

const paraGuardar = (r) => ({
  opcoes: { ...r.opcoes },
  malhas: r.malhas.map((m) => ({ nome: m.nome, cor: m.cor, vertices: Array.from(m.vertices), triangulos: Array.from(m.triangulos) })),
  dimensoes: [...r.dimensoes],
});

function terminar(valor) {
  clearTimeout(temporizador);
  ticket++;
  if ($("dialogo-nome-copo").open) $("dialogo-nome-copo").close();
  const p = pedido;
  pedido = null;
  p?.resolver(valor);
}

// Abre a janela. salvo: opções do nome que já está no copo. Devolve { opcoes, malhas, miniatura } ou null.
export function abrirNomeNoCopo(salvo = null) {
  terminar(null);
  opcoes = { ...PADRAO_NOME_COPO, ...(salvo ?? {}), texto: salvo?.texto ?? "" };
  $("nc-texto").value = salvo?.texto ?? "";
  $("nc-largura").value = mm(opcoes.largura);
  resultado = null;
  $("nc-svg").replaceChildren();
  $("nc-medidas").textContent = "";
  marcar();
  $("dialogo-nome-copo").showModal();
  $("nc-texto").focus();
  if (salvo?.texto) gerarAgora();
  else {
    $("nc-usar").disabled = true;
    estado("Digite o nome do cliente.");
  }
  return new Promise((resolver) => {
    pedido = { resolver };
  });
}

// Refaz a peça sem mostrar a janela (ao reabrir um copo de Meus modelos).
export async function refazerNome(salvo) {
  const o = validarOpcoesNomeCopo(salvo);
  const [M, fonte] = await Promise.all([motorDaTela(), carregarFonte(o.fonte)]);
  const r = gerarNomeCopo(M, fonte, o);
  return { ...paraGuardar(r), miniatura: miniaturaDoNome(r) };
}

export const resumoDoNome = (o) => `Fonte ${numeroDaFonte(o.fonte)} · Base ${numeroDaBase(o.estilo)}`;

export function iniciarNomeCopo() {
  $("nc-bases").replaceChildren(
    ...BASES_NOME.map((b, i) => {
      const botao = el("button", "nc-base");
      botao.type = "button";
      botao.dataset.base = b.id;
      botao.title = b.nome;
      botao.setAttribute("role", "radio");
      botao.setAttribute("aria-label", `Base ${i + 1}: ${b.nome}`);
      botao.innerHTML = `<svg viewBox="0 0 60 28" aria-hidden="true">${ICONES_BASE[b.id]}</svg>`;
      botao.append(el("span", "", `Base ${i + 1}`));
      botao.addEventListener("click", () => mudar({ estilo: b.id }));
      return botao;
    }),
  );
  $("nc-cor-base").replaceChildren(...CORES.map((c) => botaoCor(c, (hex) => mudar({ corBase: hex }))));
  $("nc-cor-texto").replaceChildren(...CORES.map((c) => botaoCor(c, (hex) => mudar({ corTexto: hex }))));
  $("nc-texto").addEventListener("input", () => mudar({ texto: $("nc-texto").value }, false));
  $("nc-largura").addEventListener("input", () => {
    const n = Number(String($("nc-largura").value).replace(",", "."));
    const [min, max] = LIMITES_NOME_COPO.largura;
    if (!(n >= min && n <= max)) {
      ticket++;
      $("nc-usar").disabled = true;
      estado(`Largura: use de ${min} a ${max} mm.`, true);
      return;
    }
    mudar({ largura: n }, false);
  });
  $("nc-fonte").addEventListener("click", async () => {
    const id = await escolherFonte(opcoes.fonte);
    if (id && id !== opcoes.fonte) mudar({ fonte: id });
  });
  $("nc-usar").addEventListener("click", async () => {
    const r = resultado ?? (await gerarAgora());
    if (!r || !pedido) return;
    terminar({ ...paraGuardar(r), miniatura: miniaturaDoNome(r) });
  });
  $("nc-cancelar").addEventListener("click", () => terminar(null));
  $("nc-fechar").addEventListener("click", () => terminar(null));
  $("dialogo-nome-copo").addEventListener("cancel", (ev) => {
    ev.preventDefault();
    terminar(null);
  });
  $("nc-texto").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !$("nc-usar").disabled) $("nc-usar").click();
  });
}
