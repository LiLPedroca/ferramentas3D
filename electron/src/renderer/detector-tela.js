// Tela "Detector de IA e metadados": para cada imagem mostra os indícios de IA (com onde e o que foi achado),
// todos os metadados que ela carrega, e salva cópias sem metadados (os originais nunca são alterados).
import { detectarIA, RESUMOS } from "../core/detector-ia.js";
import { analisarImagem, limparImagem } from "../core/metadados.js";
import { mostrarAviso } from "./shell.js";
import { el, ligarZonaArquivos, ROTULO_TAMANHO } from "./util-tela.js";
import { arquivoLegivel, jpegDoHeic, nomeJpeg } from "./imagem-arquivo.js";

const $ = (id) => document.getElementById(id);
const LIMITE = 100 * 1024 * 1024;
const MAXIMO_ARQUIVOS = 50;

// [{ nome, tamanho, bytes, url, r (resultado do detector), erro, salvo }]
let arquivos = [];
let ultimaPasta = "";

async function adicionar(lista) {
  const cabem = lista.slice(0, MAXIMO_ARQUIVOS - arquivos.length);
  for (const arquivo of cabem) {
    const registro = { nome: arquivo.name, tamanho: arquivo.size, bytes: null, url: "", r: null, erro: "", salvo: "", arquivo };
    try {
      if (arquivo.size > LIMITE) throw new Error("Arquivo maior que 100 MB.");
      registro.bytes = new Uint8Array(await arquivo.arrayBuffer());
      registro.r = detectarIA(registro.bytes);
      registro.url = URL.createObjectURL(registro.r.formato === "heic" ? await arquivoLegivel(arquivo) : arquivo);
    } catch (erro) {
      registro.erro = erro.message;
    }
    arquivos.unshift(registro);
  }
  if (cabem.length < lista.length) mostrarAviso(`Use no máximo ${MAXIMO_ARQUIVOS} arquivos por vez.`);
  renderizar();
}

function remover(registro) {
  if (registro.url) URL.revokeObjectURL(registro.url);
  arquivos = arquivos.filter((a) => a !== registro);
  renderizar();
}

function listaEvidencias(evidencias) {
  const lista = el("ul", "ia-evidencias");
  for (const e of evidencias) {
    const li = el("li", e.forca);
    li.append(el("strong", "", e.rotulo), el("span", "", e.detalhe));
    if (e.onde) li.append(el("span", "ia-onde", `Encontrado em: ${e.onde}`));
    if (e.trecho) li.append(el("code", "ia-trecho", e.trecho));
    lista.append(li);
  }
  return lista;
}

function chipsMetadados(itens) {
  const chips = el("div", "md-chips");
  if (itens.length === 0) chips.append(el("span", "md-chip limpo", "Nenhum metadado encontrado"));
  for (const item of itens) {
    const chip = el("span", `md-chip ${item.tipo === "gps" ? "alerta" : ""}`, item.rotulo);
    chip.title = item.detalhe;
    chips.append(chip);
  }
  return chips;
}

function cartaoArquivo(a) {
  const cartao = el("div", "ia-cartao");
  const miniatura = el("div", "ia-miniatura");
  const corpo = el("div", "ia-corpo");
  cartao.append(miniatura, corpo);
  if (a.url) {
    const img = el("img");
    img.src = a.url;
    img.alt = "";
    miniatura.append(img);
  }

  const topo = el("div", "md-topo");
  const nome = el("div", "md-nome");
  nome.append(
    el("strong", "ia-nome", a.nome),
    el("span", "cliente-sub", [a.r?.formato?.toUpperCase(), ROTULO_TAMANHO(a.tamanho)].filter(Boolean).join(" · ")),
  );
  const botaoRemover = el("button", "item-remover", "×");
  botaoRemover.type = "button";
  botaoRemover.setAttribute("aria-label", `Tirar ${a.nome} da lista`);
  botaoRemover.addEventListener("click", () => remover(a));
  topo.append(nome, botaoRemover);
  corpo.append(topo);

  if (a.erro) {
    corpo.append(el("p", "erro", a.erro));
    return cartao;
  }

  const resumo = RESUMOS[a.r.nivel];
  const veredito = el("div", `ia-veredito ${a.r.nivel}`);
  veredito.append(el("strong", "", resumo.titulo), el("span", "", resumo.texto));
  corpo.append(veredito);
  if (a.r.evidencias.length) corpo.append(listaEvidencias(a.r.evidencias));

  corpo.append(el("h3", "ia-subtitulo", "Metadados no arquivo"), chipsMetadados(a.r.itens));

  const acoes = el("div", "ia-acoes-cartao");
  if (a.salvo) {
    acoes.append(el("span", "md-chip limpo", `Cópia limpa salva: ${a.salvo}`));
  } else if (a.r.itens.length > 0) {
    const salvar = el("button", "botao-secundario pequeno", "Salvar cópia sem metadados");
    salvar.type = "button";
    salvar.addEventListener("click", () => salvarCopias([a]));
    acoes.append(salvar);
  }
  if (acoes.childElementCount) corpo.append(acoes);
  return cartao;
}

