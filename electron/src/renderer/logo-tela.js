// Tela do Chaveiro de logo: imagem -> cores vetorizadas -> relevo multicor sobre base com argola.
import { PALETA } from "./chaveiro-tela.js";
import { abrirNoFatiador } from "./fatiador-ui.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { coresDoSvg, gerarLogo, LIMITES_LOGO, PADRAO_LOGO } from "./modelos/logo.js";
import { familiaCss } from "./modelos/fontes.js";
import { motorDaTela } from "./modelos/manifold.js";
import { criarPrevia2d } from "./modelos/previa2d.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el, ligarZonaArquivos } from "./util-tela.js";
import { vetorizar } from "./vetorizar.js";

const $ = (id) => document.getElementById(id);
const LADO = 360; // logos não precisam de mais resolução para virar relevo
const MEDIDAS = { "lg-largura": "largura", "lg-borda": "borda", "lg-base": "base", "lg-relevo": "relevo", "lg-furo": "furo", "lg-parede": "parede" };

let imagem = null; // { width, height, data, nome }
let cores = null; // contornos por cor (coresDoSvg), refeitos só quando a imagem ou as cores mudam
let opcoes = { ...PADRAO_LOGO };
let modelo = null;
let partes = null;
let modo = "2d";
let previa2d = null;
let previa3d = null;
let temporizador = null;
let geracao = 0;

const formatar = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const status = (texto, erro = false) => {
  $("lg-status").textContent = texto;
  $("lg-status").classList.toggle("erro", erro);
};

function preencherCampos() {
  for (const [id, chave] of Object.entries(MEDIDAS)) $(id).value = formatar(opcoes[chave]);
  for (const b of document.querySelectorAll("[data-lg-estilo]")) b.setAttribute("aria-pressed", String(b.dataset.lgEstilo === opcoes.estilo));
  let achou = false;
  for (const b of $("lg-paleta-base").querySelectorAll(".ch-cor")) {
    const igual = b.dataset.cor === opcoes.corBase;
    achou ||= igual;
    b.setAttribute("aria-pressed", String(igual));
  }
  const personalizada = $("lg-paleta-base").querySelector(".ch-cor-personalizada");
  personalizada.classList.toggle("ativa", !achou);
  personalizada.querySelector("input").value = opcoes.corBase;
}

function criarPaleta() {
  const botoes = PALETA.map(([cor, nome]) => {
    const b = el("button", "ch-cor");
    b.type = "button";
    b.style.background = cor;
    b.dataset.cor = cor;
    b.title = nome;
    b.setAttribute("aria-label", nome);
    b.addEventListener("click", () => mudar({ corBase: cor }));
    return b;
  });
  const personalizada = el("label", "ch-cor-personalizada");
  const seletor = el("input");
  seletor.type = "color";
  seletor.addEventListener("input", () => mudar({ corBase: seletor.value }));
  personalizada.append(seletor, el("span", "", "Cor personalizada"));
  $("lg-paleta-base").replaceChildren(...botoes, personalizada);
}

function mudar(mudancas) {
  if ("estilo" in mudancas) mudancas.argola = null;
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  gerar();
}

// cores do logo: vetoriza a imagem de novo (só quando a imagem, o número de cores ou o fundo mudam)
function vetorizarImagem() {
  $("lg-cores-valor").textContent = $("lg-cores").value;
  cores = null;
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
    cores = coresDoSvg(svg);
  } catch (erro) {
    status(erro.message, true);
  }
}

async function gerar() {
  clearTimeout(temporizador);
  if (!cores) {
    habilitar(false);
    return;
  }
  const minha = ++geracao;
  try {
    const M = await motorDaTela();
    if (minha !== geracao) return;
    modelo = gerarLogo(M, cores, opcoes);
    partes = modelo.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
    posicionarNaOrigem(partes.map((p) => p.geometria));
    if (modo === "3d") previa3d?.mostrar(partes);
    status(modelo.avisos.join(" ") || "Peça pronta. Confira a prévia e as medidas antes de exportar.");
    $("lg-cores-lista").replaceChildren(
      ...modelo.cores.map((c) => {
        const amostra = el("span", "amostra-cor");
        amostra.style.background = c;
        amostra.title = c;
        return amostra;
      }),
    );
    $("lg-partes").textContent = `${modelo.cores.length} cor(es) no logo + base`;
    habilitar(true);
  } catch (erro) {
    if (minha !== geracao) return;
    status(erro.message, true);
    habilitar(false);
  }
  $("lg-medidas").textContent = modelo ? `${modelo.dimensoes.map(formatar).join(" × ")} mm` : "";
  previa2d.mostrar(modelo);
}

