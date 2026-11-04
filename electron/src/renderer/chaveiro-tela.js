// Tela do Chaveiro de nome: opções à esquerda, prévia 2D (argola arrastável) ou 3D à direita.
import { abrirNoFatiador } from "./fatiador-ui.js";
import { gerarChaveiro, LIMITES_CHAVEIRO, MODELOS_PRONTOS, PADRAO_CHAVEIRO } from "./modelos/chaveiro.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { CATEGORIAS_FONTES, carregarFonte, familiaCss, FONTES } from "./modelos/fontes.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { carregarManifold, maisPertoNoLaco, pontoNoLaco } from "./modelos/manifold.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);

export const PALETA = [
  ["#2563eb", "Azul"],
  ["#dc2626", "Vermelho"],
  ["#facc15", "Amarelo"],
  ["#f472b6", "Rosa"],
  ["#7e22ce", "Roxo"],
  ["#15803d", "Verde"],
  ["#f59e0b", "Laranja"],
  ["#ffffff", "Branco"],
  ["#111111", "Preto"],
  ["#8a8f98", "Cinza"],
  ["#8b4513", "Marrom"],
];

// campos de medida: id do campo → chave nas opções
const MEDIDAS = { "ch-largura": "largura", "ch-borda": "borda", "ch-base": "base", "ch-relevo": "relevo", "ch-furo": "furo", "ch-parede": "parede" };

let opcoes = { ...PADRAO_CHAVEIRO };
let unidade = "mm";
let modelo = null; // última peça gerada com sucesso
let partes = null; // partes prontas para exportar
let historico = [];
let posicao = -1;
let modo = "2d";
let previa3d = null;
let temporizador = null;
let geracao = 0;
let arrasto = null; // { t, centro } enquanto a argola é arrastada
const vista = { zoom: 1 };

const fator = () => (unidade === "cm" ? 10 : 1);
const formatar = (mm, casas = 2) => (mm / fator()).toLocaleString("pt-BR", { maximumFractionDigits: casas });
const status = (texto, erro = false) => {
  $("ch-status").textContent = texto;
  $("ch-status").classList.toggle("erro", erro);
};

// ---------- Campos ----------
function preencherCampos() {
  $("ch-texto").value = opcoes.texto;
  for (const [id, chave] of Object.entries(MEDIDAS)) $(id).value = formatar(opcoes[chave], 3);
  $("ch-unidade").value = unidade;
  for (const em of document.querySelectorAll("#tela-chaveiro [data-unidade]")) em.textContent = unidade;
  const fonte = FONTES.find((f) => f.id === opcoes.fonte);
  $("ch-fonte").textContent = fonte?.nome ?? opcoes.fonte;
  $("ch-fonte").style.fontFamily = familiaCss(opcoes.fonte);
  $("ch-fonte-amostra").style.fontFamily = familiaCss(opcoes.fonte);
  for (const b of document.querySelectorAll("#tela-chaveiro [data-estilo]")) b.setAttribute("aria-pressed", String(b.dataset.estilo === opcoes.estilo));
  marcarPaleta("ch-paleta-base", opcoes.corBase);
  marcarPaleta("ch-paleta-texto", opcoes.corTexto);
  const pronto = Object.entries(MODELOS_PRONTOS).find(([, p]) => p.borda === opcoes.borda && p.base === opcoes.base && p.relevo === opcoes.relevo);
  $("ch-pronto").value = pronto ? pronto[0] : "";
}

function lerMedida(id) {
  const n = Number(String($(id).value).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * fator() * 1000) / 1000 : NaN;
}