function renderizar() {
  $("ia-resultados").replaceChildren(...arquivos.map(cartaoArquivo));
  const validos = arquivos.filter((a) => !a.erro);
  const comIa = validos.filter((a) => a.r.nivel === "forte").length;
  const comMetadados = validos.filter((a) => a.r.itens.length > 0 && !a.salvo);
  $("ia-acoes").hidden = arquivos.length === 0;
  $("ia-salvar-todas").disabled = comMetadados.length === 0;
  $("ia-salvar-todas").textContent = `Salvar ${comMetadados.length} cópia(s) sem metadados`;
  $("ia-resumo").textContent = arquivos.length
    ? `${validos.length} imagem(ns) · ${comIa} com indícios de IA · ${comMetadados.length} com metadados para tirar.`
    : "";
}

function nomeLimpo(nome) {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? `${nome.slice(0, ponto)}-sem-metadados${nome.slice(ponto)}` : `${nome}-sem-metadados`;
}

async function salvarCopias(lista) {
  if (lista.length === 0) return;
  const manterCor = $("ia-manter-cor").checked;
  const copias = [];
  for (const a of lista) {
    // HEIC: a cópia limpa sai em JPEG (os pixels são regravados, sem nenhum metadado)
    const heic = a.r.formato === "heic";
    const limpo = heic ? await jpegDoHeic(a.arquivo) : limparImagem(a.bytes, { manterCor });
    // confere: na cópia não pode ter sobrado nenhum metadado
    if (analisarImagem(limpo).itens.length > 0 || detectarIA(limpo).nivel !== "nenhum") {
      mostrarAviso(`Não foi possível limpar ${a.nome} por completo. Nada foi salvo.`);
      return;
    }
    copias.push({ nome: nomeLimpo(heic ? nomeJpeg(a.nome) : a.nome), bytes: limpo });
  }
  const resposta = await window.arquivos.salvarCopias(copias);
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  if (!resposta.dados) return; // pasta não escolhida
  ultimaPasta = resposta.dados.pasta;
  lista.forEach((a, i) => (a.salvo = resposta.dados.salvos[i] || copias[i].nome));
  $("ia-resultado-texto").textContent = `${resposta.dados.salvos.length} cópia(s) salva(s) em ${resposta.dados.pasta}. Os arquivos originais não foram alterados.`;
  $("ia-resultado").hidden = false;
  renderizar();
}

export function iniciarDetector() {
  ligarZonaArquivos($("ia-zona"), $("ia-entrada"), adicionar);
  $("ia-salvar-todas").addEventListener("click", () =>
    salvarCopias(arquivos.filter((a) => !a.erro && !a.salvo && a.r.itens.length > 0)),
  );
  $("ia-limpar").addEventListener("click", () => {
    arquivos.forEach((a) => a.url && URL.revokeObjectURL(a.url));
    arquivos = [];
    $("ia-resultado").hidden = true;
    renderizar();
  });
  $("ia-abrir-pasta").addEventListener("click", async () => {
    if (!ultimaPasta) return;
    const resposta = await window.arquivos.abrirPasta(ultimaPasta);
    if (!resposta.ok) mostrarAviso(resposta.erro);
  });
  renderizar();
}