function agendar() {
  clearTimeout(temporizador);
  status("Atualizando a peça…");
  temporizador = setTimeout(gerar, 250);
}

function habilitar(pronto) {
  for (const id of ["lg-3mf", "lg-stl", "lg-fatiador"]) $(id).disabled = !pronto;
}

async function argolaSolta(t) {
  const anterior = opcoes.argola;
  opcoes = { ...opcoes, argola: t };
  await gerar();
  if ($("lg-status").classList.contains("erro")) {
    const motivo = $("lg-status").textContent;
    opcoes = { ...opcoes, argola: anterior };
    await gerar();
    status(motivo, true);
  }
}

function mudarModo(novo) {
  modo = novo;
  $("lg-ver-2d").setAttribute("aria-pressed", String(modo === "2d"));
  $("lg-ver-3d").setAttribute("aria-pressed", String(modo === "3d"));
  previa2d.ativar(modo === "2d");
  $("lg-3d").hidden = modo !== "3d";
  if (modo === "3d") {
    previa3d ??= criarPrevia($("lg-3d"));
    if (partes) previa3d.mostrar(partes);
  }
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
    $("lg-zona").hidden = true;
    $("lg-nome").textContent = arquivo.name;
    opcoes = { ...opcoes, argola: null };
    status("Preparando a peça…");
    vetorizarImagem();
    gerar();
  } catch {
    mostrarAviso("Não foi possível abrir essa imagem. Use PNG, JPEG ou WebP.");
  }
}

const nomeArquivo = () => `Chaveiro logo ${imagem.nome.replace(/\.[^.]+$/, "")}`.slice(0, 60);

async function salvar(extensao) {
  if (!partes) return;
  const bytes = extensao === "3mf" ? gerar3mf(partes, { titulo: nomeArquivo() }) : gerarStl(partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

export function iniciarLogo() {
  ligarZonaArquivos($("lg-zona"), $("lg-entrada"), carregar);
  $("lg-trocar").addEventListener("click", () => $("lg-entrada").click());
  familiaCss("Lobster"); // ícone "Aa" do estilo Contorno
  criarPaleta();
  preencherCampos();
  $("lg-cores").addEventListener("input", () => {
    vetorizarImagem();
    agendar();
  });
  $("lg-fundo").addEventListener("change", () => {
    vetorizarImagem();
    agendar();
  });
  for (const [id, chave] of Object.entries(MEDIDAS)) {
    $(id).addEventListener("input", () => {
      const valor = Number(String($(id).value).replace(",", "."));
      if (!Number.isFinite(valor)) return;
      const [minimo, maximo] = LIMITES_LOGO[chave];
      if (valor < minimo || valor > maximo) {
        status(`${chave === "largura" ? "Largura total" : "Medida"}: use de ${formatar(minimo)} a ${formatar(maximo)} mm.`, true);
        habilitar(false);
        return;
      }
      opcoes = { ...opcoes, [chave]: valor };
      agendar();
    });
    $(id).addEventListener("change", preencherCampos);
  }
  for (const b of document.querySelectorAll("[data-lg-estilo]")) b.addEventListener("click", () => mudar({ estilo: b.dataset.lgEstilo }));
  $("lg-argola-auto").addEventListener("click", () => mudar({ argola: null }));
  for (const b of document.querySelectorAll("#tela-logo .ch-abas button")) {
    b.addEventListener("click", () => $(b.dataset.alvo).scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  previa2d = criarPrevia2d($("lg-2d"), {
    aoComecar: () => status("Posicione a argola. A peça é refeita ao soltar."),
    aoSoltar: argolaSolta,
  });
  $("lg-ver-2d").addEventListener("click", () => mudarModo("2d"));
  $("lg-ver-3d").addEventListener("click", () => mudarModo("3d"));
  $("lg-zoom-menos").addEventListener("click", () => (modo === "3d" ? previa3d?.zoom(1.25) : previa2d.zoom(1.25)));
  $("lg-zoom-mais").addEventListener("click", () => (modo === "3d" ? previa3d?.zoom(0.8) : previa2d.zoom(0.8)));
  $("lg-ajustar").addEventListener("click", () => (modo === "3d" ? previa3d?.enquadrar() : previa2d.ajustar()));

  $("lg-3mf").addEventListener("click", () => salvar("3mf"));
  $("lg-stl").addEventListener("click", () => salvar("stl"));
  $("lg-fatiador").addEventListener("click", () => {
    if (partes) abrirNoFatiador(gerar3mf(partes, { titulo: nomeArquivo() }), nomeArquivo(), "3mf");
  });
  registrarAoAbrir("logo", () => {
    const nome = estado.config.fatiador?.nome;
    $("lg-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
  });
}