function criarPaleta(id, chave) {
  const caixa = $(id);
  const botoes = PALETA.map(([cor, nome]) => {
    const b = el("button", "ch-cor");
    b.type = "button";
    b.style.background = cor;
    b.dataset.cor = cor;
    b.title = nome;
    b.setAttribute("aria-label", nome);
    b.addEventListener("click", () => mudar({ [chave]: cor }));
    return b;
  });
  const personalizada = el("label", "ch-cor-personalizada");
  const seletor = el("input");
  seletor.type = "color";
  seletor.addEventListener("input", () => mudar({ [chave]: seletor.value }, { lembrar: false }));
  seletor.addEventListener("change", lembrar);
  personalizada.append(seletor, el("span", "", "Cor personalizada"));
  caixa.replaceChildren(...botoes, personalizada);
}

function marcarPaleta(id, cor) {
  let achou = false;
  for (const b of $(id).querySelectorAll(".ch-cor")) {
    const igual = b.dataset.cor === cor;
    achou ||= igual;
    b.setAttribute("aria-pressed", String(igual));
  }
  const personalizada = $(id).querySelector(".ch-cor-personalizada");
  personalizada.classList.toggle("ativa", !achou);
  personalizada.querySelector("input").value = cor;
}

// ---------- Histórico (desfazer/refazer) ----------
function lembrar() {
  const foto = JSON.stringify(opcoes);
  if (historico[posicao] === foto) return;
  historico = historico.slice(0, posicao + 1);
  historico.push(foto);
  if (historico.length > 60) historico.shift();
  posicao = historico.length - 1;
  botoesHistorico();
}

function botoesHistorico() {
  $("ch-desfazer").disabled = posicao < 1;
  $("ch-refazer").disabled = posicao >= historico.length - 1;
}

function voltar(passo) {
  const nova = posicao + passo;
  if (nova < 0 || nova >= historico.length) return;
  posicao = nova;
  opcoes = JSON.parse(historico[posicao]);
  preencherCampos();
  botoesHistorico();
  gerar();
}

// Muda opções e agenda a nova peça. Trocar texto, fonte ou estilo devolve a argola à posição automática.
function mudar(mudancas, { lembrar: guardar = true, imediato = true } = {}) {
  if ("texto" in mudancas || "fonte" in mudancas || "estilo" in mudancas) mudancas.argola = null;
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  if (guardar) lembrar();
  if (imediato) gerar();
  else agendar();
}

function agendar() {
  clearTimeout(temporizador);
  status("Atualizando a peça…");
  temporizador = setTimeout(gerar, 220);
}

// ---------- Geração ----------
async function gerar() {
  clearTimeout(temporizador);
  const minha = ++geracao;
  const pedido = { ...opcoes };
  try {
    const [M, fonte] = await Promise.all([motor(), carregarFonte(pedido.fonte)]);
    if (minha !== geracao) return;
    const resultado = gerarChaveiro(M, fonte, pedido);
    modelo = resultado;
    partes = resultado.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
    posicionarNaOrigem(partes.map((p) => p.geometria));
    if (modo === "3d") previa3d?.mostrar(partes);
    status(resultado.avisos.join(" ") || "Peça pronta. Confira a prévia e as medidas antes de exportar.");
    habilitar(true);
  } catch (erro) {
    if (minha !== geracao) return;
    status(erro.message, true);
    habilitar(false);
  }
  mostrarMedidas();
  desenhar();
}

let motorPronto = null;
function motor() {
  motorPronto ??= (async () => {
    const resposta = await window.modelos.lerMotor();
    if (!resposta.ok) throw new Error(resposta.erro);
    return carregarManifold({ wasmBinary: resposta.dados });
  })().catch((erro) => {
    motorPronto = null;
    throw new Error(`Não foi possível iniciar o motor de geometria. ${erro.message ?? ""}`.trim());
  });
  return motorPronto;
}

function habilitar(pronto) {
  for (const id of ["ch-3mf", "ch-stl", "ch-fatiador"]) $(id).disabled = !pronto;
}

function mostrarMedidas() {
  if (!modelo) {
    $("ch-medidas").textContent = "";
    return;
  }
  $("ch-medidas").textContent = `${modelo.dimensoes.map((d) => formatar(d)).join(" × ")} ${unidade}`;
}

