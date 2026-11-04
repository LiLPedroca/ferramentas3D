// Tela do Chaveiro de nome: opções à esquerda, prévia 2D (argola arrastável) ou 3D à direita.
import { abrirNoFatiador } from "./fatiador-ui.js";
import { gerarChaveiro, LIMITES_CHAVEIRO, MODELOS_PRONTOS, PADRAO_CHAVEIRO } from "./modelos/chaveiro.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { carregarFonte, familiaCss } from "./modelos/fontes.js";
import { criarPaleta, escolherFonte, marcarPaleta, mostrarFonte } from "./modelos-ui.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { motorDaTela } from "./modelos/manifold.js";
import { criarPrevia2d } from "./modelos/previa2d.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);

// campos de medida: id do campo → chave nas opções
const MEDIDAS = { "ch-largura": "largura", "ch-borda": "borda", "ch-base": "base", "ch-relevo": "relevo", "ch-furo": "furo", "ch-parede": "parede" };

let opcoes = { ...PADRAO_CHAVEIRO };
let unidade = "mm";
let modelo = null; // última peça gerada com sucesso
let partes = null; // partes prontas para exportar
let historico = [];
let posicao = -1;
let modo = "2d";
let previa3d = null;
let temporizador = null;
let geracao = 0;
let previa2d = null;

const fator = () => (unidade === "cm" ? 10 : 1);
const formatar = (mm, casas = 2) => (mm / fator()).toLocaleString("pt-BR", { maximumFractionDigits: casas });
const status = (texto, erro = false) => {
  $("ch-status").textContent = texto;
  $("ch-status").classList.toggle("erro", erro);
};

// ---------- Campos ----------
function preencherCampos() {
  $("ch-texto").value = opcoes.texto;
  for (const [id, chave] of Object.entries(MEDIDAS)) $(id).value = formatar(opcoes[chave], 3);
  $("ch-unidade").value = unidade;
  for (const em of document.querySelectorAll("#tela-chaveiro [data-unidade]")) em.textContent = unidade;
  mostrarFonte($("ch-fonte"), opcoes.fonte);
  $("ch-fonte-amostra").style.fontFamily = familiaCss(opcoes.fonte);
  for (const b of document.querySelectorAll("#tela-chaveiro [data-estilo]")) b.setAttribute("aria-pressed", String(b.dataset.estilo === opcoes.estilo));
  marcarPaleta($("ch-paleta-base"), opcoes.corBase);
  marcarPaleta($("ch-paleta-texto"), opcoes.corTexto);
  const pronto = Object.entries(MODELOS_PRONTOS).find(([, p]) => p.borda === opcoes.borda && p.base === opcoes.base && p.relevo === opcoes.relevo);
  $("ch-pronto").value = pronto ? pronto[0] : "";
}

function lerMedida(id) {
  const n = Number(String($(id).value).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * fator() * 1000) / 1000 : NaN;
}

// ---------- Histórico (desfazer/refazer) ----------
function lembrar() {
  const foto = JSON.stringify(opcoes);
  if (historico[posicao] === foto) return;
  historico = historico.slice(0, posicao + 1);
  historico.push(foto);
  if (historico.length > 60) historico.shift();
  posicao = historico.length - 1;
  botoesHistorico();
}

function botoesHistorico() {
  $("ch-desfazer").disabled = posicao < 1;
  $("ch-refazer").disabled = posicao >= historico.length - 1;
}

function voltar(passo) {
  const nova = posicao + passo;
  if (nova < 0 || nova >= historico.length) return;
  posicao = nova;
  opcoes = JSON.parse(historico[posicao]);
  preencherCampos();
  botoesHistorico();
  gerar();
}

// Muda opções e agenda a nova peça. Trocar texto, fonte ou estilo devolve a argola à posição automática.
function mudar(mudancas, { lembrar: guardar = true, imediato = true } = {}) {
  if ("texto" in mudancas || "fonte" in mudancas || "estilo" in mudancas) mudancas.argola = null;
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  if (guardar) lembrar();
  if (imediato) gerar();
  else agendar();
}

