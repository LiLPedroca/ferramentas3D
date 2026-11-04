// Tela do Removedor de metadados: mostra o que cada foto carrega e salva cópias limpas.
import { analisarImagem, detectarFormato, limparImagem } from "../core/metadados.js";
import { mostrarAviso } from "./shell.js";
import { el, ligarZonaArquivos, ROTULO_TAMANHO } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const LIMITE = 100 * 1024 * 1024;
const MAXIMO_ARQUIVOS = 50;

let arquivos = []; // [{ nome, tamanho, bytes, formato, itens, erro }]
let ultimaPasta = "";

async function adicionar(lista) {
  for (const arquivo of lista.slice(0, MAXIMO_ARQUIVOS - arquivos.length)) {
    const registro = { nome: arquivo.name, tamanho: arquivo.size, bytes: null, formato: null, itens: [], erro: "" };
    try {
      if (arquivo.size > LIMITE) throw new Error("Arquivo maior que 100 MB.");
      registro.bytes = new Uint8Array(await arquivo.arrayBuffer());
      registro.formato = detectarFormato(registro.bytes);
      if (!registro.formato) throw new Error("Formato não suportado. Use JPEG, PNG ou WebP.");
      registro.itens = analisarImagem(registro.bytes).itens;
    } catch (erro) {
      registro.erro = erro.message;
    }
    arquivos.push(registro);
  }
  if (lista.length + arquivos.length > MAXIMO_ARQUIVOS) mostrarAviso(`Use no máximo ${MAXIMO_ARQUIVOS} arquivos por vez.`);
  renderizar();
}

function cartaoArquivo(a, indice) {
  const cartao = el("div", "md-arquivo");
  const topo = el("div", "md-topo");
  const nome = el("div", "md-nome");
  nome.append(
    el("strong", "", a.nome),
    el("span", "cliente-sub", [a.formato?.toUpperCase(), ROTULO_TAMANHO(a.tamanho)].filter(Boolean).join(" · ")),
  );
  const remover = el("button", "item-remover", "×");
  remover.type = "button";
  remover.setAttribute("aria-label", `Tirar ${a.nome} da lista`);
  remover.addEventListener("click", () => {
    arquivos.splice(indice, 1);
    renderizar();
  });
  topo.append(nome, remover);
  cartao.append(topo);

  const chips = el("div", "md-chips");
  if (a.erro) chips.append(el("span", "md-chip erro-chip", a.erro));
  else if (a.itens.length === 0) chips.append(el("span", "md-chip limpo", "Nenhum metadado encontrado"));
  else {
    for (const item of a.itens) {
      const chip = el("span", `md-chip ${item.tipo === "gps" ? "alerta" : ""}`, item.rotulo);
      chip.title = item.detalhe;
      chips.append(chip);
    }
  }
  cartao.append(chips);
  return cartao;
}

function renderizar() {
  $("md-lista").replaceChildren(...arquivos.map(cartaoArquivo));
  const validos = arquivos.filter((a) => !a.erro);
  const comMetadados = validos.filter((a) => a.itens.length > 0);
  $("md-acoes").hidden = arquivos.length === 0;
  $("md-salvar").disabled = validos.length === 0;
  $("md-salvar").textContent = `Salvar ${validos.length} cópia(s) sem metadados`;
  $("md-resumo").textContent = arquivos.length
    ? `${comMetadados.length} de ${validos.length} imagem(ns) com metadados.`
    : "";
  $("md-resultado").hidden = true;
}

function nomeLimpo(nome) {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? `${nome.slice(0, ponto)}-sem-metadados${nome.slice(ponto)}` : `${nome}-sem-metadados`;
}

async function salvar() {
  const manterCor = $("md-manter-cor").checked;
  const copias = [];
  for (const a of arquivos.filter((x) => !x.erro)) {
    const limpo = limparImagem(a.bytes, { manterCor });
    // confere: a cópia não pode ter sobrado nenhum metadado
    if (analisarImagem(limpo).itens.length > 0) {
      mostrarAviso(`Não foi possível limpar ${a.nome} por completo. Nada foi salvo.`);
      return;
    }
    copias.push({ nome: nomeLimpo(a.nome), bytes: limpo });
  }
  const resposta = await window.arquivos.salvarCopias(copias);
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  if (!resposta.dados) return;
  ultimaPasta = resposta.dados.pasta;
  $("md-resultado-texto").textContent = `${resposta.dados.salvos.length} cópia(s) salva(s) em ${resposta.dados.pasta}. Os arquivos originais não foram alterados.`;
  $("md-resultado").hidden = false;
}

export function iniciarMetadados() {
  ligarZonaArquivos($("md-zona"), $("md-entrada"), adicionar);
  $("md-salvar").addEventListener("click", salvar);
  $("md-limpar").addEventListener("click", () => {
    arquivos = [];
    renderizar();
  });
  $("md-abrir-pasta").addEventListener("click", async () => {
    if (!ultimaPasta) return;
    const resposta = await window.arquivos.abrirPasta(ultimaPasta);
    if (!resposta.ok) mostrarAviso(resposta.erro);
  });
  renderizar();
}
