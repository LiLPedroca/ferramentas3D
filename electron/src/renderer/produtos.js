// Tela de Produtos: lista, busca, filtro por categoria, cadastro, edição e exclusão.
// Os dados ficam no processo principal (window.dados.produtos), que valida e grava.
import { Racional } from "../core/racional.js";
import { formatarReais } from "../core/calculadora.js";
import { normalizar } from "../core/inicio.js";
import { icone } from "./icones.js";
import { confirmar, estado, salvarConfig } from "./shell.js";
import { abrirImagem } from "./imagem-arquivo.js";

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

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// ---------- Categorias ----------
// As criadas pelo usuário (guardadas nas configurações) mais as que já estão em produtos antigos.
const criadas = () => estado.config.categorias ?? [];

function categorias() {
  const mapa = new Map();
  for (const c of criadas()) mapa.set(normalizar(c), c);
  for (const p of produtos) if (p.categoria && !mapa.has(normalizar(p.categoria))) mapa.set(normalizar(p.categoria), p.categoria);
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const emUso = (c) => produtos.filter((p) => normalizar(p.categoria) === normalizar(c)).length;

function atualizarCategorias() {
  const seletor = $("filtro-categoria");
  const atual = seletor.value;
  const lista = categorias();
  seletor.replaceChildren(new Option("Todas as categorias", ""), ...lista.map((c) => new Option(c, c)));
  seletor.value = lista.includes(atual) ? atual : "";
}

const NOVA = "__nova";

function preencherSeletorCategoria(valor) {
  const lista = categorias();
  $("p-categoria").replaceChildren(
    new Option("Sem categoria", ""),
    ...lista.map((c) => new Option(c, c)),
    new Option("+ Nova categoria…", NOVA),
  );
  const escolhida = lista.find((c) => normalizar(c) === normalizar(valor ?? ""));
  $("p-categoria").value = escolhida ?? "";
  $("p-categoria").dataset.anterior = $("p-categoria").value;
}

let aoCriarCategoria = null; // usado quando a criação veio do cadastro de produto

function renderizarCategorias() {
  const lista = categorias();
  $("lista-categorias").replaceChildren(
    ...lista.map((c) => {
      const li = el("li");
      const n = emUso(c);
      const nome = el("span", "", c);
      if (n) nome.append(" ", el("small", "", n === 1 ? "· 1 produto" : `· ${n} produtos`));
      li.append(nome);
      // Só remove categoria sem produtos: nada muda no cadastro de ninguém.
      if (!n) {
        const remover = el("button", "botao-texto perigo", "Remover");
        remover.type = "button";
        remover.addEventListener("click", () => removerCategoria(c));
        li.append(remover);
      }
      return li;
    }),
  );
  $("categorias-vazio").hidden = lista.length > 0;
}

function abrirCategorias(depois = null) {
  aoCriarCategoria = depois;
  $("nova-categoria").value = "";
  $("erro-categoria").textContent = "";
  renderizarCategorias();
  $("dialogo-categorias").showModal();
  $("nova-categoria").focus();
}

function fecharCategorias() {
  const depois = aoCriarCategoria;
  aoCriarCategoria = null;
  $("dialogo-categorias").close();
  depois?.(null);
}

async function criarCategoria(ev) {
  ev.preventDefault();
  const nome = $("nova-categoria").value.trim().replace(/\s+/g, " ");
  if (!nome) {
    $("erro-categoria").textContent = "Digite o nome da categoria.";
    return;
  }
  const existente = categorias().find((c) => normalizar(c) === normalizar(nome));
  if (!existente) {
    const resposta = await salvarConfig({ categorias: [...criadas(), nome] });
    if (!resposta.ok) {
      $("erro-categoria").textContent = resposta.erro;
      return;
    }
  }
  const final = existente ?? nome;
  atualizarCategorias();
  avisar(existente ? `A categoria "${final}" já existe.` : `Categoria "${final}" criada.`);
  if (aoCriarCategoria) {
    const depois = aoCriarCategoria;
    aoCriarCategoria = null;
    $("dialogo-categorias").close();
    depois(final);
    return;
  }
  $("nova-categoria").value = "";
  $("erro-categoria").textContent = "";
  renderizarCategorias();
}

async function removerCategoria(c) {
  const resposta = await salvarConfig({ categorias: criadas().filter((x) => normalizar(x) !== normalizar(c)) });
  if (!resposta.ok) {
    $("erro-categoria").textContent = resposta.erro;
    return;
  }
  atualizarCategorias();
  renderizarCategorias();
}

// ---------- Lista ----------
const lucroDe = (p) => (p.custo ? BigInt(p.precoCentavos) - BigInt(p.custo.custoUnitarioCentavos) : null);

// Preferências da tela (só deste computador).
function lerPreferencia(chave, padrao) {
  try {
    return localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao;
  }
}
function gravarPreferencia(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento: vale só nesta abertura
  }
}

