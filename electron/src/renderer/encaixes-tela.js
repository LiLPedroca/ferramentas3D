// Tela de Encaixes e tolerâncias: calculadora de folga e peça de teste para calibrar.
import { abrirNoFatiador } from "./fatiador-ui.js";
import { calcularEncaixe, ENCAIXES, gerarPecaTeste, MATERIAIS_ENCAIXE } from "./modelos/encaixes.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { carregarFonte } from "./modelos/fontes.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { motorDaTela } from "./modelos/manifold.js";
import { criarPrevia2d } from "./modelos/previa2d.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { estado, irPara, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const numero = (id) => Number(String($(id).value).replace(",", "."));
const mm = (n) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`;

let modelo = null;
let partes = null;
let modo = "2d";
let previa2d = null;
let previa3d = null;
let temporizador = null;
let geracao = 0;

const status = (texto, erro = false) => {
  $("en-status").textContent = texto;
  $("en-status").classList.toggle("erro", erro);
};

function calcular() {
  const caixa = $("en-resultado");
  try {
    const calibrada = $("en-calibrada").value.trim() === "" ? null : numero("en-calibrada");
    const r = calcularEncaixe({
      medida: numero("en-medida"),
      encaixe: $("en-encaixe").value,
      material: $("en-material").value,
      bico: numero("en-bico"),
      calibrada,
    });
    const bloco = (rotulo, valor, detalhe) => {
      const b = el("div", "en-bloco");
      b.append(el("span", "cliente-sub", rotulo), el("strong", "", valor), el("span", "cliente-sub", detalhe));
      return b;
    };
    caixa.replaceChildren(
      bloco("Folga", mm(r.folga), calibrada === null ? "recomendada" : "calibrada"),
      bloco("Furo para esse pino", mm(r.furo), "medida para desenhar"),
      bloco("Pino para esse furo", mm(r.pino), "medida para desenhar"),
    );
    caixa.classList.remove("erro");
  } catch (erro) {
    caixa.replaceChildren(el("p", "erro", erro.message));
  }
}

async function gerar() {
  invalidar();
  const minha = ++geracao;
  try {
    const [M, fonte] = await Promise.all([motorDaTela(), carregarFonte("Fredoka")]);
    if (minha !== geracao) return;
    modelo = gerarPecaTeste(M, fonte, {
      diametro: numero("en-diametro"),
      quantidade: numero("en-quantidade"),
      folgaInicial: numero("en-folga-inicial"),
      passo: numero("en-passo"),
      espessura: numero("en-espessura"),
    });
    partes = modelo.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
    posicionarNaOrigem(partes.map((p) => p.geometria));
    if (modo === "3d") previa3d?.mostrar(partes);
    $("en-folgas").textContent = `Folgas: ${modelo.folgas.map((f) => f.toFixed(2).replace(".", ",")).join(" · ")} mm`;
    $("en-medidas").textContent = `${modelo.dimensoes.map((d) => d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })).join(" × ")} mm`;
    status("Imprima com as mesmas configurações das peças de verdade (camada, material, velocidade).");
    habilitar(true);
  } catch (erro) {
    if (minha !== geracao) return;
    status(erro.message, true);
    habilitar(false);
  }
  previa2d.mostrar(modelo);
}

// Cancela pedidos antigos e impede exportar a peça anterior enquanto há alterações.
function invalidar() {
  clearTimeout(temporizador);
  geracao += 1;
  habilitar(false);
}

function agendar() {
  invalidar();
  temporizador = setTimeout(gerar, 250);
}

function habilitar(pronto) {
  for (const id of ["en-3mf", "en-stl", "en-fatiador"]) $(id).disabled = !pronto;
}

function mudarModo(novo) {
  modo = novo;
  $("en-ver-2d").setAttribute("aria-pressed", String(modo === "2d"));
  $("en-ver-3d").setAttribute("aria-pressed", String(modo === "3d"));
  previa2d.ativar(modo === "2d");
  $("en-3d").hidden = modo !== "3d";
  if (modo === "3d") {
    previa3d ??= criarPrevia($("en-3d"));
    if (partes) previa3d.mostrar(partes);
  }
}

const nomeArquivo = () => `Teste de encaixe ${String(modelo.opcoes.diametro).replace(".", ",")} mm`;

async function salvar(extensao) {
  if (!partes) return;
  // peça de uma cor: tudo no filamento 1
  const bytes = extensao === "3mf" ? gerar3mf(partes.map((p) => ({ ...p, slot: 1 })), { titulo: nomeArquivo() }) : gerarStl(partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

// Chamado pelo Visualizador 3D: abre a calculadora com o diâmetro medido na peça.
export function abrirEncaixeCom(medida) {
  $("en-medida").value = (Math.round(medida * 100) / 100).toLocaleString("pt-BR");
  $("en-calibrada").value = "";
  calcular();
  irPara("encaixes");
  $("en-resultado").scrollIntoView({ behavior: "smooth", block: "center" });
}

export function iniciarEncaixes() {
  $("en-material").replaceChildren(...Object.keys(MATERIAIS_ENCAIXE).map((m) => new Option(m, m)));
  $("en-encaixe").replaceChildren(...Object.entries(ENCAIXES).map(([id, e]) => new Option(e.nome, id)));
  $("en-encaixe").value = "deslizante";
  for (const id of ["en-medida", "en-material", "en-encaixe", "en-bico", "en-calibrada"]) $(id).addEventListener("input", calcular);
  for (const id of ["en-diametro", "en-quantidade", "en-folga-inicial", "en-passo", "en-espessura"]) $(id).addEventListener("input", agendar);
  for (const b of document.querySelectorAll("#tela-encaixes .ch-abas button")) {
    b.addEventListener("click", () => $(b.dataset.alvo).scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  previa2d = criarPrevia2d($("en-2d"));
  $("en-ver-2d").addEventListener("click", () => mudarModo("2d"));
  $("en-ver-3d").addEventListener("click", () => mudarModo("3d"));
  $("en-3mf").addEventListener("click", () => salvar("3mf"));
  $("en-stl").addEventListener("click", () => salvar("stl"));
  $("en-fatiador").addEventListener("click", () => {
    if (partes) abrirNoFatiador(gerar3mf(partes.map((p) => ({ ...p, slot: 1 })), { titulo: nomeArquivo() }), nomeArquivo(), "3mf");
  });
  calcular();
  registrarAoAbrir("encaixes", () => {
    const nome = estado.config.fatiador?.nome;
    $("en-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
    gerar();
  });
}
