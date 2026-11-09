// Tela do Caçador de STL: busca no Printables dentro do programa, os outros sites no navegador,
// e favoritos locais.
import modeloStl from "../core/stl.cjs";
import { normalizar } from "../core/inicio.js";
import { confirmar, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const { PRECOS, SITES, detectarSite, sugerirTitulo, urlBusca } = modeloStl;
const $ = (id) => document.getElementById(id);

const NOME_SITE = Object.fromEntries([...SITES.map((s) => [s.id, s.nome]), ["outro", "Outro site"]]);
const ROTULO_PRECO = { gratuito: "Gratuito", pago: "Pago", desconhecido: "Preço não informado" };
const CHAVE_SITES = "stl-sites-escolhidos";

let favoritos = [];
let editandoId = null;

// ---------- Busca ----------
function sitesEscolhidos() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_SITES) ?? "null");
    if (Array.isArray(salvo) && salvo.length) return new Set(salvo);
  } catch {
    // sem armazenamento: usa todos
  }
  return new Set(SITES.map((s) => s.id));
}

function guardarSites() {
  const ids = [...document.querySelectorAll(".stl-site input:checked")].map((i) => i.value);
  try {
    localStorage.setItem(CHAVE_SITES, JSON.stringify(ids));
  } catch {
    // tudo bem: só não lembra na próxima vez
  }
}

function montarSites() {
  const escolhidos = sitesEscolhidos();
  $("stl-sites").replaceChildren(
    ...SITES.map((s) => {
      const rotulo = el("label", "stl-site");
      const caixa = el("input");
      caixa.type = "checkbox";
      caixa.value = s.id;
      caixa.checked = escolhidos.has(s.id);
      caixa.addEventListener("change", guardarSites);
      rotulo.append(caixa, document.createTextNode(s.nome));
      return rotulo;
    }),
  );
}

// Printables: resultados dentro do programa. Os outros sites viram botões que abrem no navegador.
const busca = { termo: "", pagina: 0, carregando: false };

function botaoExterno(id, termo) {
  const b = el("button", "botao-secundario pequeno", `${NOME_SITE[id]} ↗`);
  b.type = "button";
  b.title = "Abre a busca no navegador";
  b.addEventListener("click", () => window.open(urlBusca(id, termo)));
  return b;
}

function cartaoResultado(item) {
  const cartao = el("div", "stl-resultado");
  const foto = el("div", "stl-foto");
  if (item.imagem) {
    window.stl.miniatura(item.imagem).then((r) => {
      if (!r.ok) return;
      const img = el("img");
      img.src = r.dados;
      img.alt = "";
      foto.append(img);
    });
  }
  const corpo = el("div", "stl-resultado-corpo");
  corpo.append(el("strong", "stl-resultado-titulo", item.titulo));
  if (item.autor) corpo.append(el("span", "cliente-sub", `por ${item.autor}`));
  const meta = el("span", "stl-fav-meta");
  meta.append(el("span", `stl-preco ${item.preco}`, ROTULO_PRECO[item.preco]));
  if (item.curtidas !== null) meta.append(el("span", "stl-chip-site", `♥ ${item.curtidas}`));
  if (item.downloads !== null) meta.append(el("span", "stl-chip-site", `↓ ${item.downloads}`));
  corpo.append(meta);

  const acoes = el("div", "stl-resultado-acoes");
  const abrir = el("button", "botao-secundario pequeno", "Abrir");
  abrir.type = "button";
  abrir.addEventListener("click", () => window.open(item.url));
  const salvar = el("button", "botao-texto pequeno", "☆ Favoritar");
  salvar.type = "button";
  const jaSalvo = () => favoritos.some((f) => f.url === item.url);
  const marcar = () => {
    salvar.textContent = "★ Nos favoritos";
    salvar.disabled = true;
  };
  if (jaSalvo()) marcar();
  salvar.addEventListener("click", async () => {
    const r = await window.dados.favoritos.salvar({ url: item.url, titulo: item.titulo, preco: item.preco, observacoes: item.autor ? `Printables · ${item.autor}` : "Printables" }, null);
    if (!r.ok) {
      mostrarAviso(r.erro);
      return;
    }
    marcar();
    mostrarAviso("Favorito salvo.");
    await carregarFavoritos();
  });
  acoes.append(abrir, salvar);
  corpo.append(acoes);
  cartao.append(foto, corpo);
  return cartao;
}

