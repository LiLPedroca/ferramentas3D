// Tela "Meus modelos": chaveiros e placas salvos, com miniatura, para reabrir ou excluir.
import { abridorDe } from "./modelos-ui.js";
import { confirmar, irPara, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const TIPOS = { chaveiro: "Chaveiro de nome", logo: "Chaveiro de logo", palavras: "Palavras decorativas" };

let lista = [];

const data = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function cartao(p) {
  const card = el("article", "painel pj-card");
  const figura = el("div", "pj-miniatura");
  if (p.miniatura) {
    const img = el("img");
    img.src = p.miniatura;
    img.alt = "";
    figura.append(img);
  }
  const corpo = el("div", "pj-corpo");
  corpo.append(el("strong", "", p.nome), el("span", "cliente-sub", `${TIPOS[p.tipo]} · ${data(p.atualizadoEm)}`));
  const acoes = el("div", "pj-acoes");
  const abrir = el("button", "botao-primario", "Abrir");
  abrir.type = "button";
  abrir.addEventListener("click", () => abrirProjeto(p));
  const excluir = el("button", "botao-texto", "Excluir");
  excluir.type = "button";
  excluir.addEventListener("click", () => excluirProjeto(p));
  acoes.append(abrir, excluir);
  card.append(figura, corpo, acoes);
  return card;
}

function mostrar() {
  const busca = $("pj-busca").value.trim().toLowerCase();
  const itens = lista.filter((p) => !busca || p.nome.toLowerCase().includes(busca));
  $("pj-grade").replaceChildren(...itens.map(cartao));
  const vazio = $("pj-vazio");
  vazio.hidden = itens.length > 0;
  vazio.textContent = lista.length
    ? "Nenhum modelo com esse nome."
    : "Nenhum modelo salvo ainda. Use “Salvar modelo” no Chaveiro de nome, no Chaveiro de logo ou nas Palavras decorativas.";
}

async function carregar() {
  const resposta = await window.dados.projetos.listar();
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  lista = resposta.dados;
  mostrar();
}

function abrirProjeto(p) {
  const abrir = abridorDe(p.tipo);
  if (!abrir) return;
  irPara(p.tipo);
  abrir(p);
}

async function excluirProjeto(p) {
  const ok = await confirmar({ titulo: "Excluir modelo?", texto: `"${p.nome}" sai de Meus modelos. Os arquivos que você já exportou não mudam.`, botao: "Excluir" });
  if (!ok) return;
  const resposta = await window.dados.projetos.excluir(p.id);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else mostrarAviso(`"${p.nome}" excluído.`);
  carregar();
}

export function iniciarProjetos() {
  $("pj-busca").addEventListener("input", mostrar);
  registrarAoAbrir("projetos", carregar);
}