function agendar() {
  clearTimeout(temporizador);
  status("Atualizando a peça…");
  temporizador = setTimeout(gerar, 220);
}

// ---------- Geração ----------
async function gerar() {
  clearTimeout(temporizador);
  const minha = ++geracao;
  const pedido = { ...opcoes };
  try {
    const [M, fonte] = await Promise.all([motorDaTela(), carregarFonte(pedido.fonte)]);
    if (minha !== geracao) return;
    const resultado = gerarChaveiro(M, fonte, pedido);
    modelo = resultado;
    partes = resultado.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
    posicionarNaOrigem(partes.map((p) => p.geometria));
    if (modo === "3d") previa3d?.mostrar(partes);
    status(resultado.avisos.join(" ") || "Peça pronta. Confira a prévia e as medidas antes de exportar.");
    habilitar(true);
  } catch (erro) {
    if (minha !== geracao) return;
    status(erro.message, true);
    habilitar(false);
  }
  mostrarMedidas();
  previa2d.mostrar(modelo);
}

function habilitar(pronto) {
  for (const id of ["ch-3mf", "ch-stl", "ch-fatiador"]) $(id).disabled = !pronto;
}

function mostrarMedidas() {
  if (!modelo) {
    $("ch-medidas").textContent = "";
    return;
  }
  $("ch-medidas").textContent = `${modelo.dimensoes.map((d) => formatar(d)).join(" × ")} ${unidade}`;
}

// A argola foi solta num ponto da borda: tenta a nova posição; se não servir, volta e explica.
async function argolaSolta(t) {
  const anterior = opcoes.argola;
  opcoes = { ...opcoes, argola: t };
  await gerar();
  if ($("ch-status").classList.contains("erro")) {
    const motivo = $("ch-status").textContent;
    opcoes = { ...opcoes, argola: anterior };
    await gerar();
    status(motivo, true);
  } else lembrar();
}

// ---------- Prévia 2D/3D e zoom ----------
function mudarModo(novo) {
  modo = novo;
  $("ch-ver-2d").setAttribute("aria-pressed", String(modo === "2d"));
  $("ch-ver-3d").setAttribute("aria-pressed", String(modo === "3d"));
  previa2d.ativar(modo === "2d");
  $("ch-3d").hidden = modo !== "3d";
  if (modo === "3d") {
    previa3d ??= criarPrevia($("ch-3d"));
    if (partes) previa3d.mostrar(partes);
  }
}

function zoom(f) {
  if (modo === "3d") previa3d?.zoom(f);
  else previa2d.zoom(f);
}

function ajustar() {
  if (modo === "3d") previa3d?.enquadrar();
  else previa2d.ajustar();
}

// ---------- Exportação ----------
const nomeArquivo = () => `Chaveiro ${modelo.opcoes.texto}`;

function partesComSlots() {
  const slots = [Number($("ch-slot-base").value), Number($("ch-slot-texto").value)];
  return partes.map((p, i) => ({ ...p, slot: slots[i] }));
}