async function carregarPagina() {
  if (busca.carregando) return;
  busca.carregando = true;
  const proxima = busca.pagina + 1;
  $("stl-mais").hidden = true;
  $("stl-buscar").disabled = true;
  $("stl-estado").textContent = proxima === 1 ? "Buscando no Printables…" : "Carregando mais…";
  const termo = busca.termo;
  const r = await window.stl.printables(termo, proxima);
  busca.carregando = false;
  $("stl-buscar").disabled = false;
  if (termo !== busca.termo) return; // chegou depois de uma busca nova
  if (!r.ok) {
    $("stl-estado").replaceChildren(document.createTextNode(`${r.erro} `), botaoExterno("printables", termo));
    return;
  }
  busca.pagina = proxima;
  $("stl-total").textContent = r.dados.total ? `(${r.dados.total.toLocaleString("pt-BR")})` : "";
  $("stl-estado").textContent = r.dados.total === 0 ? "Nenhum modelo encontrado. Tente outras palavras, de preferência em inglês." : "";
  $("stl-resultados").append(...r.dados.itens.map(cartaoResultado));
  $("stl-mais").hidden = !r.dados.temMais;
}

function buscar(ev) {
  ev.preventDefault();
  const termo = $("stl-termo").value.trim();
  if (!termo) {
    $("stl-termo").focus();
    return;
  }
  const ids = [...document.querySelectorAll(".stl-site input:checked")].map((i) => i.value);
  if (ids.length === 0) {
    mostrarAviso("Escolha pelo menos um site.");
    return;
  }
  const externos = ids.filter((id) => id !== "printables");
  $("stl-externos").hidden = externos.length === 0;
  $("stl-externos").replaceChildren(
    ...(externos.length ? [el("span", "ajuda", "Ver também no navegador:"), ...externos.map((id) => botaoExterno(id, termo))] : []),
  );
  $("stl-resultados-painel").hidden = false;
  $("stl-resultados").replaceChildren();
  $("stl-total").textContent = "";
  $("stl-mais").hidden = true;
  busca.termo = termo;
  busca.pagina = 0;
  busca.carregando = false;
  if (ids.includes("printables")) {
    carregarPagina();
  } else {
    $("stl-estado").textContent = "Marque o Printables para ver resultados aqui. Os outros sites abrem pelos botões acima.";
  }
}

// ---------- Favoritos ----------
function cartaoFavorito(f) {
  const linha = el("div", "stl-favorito");
  const info = el("button", "stl-fav-info");
  info.type = "button";
  info.setAttribute("aria-label", `Editar ${f.titulo}`);
  info.append(el("strong", "", f.titulo));
  const meta = el("span", "stl-fav-meta");
  meta.append(el("span", `stl-chip-site ${f.site}`, NOME_SITE[f.site] ?? f.site), el("span", `stl-preco ${f.preco}`, ROTULO_PRECO[f.preco]));
  info.append(meta);
  if (f.observacoes) info.append(el("span", "cliente-sub", f.observacoes));
  info.addEventListener("click", () => abrirEditor(f));

  const abrir = el("button", "botao-secundario pequeno", "Abrir");
  abrir.type = "button";
  abrir.addEventListener("click", () => window.open(f.url));
  linha.append(info, abrir);
  return linha;
}

