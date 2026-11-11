// Tela do Estoque de filamentos: rolos com cor, preço por kg e quanto resta; "Usar" desconta gramas.
import modeloFilamento from "../core/filamento.cjs";
import { normalizar } from "../core/inicio.js";
import { icone } from "./icones.js";
import { confirmar, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const { MATERIAIS, acabando, valorRestanteCentavos } = modeloFilamento;
const $ = (id) => document.getElementById(id);

let rolos = [];
let editandoId = null;
let usandoId = null;

export const reaisDeCentavos = (c) => (Number(c) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const gramas = (g) => `${g.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`;
const kg = (g) => `${(g / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
export const nomeDoRolo = (f) => `${f.material} ${f.cor}${f.marca ? ` · ${f.marca}` : ""}`;

export function listaDeRolos() {
  return rolos;
}

export async function carregarFilamentos() {
  const resposta = await window.dados.filamentos.listar();
  // A tela do estoque saiu da interface na v0.45.0: só atualiza a tela se ela existir.
  const erro = $("fl-erro");
  if (!resposta.ok) {
    if (erro) erro.textContent = resposta.erro;
    return rolos;
  }
  if (erro) erro.textContent = "";
  rolos = resposta.dados;
  if ($("tela-filamentos")) renderizar();
  return rolos;
}

function cartao(f) {
  const card = el("article", `painel fl-card${acabando(f) ? " acabando" : ""}`);
  const topo = el("div", "fl-topo");
  const amostra = el("span", "fl-amostra");
  amostra.style.background = f.corHex;
  const titulo = el("div", "fl-titulo");
  titulo.append(el("strong", "", `${f.material} ${f.cor}`), el("span", "cliente-sub", f.marca || "Sem marca"));
  topo.append(amostra, titulo);

  const fracao = f.pesoTotalG ? f.restanteG / f.pesoTotalG : 0;
  const trilho = el("div", "fl-trilho");
  const barra = el("div", "fl-barra");
  barra.style.width = `${Math.round(fracao * 100)}%`;
  barra.style.background = f.corHex;
  trilho.append(barra);
  const numeros = el("div", "fl-numeros");
  numeros.append(
    el("span", "", `${gramas(f.restanteG)} de ${gramas(f.pesoTotalG)} (${Math.round(fracao * 100)}%)`),
    el("span", "cliente-sub", `${reaisDeCentavos(f.precoKgCentavos)}/kg`),
  );
  if (acabando(f)) numeros.append(el("span", "fl-aviso", "Acabando"));

  const acoes = el("div", "pj-acoes");
  const usar = el("button", "botao-secundario", "Usar");
  usar.type = "button";
  usar.addEventListener("click", () => abrirUsar(f));
  const editar = el("button", "botao-texto", "Editar");
  editar.type = "button";
  editar.addEventListener("click", () => abrirEditor(f));
  acoes.append(usar, editar);

  card.append(topo, trilho, numeros, acoes);
  return card;
}

function renderizar() {
  const palavras = normalizar($("fl-busca").value).split(/\s+/).filter(Boolean);
  const filtrados = rolos.filter((f) => {
    const texto = normalizar(`${f.material} ${f.cor} ${f.marca} ${f.observacoes}`);
    return palavras.every((p) => texto.includes(p));
  });
  $("fl-grade").replaceChildren(...filtrados.map(cartao));
  $("fl-grade").hidden = filtrados.length === 0;
  $("fl-vazio").hidden = rolos.length > 0;
  $("fl-sem-resultado").hidden = rolos.length === 0 || filtrados.length > 0;
  const total = rolos.reduce((s, f) => s + f.restanteG, 0);
  const valor = rolos.reduce((s, f) => s + valorRestanteCentavos(f), 0n);
  $("fl-resumo").textContent = rolos.length
    ? `${rolos.length} rolo(s) · ${kg(total)} em estoque · ${reaisDeCentavos(valor)} em filamento`
    : "";
  const poucos = rolos.filter(acabando);
  $("fl-alerta").hidden = poucos.length === 0;
  $("fl-alerta").textContent = poucos.length
    ? `Acabando: ${poucos.map((f) => `${f.material} ${f.cor} (${gramas(f.restanteG)})`).join(", ")}.`
    : "";
}

// ---------- Cadastro ----------
function abrirEditor(f) {
  editandoId = f?.id ?? null;
  $("titulo-dialogo-filamento").textContent = f ? "Editar rolo" : "Novo rolo";
  $("fl-material").value = f?.material ?? "PLA";
  $("fl-marca").value = f?.marca ?? "";
  $("fl-cor").value = f?.cor ?? "";
  $("fl-cor-hex").value = f?.corHex ?? "#ffffff";
  $("fl-peso").value = String(f?.pesoTotalG ?? 1000).replace(".", ",");
  $("fl-restante").value = f ? String(f.restanteG).replace(".", ",") : "";
  $("fl-preco").value = f ? (Number(f.precoKgCentavos) / 100).toFixed(2).replace(".", ",") : "";
  $("fl-obs").value = f?.observacoes ?? "";
  $("fl-erro-dialogo").textContent = "";
  $("fl-excluir").hidden = !f;
  $("dialogo-filamento").showModal();
  $(f ? "fl-restante" : "fl-cor").focus();
}

async function salvar() {
  const botao = $("fl-salvar");
  botao.disabled = true;
  try {
    const resposta = await window.dados.filamentos.salvar(
      {
        material: $("fl-material").value,
        marca: $("fl-marca").value,
        cor: $("fl-cor").value,
        corHex: $("fl-cor-hex").value,
        pesoTotal: $("fl-peso").value,
        restante: $("fl-restante").value,
        precoKg: $("fl-preco").value,
        observacoes: $("fl-obs").value,
      },
      editandoId,
    );
    if (!resposta.ok) {
      $("fl-erro-dialogo").textContent = resposta.erro;
      return;
    }
    $("dialogo-filamento").close();
    mostrarAviso(editandoId ? "Rolo atualizado." : "Rolo cadastrado.");
    await carregarFilamentos();
  } finally {
    botao.disabled = false;
  }
}

async function excluir() {
  const f = rolos.find((r) => r.id === editandoId);
  if (!f) return;
  $("dialogo-filamento").close();
  const ok = await confirmar({ titulo: "Excluir rolo?", texto: `${nomeDoRolo(f)} sai do estoque.`, botao: "Excluir" });
  if (!ok) return;
  const resposta = await window.dados.filamentos.excluir(f.id);
  mostrarAviso(resposta.ok ? "Rolo excluído." : resposta.erro);
  await carregarFilamentos();
}

// ---------- Usar (descontar) ----------
function abrirUsar(f) {
  usandoId = f.id;
  $("fu-rolo").textContent = `${nomeDoRolo(f)} · restam ${gramas(f.restanteG)}`;
  $("fu-gramas").value = "";
  $("fu-erro").textContent = "";
  $("dialogo-usar-filamento").showModal();
  $("fu-gramas").focus();
}

// Desconta gramas de um rolo (usado também pela calculadora). Devolve o rolo atualizado ou null.
export async function descontarDoRolo(id, g) {
  const resposta = await window.dados.filamentos.descontar(id, g);
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return null;
  }
  await carregarFilamentos();
  const f = resposta.dados;
  mostrarAviso(`${nomeDoRolo(f)}: restam ${gramas(f.restanteG)}.${acabando(f) ? " Está acabando!" : ""}`);
  return f;
}

async function confirmarUsar() {
  const g = Number(String($("fu-gramas").value).replace(",", "."));
  if (!Number.isFinite(g) || g === 0) {
    $("fu-erro").textContent = "Informe quantos gramas foram usados.";
    return;
  }
  $("dialogo-usar-filamento").close();
  await descontarDoRolo(usandoId, g);
}

export function iniciarFilamentos() {
  $("fl-material").replaceChildren(...MATERIAIS.map((m) => new Option(m, m)));
  $("fl-vazio-icone").innerHTML = icone("filamentos", 40);
  $("fl-busca").addEventListener("input", renderizar);
  for (const id of ["fl-novo", "fl-vazio-novo"]) $(id).addEventListener("click", () => abrirEditor(null));
  $("fl-salvar").addEventListener("click", salvar);
  $("fl-cancelar").addEventListener("click", () => $("dialogo-filamento").close());
  $("fl-excluir").addEventListener("click", excluir);
  $("fu-descontar").addEventListener("click", confirmarUsar);
  $("fu-cancelar").addEventListener("click", () => $("dialogo-usar-filamento").close());
  $("fu-gramas").addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmarUsar();
  });
  registrarAoAbrir("filamentos", carregarFilamentos);
}
