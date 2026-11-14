// Tela do Estoque de filamentos: rolos (marca, material, cor, peso, preço do rolo), quanto resta,
// rolos fechados iguais, as posições da impressora, pesar na balança e abrir rolo novo.
// Também é a fonte dos rolos para a Calculadora, Minhas Impressões e o aviso ao abrir no fatiador.
import modeloFilamento from "../core/filamento.cjs";
import modeloImpressao from "../core/impressao.cjs";
import { confirmar, estado, mostrarAviso, registrarAoAbrir, salvarConfig } from "./shell.js";
import { el } from "./util-tela.js";

const { CARRETEL_PADRAO_G, MARCAS, MATERIAIS, acabando, gramasEmEstoque, planejarDesconto, precoKgCentavos, valorEmEstoqueCentavos } = modeloFilamento;
const { CORES } = modeloImpressao;
const $ = (id) => document.getElementById(id);

let rolos = [];
let editandoId = null;
let corEscolhida = null;
let filtro = "todos";
let pesandoId = null;
let posicaoEscolhendo = null;
let menuAberto = null;

export const reaisDeCentavos = (c) => (Number(c) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const gramas = (g) => `${Math.round(g).toLocaleString("pt-BR")} g`;
const kg = (g) => `${(g / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
const corDe = (id) => CORES.find((c) => c.id === id) ?? { id, nome: id, hex: "" };
export const nomeDoRolo = (f) => `${corDe(f.cor).nome} ${f.material} · ${f.marca}`;
export const precoKgDoRolo = (f) => Number(precoKgCentavos(f)) / 100;
const posicoes = () => estado.config.estoque?.posicoes ?? 4;

export function listaDeRolos() {
  return rolos;
}

export async function carregarFilamentos() {
  const resposta = await window.dados.filamentos.listar();
  if (!resposta.ok) {
    if ($("fe-erro")) $("fe-erro").textContent = resposta.erro;
    return rolos;
  }
  if ($("fe-erro")) $("fe-erro").textContent = "";
  rolos = resposta.dados;
  renderizar();
  return rolos;
}

export async function descontarDoRolo(id, g) {
  const r = await window.dados.filamentos.descontar(id, g);
  if (!r.ok) mostrarAviso(r.erro);
  await carregarFilamentos();
  return r.ok;
}

// Bolinha da cor (transparente com xadrez).
function bolinha(cor, classe = "fe-bolinha") {
  const b = el("span", `${classe}${cor.hex ? "" : " transparente"}`);
  if (cor.hex) b.style.setProperty("--cor", cor.hex);
  return b;
}

// ---------- Lista ----------
function renderizar() {
  if (!$("tela-filamentos")) return;
  const total = rolos.reduce((s, f) => s + gramasEmEstoque(f), 0);
  const valor = rolos.reduce((s, f) => s + valorEmEstoqueCentavos(f), 0n);
  const qtd = rolos.reduce((s, f) => s + 1 + f.fechados, 0);
  $("fe-resumo").textContent = rolos.length ? `${qtd} ${qtd === 1 ? "rolo" : "rolos"} · ${kg(total)} · ${reaisDeCentavos(valor)} em estoque` : "Cadastre seus rolos para saber quanto filamento você tem.";
  mostrarPosicoes();

  // filtros por material (só os que existem)
  const materiais = MATERIAIS.filter((m) => rolos.some((f) => f.material === m));
  if (filtro !== "todos" && !materiais.includes(filtro)) filtro = "todos";
  $("fe-filtros").hidden = materiais.length < 2;
  $("fe-filtros").replaceChildren(
    ...["todos", ...materiais].map((m) => {
      const b = el("button", "fe-filtro", m === "todos" ? "Todos" : m);
      b.type = "button";
      b.setAttribute("aria-pressed", String(filtro === m));
      b.addEventListener("click", () => {
        filtro = m;
        renderizar();
      });
      return b;
    }),
  );

  const lista = rolos
    .filter((f) => filtro === "todos" || f.material === filtro)
    .sort((a, b) => acabando(b) - acabando(a) || a.material.localeCompare(b.material) || corDe(a.cor).nome.localeCompare(corDe(b.cor).nome, "pt-BR"));
  $("fe-vazio").hidden = rolos.length > 0;
  $("fe-grade").replaceChildren(...lista.map(cartao));
}

function cartao(f) {
  const cor = corDe(f.cor);
  const card = el("article", `fe-card${acabando(f) ? " acabando" : ""}`);
  const cabeca = el("div", "fe-cabeca");
  const titulo = el("div", "fe-titulo");
  titulo.append(el("strong", "", cor.nome), el("span", "", `${f.material} · ${f.marca}`));
  const mais = el("button", "produto-mais");
  mais.type = "button";
  mais.setAttribute("aria-label", `Opções do rolo ${cor.nome}`);
  mais.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  mais.addEventListener("click", (ev) => {
    ev.stopPropagation();
    abrirMenu(f, mais);
  });
  cabeca.append(bolinha(cor, "fe-bolinha grande"), titulo, mais);

  const fracao = f.pesoTotalG ? f.restanteG / f.pesoTotalG : 0;
  const trilho = el("div", "fe-trilho");
  const barra = el("div", "fe-barra");
  barra.style.width = `${Math.max(0, Math.min(100, fracao * 100))}%`;
  trilho.append(barra);
  const numeros = el("div", "fe-numeros");
  numeros.append(el("span", "", `${gramas(f.restanteG)} de ${gramas(f.pesoTotalG)}`), el("span", "fe-preco", `${reaisDeCentavos(f.precoCentavos)} o rolo`));

  const selos = el("div", "fe-selos");
  if (acabando(f)) selos.append(el("span", "fe-selo alerta", "Acabando"));
  if (f.posicao !== null) selos.append(el("span", "fe-selo", posicoes() === 1 ? "Na impressora" : `Na impressora · ${f.posicao}`));
  if (f.fechados) selos.append(el("span", "fe-selo", `+${f.fechados} ${f.fechados === 1 ? "fechado" : "fechados"}`));

  card.append(cabeca, trilho, numeros);
  if (selos.childElementCount) card.append(selos);
  card.addEventListener("click", () => abrirEditor(f));
  return card;
}

function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
}

function abrirMenu(f, botao) {
  const mesmo = menuAberto?.dataset.id === f.id;
  fecharMenu();
  if (mesmo) return;
  const menu = el("div", "menu-produto");
  menu.dataset.id = f.id;
  menu.setAttribute("role", "menu");
  const itens = [
    ["Editar", () => abrirEditor(f)],
    ["Pesar na balança", () => abrirPesar(f)],
    ...(f.fechados ? [["Abrir rolo novo", () => abrirRoloNovo(f)]] : []),
    ["Tenho mais um igual", () => mudarFechados(f, 1)],
    ...(f.fechados ? [["Tirar um fechado", () => mudarFechados(f, -1)]] : []),
    ["Excluir", () => excluir(f), "perigo"],
  ];
  for (const [texto, acao, classe] of itens) {
    const b = el("button", classe ?? "", texto);
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      fecharMenu();
      acao();
    });
    menu.append(b);
  }
  botao.after(menu);
  menuAberto = menu;
  menu.querySelector("button").focus();
}

async function abrirRoloNovo(f) {
  const r = await window.dados.filamentos.abrirRoloNovo(f.id);
  if (!r.ok) return mostrarAviso(r.erro);
  mostrarAviso(`Rolo novo aberto: ${corDe(f.cor).nome} ${f.material} cheio (${gramas(f.pesoTotalG)}).`);
  await carregarFilamentos();
}

async function mudarFechados(f, delta) {
  const r = await window.dados.filamentos.salvar(valoresDe(f, { fechados: f.fechados + delta }), f.id);
  if (!r.ok) return mostrarAviso(r.erro);
  await carregarFilamentos();
}

async function excluir(f) {
  const ok = await confirmar({ titulo: "Excluir este rolo?", texto: `${nomeDoRolo(f)} sai do estoque.`, botao: "Excluir" });
  if (!ok) return;
  const r = await window.dados.filamentos.excluir(f.id);
  if (!r.ok) return mostrarAviso(r.erro);
  await carregarFilamentos();
}

// valores no formato da tela a partir do rolo gravado (para salvar mudanças pequenas)
const valoresDe = (f, mudancas = {}) => ({
  marca: f.marca,
  material: f.material,
  cor: f.cor,
  peso: String(f.pesoTotalG),
  preco: (Number(f.precoCentavos) / 100).toFixed(2),
  restante: String(f.restanteG),
  fechados: f.fechados,
  posicao: f.posicao,
  ...mudancas,
});

// ---------- Posições da impressora ----------
function mostrarPosicoes() {
  const n = posicoes();
  for (const b of document.querySelectorAll("[data-fe-posicoes]")) b.setAttribute("aria-pressed", String(Number(b.dataset.fePosicoes) === n));
  $("fe-posicoes").replaceChildren(
    ...Array.from({ length: n }, (_, i) => {
      const p = i + 1;
      const f = rolos.find((r) => r.posicao === p);
      const b = el("button", `fe-posicao${f ? "" : " vazia"}`);
      b.type = "button";
      if (n > 1) b.append(el("span", "fe-posicao-num", String(p)));
      if (f) {
        const cor = corDe(f.cor);
        const info = el("span", "fe-posicao-info");
        info.append(el("strong", "", `${cor.nome} ${f.material}`), el("span", "", gramas(f.restanteG)));
        b.append(bolinha(cor), info);
      } else b.append(el("span", "fe-posicao-info", "Vazia · escolher rolo"));
      b.addEventListener("click", () => escolherPosicao(p));
      return b;
    }),
  );
}

function escolherPosicao(p) {
  posicaoEscolhendo = p;
  $("titulo-fe-posicao").textContent = posicoes() === 1 ? "Rolo na impressora" : `Rolo da posição ${p}`;
  const atual = rolos.find((r) => r.posicao === p);
  $("fe-posicao-lista").replaceChildren(
    ...rolos.map((f) => {
      const b = el("button", "fe-opcao");
      b.type = "button";
      b.setAttribute("aria-pressed", String(atual?.id === f.id));
      const info = el("span", "fe-opcao-info");
      info.append(el("strong", "", `${corDe(f.cor).nome} ${f.material}`), el("span", "", `${f.marca} · ${gramas(f.restanteG)}${f.posicao && f.posicao !== p ? ` · está na posição ${f.posicao}` : ""}`));
      b.append(bolinha(corDe(f.cor)), info);
      b.addEventListener("click", () => posicionar(f.id));
      return b;
    }),
  );
  $("fe-posicao-vazio").hidden = rolos.length > 0;
  $("fe-posicao-tirar").hidden = !atual;
  $("dialogo-fe-posicao").showModal();
}

async function posicionar(id) {
  const p = posicaoEscolhendo;
  const atual = rolos.find((r) => r.posicao === p);
  const r = id === null ? await window.dados.filamentos.posicionar(atual.id, null) : await window.dados.filamentos.posicionar(id, p);
  $("dialogo-fe-posicao").close();
  if (!r.ok) return mostrarAviso(r.erro);
  await carregarFilamentos();
}

async function mudarPosicoes(n) {
  const r = await salvarConfig({ estoque: { posicoes: n } });
  if (!r.ok) return mostrarAviso(r.erro);
  // com 1 posição, rolos que estavam nas posições 2 a 4 saem da impressora
  for (const f of rolos.filter((f) => f.posicao !== null && f.posicao > n)) await window.dados.filamentos.posicionar(f.id, null);
  await carregarFilamentos();
}

// ---------- Novo / editar ----------
function preencherSelect(select, opcoes, valor) {
  select.replaceChildren(new Option("Escolher…", ""), ...opcoes.map((o) => new Option(o, o)));
  select.value = valor ?? "";
}

function mostrarCores() {
  $("fe-cores").replaceChildren(
    ...CORES.map((c) => {
      const b = el("button", `im-cor${c.hex ? "" : " transparente"}`);
      b.type = "button";
      b.title = c.nome;
      b.setAttribute("aria-label", c.nome);
      if (c.hex) b.style.setProperty("--cor", c.hex);
      b.setAttribute("aria-pressed", String(corEscolhida === c.id));
      b.addEventListener("click", () => {
        corEscolhida = c.id;
        mostrarCores();
      });
      return b;
    }),
  );
  $("fe-cor-nome").textContent = corEscolhida ? corDe(corEscolhida).nome : "";
}

function abrirEditor(f = null) {
  fecharMenu();
  editandoId = f?.id ?? null;
  $("titulo-fe-rolo").textContent = f ? "Editar rolo" : "Novo rolo";
  preencherSelect($("fe-marca"), MARCAS, f?.marca);
  preencherSelect($("fe-material"), MATERIAIS, f?.material);
  $("fe-peso").value = f ? String(f.pesoTotalG).replace(".", ",") : "1000";
  $("fe-preco-rolo").value = f ? (Number(f.precoCentavos) / 100).toFixed(2).replace(".", ",") : "";
  corEscolhida = f?.cor ?? null;
  mostrarCores();
  $("fe-excluir").hidden = !f;
  $("erro-fe-rolo").textContent = "";
  $("dialogo-fe-rolo").showModal();
}

async function salvarRolo() {
  const f = rolos.find((r) => r.id === editandoId);
  const valores = {
    marca: $("fe-marca").value,
    material: $("fe-material").value,
    cor: corEscolhida,
    peso: $("fe-peso").value,
    preco: $("fe-preco-rolo").value,
  };
  // ao mudar o peso do rolo, o que resta acompanha (rolo cheio continua cheio)
  if (f) {
    const novoPeso = Number(String(valores.peso).replace(",", "."));
    valores.restante = String(f.restanteG >= f.pesoTotalG && novoPeso > 0 ? novoPeso : Math.min(f.restanteG, novoPeso || f.restanteG));
  }
  const r = await window.dados.filamentos.salvar(valores, editandoId ?? undefined);
  if (!r.ok) {
    $("erro-fe-rolo").textContent = r.erro;
    return;
  }
  $("dialogo-fe-rolo").close();
  mostrarAviso(f ? "Rolo atualizado." : "Rolo cadastrado.");
  await carregarFilamentos();
}

// ---------- Pesar na balança ----------
const numero = (v) => Number(String(v ?? "").trim().replace(",", "."));

function abrirPesar(f) {
  pesandoId = f.id;
  $("titulo-fe-pesar").textContent = `Pesar ${corDe(f.cor).nome} ${f.material}`;
  $("fe-balanca").value = "";
  $("fe-carretel").value = String(estado.config.estoque?.carretelG?.[f.marca] ?? CARRETEL_PADRAO_G).replace(".", ",");
  $("erro-fe-pesar").textContent = "";
  previaPesar();
  $("dialogo-fe-pesar").showModal();
  $("fe-balanca").focus();
}

function previaPesar() {
  const f = rolos.find((r) => r.id === pesandoId);
  const b = numero($("fe-balanca").value);
  const c = numero($("fe-carretel").value);
  $("fe-pesar-resultado").textContent = f && b > 0 && c >= 0 && b >= c ? `Restam ${gramas(Math.min(f.pesoTotalG, b - c))} no rolo.` : "";
}

async function confirmarPesar() {
  const f = rolos.find((r) => r.id === pesandoId);
  if (!f) return;
  const r = await window.dados.filamentos.pesar(f.id, $("fe-balanca").value, $("fe-carretel").value);
  if (!r.ok) {
    $("erro-fe-pesar").textContent = r.erro;
    return;
  }
  // o carretel vazio fica guardado para a marca
  const carretel = numero($("fe-carretel").value);
  if (carretel >= 0 && carretel !== estado.config.estoque?.carretelG?.[f.marca]) await salvarConfig({ estoque: { carretelG: { [f.marca]: carretel } } });
  $("dialogo-fe-pesar").close();
  mostrarAviso(`Atualizado: restam ${gramas(r.dados.restanteG)} no ${corDe(f.cor).nome} ${f.material}.`);
  await carregarFilamentos();
}

// ---------- Desconto de uma impressão (Minhas Impressões) ----------
// usos: [{ cor, material?, gramas } | { posicao, gramas }]. Desconta e mostra o aviso com "Desfazer".
export async function descontarImpressao(usos) {
  await carregarFilamentos();
  if (!rolos.length) return null;
  const { itens, semRolo } = planejarDesconto(rolos, usos);
  if (!itens.length) {
    if (semRolo.length) mostrarAviso(`Nenhum rolo ${[...new Set(semRolo.map((u) => (u.cor ? corDe(u.cor).nome : "na impressora")))].join(", ")} no estoque para descontar.`, { duracao: 6000 });
    return null;
  }
  const r = await window.dados.filamentos.descontarVarios(itens);
  if (!r.ok) {
    mostrarAviso(r.erro);
    return null;
  }
  const partes = itens.map((i) => {
    const f = rolos.find((x) => x.id === i.id);
    return `${i.gramas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g do ${corDe(f.cor).nome} ${f.material}`;
  });
  const falta = semRolo.length ? ` Sem rolo ${[...new Set(semRolo.map((u) => (u.cor ? corDe(u.cor).nome : "na impressora")))].join(", ")}.` : "";
  await carregarFilamentos();
  mostrarAviso(`Descontei ${partes.join(" e ")}.${falta}`, {
    duracao: 9000,
    acao: {
      rotulo: "Desfazer",
      aoClicar: async () => {
        const volta = await window.dados.filamentos.descontarVarios(itens.map((i) => ({ id: i.id, gramas: -i.gramas })));
        mostrarAviso(volta.ok ? "Desconto desfeito." : volta.erro);
        await carregarFilamentos();
      },
    },
  });
  return itens;
}

// Quanto do estoque há de cada cor (gramas), para o aviso ao abrir no fatiador.
export async function estoquePorCor(material = null) {
  await carregarFilamentos();
  if (!rolos.length) return null;
  const mapa = new Map();
  for (const f of rolos) {
    if (material && f.material !== material) continue;
    mapa.set(f.cor, (mapa.get(f.cor) ?? 0) + gramasEmEstoque(f));
  }
  return mapa;
}

export function iniciarFilamentos() {
  $("fe-novo").addEventListener("click", () => abrirEditor());
  $("fe-salvar").addEventListener("click", salvarRolo);
  $("fe-cancelar").addEventListener("click", () => $("dialogo-fe-rolo").close());
  $("fe-excluir").addEventListener("click", () => {
    const f = rolos.find((r) => r.id === editandoId);
    $("dialogo-fe-rolo").close();
    if (f) excluir(f);
  });
  $("fe-pesar-salvar").addEventListener("click", confirmarPesar);
  $("fe-pesar-cancelar").addEventListener("click", () => $("dialogo-fe-pesar").close());
  for (const id of ["fe-balanca", "fe-carretel"]) $(id).addEventListener("input", previaPesar);
  $("fe-balanca").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") confirmarPesar();
  });
  $("fe-posicao-tirar").addEventListener("click", () => posicionar(null));
  $("fe-posicao-fechar").addEventListener("click", () => $("dialogo-fe-posicao").close());
  for (const b of document.querySelectorAll("[data-fe-posicoes]")) b.addEventListener("click", () => mudarPosicoes(Number(b.dataset.fePosicoes)));
  document.addEventListener("click", (ev) => {
    if (menuAberto && !menuAberto.contains(ev.target)) fecharMenu();
  });
  // acesso para os roteiros do modo de captura
  window.__estoqueTeste = { descontarImpressao };
  registrarAoAbrir("filamentos", carregarFilamentos);
  carregarFilamentos();
}
