// Tela do Conversor SVG: escolhe a imagem, ajusta as opções e salva o vetor.
import { mostrarAviso } from "./shell.js";
import { ligarZonaArquivos, ROTULO_TAMANHO } from "./util-tela.js";
import { vetorizar } from "./vetorizar.js";

const $ = (id) => document.getElementById(id);
const LADO_MAXIMO = 1000; // reduz imagens grandes antes de vetorizar (mais rápido, sem perder forma)

let imagem = null; // { width, height, data, nome }
let svgAtual = "";
let urlOriginal = "";
let urlSvg = "";
let trabalho = 0;
let worker = null;
let temporizador = null;

function criarWorker() {
  try {
    const w = new Worker("svg-worker.js");
    w.onmessage = (ev) => receber(ev.data);
    w.onerror = () => {
      worker = null; // sem worker: a conversão roda na própria tela
      if (imagem) converter();
    };
    return w;
  } catch {
    return null;
  }
}

function opcoes() {
  return {
    modo: $("svg-modo").value,
    cores: Number($("svg-cores").value),
    detalhe: $("svg-detalhe").value,
    suavizar: $("svg-suavizar").checked,
    removerFundo: $("svg-fundo").checked,
  };
}

function atualizarControles() {
  const silhueta = $("svg-modo").value === "silhueta";
  $("campo-svg-cores").hidden = silhueta;
  $("campo-svg-fundo").hidden = silhueta;
  $("svg-cores-valor").textContent = $("svg-cores").value;
}

function receber({ id, svg, caminhos, cores, erro }) {
  if (id !== trabalho) return; // resultado antigo
  document.documentElement.dataset.svgMotor = worker ? "worker" : "tela"; // conferência nos testes
  $("svg-estado").textContent = "";
  if (erro) {
    $("svg-estado").textContent = `Não foi possível converter: ${erro}`;
    return;
  }
  svgAtual = svg;
  if (urlSvg) URL.revokeObjectURL(urlSvg);
  urlSvg = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  $("svg-resultado").src = urlSvg;
  $("svg-info").textContent = `${caminhos} caminho(s) · ${cores} cor(es) · ${ROTULO_TAMANHO(new Blob([svg]).size)}`;
  $("svg-salvar").disabled = false;
}

function converter() {
  if (!imagem) return;
  trabalho += 1;
  const id = trabalho;
  $("svg-estado").textContent = "Convertendo…";
  $("svg-salvar").disabled = true;
  const dados = { width: imagem.width, height: imagem.height, data: imagem.data };
  if (worker) {
    worker.postMessage({ id, imagem: dados, opcoes: opcoes() });
  } else {
    setTimeout(() => {
      try {
        receber({ id, ...vetorizar(dados, opcoes()) });
      } catch (erro) {
        receber({ id, erro: erro.message });
      }
    }, 30);
  }
}

function agendarConversao() {
  atualizarControles();
  clearTimeout(temporizador);
  temporizador = setTimeout(converter, 250);
}

async function carregar([arquivo]) {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = new OffscreenCanvas(largura, altura);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    const dados = ctx.getImageData(0, 0, largura, altura);
    imagem = { width: largura, height: altura, data: dados.data, nome: arquivo.name };

    if (urlOriginal) URL.revokeObjectURL(urlOriginal);
    urlOriginal = URL.createObjectURL(arquivo);
    $("svg-original").src = urlOriginal;
    $("svg-trabalho").hidden = false;
    $("svg-nome").textContent = `${arquivo.name} · ${bitmap.width} × ${bitmap.height} px`;
    converter();
  } catch {
    mostrarAviso("Não foi possível abrir essa imagem. Use PNG, JPEG ou WebP.");
  }
}

async function salvar() {
  if (!svgAtual || !imagem) return;
  const base = imagem.nome.replace(/\.[^.]+$/, "") || "imagem";
  const resposta = await window.arquivos.salvarCopias([{ nome: `${base}.svg`, bytes: new TextEncoder().encode(svgAtual) }]);
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  if (resposta.dados) mostrarAviso(`SVG salvo em ${resposta.dados.pasta}.`);
}

export function iniciarSvg() {
  worker = criarWorker();
  ligarZonaArquivos($("svg-zona"), $("svg-entrada"), carregar);
  for (const id of ["svg-modo", "svg-detalhe", "svg-suavizar", "svg-fundo"]) $(id).addEventListener("change", agendarConversao);
  $("svg-cores").addEventListener("input", agendarConversao);
  $("svg-salvar").addEventListener("click", salvar);
  atualizarControles();
}
