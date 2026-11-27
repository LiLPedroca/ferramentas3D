// Peças de tela comuns aos modelos personalizados (chaveiros e palavras): paleta de cores e
// janela de escolha de fonte.
import { CATEGORIAS_FONTES, familiaCss, FONTES, numeroDaFonte } from "./modelos/fontes.js";
import { guardarMaterial, materialAtual } from "./modelos/projeto-fatiador.js";
import { el } from "./util-tela.js";
import { CORES_PRONTAS, corPronta } from "./modelos/cores-prontas.js";

const $ = (id) => document.getElementById(id);

export const PALETA = CORES_PRONTAS.map((c) => [c.hex, c.nome]);

// Bolinhas das cores prontas (sem cor livre). aoEscolher(cor, final): final é sempre true.
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
  caixa.replaceChildren(...botoes);
}

// Marca a cor pronta mais parecida com a cor dada.
export function marcarPaleta(caixa, cor) {
  const pronta = corPronta(cor);
  for (const b of caixa.querySelectorAll(".ch-cor")) b.setAttribute("aria-pressed", String(b.dataset.cor === pronta));
}

// ---------- Escolha de fonte ----------
let escolher = null; // resolve da janela aberta
let atual = null;

function listarFontes() {
  const busca = $("fontes-busca").value.trim().toLowerCase();
  const grupos = [];
  for (const categoria of CATEGORIAS_FONTES) {
    const itens = FONTES.filter((f) => f.categoria === categoria.nome && (!busca || f.nome.toLowerCase().includes(busca) || String(numeroDaFonte(f.id)) === busca.replace(/\D/g, "")));
    if (!itens.length) continue;
    grupos.push(el("h3", "fontes-categoria", categoria.nome));
    for (const f of itens) {
      const b = el("button", "fontes-item");
      b.type = "button";
      const nome = el("span", "fontes-nome", f.nome);
      nome.style.fontFamily = familiaCss(f.id);
      b.append(el("span", "fontes-numero", `Fonte ${numeroDaFonte(f.id)}`), nome);
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
let soMaterial = false; // copos: só o material (as cores são pintadas, sem pausas)

function resumoImpressao() {
  const manual = !soMaterial && document.querySelector('input[name="imp-modo"]:checked')?.value === "manual";
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

const materialEscolhido = () => document.querySelector(".imp-material-opcoes [aria-checked='true']")?.dataset.material ?? "PLA";
function marcarMaterial(material) {
  for (const b of document.querySelectorAll(".imp-material-opcoes button")) b.setAttribute("aria-checked", String(b.dataset.material === material));
}

function responder(valor) {
  if (valor) {
    guardarMaterial(materialEscolhido());
    valor = { ...valor, material: materialEscolhido() };
  }
  if ($("dialogo-impressao").open) $("dialogo-impressao").close();
  const r = responderImpressao;
  responderImpressao = null;
  r?.(valor);
}

// Pergunta se a impressão é com AMS. calcular(camada, primeira) → { z, numero } da troca.
// Devolve { ams: true } | { ams: false, z, numero, camada, primeira } | null (cancelado).
export function perguntarImpressao(calcular) {
  return abrirImpressao(calcular, false);
}

// Só o material (PLA ou PETG). Devolve { material } | null (cancelado).
export function perguntarMaterial() {
  return abrirImpressao(null, true);
}

function abrirImpressao(calcular, apenasMaterial) {
  responder(null);
  calcularTroca = calcular;
  soMaterial = apenasMaterial;
  $("dialogo-impressao").classList.toggle("so-material", apenasMaterial);
  marcarMaterial(materialAtual());
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
  for (const b of document.querySelectorAll(".imp-material-opcoes button")) b.addEventListener("click", () => marcarMaterial(b.dataset.material));
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
