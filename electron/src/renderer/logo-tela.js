// Tela do Criador de logos (antes "Chaveiro de logo"): imagem -> recorte e cores automáticos (nas 14 cores
// prontas) -> correção à mão (borracha, restaurar, varinha, pincel, balde) -> relevo multicor sobre a base,
// com ou sem argola.
import { conferirMedidas, densidadeDoModelo, calcularCustoModelo, salvarModeloComo, enviarModeloAoFatiador, mudarPrevia, zoomPrevia, ajustarPrevia, arquivoDeTexto, imagemComoTexto } from "./modelos-acoes.js";
import { registrarAbridor, salvarEmMeusModelos } from "./modelos-ui.js";
import { pesoCurto } from "./modelos/estimativa.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { coresDoSvg, gerarLogo, LIMITES_LOGO, PADRAO_LOGO } from "./modelos/logo.js";
import { CORES_LOGO, VAZIO, coresUsadas, encher, mapaAutomatico, mapaDeCoresProntas, mapaVazio, pintarTraco, rgbaDoMapa, svgDoMapa } from "./modelos/mapa-logo.js";
import { familiaCss } from "./modelos/fontes.js";
import { motorDaTela } from "./modelos/manifold.js";
import { criarPrevia2d, miniatura } from "./modelos/previa2d.js";
import { confirmar, estado, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el, ligarZonaArquivos } from "./util-tela.js";
import { abrirImagem } from "./imagem-arquivo.js";

const $ = (id) => document.getElementById(id);
const LADO = 512; // resolução do mapa: dá para corrigir detalhes à mão sem pesar
const MEDIDAS = { "lg-largura": "largura", "lg-borda": "borda", "lg-base": "base", "lg-relevo": "relevo", "lg-furo": "furo", "lg-parede": "parede" };
const LIMITE_HISTORICO = 40;

let imagem = null; // { width, height, data, nome } (imagem reduzida, a que vira o mapa)
let origem = null; // mapa do recorte automático (a ferramenta Restaurar volta para ele)
let mapa = null; // mapa atual: { largura, altura, idx } (VAZIO ou índice em CORES_LOGO)
let historico = []; // cópias de mapa.idx para desfazer
let refazer = [];
let cores = null; // contornos por cor (coresDoSvg), refeitos quando o mapa muda
let opcoes = { ...PADRAO_LOGO };
let modelo = null;
let partes = null;
let modo = "2d";
let previa2d = null;
let projetoAtual = null; // { id, nome } quando veio de Meus modelos
let previa3d = null;
let temporizador = null;
let geracao = 0;
let corTrocando = null; // cor achada que o usuário está trocando

const formatar = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const status = (texto, erro = false) => {
  $("lg-status").textContent = texto;
  $("lg-status").classList.toggle("erro", erro);
};

// ---------- Botões de cor (as cores prontas, sem seletor livre) ----------
function botaoCor(c, aoEscolher, classe = "im-cor") {
  const b = el("button", classe);
  b.type = "button";
  b.title = c.nome;
  b.setAttribute("aria-label", c.nome);
  b.dataset.cor = c.hex;
  b.style.setProperty("--cor", c.hex);
  b.addEventListener("click", () => aoEscolher(c));
  return b;
}

function marcarCores(caixa, hex) {
  for (const b of caixa.querySelectorAll("[data-cor]")) b.setAttribute("aria-pressed", String(b.dataset.cor === hex));
}

function preencherCampos() {
  for (const [id, chave] of Object.entries(MEDIDAS)) $(id).value = formatar(opcoes[chave]);
  for (const b of document.querySelectorAll("[data-lg-estilo]")) b.setAttribute("aria-pressed", String(b.dataset.lgEstilo === opcoes.estilo));
  marcarCores($("lg-paleta-base"), opcoes.corBase);
  $("lg-com-argola").checked = opcoes.comArgola !== false;
  $("lg-argola-campos").hidden = opcoes.comArgola === false;
  $("lg-largura-ajuda").textContent = `${opcoes.comArgola === false ? "Inclui a base" : "Inclui base e argola"}. O arquivo exportado sai com esta largura.`;
  $("lg-fundo-dentro-linha").hidden = !$("lg-fundo").checked;
}

function mudar(mudancas) {
  if ("estilo" in mudancas) mudancas.argola = null;
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  gerar();
}

