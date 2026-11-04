// Tela das Palavras decorativas: até 3 linhas, placa ou letreiro, prévia 2D/3D.
import { abrirNoFatiador } from "./fatiador-ui.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { carregarFonte } from "./modelos/fontes.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { motorDaTela } from "./modelos/manifold.js";
import { gerarPalavras, LIMITES_PALAVRAS, PADRAO_PALAVRAS } from "./modelos/palavras.js";
import { criarPrevia2d } from "./modelos/previa2d.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { criarPaleta, escolherFonte, marcarPaleta, mostrarFonte } from "./modelos-ui.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);
const MEDIDAS = { "pl-largura": "largura", "pl-espacamento": "espacamento", "pl-espessura": "espessura", "pl-relevo": "relevo", "pl-borda": "borda", "pl-ligacao": "ligacao" };
const NOMES = { largura: "Largura total", espacamento: "Espaço entre linhas", espessura: "Espessura", relevo: "Relevo", borda: "Borda", ligacao: "Ligação" };

let opcoes = {
  ...PADRAO_PALAVRAS,
  linhas: [...PADRAO_PALAVRAS.linhas.map((l) => ({ ...l })), { texto: "", fonte: "Fredoka", tamanho: 45 }],
};
let modelo = null;
let partes = null;
let modo = "2d";
let previa2d = null;
let previa3d = null;
let temporizador = null;
let geracao = 0;

const formatar = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const status = (texto, erro = false) => {
  $("pl-status").textContent = texto;
  $("pl-status").classList.toggle("erro", erro);
};

function preencherCampos() {
  opcoes.linhas.forEach((l, i) => {
    $(`pl-texto-${i + 1}`).value = l.texto;
    $(`pl-tamanho-${i + 1}`).value = formatar(l.tamanho);
    mostrarFonte($(`pl-fonte-${i + 1}`), l.fonte);
  });
  for (const [id, chave] of Object.entries(MEDIDAS)) $(id).value = formatar(opcoes[chave]);
  const letreiro = opcoes.modo === "letreiro";
  for (const b of document.querySelectorAll("[data-pl-modo]")) b.setAttribute("aria-pressed", String(b.dataset.plModo === opcoes.modo));
  for (const b of document.querySelectorAll("[data-pl-estilo]")) b.setAttribute("aria-pressed", String(b.dataset.plEstilo === opcoes.estilo));
  $("pl-so-placa").hidden = letreiro;
  $("campo-pl-relevo").hidden = letreiro;
  $("campo-pl-borda").hidden = letreiro;
  $("campo-pl-ligacao").hidden = !letreiro;
  $("pl-modo-ajuda").textContent = letreiro
    ? "Letras com a espessura toda, ligadas entre si e a uma barra embaixo: a peça fica em pé."
    : "Texto em relevo sobre uma base.";
  $("pl-rotulo-espessura").textContent = letreiro ? "Espessura das letras" : "Espessura da placa";
  $("pl-rotulo-cor-base").textContent = letreiro ? "Barra" : "Placa";
  $("pl-rotulo-cor-texto").textContent = letreiro ? "Letras" : "Texto";
  marcarPaleta($("pl-paleta-base"), opcoes.corBase);
  marcarPaleta($("pl-paleta-texto"), opcoes.corTexto);
}

function mudar(mudancas) {
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  gerar();
}

function agendar() {
  clearTimeout(temporizador);
  status("Atualizando a peça…");
  temporizador = setTimeout(gerar, 250);
}

function habilitar(pronto) {
  for (const id of ["pl-3mf", "pl-stl", "pl-fatiador"]) $(id).disabled = !pronto;
}

async function gerar() {
  clearTimeout(temporizador);
  const minha = ++geracao;
  const pedido = structuredClone(opcoes);
  try {
    const usadas = pedido.linhas.filter((l) => l.texto.trim());
    const [M, ...lista] = await Promise.all([motorDaTela(), ...usadas.map((l) => carregarFonte(l.fonte))]);
    if (minha !== geracao) return;
    const fontes = new Map(usadas.map((l, i) => [l.fonte, lista[i]]));
    modelo = gerarPalavras(M, fontes, pedido);
    partes = modelo.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
    posicionarNaOrigem(partes.map((p) => p.geometria));
    if (modo === "3d") previa3d?.mostrar(partes);
    status(modelo.avisos.join(" ") || "Peça pronta. Confira a prévia e as medidas antes de exportar.");
    $("pl-partes").textContent = `${partes[0].nome} no filamento 1 · ${partes[1].nome} no filamento 2`;
    habilitar(true);
  } catch (erro) {
    if (minha !== geracao) return;
    status(erro.message, true);
    habilitar(false);
  }
  $("pl-medidas").textContent = modelo ? `${modelo.dimensoes.map(formatar).join(" × ")} mm` : "";
  previa2d.mostrar(modelo);
}