function renderizarFavoritos() {
  const palavras = normalizar($("stl-busca-fav").value).split(/\s+/).filter(Boolean);
  const site = $("stl-filtro-site").value;
  const filtrados = favoritos.filter((f) => {
    if (site && f.site !== site) return false;
    const texto = normalizar(`${f.titulo} ${f.observacoes} ${NOME_SITE[f.site] ?? ""}`);
    return palavras.every((p) => texto.includes(p));
  });
  $("stl-favoritos").replaceChildren(...filtrados.map(cartaoFavorito));
  $("stl-vazio-fav").hidden = favoritos.length > 0;
  $("stl-sem-resultado").hidden = favoritos.length === 0 || filtrados.length > 0;
  $("stl-contagem").textContent = favoritos.length ? `(${favoritos.length})` : "";
}

async function carregarFavoritos() {
  const resposta = await window.dados.favoritos.listar();
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  favoritos = resposta.dados;
  renderizarFavoritos();
}

function preencherSugestao() {
  const url = $("fav-url").value.trim();
  const site = detectarSite(url);
  $("fav-site").textContent = url ? `Site: ${NOME_SITE[site]}` : "";
  if (!$("fav-titulo").value.trim()) $("fav-titulo").placeholder = sugerirTitulo(url) || "Nome do modelo";
}

function abrirEditor(f, urlInicial = "") {
  editandoId = f?.id ?? null;
  $("titulo-dialogo-fav").textContent = f ? "Editar favorito" : "Novo favorito";
  $("fav-url").value = f?.url ?? urlInicial;
  $("fav-titulo").value = f?.titulo ?? "";
  $("fav-preco").value = f?.preco ?? "desconhecido";
  $("fav-obs").value = f?.observacoes ?? "";
  $("erro-fav").textContent = "";
  $("excluir-fav").hidden = !f;
  preencherSugestao();
  $("dialogo-favorito").showModal();
  (f ? $("fav-titulo") : $("fav-url")).focus();
}

async function salvarFavorito(ev) {
  ev.preventDefault();
  const resposta = await window.dados.favoritos.salvar(
    { url: $("fav-url").value, titulo: $("fav-titulo").value, preco: $("fav-preco").value, observacoes: $("fav-obs").value },
    editandoId,
  );
  if (!resposta.ok) {
    $("erro-fav").textContent = resposta.erro;
    return;
  }
  $("dialogo-favorito").close();
  mostrarAviso(editandoId ? "Favorito atualizado." : "Favorito salvo.");
  await carregarFavoritos();
}

async function excluirFavorito() {
  const f = favoritos.find((x) => x.id === editandoId);
  if (!f) return;
  const ok = await confirmar({ titulo: "Excluir favorito?", texto: `"${f.titulo}" sai dos seus favoritos.`, botao: "Excluir" });
  if (!ok) return;
  const resposta = await window.dados.favoritos.excluir(editandoId);
  if (!resposta.ok) {
    $("erro-fav").textContent = resposta.erro;
    return;
  }
  $("dialogo-favorito").close();
  mostrarAviso("Favorito excluído.");
  await carregarFavoritos();
}

export function iniciarStl() {
  montarSites();
  $("stl-form-busca").addEventListener("submit", buscar);
  $("stl-mais").addEventListener("click", carregarPagina);
  $("stl-filtro-site").replaceChildren(
    new Option("Todos os sites", ""),
    ...[...SITES, { id: "outro", nome: "Outro site" }].map((s) => new Option(s.nome, s.id)),
  );
  $("fav-preco").replaceChildren(...PRECOS.map((p) => new Option(ROTULO_PRECO[p], p)));
  $("stl-busca-fav").addEventListener("input", renderizarFavoritos);
  $("stl-filtro-site").addEventListener("change", renderizarFavoritos);
  $("stl-novo-fav").addEventListener("click", () => abrirEditor());
  $("form-favorito").addEventListener("submit", salvarFavorito);
  $("fav-url").addEventListener("input", preencherSugestao);
  $("fechar-fav").addEventListener("click", () => $("dialogo-favorito").close());
  $("cancelar-fav").addEventListener("click", () => $("dialogo-favorito").close());
  $("excluir-fav").addEventListener("click", excluirFavorito);
  registrarAoAbrir("stl", carregarFavoritos);
}