// Menu "⋯" do cartão: um só, reaproveitado.
let menuAberto = null;
function fecharMenuProduto() {
  menuAberto?.remove();
  menuAberto = null;
}

function abrirMenuProduto(p, botao) {
  const mesmo = menuAberto?.dataset.id === p.id;
  fecharMenuProduto();
  if (mesmo) return;
  const menu = el("div", "menu-produto");
  menu.dataset.id = p.id;
  menu.setAttribute("role", "menu");
  for (const [texto, acao, classe] of [
    ["Editar", () => abrirEditor(p), ""],
    ["Duplicar", () => duplicar(p), ""],
    ["Excluir", () => excluirDaLista(p), "perigo"],
  ]) {
    const b = el("button", classe, texto);
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      fecharMenuProduto();
      acao();
    });
    menu.append(b);
  }
  botao.after(menu);
  menuAberto = menu;
  menu.querySelector("button").focus();
}

async function duplicar(p) {
  const valores = {
    nome: `${p.nome} (cópia)`.slice(0, 120),
    categoria: p.categoria ?? "",
    preco: reais(p.precoCentavos).replace("R$", "").trim(),
    pesoG: medida(p.pesoG),
    alturaMm: medida(p.alturaMm),
    larguraMm: medida(p.larguraMm),
    comprimentoMm: medida(p.comprimentoMm),
    observacoes: p.observacoes ?? "",
  };
  if (p.foto) valores.foto = p.foto;
  if (p.custo) valores.custo = p.custo;
  const resposta = await window.dados.produtos.salvar(valores);
  if (!resposta.ok) {
    $("erro-produtos").textContent = resposta.erro;
    return;
  }
  avisar(`"${valores.nome}" criado.`);
  await carregarProdutos();
}

async function excluirDaLista(p) {
  const ok = await confirmar({
    titulo: "Excluir produto?",
    texto: `"${p.nome}" será excluído. Essa ação não pode ser desfeita.`,
    botao: "Excluir",
  });
  if (!ok) return;
  const resposta = await window.dados.produtos.excluir(p.id);
  if (!resposta.ok) {
    $("erro-produtos").textContent = resposta.erro;
    return;
  }
  avisar("Produto excluído.");
  await carregarProdutos();
}

function valorCartao(rotulo, valor, classe) {
  const caixa = el("div", `produto-valor ${classe}`);
  caixa.append(el("span", "", rotulo), el("strong", "", valor));
  return caixa;
}