function mudarModo(novo) {
  modo = novo;
  $("pl-ver-2d").setAttribute("aria-pressed", String(modo === "2d"));
  $("pl-ver-3d").setAttribute("aria-pressed", String(modo === "3d"));
  previa2d.ativar(modo === "2d");
  $("pl-3d").hidden = modo !== "3d";
  if (modo === "3d") {
    previa3d ??= criarPrevia($("pl-3d"));
    if (partes) previa3d.mostrar(partes);
  }
}

const nomeArquivo = () => `Palavras ${modelo.opcoes.linhas.map((l) => l.texto).join(" ")}`.slice(0, 60);

async function salvar(extensao) {
  if (!partes) return;
  const bytes = extensao === "3mf" ? gerar3mf(partes, { titulo: nomeArquivo() }) : gerarStl(partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

export function iniciarPalavras() {
  criarPaleta($("pl-paleta-base"), (cor) => mudar({ corBase: cor }));
  criarPaleta($("pl-paleta-texto"), (cor) => mudar({ corTexto: cor }));
  for (let n = 1; n <= 3; n++) {
    const i = n - 1;
    $(`pl-texto-${n}`).addEventListener("input", () => {
      opcoes.linhas[i] = { ...opcoes.linhas[i], texto: $(`pl-texto-${n}`).value };
      agendar();
    });
    $(`pl-tamanho-${n}`).addEventListener("input", () => {
      const v = Number(String($(`pl-tamanho-${n}`).value).replace(",", "."));
      const [minimo, maximo] = LIMITES_PALAVRAS.tamanho;
      if (!Number.isFinite(v) || v < minimo || v > maximo) {
        status(`Tamanho da linha ${n}: use de ${minimo} a ${maximo}%.`, true);
        habilitar(false);
        return;
      }
      opcoes.linhas[i] = { ...opcoes.linhas[i], tamanho: v };
      agendar();
    });
    $(`pl-fonte-${n}`).addEventListener("click", async () => {
      const id = await escolherFonte(opcoes.linhas[i].fonte);
      if (!id || id === opcoes.linhas[i].fonte) return;
      opcoes.linhas[i] = { ...opcoes.linhas[i], fonte: id };
      mudar({});
    });
  }
  for (const [id, chave] of Object.entries(MEDIDAS)) {
    $(id).addEventListener("input", () => {
      const v = Number(String($(id).value).replace(",", "."));
      const [minimo, maximo] = LIMITES_PALAVRAS[chave];
      if (!Number.isFinite(v) || v < minimo || v > maximo) {
        status(`${NOMES[chave]}: use de ${formatar(minimo)} a ${formatar(maximo)} mm.`, true);
        habilitar(false);
        return;
      }
      opcoes = { ...opcoes, [chave]: v };
      agendar();
    });
    $(id).addEventListener("change", preencherCampos);
  }
  for (const b of document.querySelectorAll("[data-pl-modo]")) b.addEventListener("click", () => mudar({ modo: b.dataset.plModo }));
  for (const b of document.querySelectorAll("[data-pl-estilo]")) b.addEventListener("click", () => mudar({ estilo: b.dataset.plEstilo }));
  for (const b of document.querySelectorAll("#tela-palavras .ch-abas button")) {
    b.addEventListener("click", () => $(b.dataset.alvo).scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  previa2d = criarPrevia2d($("pl-2d"));
  $("pl-ver-2d").addEventListener("click", () => mudarModo("2d"));
  $("pl-ver-3d").addEventListener("click", () => mudarModo("3d"));
  $("pl-zoom-menos").addEventListener("click", () => (modo === "3d" ? previa3d?.zoom(1.25) : previa2d.zoom(1.25)));
  $("pl-zoom-mais").addEventListener("click", () => (modo === "3d" ? previa3d?.zoom(0.8) : previa2d.zoom(0.8)));
  $("pl-ajustar").addEventListener("click", () => (modo === "3d" ? previa3d?.enquadrar() : previa2d.ajustar()));

  $("pl-3mf").addEventListener("click", () => salvar("3mf"));
  $("pl-stl").addEventListener("click", () => salvar("stl"));
  $("pl-fatiador").addEventListener("click", () => {
    if (partes) abrirNoFatiador(gerar3mf(partes, { titulo: nomeArquivo() }), nomeArquivo(), "3mf");
  });
  preencherCampos();
  registrarAoAbrir("palavras", () => {
    const nome = estado.config.fatiador?.nome;
    $("pl-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
    status("Preparando a peça…");
    gerar();
  });
}
