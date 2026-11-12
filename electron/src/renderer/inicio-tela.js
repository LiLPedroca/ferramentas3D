// Tela inicial (cards dos grupos com foto e busca) e a página de cada grupo.
import { DESTAQUES, FERRAMENTAS } from "../core/ferramentas.js";
import { boasVindas, filtrarFerramentas } from "../core/inicio.js";
import { icone } from "./icones.js";
import { aoMudarConfig, grupos, irPara, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// Card de ferramenta (usado na busca e nas páginas de grupo).
export function cartaoFerramenta(f) {
  const cartao = el("button", "cartao-ferramenta");
  cartao.type = "button";
  cartao.setAttribute("aria-label", `Abrir ${f.titulo}`);
  const iconeEl = el("span", "ferramenta-icone");
  iconeEl.innerHTML = icone(f.id, 22);
  const seta = el("span", "ferramenta-seta");
  seta.innerHTML = icone("seta", 18);
  const texto = el("span", "ferramenta-texto");
  texto.append(el("span", "ferramenta-titulo", f.titulo), el("span", "ferramenta-descricao", f.descricao));
  cartao.append(iconeEl, texto, seta);
  cartao.addEventListener("click", () => irPara(f.tela));
  return cartao;
}

// g: grupo (abre a página do grupo) ou destaque (abre a ferramenta direto).
function cartaoGrupo(g) {
  const cartao = el("button", "cartao-grupo");
  cartao.type = "button";
  cartao.setAttribute("aria-label", `${g.titulo}: ${g.descricao}`);

  const foto = el("img", "grupo-foto");
  foto.src = g.foto;
  foto.alt = "";
  foto.decoding = "async";

  const painel = el("span", "grupo-painel");
  const rodape = el("span", "grupo-rodape");
  rodape.append(el("span", "", "Explorar"));
  rodape.insertAdjacentHTML("beforeend", icone("seta", 18));
  painel.append(el("span", "grupo-nome", g.titulo), el("span", "grupo-desc", g.descricao), rodape);

  cartao.append(foto, painel);
  cartao.addEventListener("click", () => irPara(g.tela && !g.ferramentas ? g.tela : `grupo:${g.id}`));
  return cartao;
}

function renderizar() {
  const busca = $("busca").value.trim();
  const buscando = busca.length > 0;
  $("grupos").hidden = buscando;
  $("secao-busca").hidden = true;
  $("vazio").hidden = true;

  if (!buscando) {
    const lista = [...grupos(), ...DESTAQUES.filter((d) => FERRAMENTAS.some((f) => f.id === d.id && f.disponivel))];
    $("grupos").replaceChildren(...lista.map(cartaoGrupo));
    $("grupos").dataset.quantidade = String(lista.length);
    return;
  }
  const resultados = filtrarFerramentas(FERRAMENTAS, { filtro: "disponiveis", busca });
  $("resultados-busca").replaceChildren(...resultados.map(cartaoFerramenta));
  $("secao-busca").hidden = resultados.length === 0;
  $("vazio").hidden = resultados.length > 0;
}

function abrirGrupo(g) {
  const capa = $("grupo-capa");
  capa.style.backgroundImage = `url("${g.foto}")`;
  $("grupo-titulo").textContent = g.titulo;
  $("grupo-descricao").textContent = g.descricao;
  $("grupo-ferramentas").replaceChildren(...g.ferramentas.map(cartaoFerramenta));
}

export function iniciarInicio() {
  $("busca").addEventListener("input", renderizar);
  $("busca").addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      $("busca").value = "";
      renderizar();
    }
  });
  aoMudarConfig((config) => {
    $("boas-vindas").textContent = boasVindas(config.nome);
  });
  registrarAoAbrir("grupo", abrirGrupo);
  registrarAoAbrir("inicio", renderizar);
  renderizar();
}
