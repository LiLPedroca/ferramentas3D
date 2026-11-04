// Tela do Chaveiro de logo: imagem -> cores vetorizadas -> relevo multicor sobre base com argola.
import { abrirNoFatiador } from "./fatiador-ui.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { gerarLogo } from "./modelos/logo.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { mostrarAviso } from "./shell.js";
import { el, ligarZonaArquivos } from "./util-tela.js";
import { vetorizar } from "./vetorizar.js";

const $ = (id) => document.getElementById(id);
const LADO = 360; // logos não precisam de mais resolução para virar relevo

let imagem = null; // { width, height, data, nome }
let previa = null;
let modelo = null;
let temporizador = null;

const mm = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function gerar() {
  if (!imagem) return;
  try {
    const { svg } = vetorizar(imagem, {
      modo: "cores",
      // a cor do fundo conta na quantização, mas sai depois
      cores: Number($("lg-cores").value) + ($("lg-fundo").checked ? 1 : 0),
      detalhe: "medio",
      suavizar: true,
      removerFundo: $("lg-fundo").checked,
    });
    modelo = gerarLogo(svg, {
      largura: $("lg-largura").value,
      espessuraBase: $("lg-base").value,
      relevo: $("lg-relevo").value,
      margem: $("lg-margem").value,
      furo: $("lg-furo").value,
      base: $("lg-formato").value,
      corBase: $("lg-cor-base").value,
    });
    $("lg-erro").textContent = "";
    $("lg-medidas").textContent = `${mm(modelo.tamanho.x)} × ${mm(modelo.tamanho.y)} × ${mm(modelo.tamanho.z)} mm · ${modelo.cores.length} cor(es) no logo + base`;
    $("lg-cores-lista").replaceChildren(
      ...modelo.cores.map((c) => {
        const amostra = el("span", "amostra-cor");
        amostra.style.background = c;
        amostra.title = c;
        return amostra;
      }),
    );
    previa ??= criarPrevia($("lg-palco"));
    previa.mostrar(modelo.partes);
    for (const id of ["lg-3mf", "lg-stl", "lg-fatiador"]) $(id).disabled = false;
  } catch (erro) {
    modelo = null;
    $("lg-erro").textContent = erro.message;
    for (const id of ["lg-3mf", "lg-stl", "lg-fatiador"]) $(id).disabled = true;
  }
}

function agendar() {
  $("lg-cores-valor").textContent = $("lg-cores").value;
  clearTimeout(temporizador);
  temporizador = setTimeout(gerar, 300);
}

async function carregar([arquivo]) {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    imagem = { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data, nome: arquivo.name };
    $("lg-trabalho").hidden = false;
    $("lg-nome").textContent = arquivo.name;
    gerar();
  } catch {
    mostrarAviso("Não foi possível abrir essa imagem. Use PNG, JPEG ou WebP.");
  }
}

const nomeArquivo = () => `Chaveiro logo ${imagem.nome.replace(/\.[^.]+$/, "")}`.slice(0, 60);

async function salvar(extensao) {
  if (!modelo) return;
  const bytes = extensao === "3mf" ? gerar3mf(modelo.partes, { titulo: nomeArquivo() }) : gerarStl(modelo.partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

export function iniciarLogo() {
  ligarZonaArquivos($("lg-zona"), $("lg-entrada"), carregar);
  for (const campo of document.querySelectorAll("#lg-trabalho input, #lg-trabalho select")) campo.addEventListener("input", agendar);
  $("lg-3mf").addEventListener("click", () => salvar("3mf"));
  $("lg-stl").addEventListener("click", () => salvar("stl"));
  $("lg-fatiador").addEventListener("click", () => {
    if (modelo) abrirNoFatiador(gerar3mf(modelo.partes, { titulo: nomeArquivo() }), nomeArquivo(), "3mf");
  });
}