// ---------- Prévia 2D ----------
const canvas = () => $("ch-2d");

// transformação mm → pixels (Y para cima no modelo, para baixo na tela)
function transformacao() {
  const c = canvas();
  const { min, max } = modelo.caixa;
  const margem = 18;
  const largura = max[0] - min[0] + margem;
  const altura = max[1] - min[1] + margem;
  const escala = Math.min(c.width / largura, c.height / altura) * vista.zoom;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  return {
    escala,
    paraTela: ([x, y]) => [c.width / 2 + (x - cx) * escala, c.height / 2 - (y - cy) * escala],
    paraModelo: (px, py) => [cx + (px - c.width / 2) / escala, cy - (py - c.height / 2) / escala],
  };
}

function caminho(ctx, lacos, paraTela) {
  ctx.beginPath();
  for (const laco of lacos) {
    laco.forEach((p, i) => {
      const [x, y] = paraTela(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

// posição do centro da argola para um ponto t da borda (mesma regra da geometria)
function centroDaArgola(t) {
  const { ponto, normal } = pontoNoLaco(modelo.perimetro, t);
  const d = modelo.argola.raio - Math.min(modelo.opcoes.parede, 2);
  return [ponto[0] + normal[0] * d, ponto[1] + normal[1] * d];
}

function desenhar() {
  const c = canvas();
  const ctx = c.getContext("2d");
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }
  ctx.clearRect(0, 0, c.width, c.height);
  if (!modelo || modo !== "2d") return;
  const { paraTela, escala } = transformacao();
  ctx.fillStyle = modelo.opcoes.corBase;
  caminho(ctx, modelo.lacosBase, paraTela);
  ctx.fill("evenodd");
  ctx.strokeStyle = "rgba(127,127,127,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = modelo.opcoes.corTexto;
  caminho(ctx, modelo.lacosTexto, paraTela);
  ctx.fill("nonzero");
  // alça da argola: círculo tracejado arrastável
  const centro = arrasto ? arrasto.centro : modelo.argola.centro;
  const [x, y] = paraTela(centro);
  ctx.setLineDash([6 * dpr, 5 * dpr]);
  ctx.strokeStyle = "#5b8def";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.arc(x, y, (modelo.argola.raio + 1.2) * escala, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (arrasto) {
    ctx.fillStyle = "rgba(91,141,239,0.25)";
    ctx.beginPath();
    ctx.arc(x, y, modelo.argola.raio * escala, 0, Math.PI * 2);
    ctx.fill();
  }
}

function pontoDoEvento(e) {
  const r = canvas().getBoundingClientRect();
  const dpr = canvas().width / r.width;
  return transformacao().paraModelo((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
}

function sobreArgola(p) {
  if (!modelo) return false;
  const [cx, cy] = modelo.argola.centro;
  return Math.hypot(p[0] - cx, p[1] - cy) <= modelo.argola.raio * 1.6 + 1;
}

function ligarArrasto() {
  const c = canvas();
  c.addEventListener("pointerdown", (e) => {
    if (!modelo || modo !== "2d" || !sobreArgola(pontoDoEvento(e))) return;
    c.setPointerCapture(e.pointerId);
    arrasto = { t: modelo.argola.t, centro: modelo.argola.centro };
    status("Posicione a argola. A peça é refeita ao soltar.");
    desenhar();
  });
  c.addEventListener("pointermove", (e) => {
    if (!modelo || modo !== "2d") return;
    const p = pontoDoEvento(e);
    if (!arrasto) {
      c.style.cursor = sobreArgola(p) ? "grab" : "";
      return;
    }
    c.style.cursor = "grabbing";
    const t = maisPertoNoLaco(modelo.perimetro, p).t;
    arrasto = { t, centro: centroDaArgola(t) };
    desenhar();
  });
  const soltar = async (e, cancelar = false) => {
    if (!arrasto) return;
    const { t } = arrasto;
    arrasto = null;
    c.style.cursor = "";
    if (c.hasPointerCapture?.(e.pointerId)) c.releasePointerCapture(e.pointerId);
    if (cancelar) {
      desenhar();
      return;
    }
    // tenta a nova posição; se ela não servir, a argola fica onde estava e o aviso explica
    const anterior = opcoes.argola;
    opcoes = { ...opcoes, argola: Math.round(t * 1e5) / 1e5 };
    await gerar();
    if ($("ch-status").classList.contains("erro")) {
      const motivo = $("ch-status").textContent;
      opcoes = { ...opcoes, argola: anterior };
      await gerar();
      status(motivo, true);
    } else lembrar();
  };
  c.addEventListener("pointerup", (e) => soltar(e));
  c.addEventListener("pointercancel", (e) => soltar(e, true));
  c.addEventListener(
    "wheel",
    (e) => {
      if (modo !== "2d") return;
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);
    },
    { passive: false },
  );
  new ResizeObserver(desenhar).observe(c);
}

// ---------- Prévia 3D e zoom ----------
function mudarModo(novo) {
  modo = novo;
  $("ch-ver-2d").setAttribute("aria-pressed", String(modo === "2d"));
  $("ch-ver-3d").setAttribute("aria-pressed", String(modo === "3d"));
  canvas().hidden = modo !== "2d";
  $("ch-3d").hidden = modo !== "3d";
  if (modo === "3d") {
    previa3d ??= criarPrevia($("ch-3d"));
    if (partes) previa3d.mostrar(partes);
  }
  desenhar();
}

function zoom(f) {
  if (modo === "3d") previa3d?.zoom(f);
  else {
    vista.zoom = Math.min(8, Math.max(0.3, vista.zoom / f));
    desenhar();
  }
}

function ajustar() {
  if (modo === "3d") previa3d?.enquadrar();
  else {
    vista.zoom = 1;
    desenhar();
  }
}

// ---------- Fontes ----------
function abrirFontes() {
  $("fontes-busca").value = "";
  listarFontes();
  $("dialogo-fontes").showModal();
  $("fontes-busca").focus();
}

function listarFontes() {
  const busca = $("fontes-busca").value.trim().toLowerCase();
  const grupos = [];
  for (const categoria of CATEGORIAS_FONTES) {
    const itens = FONTES.filter((f) => f.categoria === categoria.nome && (!busca || f.nome.toLowerCase().includes(busca)));
    if (!itens.length) continue;
    grupos.push(el("h3", "fontes-categoria", categoria.nome));
    for (const f of itens) {
      const b = el("button", "fontes-item", f.nome);
      b.type = "button";
      b.style.fontFamily = familiaCss(f.id);
      b.setAttribute("aria-pressed", String(f.id === opcoes.fonte));
      b.addEventListener("click", () => {
        $("dialogo-fontes").close();
        mudar({ fonte: f.id });
      });
      grupos.push(b);
    }
  }
  if (!grupos.length) grupos.push(el("p", "ajuda", "Nenhuma fonte com esse nome."));
  $("fontes-lista").replaceChildren(...grupos);
}

// ---------- Exportação ----------
const nomeArquivo = () => `Chaveiro ${modelo.opcoes.texto}`;

function partesComSlots() {
  const slots = [Number($("ch-slot-base").value), Number($("ch-slot-texto").value)];
  return partes.map((p, i) => ({ ...p, slot: slots[i] }));
}

async function salvar(extensao) {
  if (!partes) return;
  const bytes = extensao === "3mf" ? gerar3mf(partesComSlots(), { titulo: nomeArquivo() }) : gerarStl(partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

function rotuloFatiador() {
  const nome = estado.config.fatiador?.nome;
  $("ch-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
}

// ---------- Início ----------
export function iniciarChaveiro() {
  criarPaleta("ch-paleta-base", "corBase");
  criarPaleta("ch-paleta-texto", "corTexto");
  $("ch-pronto").append(...Object.entries(MODELOS_PRONTOS).map(([id, p]) => new Option(p.nome, id)));
  for (const id of ["ch-slot-base", "ch-slot-texto"]) {
    $(id).replaceChildren(...Array.from({ length: 16 }, (_, i) => new Option(`Filamento ${i + 1}`, String(i + 1))));
  }
  $("ch-slot-texto").value = "2";

  $("ch-texto").addEventListener("input", () => {
    opcoes = { ...opcoes, texto: $("ch-texto").value, argola: null };
    agendar();
  });
  $("ch-texto").addEventListener("change", lembrar);
  for (const [id, chave] of Object.entries(MEDIDAS)) {
    $(id).addEventListener("input", () => {
      const valor = lerMedida(id);
      if (!Number.isFinite(valor)) return;
      const [minimo, maximo] = LIMITES_CHAVEIRO[chave];
      if (valor < minimo || valor > maximo) {
        status(`${chave === "largura" ? "Largura total" : "Medida"}: use de ${formatar(minimo)} a ${formatar(maximo)} ${unidade}.`, true);
        habilitar(false);
        return;
      }
      opcoes = { ...opcoes, [chave]: valor };
      agendar();
    });
    $(id).addEventListener("change", () => {
      preencherCampos();
      lembrar();
    });
  }
  $("ch-unidade").addEventListener("change", () => {
    unidade = $("ch-unidade").value;
    preencherCampos();
    mostrarMedidas();
  });
  for (const b of document.querySelectorAll("#tela-chaveiro [data-estilo]")) b.addEventListener("click", () => mudar({ estilo: b.dataset.estilo }));
  $("ch-pronto").addEventListener("change", () => {
    const p = MODELOS_PRONTOS[$("ch-pronto").value];
    if (p) mudar({ borda: p.borda, base: p.base, relevo: p.relevo });
  });
  $("ch-argola-auto").addEventListener("click", () => mudar({ argola: null }));
  for (const b of document.querySelectorAll("#tela-chaveiro .ch-abas button")) {
    b.addEventListener("click", () => $(b.dataset.alvo).scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  $("ch-fonte").addEventListener("click", abrirFontes);
  $("fontes-busca").addEventListener("input", listarFontes);
  $("fontes-fechar").addEventListener("click", () => $("dialogo-fontes").close());

  $("ch-desfazer").addEventListener("click", () => voltar(-1));
  $("ch-refazer").addEventListener("click", () => voltar(1));
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("tela-chaveiro").classList.contains("oculta") || !e.ctrlKey) return;
    if (e.target.matches?.("input, textarea")) return;
    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      voltar(-1);
    } else if (e.key.toLowerCase() === "y") {
      e.preventDefault();
      voltar(1);
    }
  });
  $("ch-ver-2d").addEventListener("click", () => mudarModo("2d"));
  $("ch-ver-3d").addEventListener("click", () => mudarModo("3d"));
  $("ch-zoom-menos").addEventListener("click", () => zoom(1.25));
  $("ch-zoom-mais").addEventListener("click", () => zoom(0.8));
  $("ch-ajustar").addEventListener("click", ajustar);
  ligarArrasto();

  $("ch-3mf").addEventListener("click", () => salvar("3mf"));
  $("ch-stl").addEventListener("click", () => salvar("stl"));
  $("ch-fatiador").addEventListener("click", () => {
    if (partes) abrirNoFatiador(gerar3mf(partesComSlots(), { titulo: nomeArquivo() }), nomeArquivo(), "3mf");
  });

  let primeira = true;
  registrarAoAbrir("chaveiro", () => {
    rotuloFatiador();
    if (primeira) {
      primeira = false;
      opcoes = { ...opcoes, texto: (estado.config.nome || "").split(/\s+/)[0] || PADRAO_CHAVEIRO.texto };
      preencherCampos();
      lembrar();
    }
    status("Preparando a peça…");
    gerar();
  });
}