async function salvar(extensao) {
  if (!partes) return;
  const bytes = extensao === "3mf" ? gerar3mf(partesComSlots(), { titulo: nomeArquivo() }) : gerarStl(partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

function rotuloFatiador() {
  const nome = estado.config.fatiador?.nome;
  $("ch-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
}

// ---------- Início ----------
export function iniciarChaveiro() {
  for (const [id, chave] of [["ch-paleta-base", "corBase"], ["ch-paleta-texto", "corTexto"]]) {
    criarPaleta($(id), (cor, final) => mudar({ [chave]: cor }, { lembrar: final }));
  }
  $("ch-pronto").append(...Object.entries(MODELOS_PRONTOS).map(([id, p]) => new Option(p.nome, id)));
  for (const id of ["ch-slot-base", "ch-slot-texto"]) {
    $(id).replaceChildren(...Array.from({ length: 16 }, (_, i) => new Option(`Filamento ${i + 1}`, String(i + 1))));
  }
  $("ch-slot-texto").value = "2";

  $("ch-texto").addEventListener("input", () => {
    opcoes = { ...opcoes, texto: $("ch-texto").value, argola: null };
    agendar();
  });
  $("ch-texto").addEventListener("change", lembrar);
  for (const [id, chave] of Object.entries(MEDIDAS)) {
    $(id).addEventListener("input", () => {
      const valor = lerMedida(id);
      if (!Number.isFinite(valor)) return;
      const [minimo, maximo] = LIMITES_CHAVEIRO[chave];
      if (valor < minimo || valor > maximo) {
        status(`${chave === "largura" ? "Largura total" : "Medida"}: use de ${formatar(minimo)} a ${formatar(maximo)} ${unidade}.`, true);
        habilitar(false);
        return;
      }
      opcoes = { ...opcoes, [chave]: valor };
      agendar();
    });
    $(id).addEventListener("change", () => {
      preencherCampos();
      lembrar();
    });
  }
  $("ch-unidade").addEventListener("change", () => {
    unidade = $("ch-unidade").value;
    preencherCampos();
    mostrarMedidas();
  });
  for (const b of document.querySelectorAll("#tela-chaveiro [data-estilo]")) b.addEventListener("click", () => mudar({ estilo: b.dataset.estilo }));
  $("ch-pronto").addEventListener("change", () => {
    const p = MODELOS_PRONTOS[$("ch-pronto").value];
    if (p) mudar({ borda: p.borda, base: p.base, relevo: p.relevo });
  });
  $("ch-argola-auto").addEventListener("click", () => mudar({ argola: null }));
  for (const b of document.querySelectorAll("#tela-chaveiro .ch-abas button")) {
    b.addEventListener("click", () => $(b.dataset.alvo).scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  $("ch-fonte").addEventListener("click", async () => {
    const id = await escolherFonte(opcoes.fonte);
    if (id && id !== opcoes.fonte) mudar({ fonte: id });
  });

  $("ch-desfazer").addEventListener("click", () => voltar(-1));
  $("ch-refazer").addEventListener("click", () => voltar(1));
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("tela-chaveiro").classList.contains("oculta") || !e.ctrlKey) return;
    if (e.target.matches?.("input, textarea")) return;
    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      voltar(-1);
    } else if (e.key.toLowerCase() === "y") {
      e.preventDefault();
      voltar(1);
    }
  });
  $("ch-ver-2d").addEventListener("click", () => mudarModo("2d"));
  $("ch-ver-3d").addEventListener("click", () => mudarModo("3d"));
  $("ch-zoom-menos").addEventListener("click", () => zoom(1.25));
  $("ch-zoom-mais").addEventListener("click", () => zoom(0.8));
  $("ch-ajustar").addEventListener("click", ajustar);
  previa2d = criarPrevia2d($("ch-2d"), {
    aoComecar: () => status("Posicione a argola. A peça é refeita ao soltar."),
    aoSoltar: argolaSolta,
  });

  $("ch-3mf").addEventListener("click", () => salvar("3mf"));
  $("ch-stl").addEventListener("click", () => salvar("stl"));
  $("ch-fatiador").addEventListener("click", () => {
    if (partes) abrirNoFatiador(gerar3mf(partesComSlots(), { titulo: nomeArquivo() }), nomeArquivo(), "3mf");
  });

  let primeira = true;
  registrarAoAbrir("chaveiro", () => {
    rotuloFatiador();
    if (primeira) {
      primeira = false;
      opcoes = { ...opcoes, texto: (estado.config.nome || "").split(/\s+/)[0] || PADRAO_CHAVEIRO.texto };
      preencherCampos();
      lembrar();
    }
    status("Preparando a peça…");
    gerar();
  });
}
