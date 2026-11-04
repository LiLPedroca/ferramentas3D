// Tela das Palavras decorativas.
import { abrirNoFatiador } from "./fatiador-ui.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { carregarFonte, FONTES } from "./modelos/fontes.js";
import { gerarPalavras } from "./modelos/palavras.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { mostrarAviso, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);

let previa = null;
let modelo = null;
let temporizador = null;
let geracao = 0;

const mm = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function linhas() {
  return [1, 2, 3].map((n) => ({ texto: $(`pl-texto-${n}`).value, fonte: $(`pl-fonte-${n}`).value, altura: $(`pl-altura-${n}`).value }));
}

async function gerar() {
  const minha = ++geracao;
  try {
    const usadas = linhas().filter((l) => l.texto.trim());
    const fontes = new Map();
    for (const l of usadas) fontes.set(l.fonte, await carregarFonte(l.fonte));
    if (minha !== geracao) return;
    modelo = gerarPalavras(fontes, {
      modo: $("pl-modo").value,
      linhas: linhas(),
      espacamento: $("pl-espaco").value,
      espessura: $("pl-espessura").value,
      relevo: $("pl-relevo").value,
      corBase: $("pl-cor-base").value,
      corTexto: $("pl-cor-texto").value,
    });
    $("pl-erro").textContent = "";
    $("pl-medidas").textContent = `${mm(modelo.tamanho.x)} × ${mm(modelo.tamanho.y)} × ${mm(modelo.tamanho.z)} mm`;
    previa ??= criarPrevia($("pl-palco"));
    previa.mostrar(modelo.partes);
    for (const id of ["pl-3mf", "pl-stl", "pl-fatiador"]) $(id).disabled = false;
  } catch (erro) {
    if (minha !== geracao) return;
    modelo = null;
    $("pl-erro").textContent = erro.message;
    for (const id of ["pl-3mf", "pl-stl", "pl-fatiador"]) $(id).disabled = true;
  }
}

function agendar() {
  const letreiro = $("pl-modo").value === "letreiro";
  $("campo-pl-relevo").hidden = letreiro;
  $("pl-rotulo-espessura").textContent = letreiro ? "Espessura das letras" : "Espessura da placa";
  $("pl-rotulo-cor-base").textContent = letreiro ? "Cor da barra" : "Cor da placa";
  $("pl-rotulo-cor-texto").textContent = letreiro ? "Cor das letras" : "Cor do texto";
  clearTimeout(temporizador);
  temporizador = setTimeout(gerar, 250);
}

const nomeArquivo = () => `Palavras ${modelo.opcoes.linhas.map((l) => l.texto).join(" ")}`.slice(0, 60);

async function salvar(extensao) {
  if (!modelo) return;
  const bytes = extensao === "3mf" ? gerar3mf(modelo.partes, { titulo: nomeArquivo() }) : gerarStl(modelo.partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

export function iniciarPalavras() {
  for (const n of [1, 2, 3]) {
    $(`pl-fonte-${n}`).replaceChildren(...FONTES.map((f) => new Option(f.nome, f.id)));
    $(`pl-fonte-${n}`).value = n === 1 ? "Pacifico" : "Fredoka";
  }
  for (const campo of document.querySelectorAll("#tela-palavras input, #tela-palavras select")) campo.addEventListener("input", agendar);
  $("pl-3mf").addEventListener("click", () => salvar("3mf"));
  $("pl-stl").addEventListener("click", () => salvar("stl"));
  $("pl-fatiador").addEventListener("click", () => {
    if (modelo) abrirNoFatiador(gerar3mf(modelo.partes, { titulo: nomeArquivo() }), nomeArquivo(), "3mf");
  });
  registrarAoAbrir("palavras", agendar);
}