// ---------- Mapa (recorte e cores) ----------
const copiaDoMapa = (m) => ({ largura: m.largura, altura: m.altura, idx: m.idx.slice() });
const editado = () => historico.length > 0;

function recortar() {
  $("lg-cores-valor").textContent = $("lg-cores").value;
  if (!imagem) return;
  origem = mapaAutomatico(imagem, {
    cores: Number($("lg-cores").value),
    tirarFundo: $("lg-fundo").checked,
    fundoDeDentro: $("lg-fundo-dentro").checked,
  });
  mapa = copiaDoMapa(origem);
  historico = [];
  refazer = [];
  mapaMudou();
}

// Mudar o recorte automático joga fora as correções à mão: pergunta antes.
async function mudarRecorte(desfazerControle) {
  if (editado()) {
    const ok = await confirmar({
      titulo: "Refazer o recorte automático?",
      texto: "As correções feitas à mão serão perdidas.",
      botao: "Refazer",
    });
    if (!ok) {
      desfazerControle();
      return;
    }
  }
  recortar();
}

function guardarParaDesfazer() {
  historico.push(mapa.idx.slice());
  if (historico.length > LIMITE_HISTORICO) historico.shift();
  refazer = [];
  atualizarDesfazer();
}

function atualizarDesfazer() {
  $("lg-desfazer").disabled = !historico.length;
  $("lg-refazer").disabled = !refazer.length;
}

function voltarEdicao(de, para) {
  if (!de.length) return;
  para.push(mapa.idx.slice());
  mapa.idx = de.pop();
  atualizarDesfazer();
  mapaMudou();
}

// Depois de qualquer mudança no mapa: redesenha o editor, a lista de cores e refaz a peça.
function mapaMudou({ refazerPeca = true } = {}) {
  editor.desenhar(true);
  mostrarCoresAchadas();
  atualizarDesfazer();
  if (refazerPeca) agendar(400);
}

function mostrarCoresAchadas() {
  const usadas = mapa ? coresUsadas(mapa) : [];
  $("lg-cores-lista").replaceChildren(
    ...usadas.map((i) => {
      const c = CORES_LOGO[i];
      const chip = el("button", "lg-cor-chip");
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(corTrocando === i));
      const bola = el("span", "im-bolinha");
      bola.style.setProperty("--cor", c.hex);
      chip.append(bola, c.nome);
      chip.addEventListener("click", () => {
        corTrocando = corTrocando === i ? null : i;
        mostrarCoresAchadas();
      });
      return chip;
    }),
  );
  if (corTrocando !== null && !usadas.includes(corTrocando)) corTrocando = null;
  const caixa = $("lg-trocar-cor");
  caixa.hidden = corTrocando === null;
  if (corTrocando !== null) {
    caixa.replaceChildren(
      ...CORES_LOGO.map((c, i) =>
        botaoCor(c, () => {
          const de = corTrocando;
          corTrocando = null;
          if (i !== de) {
            guardarParaDesfazer();
            for (let p = 0; p < mapa.idx.length; p++) if (mapa.idx[p] === de) mapa.idx[p] = i;
          }
          mapaMudou({ refazerPeca: i !== de });
        }),
      ),
    );
    marcarCores(caixa, CORES_LOGO[corTrocando].hex);
  }
}

// ---------- Peça ----------
async function gerar() {
  invalidar();
  if (!mapa) return;
  if (mapaVazio(mapa)) {
    cores = null;
    modelo = null;
    status("O logo ficou vazio. Desfaça a última correção ou desligue \"Tirar o fundo\".", true);
    $("lg-medidas").textContent = "";
    previa2d.mostrar(null);
    return;
  }
  const minha = ++geracao;
  try {
    cores = coresDoSvg(svgDoMapa(mapa));
    conferirMedidas(MEDIDAS, LIMITES_LOGO);
    const M = await motorDaTela();
    if (minha !== geracao) return;
    modelo = gerarLogo(M, cores, opcoes);
    partes = modelo.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
    posicionarNaOrigem(partes.map((p) => p.geometria));
    if (modo === "3d") previa3d?.mostrar(partes);
    status(modelo.avisos.join(" ") || "Peça pronta. Confira a prévia e as medidas antes de exportar.");
    $("lg-partes").textContent = `${modelo.cores.length} cor(es) no logo + base`;
    habilitar(true);
  } catch (erro) {
    if (minha !== geracao) return;
    modelo = null;
    status(erro.message, true);
    habilitar(false);
  }
  $("lg-medidas").textContent = modelo ? `${modelo.dimensoes.map(formatar).join(" × ")} mm · ${pesoCurto(modelo.malhas, densidadeDoModelo())}` : "";
  previa2d.mostrar(modelo);
}