function cartaoProduto(p) {
  const cartao = el("article", "cartao-produto");
  cartao.tabIndex = 0;
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
  const nome = el("div", "produto-nome");
  nome.append(el("h3", "", p.nome));
  const etiquetas = el("div", "produto-etiquetas");
  if (p.categoria) {
    const cat = el("span", "produto-categoria");
    cat.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>';
    cat.append(p.categoria);
    etiquetas.append(cat);
  }
  if (p.teste) etiquetas.append(el("span", "chip chip-teste", "Teste"));
  if (etiquetas.childElementCount) nome.append(etiquetas);
  const mais = el("button", "produto-mais");
  mais.type = "button";
  mais.setAttribute("aria-label", `Opções de ${p.nome}`);
  mais.setAttribute("aria-haspopup", "menu");
  mais.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  mais.addEventListener("click", (ev) => {
    ev.stopPropagation();
    abrirMenuProduto(p, mais);
  });
  cabeca.append(nome, mais);

  const valores = el("div", "produto-valores");
  valores.append(valorCartao("Venda", reais(p.precoCentavos), "pv-venda"));
  const lucro = lucroDe(p);
  if (lucro !== null) valores.append(valorCartao("Lucro", reais(lucro.toString()), lucro >= 0n ? "pv-lucro" : "pv-lucro negativo"));
  info.append(cabeca, valores);
  info.append(el("p", "produto-custo", p.custo ? `Custo ${reais(p.custo.custoUnitarioCentavos)}` : "Custo não calculado"));

  cartao.append(foto, info);
  cartao.addEventListener("click", () => abrirEditor(p));
  cartao.addEventListener("keydown", (ev) => {
    if (ev.target === cartao && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      abrirEditor(p);
    }
  });
  return cartao;
}

const ORDENS = {
  recentes: (a, b) => String(b.atualizadoEm ?? "").localeCompare(String(a.atualizadoEm ?? "")),
  nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
  preco: (a, b) => Number(BigInt(b.precoCentavos) - BigInt(a.precoCentavos)),
  lucro: (a, b) => {
    const la = lucroDe(a);
    const lb = lucroDe(b);
    if (la === null || lb === null) return (la === null) - (lb === null);
    return lb > la ? 1 : lb < la ? -1 : 0;
  },
};

function mudarVista(vista) {
  gravarPreferencia("produtos-vista", vista);
  $("grade-produtos").classList.toggle("lista", vista === "lista");
  for (const b of document.querySelectorAll(".vista-botao")) b.setAttribute("aria-pressed", String(b.dataset.vista === vista));
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

  filtrados.sort(ORDENS[$("ordem-produtos").value] ?? ORDENS.recentes);
  fecharMenuProduto();
  $("grade-produtos").replaceChildren(...filtrados.map(cartaoProduto));
  $("vazio-produtos").hidden = produtos.length > 0;
  $("sem-resultado-produtos").hidden = produtos.length === 0 || filtrados.length > 0;
  $("produtos-resumo").textContent =
    produtos.length === 1 ? "1 produto cadastrado" : `${produtos.length} produtos cadastrados`;
  $("produtos-mostrando").hidden = produtos.length === 0;
  $("produtos-mostrando").textContent = `Mostrando ${filtrados.length} de ${produtos.length} ${produtos.length === 1 ? "produto" : "produtos"}`;
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
  preencherSeletorCategoria(p?.categoria ?? "");
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
  const imagem = await abrirImagem(arquivo);
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
  $("ordem-produtos").value = lerPreferencia("produtos-ordem", "recentes");
  if (!$("ordem-produtos").value) $("ordem-produtos").value = "recentes";
  $("ordem-produtos").addEventListener("change", () => {
    gravarPreferencia("produtos-ordem", $("ordem-produtos").value);
    renderizar();
  });
  mudarVista(lerPreferencia("produtos-vista", "grade") === "lista" ? "lista" : "grade");
  for (const b of document.querySelectorAll(".vista-botao")) b.addEventListener("click", () => mudarVista(b.dataset.vista));
  document.addEventListener("click", (ev) => {
    if (menuAberto && !menuAberto.contains(ev.target)) fecharMenuProduto();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && menuAberto) fecharMenuProduto();
  });
  $("gerenciar-categorias").addEventListener("click", () => abrirCategorias());
  $("form-categoria").addEventListener("submit", criarCategoria);
  $("fechar-categorias").addEventListener("click", fecharCategorias);
  $("dialogo-categorias").addEventListener("cancel", (ev) => {
    ev.preventDefault();
    fecharCategorias();
  });
  $("p-categoria").addEventListener("change", () => {
    const seletor = $("p-categoria");
    if (seletor.value !== NOVA) {
      seletor.dataset.anterior = seletor.value;
      return;
    }
    abrirCategorias((criada) => preencherSeletorCategoria(criada ?? seletor.dataset.anterior));
  });

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
