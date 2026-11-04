// Tela de Produtos: lista, busca, filtro por categoria, cadastro, edição e exclusão.
// Os dados ficam no processo principal (window.dados.produtos), que valida e grava.
import { Racional } from "../core/racional.js";
import { formatarReais } from "../core/calculadora.js";
import { normalizar } from "../core/inicio.js";
import { icone } from "./icones.js";
import { confirmar } from "./shell.js";

const $ = (id) => document.getElementById(id);

const FOTO_LADO_MAX = 640;
const FOTO_TAMANHO_MAX = 380_000;

let produtos = [];
let carregado = false;
let editandoId = null; // null = novo produto
let fotoNova = null; // data URI escolhido nesta edição
let removerFoto = false;
let custoPendente = undefined; // custo vindo da calculadora
let fotoAtual = null; // foto do produto em edição (para a prévia)
let avisar = () => {};
let irPara = () => {};

// ---------- Formatação ----------
const reais = (centavos) => formatarReais(new Racional(BigInt(centavos), 100n));
const medida = (texto) => (texto ? texto.replace(".", ",") : "");

function textoMedidas(p) {
  const partes = [];
  if (p.pesoG) partes.push(`${medida(p.pesoG)} g`);
  const dims = [p.alturaMm, p.larguraMm, p.comprimentoMm];
  if (dims.some(Boolean)) partes.push(`${dims.map((d) => medida(d) || "—").join(" × ")} mm`);
  return partes.join(" · ");
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// ---------- Lista ----------
function categorias() {
  const mapa = new Map();
  for (const p of produtos) if (p.categoria) mapa.set(normalizar(p.categoria), p.categoria);
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function atualizarCategorias() {
  const seletor = $("filtro-categoria");
  const atual = seletor.value;
  const lista = categorias();
  seletor.replaceChildren(new Option("Todas as categorias", ""), ...lista.map((c) => new Option(c, c)));
  seletor.value = lista.includes(atual) ? atual : "";
  $("lista-categorias").replaceChildren(...lista.map((c) => new Option(c)));
}

function cartaoProduto(p) {
  const cartao = el("button", "cartao-produto");
  cartao.type = "button";
  cartao.setAttribute("aria-label", `Editar ${p.nome}`);

  const foto = el("div", "produto-foto");
  if (p.foto) {
    const img = el("img");
    img.src = p.foto;
    img.alt = "";
    foto.append(img);
  } else {
    foto.innerHTML = icone("produtos", 34);
  }

  const info = el("div", "produto-info");
  const cabeca = el("div", "produto-cabeca");
  cabeca.append(el("h3", "", p.nome));
  if (p.categoria) cabeca.append(el("span", "chip", p.categoria));
  info.append(cabeca, el("strong", "produto-preco", reais(p.precoCentavos)));

  const meta = textoMedidas(p);
  if (meta) info.append(el("p", "produto-meta", meta));
  if (p.custo) {
    const lucro = BigInt(p.precoCentavos) - BigInt(p.custo.custoUnitarioCentavos);
    const classe = lucro >= 0n ? "produto-margem" : "produto-margem negativo";
    info.append(el("p", classe, `Custo ${reais(p.custo.custoUnitarioCentavos)} · lucro ${reais(lucro.toString())}`));
  }

  cartao.append(foto, info);
  cartao.addEventListener("click", () => abrirEditor(p));
  return cartao;
}

function renderizar() {
  const busca = normalizar($("busca-produtos").value);
  const categoria = $("filtro-categoria").value;
  const palavras = busca.split(/\s+/).filter(Boolean);

  const filtrados = produtos.filter((p) => {
    if (categoria && normalizar(p.categoria) !== normalizar(categoria)) return false;
    const texto = normalizar(`${p.nome} ${p.categoria} ${p.observacoes}`);
    return palavras.every((w) => texto.includes(w));
  });

  $("grade-produtos").replaceChildren(...filtrados.map(cartaoProduto));
  $("vazio-produtos").hidden = produtos.length > 0;
  $("sem-resultado-produtos").hidden = produtos.length === 0 || filtrados.length > 0;
  $("produtos-resumo").textContent =
    produtos.length === 1 ? "1 produto cadastrado" : `${produtos.length} produtos cadastrados`;
}

export async function carregarProdutos() {
  const resposta = await window.dados.produtos.listar();
  if (!resposta.ok) {
    $("erro-produtos").textContent = resposta.erro;
    return;
  }
  $("erro-produtos").textContent = "";
  produtos = resposta.dados;
  carregado = true;
  atualizarCategorias();
  renderizar();
}

// ---------- Editor ----------
function mostrarFoto(dataUri) {
  const previa = $("foto-previa");
  if (dataUri) {
    const img = el("img");
    img.src = dataUri;
    img.alt = "Foto do produto";
    previa.replaceChildren(img);
  } else {
    previa.innerHTML = `${icone("fotos", 30)}<span>Sem foto</span>`;
  }
  $("remover-foto").hidden = !dataUri;
}

function mostrarCusto(custo) {
  const caixa = $("p-custo");
  if (!custo) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  const data = new Date(custo.data).toLocaleDateString("pt-BR");
  caixa.textContent = `Custo por peça da calculadora: ${reais(custo.custoUnitarioCentavos)} (lucro de ${custo.lucroPct.replace(".", ",")}% sobre o custo, em ${data}).`;
}

// p: produto existente, ou undefined para novo. predefinido: campos vindos da calculadora.
export function abrirEditor(p, predefinido = {}) {
  editandoId = p?.id ?? null;
  fotoNova = null;
  removerFoto = false;
  fotoAtual = p?.foto ?? null;
  custoPendente = predefinido.custo;

  $("titulo-dialogo-produto").textContent = p ? "Editar produto" : "Novo produto";
  $("p-nome").value = p?.nome ?? predefinido.nome ?? "";
  $("p-categoria").value = p?.categoria ?? "";
  $("p-preco").value = p ? reais(p.precoCentavos).replace("R$ ", "") : predefinido.preco ?? "";
  $("p-peso").value = medida(p?.pesoG) || predefinido.pesoG || "";
  $("p-altura").value = medida(p?.alturaMm);
  $("p-largura").value = medida(p?.larguraMm);
  $("p-comprimento").value = medida(p?.comprimentoMm);
  $("p-obs").value = p?.observacoes ?? "";
  $("erro-produto").textContent = "";
  $("excluir-produto").hidden = !p;
  mostrarFoto(fotoAtual);
  mostrarCusto(custoPendente ?? p?.custo);

  $("dialogo-produto").showModal();
  $("p-nome").focus();
}

function fecharEditor() {
  $("dialogo-produto").close();
}

async function salvar(ev) {
  ev.preventDefault();
  const botao = $("salvar-produto");
  botao.disabled = true;
  try {
    const valores = {
      nome: $("p-nome").value,
      categoria: $("p-categoria").value,
      preco: $("p-preco").value,
      pesoG: $("p-peso").value,
      alturaMm: $("p-altura").value,
      larguraMm: $("p-largura").value,
      comprimentoMm: $("p-comprimento").value,
      observacoes: $("p-obs").value,
      removerFoto,
    };
    if (fotoNova) valores.foto = fotoNova;
    if (custoPendente) valores.custo = custoPendente;

    const resposta = await window.dados.produtos.salvar(valores, editandoId);
    if (!resposta.ok) {
      $("erro-produto").textContent = resposta.erro;
      return;
    }
    fecharEditor();
    avisar(editandoId ? "Produto atualizado." : "Produto cadastrado.");
    await carregarProdutos();
  } finally {
    botao.disabled = false;
  }
}

// Reduz a imagem para no máximo 640 px e converte em JPEG, para o arquivo de dados ficar leve.
async function prepararFoto(arquivo) {
  const imagem = await createImageBitmap(arquivo);
  for (const [lado, qualidade] of [[FOTO_LADO_MAX, 0.85], [FOTO_LADO_MAX, 0.7], [480, 0.7], [360, 0.65]]) {
    const escala = Math.min(1, lado / Math.max(imagem.width, imagem.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imagem.width * escala));
    canvas.height = Math.max(1, Math.round(imagem.height * escala));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // fundo branco para PNG com transparência
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    const uri = canvas.toDataURL("image/jpeg", qualidade);
    if (uri.length <= FOTO_TAMANHO_MAX) return uri;
  }
  throw new Error("A imagem é grande demais, mesmo reduzida. Escolha outra.");
}

async function aoEscolherFoto() {
  const arquivo = $("arquivo-foto").files[0];
  $("arquivo-foto").value = "";
  if (!arquivo) return;
  try {
    fotoNova = await prepararFoto(arquivo);
    removerFoto = false;
    mostrarFoto(fotoNova);
    $("erro-produto").textContent = "";
  } catch (erro) {
    $("erro-produto").textContent =
      erro instanceof Error && erro.message.startsWith("A imagem") ? erro.message : "Não foi possível abrir essa imagem.";
  }
}

// ---------- Exclusão ----------
async function confirmarExclusao() {
  const produto = produtos.find((p) => p.id === editandoId);
  if (!produto) return;
  const ok = await confirmar({
    titulo: "Excluir produto?",
    texto: `"${produto.nome}" será excluído. Essa ação não pode ser desfeita.`,
    botao: "Excluir",
  });
  if (ok) await excluir();
}

async function excluir() {
  const resposta = await window.dados.produtos.excluir(editandoId);
  if (!resposta.ok) {
    $("erro-produto").textContent = resposta.erro;
    return;
  }
  fecharEditor();
  avisar("Produto excluído.");
  await carregarProdutos();
}

// ---------- Inicialização ----------
export function iniciarProdutos(opcoes) {
  avisar = opcoes.avisar;
  irPara = opcoes.irPara;

  $("vazio-icone").innerHTML = icone("produtos", 40);
  $("novo-produto").addEventListener("click", () => abrirEditor());
  $("vazio-novo").addEventListener("click", () => abrirEditor());
  $("vazio-calcular").addEventListener("click", () => irPara("calculadora"));
  $("busca-produtos").addEventListener("input", renderizar);
  $("filtro-categoria").addEventListener("change", renderizar);

  $("form-produto").addEventListener("submit", salvar);
  $("fechar-produto").addEventListener("click", fecharEditor);
  $("cancelar-produto").addEventListener("click", fecharEditor);
  $("escolher-foto").addEventListener("click", () => $("arquivo-foto").click());
  $("arquivo-foto").addEventListener("change", aoEscolherFoto);
  $("remover-foto").addEventListener("click", () => {
    fotoNova = null;
    removerFoto = true;
    mostrarFoto(null);
  });
  $("excluir-produto").addEventListener("click", confirmarExclusao);
}

export function produtosCarregados() {
  return carregado;
}