// Cancela pedidos antigos e impede exportar a peça anterior enquanto há alterações.
function invalidar() {
  clearTimeout(temporizador);
  geracao += 1;
  habilitar(false);
}

function agendar(espera = 250) {
  invalidar();
  status("Atualizando a peça…");
  temporizador = setTimeout(gerar, espera);
}

function habilitar(pronto) {
  for (const id of ["lg-3mf", "lg-stl", "lg-fatiador", "lg-custo", "lg-salvar-modelo"]) $(id).disabled = !pronto;
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

// ---------- Editor (correção à mão) ----------
const editor = (() => {
  const canvas = () => $("lg-editor");
  let ferramenta = "borracha";
  let corPincel = CORES_LOGO.findIndex((c) => c.nome === "Preto");
  let vista = null; // { escala, ox, oy } em pixels do canvas
  let ponteiro = null; // posição do mouse em coordenadas do mapa (para o círculo do pincel)
  let tracando = null; // { x, y } último ponto do traço
  let arrastando = null; // { x, y, ox, oy } arrastar a vista
  let imagemMapa = null; // OffscreenCanvas com o mapa
  let xadrez = null;

  const raio = () => Number($("lg-pincel").value) / 2;
  const usaPincel = () => ["borracha", "restaurar", "pincel"].includes(ferramenta);

  function ajustar() {
    if (!mapa) return;
    const c = canvas();
    const margem = 24 * devicePixelRatio;
    const escala = Math.min((c.width - margem * 2) / mapa.largura, (c.height - margem * 2) / mapa.altura);
    vista = { escala, ox: (c.width - mapa.largura * escala) / 2, oy: (c.height - mapa.altura * escala) / 2 };
    desenhar();
  }

  function tamanho() {
    const c = canvas();
    const w = Math.round(c.clientWidth * devicePixelRatio);
    const h = Math.round(c.clientHeight * devicePixelRatio);
    if (w && h && (c.width !== w || c.height !== h)) {
      c.width = w;
      c.height = h;
      return true;
    }
    return false;
  }

  function desenhar(mapaNovo = false) {
    const c = canvas();
    if (c.hidden || !mapa) return;
    if (tamanho() || !vista) return ajustar();
    if (mapaNovo || !imagemMapa || imagemMapa.width !== mapa.largura) {
      imagemMapa = new OffscreenCanvas(mapa.largura, mapa.altura);
      imagemMapa.getContext("2d").putImageData(new ImageData(rgbaDoMapa(mapa), mapa.largura, mapa.altura), 0, 0);
    }
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    // xadrez = vazio (o fundo recortado)
    if (!xadrez) {
      const t = document.createElement("canvas");
      t.width = t.height = 16;
      const tc = t.getContext("2d");
      tc.fillStyle = "#d9d9d9";
      tc.fillRect(0, 0, 16, 16);
      tc.fillStyle = "#f2f2f2";
      tc.fillRect(0, 0, 8, 8);
      tc.fillRect(8, 8, 8, 8);
      xadrez = ctx.createPattern(t, "repeat");
    }
    const { escala, ox, oy } = vista;
    ctx.save();
    ctx.fillStyle = xadrez;
    ctx.fillRect(ox, oy, mapa.largura * escala, mapa.altura * escala);
    ctx.imageSmoothingEnabled = escala < 1;
    ctx.drawImage(imagemMapa, ox, oy, mapa.largura * escala, mapa.altura * escala);
    ctx.strokeStyle = "rgba(127,127,127,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 0.5, oy - 0.5, mapa.largura * escala + 1, mapa.altura * escala + 1);
    // círculo do pincel / mira da varinha e do balde
    if (ponteiro && !arrastando) {
      const x = ox + ponteiro.x * escala;
      const y = oy + ponteiro.y * escala;
      ctx.lineWidth = 1.5 * devicePixelRatio;
      ctx.strokeStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 2;
      ctx.beginPath();
      if (usaPincel()) ctx.arc(x, y, Math.max(2, raio() * escala), 0, Math.PI * 2);
      else {
        const r = 7 * devicePixelRatio;
        ctx.moveTo(x - r, y);
        ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function noMapa(ev) {
    const r = canvas().getBoundingClientRect();
    const px = (ev.clientX - r.left) * devicePixelRatio;
    const py = (ev.clientY - r.top) * devicePixelRatio;
    return { x: (px - vista.ox) / vista.escala, y: (py - vista.oy) / vista.escala, px, py };
  }

  const valorDaFerramenta = () =>
    ferramenta === "borracha" || ferramenta === "varinha" ? VAZIO : ferramenta === "restaurar" ? "restaurar" : corPincel;

  function escolher(nova) {
    ferramenta = nova;
    for (const b of document.querySelectorAll("#lg-ferramentas [data-ferramenta]")) b.setAttribute("aria-pressed", String(b.dataset.ferramenta === nova));
    $("lg-tamanho-campo").hidden = !usaPincel();
    $("lg-cores-pincel").hidden = !(nova === "pincel" || nova === "balde");
    desenhar();
  }

  function iniciar() {
    const c = canvas();
    $("lg-cores-pincel").replaceChildren(
      ...CORES_LOGO.map((cor, i) =>
        botaoCor(cor, () => {
          corPincel = i;
          marcarCores($("lg-cores-pincel"), cor.hex);
        }),
      ),
    );
    marcarCores($("lg-cores-pincel"), CORES_LOGO[corPincel].hex);
    for (const b of document.querySelectorAll("#lg-ferramentas [data-ferramenta]")) b.addEventListener("click", () => escolher(b.dataset.ferramenta));
    escolher("borracha");
    $("lg-pincel").addEventListener("input", () => desenhar());

    c.addEventListener("contextmenu", (ev) => ev.preventDefault());
    c.addEventListener("pointerdown", (ev) => {
      if (!mapa || !vista) return;
      c.setPointerCapture(ev.pointerId);
      const p = noMapa(ev);
      // botão direito ou do meio: arrasta a vista
      if (ev.button === 1 || ev.button === 2) {
        arrastando = { x: p.px, y: p.py, ox: vista.ox, oy: vista.oy };
        return;
      }
      if (ev.button !== 0) return;
      if (usaPincel()) {
        guardarParaDesfazer();
        tracando = { x: p.x, y: p.y };
        if (pintarTraco(mapa, p.x, p.y, p.x, p.y, raio(), valorDaFerramenta(), origem)) desenhar(true);
      } else {
        const antes = mapa.idx.slice();
        if (encher(mapa, p.x, p.y, valorDaFerramenta())) {
          historico.push(antes);
          if (historico.length > LIMITE_HISTORICO) historico.shift();
          refazer = [];
          mapaMudou();
        }
      }
    });
    c.addEventListener("pointermove", (ev) => {
      if (!mapa || !vista) return;
      const p = noMapa(ev);
      ponteiro = { x: p.x, y: p.y };
      if (arrastando) {
        vista.ox = arrastando.ox + (p.px - arrastando.x);
        vista.oy = arrastando.oy + (p.py - arrastando.y);
      } else if (tracando) {
        if (pintarTraco(mapa, tracando.x, tracando.y, p.x, p.y, raio(), valorDaFerramenta(), origem)) {
          tracando = { x: p.x, y: p.y };
          return desenhar(true);
        }
        tracando = { x: p.x, y: p.y };
      }
      desenhar();
    });
    const soltar = () => {
      arrastando = null;
      if (tracando) {
        tracando = null;
        mapaMudou();
      }
    };
    c.addEventListener("pointerup", soltar);
    c.addEventListener("pointercancel", soltar);
    c.addEventListener("pointerleave", () => {
      ponteiro = null;
      desenhar();
    });
    c.addEventListener(
      "wheel",
      (ev) => {
        if (!vista) return;
        ev.preventDefault();
        const p = noMapa(ev);
        zoom(ev.deltaY > 0 ? 1.15 : 1 / 1.15, p.px, p.py);
      },
      { passive: false },
    );
    new ResizeObserver(() => desenhar()).observe(c);
  }

  // fator > 1 afasta (mesmo sentido das outras prévias); (cx, cy) fica parado na tela
  function zoom(fator, cx, cy) {
    if (!vista) return;
    const c = canvas();
    cx ??= c.width / 2;
    cy ??= c.height / 2;
    const nova = Math.min(64, Math.max(0.2, vista.escala / fator));
    vista.ox = cx - ((cx - vista.ox) * nova) / vista.escala;
    vista.oy = cy - ((cy - vista.oy) * nova) / vista.escala;
    vista.escala = nova;
    desenhar();
  }

  return { iniciar, desenhar, ajustar, zoom, novoMapa: () => (vista = null) };
})();

function mudarModo(novo) {
  modo = novo;
  const editando = novo === "editar";
  $("lg-ver-editar").setAttribute("aria-pressed", String(editando));
  $("lg-ferramentas").hidden = !editando;
  $("lg-editor").hidden = !editando;
  if (editando) {
    $("lg-ver-2d").setAttribute("aria-pressed", "false");
    $("lg-ver-3d").setAttribute("aria-pressed", "false");
    previa2d.ativar(false);
    $("lg-3d").hidden = true;
    editor.desenhar(true);
    return;
  }
  previa3d = mudarPrevia("lg", modo, previa2d, previa3d, partes);
}

// ---------- Abrir imagem ----------
// salvo (opcional): modelo de Meus modelos sendo reaberto ({ id, nome, opcoes }).
async function carregar([arquivo], salvo = null) {
  try {
    const bitmap = await abrirImagem(arquivo);
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
    corTrocando = null;
    editor.novoMapa();
    if (salvo) {
      const { coresLogo, removerFundo, fundoDeDentro, mapaPronto, nomeImagem, ...resto } = salvo.opcoes;
      opcoes = { ...PADRAO_LOGO, ...resto };
      if (coresLogo) $("lg-cores").value = String(coresLogo);
      if (typeof removerFundo === "boolean") $("lg-fundo").checked = removerFundo;
      if (typeof fundoDeDentro === "boolean") $("lg-fundo-dentro").checked = fundoDeDentro;
      if (nomeImagem) $("lg-nome").textContent = nomeImagem;
      projetoAtual = { id: salvo.id, nome: salvo.nome };
      preencherCampos();
      status("Preparando a peça…");
      if (mapaPronto) {
        // modelo salvo pelo Criador de logos: a imagem já é o mapa (com as correções à mão)
        $("lg-cores-valor").textContent = $("lg-cores").value;
        origem = mapaDeCoresProntas(imagem);
        mapa = copiaDoMapa(origem);
        historico = [];
        refazer = [];
        mapaMudou();
        return;
      }
    } else {
      opcoes = { ...opcoes, argola: null };
      projetoAtual = null;
      preencherCampos();
    }
    status("Preparando a peça…");
    recortar();
  } catch {
    mostrarAviso("Não foi possível abrir essa imagem. Use PNG, JPEG, WebP ou HEIC.");
  }
}

const nomeBase = () => ($("lg-nome").textContent || "logo").replace(/\.[^.]+$/, "");
const nomeArquivo = () => `${opcoes.comArgola === false ? "Logo" : "Chaveiro logo"} ${nomeBase()}`.slice(0, 60);

async function salvar(extensao) {
  if (!partes) return;
  await salvarModeloComo(extensao, partes, nomeArquivo());
}

// Mapa atual como PNG (fundo transparente), para guardar em Meus modelos.
async function mapaComoTexto() {
  const canvas = new OffscreenCanvas(mapa.largura, mapa.altura);
  canvas.getContext("2d").putImageData(new ImageData(rgbaDoMapa(mapa), mapa.largura, mapa.altura), 0, 0);
  return imagemComoTexto(canvas);
}

export function iniciarLogo() {
  ligarZonaArquivos($("lg-zona"), $("lg-entrada"), carregar);
  $("lg-trocar").addEventListener("click", () => $("lg-entrada").click());
  familiaCss("Lobster"); // ícone "Aa" do estilo Contorno
  $("lg-paleta-base").replaceChildren(...CORES_LOGO.map((c) => botaoCor(c, () => mudar({ corBase: c.hex }))));
  preencherCampos();
  editor.iniciar();

  // recorte automático
  $("lg-cores").addEventListener("input", () => {
    $("lg-cores-valor").textContent = $("lg-cores").value;
  });
  let coresAntes = $("lg-cores").value;
  $("lg-cores").addEventListener("pointerdown", () => (coresAntes = $("lg-cores").value));
  $("lg-cores").addEventListener("change", () =>
    mudarRecorte(() => {
      $("lg-cores").value = coresAntes;
      $("lg-cores-valor").textContent = coresAntes;
    }).then(() => (coresAntes = $("lg-cores").value)),
  );
  for (const id of ["lg-fundo", "lg-fundo-dentro"]) {
    $(id).addEventListener("change", () => {
      preencherCampos();
      mudarRecorte(() => {
        $(id).checked = !$(id).checked;
        preencherCampos();
      });
    });
  }

  // desfazer / refazer (botões e Ctrl+Z / Ctrl+Y nesta tela)
  $("lg-desfazer").addEventListener("click", () => voltarEdicao(historico, refazer));
  $("lg-refazer").addEventListener("click", () => voltarEdicao(refazer, historico));
  document.addEventListener("keydown", (ev) => {
    if ($("tela-logo").classList.contains("oculta") || !mapa || !(ev.ctrlKey || ev.metaKey)) return;
    if (ev.target.closest?.("input, textarea, select") || document.querySelector("dialog[open]")) return;
    const tecla = ev.key.toLowerCase();
    if (tecla === "z" && !ev.shiftKey) {
      ev.preventDefault();
      voltarEdicao(historico, refazer);
    } else if (tecla === "y" || (tecla === "z" && ev.shiftKey)) {
      ev.preventDefault();
      voltarEdicao(refazer, historico);
    }
  });

  for (const [id, chave] of Object.entries(MEDIDAS)) {
    $(id).addEventListener("input", () => {
      const valor = Number(String($(id).value).replace(",", "."));
      invalidar();
      const [minimo, maximo] = LIMITES_LOGO[chave];
      if (!Number.isFinite(valor) || valor < minimo || valor > maximo) {
        status(`${chave === "largura" ? "Largura total" : "Medida"}: use de ${formatar(minimo)} a ${formatar(maximo)} mm.`, true);
        habilitar(false);
        return;
      }
      opcoes = { ...opcoes, [chave]: valor };
      agendar();
    });
    $(id).addEventListener("change", () => {
      preencherCampos();
      gerar();
    });
  }
  for (const b of document.querySelectorAll("[data-lg-estilo]")) b.addEventListener("click", () => mudar({ estilo: b.dataset.lgEstilo }));
  $("lg-com-argola").addEventListener("change", () => mudar({ comArgola: $("lg-com-argola").checked, argola: null }));
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
  $("lg-ver-editar").addEventListener("click", () => mudarModo("editar"));
  $("lg-zoom-menos").addEventListener("click", () => (modo === "editar" ? editor.zoom(1.25) : zoomPrevia(modo, previa2d, previa3d, 1.25)));
  $("lg-zoom-mais").addEventListener("click", () => (modo === "editar" ? editor.zoom(0.8) : zoomPrevia(modo, previa2d, previa3d, 0.8)));
  $("lg-ajustar").addEventListener("click", () => (modo === "editar" ? editor.ajustar() : ajustarPrevia(modo, previa2d, previa3d)));

  $("lg-3mf").addEventListener("click", () => salvar("3mf"));
  $("lg-stl").addEventListener("click", () => salvar("stl"));
  $("lg-salvar-modelo").addEventListener("click", async () => {
    if (!modelo || !mapa) return;
    const r = await salvarEmMeusModelos({
      tipo: "logo",
      atual: projetoAtual,
      nomePadrao: nomeArquivo(),
      montar: async () => ({
        opcoes: {
          ...opcoes,
          coresLogo: Number($("lg-cores").value),
          removerFundo: $("lg-fundo").checked,
          fundoDeDentro: $("lg-fundo-dentro").checked,
          nomeImagem: $("lg-nome").textContent,
          mapaPronto: true,
        },
        miniatura: miniatura(modelo),
        imagem: await mapaComoTexto(),
      }),
    });
    if (r) {
      projetoAtual = r;
      mostrarAviso(`"${r.nome}" salvo em Meus modelos.`);
    }
  });
  registrarAbridor("logo", (p) => carregar([arquivoDeTexto(p.imagem, p.opcoes.nomeImagem || `${p.nome}.png`)], p));
  $("lg-custo").addEventListener("click", () => {
    if (!modelo) return;
    calcularCustoModelo(modelo, nomeArquivo());
  });
  $("lg-fatiador").addEventListener("click", () => {
    if (partes) enviarModeloAoFatiador(partes, nomeArquivo());
  });
  registrarAoAbrir("logo", () => {
    if (modelo) $("lg-medidas").textContent = `${modelo.dimensoes.map(formatar).join(" × ")} mm · ${pesoCurto(modelo.malhas, densidadeDoModelo())}`;
    const nome = estado.config.fatiador?.nome;
    $("lg-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
  });
}
