// Tela de Etiquetas: escolhe produtos ou pedidos e cópias; o PDF é montado no processo principal.
import modeloEtiquetas from "../core/etiquetas.cjs";
import { normalizar } from "../core/inicio.js";
import modeloOrcamento from "../core/orcamento.cjs";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const { TAMANHOS, linkWhatsApp } = modeloEtiquetas;
const { ROTULOS_SITUACAO } = modeloOrcamento;
const $ = (id) => document.getElementById(id);

let tipo = "produtos";
let produtos = [];
let pedidos = [];
const escolhidos = { produtos: new Map(), pedidos: new Map() }; // id → cópias

const reais = (c) => (Number(c) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numeroPedido = (n) => `Pedido nº ${String(n).padStart(4, "0")}`;

function itensDoTipo() {
  return tipo === "produtos" ? produtos : pedidos;
}

function descricao(item) {
  if (tipo === "produtos") return { titulo: item.nome, sub: `${reais(item.precoCentavos)}${item.categoria ? ` · ${item.categoria}` : ""}` };
  return {
    titulo: `${numeroPedido(item.numero)} · ${item.cliente?.nome || "Cliente"}`,
    sub: `${ROTULOS_SITUACAO[item.situacao] ?? ""} · ${new Date(item.criadoEm).toLocaleDateString("pt-BR")}`,
  };
}

function linha(item) {
  const mapa = escolhidos[tipo];
  const marcado = mapa.has(item.id);
  const caixa = el("div", `et-item${marcado ? " marcado" : ""}`);
  const check = el("input");
  check.type = "checkbox";
  check.checked = marcado;
  check.setAttribute("aria-label", descricao(item).titulo);
  const texto = el("label", "et-texto");
  const { titulo, sub } = descricao(item);
  texto.append(el("strong", "", titulo), el("span", "cliente-sub", sub));
  texto.addEventListener("click", () => check.click());
  const copias = el("div", "entrada et-copias");
  const campo = el("input");
  campo.inputMode = "numeric";
  campo.value = String(mapa.get(item.id) ?? 1);
  campo.disabled = !marcado;
  campo.setAttribute("aria-label", "Cópias");
  copias.append(campo, el("em", "", "cópias"));
  check.addEventListener("change", () => {
    if (check.checked) mapa.set(item.id, Math.max(1, Number(campo.value) || 1));
    else mapa.delete(item.id);
    campo.disabled = !check.checked;
    caixa.classList.toggle("marcado", check.checked);
    resumir();
  });
  campo.addEventListener("input", () => {
    const n = Math.round(Number(campo.value));
    if (mapa.has(item.id) && n >= 1) mapa.set(item.id, Math.min(500, n));
    resumir();
  });
  caixa.append(check, texto, copias);
  return caixa;
}

function listar() {
  const palavras = normalizar($("et-busca").value).split(/\s+/).filter(Boolean);
  const itens = itensDoTipo().filter((item) => {
    const { titulo, sub } = descricao(item);
    const t = normalizar(`${titulo} ${sub}`);
    return palavras.every((p) => t.includes(p));
  });
  $("et-lista").replaceChildren(...itens.map(linha));
  const vazio = itensDoTipo().length === 0;
  $("et-vazio").hidden = !vazio && itens.length > 0;
  $("et-vazio").textContent = vazio
    ? tipo === "produtos"
      ? "Nenhum produto cadastrado ainda. Cadastre em Produtos."
      : "Nenhum orçamento ainda. Os pedidos vêm de Orçamentos."
    : "Nada encontrado com essa busca.";
  resumir();
}

function resumir() {
  const mapa = escolhidos[tipo];
  const total = [...mapa.values()].reduce((s, n) => s + n, 0);
  const t = TAMANHOS[$("et-tamanho").value];
  const paginas = t.folha ? Math.ceil(total / (t.colunas * t.linhas)) : total;
  $("et-resumo").textContent = total
    ? `${total} etiqueta(s) · ${paginas} ${t.folha ? "folha(s) A4" : "página(s)"}`
    : "Marque os itens na lista.";
  const semTelefone = $("et-qr").checked && !linkWhatsApp(estado.config.empresa?.telefone);
  $("et-qr-ajuda").hidden = !semTelefone;
  $("et-qr-ajuda").textContent = "Cadastre o telefone da empresa em Configurações para usar o QR code.";
  $("et-gerar").disabled = total === 0 || semTelefone;
  amostra();
}

// prévia simples da primeira etiqueta marcada (ou de um exemplo)
function amostra() {
  const t = TAMANHOS[$("et-tamanho").value];
  const primeiro = itensDoTipo().find((i) => escolhidos[tipo].has(i.id));
  const caixa = $("et-amostra");
  caixa.style.aspectRatio = `${t.largura} / ${t.altura}`;
  caixa.style.width = t.altura > t.largura ? "45%" : "100%";
  const empresa = estado.config.empresa ?? {};
  const texto = el("div", "et-amostra-texto");
  if (tipo === "produtos") {
    const p = primeiro ?? { nome: "Chaveiro personalizado", precoCentavos: "1990", pesoG: 4 };
    if (empresa.nome) texto.append(el("span", "et-a-topo", empresa.nome));
    texto.append(el("strong", "et-a-titulo", p.nome));
    if ($("et-preco").checked) texto.append(el("span", "et-a-destaque", reais(p.precoCentavos)));
  } else {
    const o = primeiro ?? { numero: 1, cliente: { nome: "Nome do cliente", cidade: "Cidade" } };
    texto.append(el("span", "et-a-topo", numeroPedido(o.numero)), el("strong", "et-a-titulo", o.cliente?.nome || "Cliente"));
    if (o.cliente?.cidade) texto.append(el("span", "et-a-linha", o.cliente.cidade));
  }
  const filhos = [texto];
  if ($("et-qr").checked) filhos.push(el("span", "et-a-qr", "QR"));
  caixa.replaceChildren(...filhos);
}

function mudarTipo(novo) {
  tipo = novo;
  for (const b of document.querySelectorAll("[data-et-tipo]")) b.setAttribute("aria-pressed", String(b.dataset.etTipo === tipo));
  $("et-campo-preco").hidden = tipo !== "produtos";
  if (tipo === "pedidos" && $("et-tamanho").value === "a4-70x37") $("et-tamanho").value = "termica-100x150";
  listar();
}

async function carregar() {
  const [rp, ro] = await Promise.all([window.dados.produtos.listar(), window.dados.orcamentos.listar()]);
  produtos = rp.ok ? rp.dados : [];
  pedidos = ro.ok ? ro.dados : [];
  listar();
}

async function gerar() {
  const mapa = escolhidos[tipo];
  const itens = itensDoTipo()
    .filter((i) => mapa.has(i.id))
    .map((i) => ({ id: i.id, copias: mapa.get(i.id) }));
  $("et-erro").textContent = "";
  $("et-gerar").disabled = true;
  try {
    const resposta = await window.dados.etiquetas({
      tipo,
      itens,
      tamanho: $("et-tamanho").value,
      mostrarPreco: $("et-preco").checked,
      qr: $("et-qr").checked,
    });
    if (!resposta.ok) $("et-erro").textContent = resposta.erro;
    else if (resposta.dados) mostrarAviso(`${resposta.dados.quantidade} etiqueta(s) salvas em PDF.`);
  } finally {
    resumir();
  }
}

export function iniciarEtiquetas() {
  $("et-tamanho").replaceChildren(...Object.entries(TAMANHOS).map(([id, t]) => new Option(t.nome, id)));
  for (const b of document.querySelectorAll("[data-et-tipo]")) b.addEventListener("click", () => mudarTipo(b.dataset.etTipo));
  for (const id of ["et-tamanho", "et-preco", "et-qr"]) $(id).addEventListener("change", resumir);
  $("et-busca").addEventListener("input", listar);
  $("et-todos").addEventListener("click", () => {
    const mapa = escolhidos[tipo];
    const todos = itensDoTipo().every((i) => mapa.has(i.id));
    for (const i of itensDoTipo()) {
      if (todos) mapa.delete(i.id);
      else if (!mapa.has(i.id)) mapa.set(i.id, 1);
    }
    listar();
  });
  $("et-gerar").addEventListener("click", gerar);
  registrarAoAbrir("etiquetas", carregar);
}
