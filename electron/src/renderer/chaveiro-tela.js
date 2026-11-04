// Tela do Chaveiro de nome.
import { abrirNoFatiador } from "./fatiador-ui.js";
import { gerarChaveiro } from "./modelos/chaveiro.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { carregarFonte, FONTES } from "./modelos/fontes.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);
const CAMPOS = ["ch-texto", "ch-fonte", "ch-altura", "ch-base", "ch-relevo", "ch-margem", "ch-furo", "ch-cor-base", "ch-cor-texto"];

let previa = null;
let modelo = null;
let temporizador = null;
let geracao = 0;

const mm = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function opcoes() {
  return {
    texto: $("ch-texto").value,
    alturaTexto: $("ch-altura").value,
    espessuraBase: $("ch-base").value,
    alturaRelevo: $("ch-relevo").value,
    margem: $("ch-margem").value,
    furo: $("ch-furo").value,
    corBase: $("ch-cor-base").value,
    corTexto: $("ch-cor-texto").value,
  };
}

async function gerar() {
  const minha = ++geracao;
  try {
    const fonte = await carregarFonte($("ch-fonte").value);
    if (minha !== geracao) return;
    modelo = gerarChaveiro(fonte, opcoes());
    $("ch-erro").textContent = "";
    $("ch-medidas").textContent = `${mm(modelo.tamanho.x)} × ${mm(modelo.tamanho.y)} × ${mm(modelo.tamanho.z)} mm`;
    previa ??= criarPrevia($("ch-palco"));
    previa.mostrar(modelo.partes);
    for (const id of ["ch-3mf", "ch-stl", "ch-fatiador"]) $(id).disabled = false;
  } catch (erro) {
    if (minha !== geracao) return;
    modelo = null;
    $("ch-erro").textContent = erro.message;
    for (const id of ["ch-3mf", "ch-stl", "ch-fatiador"]) $(id).disabled = true;
  }
}

function agendar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(gerar, 200);
}

const nomeArquivo = () => `Chaveiro ${modelo.opcoes.texto}`;

async function salvar(extensao) {
  if (!modelo) return;
  const bytes = extensao === "3mf" ? gerar3mf(modelo.partes, { titulo: nomeArquivo() }) : gerarStl(modelo.partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

export function iniciarChaveiro() {
  $("ch-fonte").replaceChildren(...FONTES.map((f) => new Option(f.nome, f.id)));
  for (const id of CAMPOS) $(id).addEventListener("input", agendar);
  $("ch-3mf").addEventListener("click", () => salvar("3mf"));
  $("ch-stl").addEventListener("click", () => salvar("stl"));
  $("ch-fatiador").addEventListener("click", () => {
    if (modelo) abrirNoFatiador(gerar3mf(modelo.partes, { titulo: nomeArquivo() }), nomeArquivo(), "3mf");
  });
  registrarAoAbrir("chaveiro", () => {
    if (!$("ch-texto").value) $("ch-texto").value = (estado.config.nome || "").split(/\s+/)[0] || "Seu nome";
    gerar();
  });
}
