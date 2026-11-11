// Minhas Impressões: biblioteca dos arquivos que você imprime, com miniatura, peso, tempo,
// material e as configurações que deram certo. Os arquivos ficam guardados na pasta de dados.
import modelo from "../core/impressao.cjs";
import { preencherDoModelo } from "./calculadora-tela.js";
import { abrirSeletorFatiador } from "./fatiador-ui.js";
import { icone } from "./icones.js";
import { partesDoArquivo, dadosDo3mf } from "./impressoes-arquivo.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { densidadeDoMaterial } from "./modelos/estimativa.js";
import { abrirEditor as abrirEditorProduto } from "./produtos.js";
import { confirmar, estado, irPara, mostrarAviso, registrarAoAbrir, salvarConfig } from "./shell.js";
import { ROTULO_TAMANHO, el, ligarZonaArquivos } from "./util-tela.js";
import { abrirArquivoNoVisualizador } from "./viewer3d.js";

const { EXTENSOES, extensaoDe, tempoTexto } = modelo;
const $ = (id) => document.getElementById(id);
const NOVA = "__nova__";

let impressoes = [];
let atual = null; // impressão aberta no detalhe
let partesAtuais = null; // geometria do arquivo aberto (para estimar o peso)
let previa = null;
let fotoNova = null;
let removerFoto = false;
let adicionando = false;

const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dataBr = (d) => (d ? d.split("-").reverse().join("/") : "");
const pesoTexto = (g) => (g ? `${Number(g).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g` : "");

// ---------- Lista ----------
function categorias() {
  const mapa = new Map();
  for (const c of estado.config.categorias ?? []) mapa.set(normalizar(c), c);
  for (const i of impressoes) if (i.categoria && !mapa.has(normalizar(i.categoria))) mapa.set(normalizar(i.categoria), i.categoria);
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function preencherFiltro() {
  const atualFiltro = $("im-filtro").value;
  $("im-filtro").replaceChildren(new Option("Todas as categorias", ""), ...categorias().map((c) => new Option(c, c)));
  $("im-filtro").value = categorias().includes(atualFiltro) ? atualFiltro : "";
}

function cartao(i) {
  const c = el("button", "cartao-produto cartao-impressao");
  c.type = "button";
  c.setAttribute("aria-label", `Abrir ${i.nome}`);
  const foto = el("div", "produto-foto impressao-foto");
  const imagem = i.foto || i.miniatura;
  if (imagem) {
    const img = el("img");
    img.src = imagem;
    img.alt = "";
    if (!i.foto) img.className = "miniatura";
    foto.append(img);
  } else foto.innerHTML = icone("impressoes", 34);

  const info = el("div", "produto-info");
  const cabeca = el("div", "produto-cabeca");
  cabeca.append(el("h3", "", i.nome));
  if (i.categoria) cabeca.append(el("span", "chip", i.categoria));
  info.append(cabeca);
  const meta = [pesoTexto(i.pesoG), tempoTexto(i.tempoMin), i.material].filter(Boolean).join(" · ");
  info.append(el("p", "produto-meta", meta || i.arquivo.extensao.toUpperCase()));
  info.append(el("p", "produto-meta", i.vezesImpressa ? `Impressa ${i.vezesImpressa} ${i.vezesImpressa === 1 ? "vez" : "vezes"} · última em ${dataBr(i.ultimaImpressao)}` : "Ainda não marcada como impressa"));
  if (i.arquivoAusente) info.append(el("span", "chip chip-teste", "Arquivo não encontrado"));
  c.append(foto, info);
  c.addEventListener("click", () => abrirDetalhe(i));
  return c;
}

function renderizar() {
  preencherFiltro();
  const palavras = normalizar($("im-busca").value).split(/\s+/).filter(Boolean);
  const categoria = $("im-filtro").value;
  const filtradas = impressoes.filter((i) => {
    if (categoria && normalizar(i.categoria) !== normalizar(categoria)) return false;
    const texto = normalizar(`${i.nome} ${i.categoria} ${i.material} ${i.cor} ${i.observacoes} ${i.arquivo.nome}`);
    return palavras.every((p) => texto.includes(p));
  });
  $("im-grade").replaceChildren(...filtradas.map(cartao));
  $("im-grade").hidden = filtradas.length === 0;
  $("im-vazio").hidden = impressoes.length > 0;
  $("im-sem-resultado").hidden = impressoes.length === 0 || filtradas.length > 0;
  $("im-resumo").textContent = impressoes.length === 1 ? "1 arquivo guardado" : `${impressoes.length} arquivos guardados`;
}

async function carregar() {
  const r = await window.dados.impressoes.listar();
  if (!r.ok) {
    $("im-erro").textContent = r.erro;
    return;
  }
  $("im-erro").textContent = "";
  impressoes = r.dados;
  renderizar();
}

// ---------- Adicionar ----------
// Miniatura gerada da peça (para arquivos sem miniatura do fatiador). Usa uma prévia 3D escondida, criada uma vez.
let previaMiniatura = null;
async function gerarMiniatura(partes) {
  if (!previaMiniatura) {
    const caixa = el("div", "im-render-oculto");
    document.body.append(caixa);
    previaMiniatura = { caixa, previa: criarPrevia(caixa, { gradeSuave: true }) };
    previaMiniatura.previa.mostrarGrade(false);
  }
  const { caixa, previa: p } = previaMiniatura;
  p.mostrar(partes);
  p.enquadrar();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = caixa.querySelector("canvas");
  let url = canvas.toDataURL("image/webp", 0.85);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/png");
  return url.length < 380_000 ? url : undefined;
}

async function adicionarArquivos(arquivos) {
  if (adicionando) return;
  adicionando = true;
  const erros = [];
  let ok = 0;
  try {
    for (const [n, arquivo] of arquivos.entries()) {
      $("im-progresso").textContent = arquivos.length > 1 ? `Adicionando ${n + 1} de ${arquivos.length}…` : "Adicionando…";
      const extensao = extensaoDe(arquivo.name);
      if (!extensao) {
        erros.push(`"${arquivo.name}": use arquivos ${EXTENSOES.map((e) => e.toUpperCase()).join(", ")}.`);
        continue;
      }
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const extras = extensao === "3mf" ? dadosDo3mf(bytes) : {};
      if (!extras.miniatura) {
        try {
          extras.miniatura = await gerarMiniatura(partesDoArquivo(bytes, extensao));
        } catch {
          // sem miniatura: o cartão mostra o ícone
        }
      }
      const r = await window.dados.impressoes.adicionar({ bytes, nome: arquivo.name, ...extras });
      if (r.ok) ok += 1;
      else erros.push(r.erro);
    }
  } finally {
    adicionando = false;
    $("im-progresso").textContent = "";
  }
  await carregar();
  // Depois de recarregar (que limpa a mensagem de erro da lista).
  $("im-erro").textContent = erros.join(" ");
  if (ok) mostrarAviso(ok === 1 ? "Arquivo adicionado a Minhas Impressões." : `${ok} arquivos adicionados a Minhas Impressões.`);
}

// ---------- Detalhe ----------
function preencherCategorias(escolhida) {
  const lista = categorias();
  if (escolhida && !lista.some((c) => normalizar(c) === normalizar(escolhida))) lista.push(escolhida);
  $("im-categoria").replaceChildren(new Option("Sem categoria", ""), ...lista.map((c) => new Option(c, c)), new Option("+ Nova categoria…", NOVA));
  $("im-categoria").value = escolhida ?? "";
  $("im-nova-categoria-campo").hidden = true;
}

function mostrarFoto() {
  const imagem = fotoNova ?? (removerFoto ? null : atual?.foto);
  $("im-foto-previa").replaceChildren();
  if (imagem) {
    const img = el("img");
    img.src = imagem;
    img.alt = "";
    $("im-foto-previa").append(img);
  }
  $("im-foto-remover").hidden = !imagem;
}

async function abrirDetalhe(i) {
  atual = i;
  partesAtuais = null;
  fotoNova = null;
  removerFoto = false;
  $("im-titulo").textContent = i.nome;
  $("im-arquivo").textContent = `${i.arquivo.nome} · ${ROTULO_TAMANHO(i.arquivo.tamanho)}`;
  $("im-nome").value = i.nome;
  preencherCategorias(i.categoria);
  $("im-peso").value = i.pesoG ? i.pesoG.replace(".", ",") : "";
  const min = i.tempoMin ? Number(i.tempoMin) : null;
  $("im-horas").value = min === null ? "" : String(Math.floor(min / 60));
  $("im-minutos").value = min === null ? "" : String(min % 60);
  $("im-material").value = i.material;
  $("im-cor").value = i.cor;
  $("im-camada").value = i.camadaMm ? i.camadaMm.replace(".", ",") : "";
  $("im-preenchimento").value = i.preenchimentoPct;
  $("im-suporte").value = i.suporte;
  $("im-perfil").value = i.perfil;
  $("im-obs").value = i.observacoes;
  $("im-vezes").textContent = i.vezesImpressa ? `Impressa ${i.vezesImpressa} ${i.vezesImpressa === 1 ? "vez" : "vezes"} · última em ${dataBr(i.ultimaImpressao)}` : "Ainda não marcada como impressa";
  $("im-erro-detalhe").textContent = "";
  mostrarFoto();
  $("im-previa-aviso").textContent = "Carregando a peça…";
  $("im-previa-aviso").hidden = false;
  if (!$("dialogo-minha-impressao").open) $("dialogo-minha-impressao").showModal();
  $("im-previa").classList.add("carregando");
  const r = await window.dados.impressoes.ler(i.id);
  if (atual?.id !== i.id) return;
  if (!r.ok) {
    $("im-previa-aviso").textContent = r.erro;
    return;
  }
  try {
    partesAtuais = partesDoArquivo(r.dados.bytes, r.dados.extensao);
    if (!previa) previa = criarPrevia($("im-previa"), { gradeSuave: true });
    previa.mostrar(partesAtuais);
    $("im-previa").classList.remove("carregando");
    previa.enquadrar();
    $("im-previa-aviso").hidden = true;
  } catch {
    $("im-previa-aviso").textContent = "Não foi possível mostrar a peça deste arquivo. Ele continua guardado.";
  }
}

function valoresDoFormulario() {
  return {
    nome: $("im-nome").value,
    categoria: $("im-categoria").value === NOVA ? "" : $("im-categoria").value,
    pesoG: $("im-peso").value,
    tempoH: $("im-horas").value,
    tempoM: $("im-minutos").value,
    material: $("im-material").value,
    cor: $("im-cor").value,
    camadaMm: $("im-camada").value,
    preenchimentoPct: $("im-preenchimento").value,
    suporte: $("im-suporte").value,
    perfil: $("im-perfil").value,
    observacoes: $("im-obs").value,
    foto: fotoNova ?? undefined,
    removerFoto,
  };
}

async function salvarDetalhe(ev) {
  ev?.preventDefault();
  if (!atual) return false;
  const r = await window.dados.impressoes.salvar(valoresDoFormulario(), atual.id);
  if (!r.ok) {
    $("im-erro-detalhe").textContent = r.erro;
    return false;
  }
  atual = { ...r.dados, arquivoAusente: atual.arquivoAusente };
  fotoNova = null;
  removerFoto = false;
  $("im-erro-detalhe").textContent = "";
  $("im-titulo").textContent = atual.nome;
  mostrarAviso("Alterações salvas.");
  await carregar();
  return true;
}

async function excluirAtual() {
  if (!atual) return;
  const ok = await confirmar({
    titulo: "Excluir esta impressão?",
    texto: `"${atual.nome}" sai de Minhas Impressões. O arquivo fica guardado na pasta "excluidos" dos seus dados.`,
    botao: "Excluir",
  });
  if (!ok) return;
  const r = await window.dados.impressoes.excluir(atual.id);
  if (!r.ok) {
    $("im-erro-detalhe").textContent = r.erro;
    return;
  }
  $("dialogo-minha-impressao").close();
  mostrarAviso("Impressão excluída.");
  await carregar();
}

async function marcarImpressa() {
  const p = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const r = await window.dados.impressoes.imprimi(atual.id, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  if (!r.ok) {
    $("im-erro-detalhe").textContent = r.erro;
    return;
  }
  atual = { ...r.dados, arquivoAusente: atual.arquivoAusente };
  $("im-vezes").textContent = `Impressa ${atual.vezesImpressa} ${atual.vezesImpressa === 1 ? "vez" : "vezes"} · última em ${dataBr(atual.ultimaImpressao)}`;
  mostrarAviso(`Impressão registrada (${atual.vezesImpressa}ª vez).`);
  await carregar();
}

async function verNoVisualizador() {
  const r = await window.dados.impressoes.ler(atual.id);
  if (!r.ok) {
    $("im-erro-detalhe").textContent = r.erro;
    return;
  }
  $("dialogo-minha-impressao").close();
  irPara("visualizador");
  await abrirArquivoNoVisualizador(new File([r.dados.bytes], r.dados.nome));
}

async function abrirFatiador() {
  const r = await window.dados.impressoes.fatiador(atual.id);
  if (r.ok) {
    mostrarAviso(`Abrindo ${r.dados}…`);
    return;
  }
  if (r.erro === "SEM_FATIADOR") abrirSeletorFatiador(() => abrirFatiador());
  else $("im-erro-detalhe").textContent = r.erro;
}

// Volume da malha (mm³), para estimar o peso quando ele não foi informado.
function volumeDasPartes(partes) {
  let v = 0;
  for (const { geometria } of partes) {
    const p = geometria.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
    }
  }
  return Math.abs(v);
}

function calcularCusto() {
  const informado = Number(String($("im-peso").value).replace(",", "."));
  let pesoG = Number.isFinite(informado) && informado > 0 ? informado : 0;
  let detalhe = "peso informado em Minhas Impressões";
  if (!pesoG && partesAtuais) {
    const material = $("im-material").value || "PLA";
    pesoG = (volumeDasPartes(partesAtuais) / 1000) * densidadeDoMaterial(material);
    detalhe = `peso estimado pelo volume da peça (${material}, peça maciça)`;
  }
  if (!pesoG) {
    $("im-erro-detalhe").textContent = "Informe o peso para calcular o custo.";
    return;
  }
  const h = Number($("im-horas").value || 0);
  const m = Number($("im-minutos").value || 0);
  $("dialogo-minha-impressao").close();
  preencherDoModelo({ nome: $("im-nome").value || atual.nome, pesoG, detalhe, tempoMin: h * 60 + m || undefined });
}

function criarProduto() {
  const nome = $("im-nome").value || atual.nome;
  const pesoG = $("im-peso").value;
  $("dialogo-minha-impressao").close();
  irPara("produtos");
  abrirEditorProduto(null, { nome, pesoG });
}

// Foto: reduz para no máximo 900 px (JPEG), para caber no cadastro.
function reduzirFoto(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, 900 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.7, 0.55]) {
        const dados = canvas.toDataURL("image/jpeg", q);
        if (dados.length < 380_000) return resolver(dados);
      }
      rejeitar(new Error("A foto ficou grande demais. Escolha outra imagem."));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rejeitar(new Error("Não foi possível abrir esta imagem."));
    };
    img.src = url;
  });
}

async function criarCategoria() {
  const nome = $("im-nova-categoria").value.trim().replace(/\s+/g, " ");
  if (!nome) return;
  const existente = categorias().find((c) => normalizar(c) === normalizar(nome));
  if (!existente) {
    const r = await salvarConfig({ categorias: [...(estado.config.categorias ?? []), nome] });
    if (r && r.ok === false) {
      $("im-erro-detalhe").textContent = r.erro;
      return;
    }
    mostrarAviso(`Categoria "${nome}" criada.`);
  }
  preencherCategorias(existente ?? nome);
}

// ---------- Início ----------
export function iniciarImpressoes() {
  $("im-vazio-icone").innerHTML = icone("impressoes", 40);
  ligarZonaArquivos($("im-zona"), $("im-entrada"), adicionarArquivos);
  $("im-adicionar").addEventListener("click", () => $("im-entrada").click());
  $("im-vazio-adicionar").addEventListener("click", () => $("im-entrada").click());
  $("im-busca").addEventListener("input", renderizar);
  $("im-filtro").addEventListener("change", renderizar);
  // Soltar arquivos em qualquer parte da tela também adiciona.
  const tela = $("tela-impressoes");
  tela.addEventListener("dragover", (ev) => ev.preventDefault());
  tela.addEventListener("drop", (ev) => {
    ev.preventDefault();
    const arquivos = [...(ev.dataTransfer?.files ?? [])];
    if (arquivos.length) adicionarArquivos(arquivos);
  });

  $("form-impressao").addEventListener("submit", salvarDetalhe);
  $("fechar-impressao").addEventListener("click", () => $("dialogo-minha-impressao").close());
  $("dialogo-minha-impressao").addEventListener("close", () => {
    atual = null;
    partesAtuais = null;
  });
  $("im-excluir").addEventListener("click", excluirAtual);
  $("im-imprimi").addEventListener("click", marcarImpressa);
  $("im-visualizador").addEventListener("click", verNoVisualizador);
  $("im-fatiador").addEventListener("click", abrirFatiador);
  $("im-custo").addEventListener("click", calcularCusto);
  $("im-produto").addEventListener("click", criarProduto);
  $("im-enquadrar").addEventListener("click", () => previa?.enquadrar());
  $("im-categoria").addEventListener("change", () => {
    $("im-nova-categoria-campo").hidden = $("im-categoria").value !== NOVA;
    if ($("im-categoria").value === NOVA) $("im-nova-categoria").focus();
  });
  $("im-criar-categoria").addEventListener("click", criarCategoria);
  $("im-foto-escolher").addEventListener("click", () => $("im-foto-entrada").click());
  $("im-foto-entrada").addEventListener("change", async () => {
    const arquivo = $("im-foto-entrada").files[0];
    $("im-foto-entrada").value = "";
    if (!arquivo) return;
    try {
      fotoNova = await reduzirFoto(arquivo);
      removerFoto = false;
      mostrarFoto();
    } catch (erro) {
      $("im-erro-detalhe").textContent = erro.message;
    }
  });
  $("im-foto-remover").addEventListener("click", () => {
    fotoNova = null;
    removerFoto = true;
    mostrarFoto();
  });
  registrarAoAbrir("impressoes", carregar);
}
