import { conferirMedidas, densidadeDoModelo, calcularCustoModelo, salvarModeloComo, enviarModeloAoFatiador, mudarPrevia, zoomPrevia, ajustarPrevia, arquivoDeTexto, imagemComoTexto, salvarArquivoModelo } from "./modelos-acoes.js";
// Tela do Chaveiro de nome: opções à esquerda, prévia 2D (argola e símbolo arrastáveis) ou 3D à direita.
// Símbolo: imagem vetorizada por cores ao lado do nome. Vários nomes: um 3MF com todos, em placas.
import { pesoCurto, pesoDasMalhas } from "./modelos/estimativa.js";
import { camadaDaTroca, gerarChaveiro, gerarChaveiroComLarguraDoTexto, larguraNaFonte, LIMITES_CHAVEIRO, LIMITES_SIMBOLO, MODELOS_PRONTOS, PADRAO_CHAVEIRO } from "./modelos/chaveiro.js";
import { arrumarNaMesa, gerar3mf, gerar3mfVarios } from "./modelos/exportar.js";
import { coresDoSvg } from "./modelos/logo.js";
import { vetorizar } from "./vetorizar.js";
import { abrirNoFatiador } from "./fatiador-ui.js";
import { el } from "./util-tela.js";
import { carregarFonte, familiaCss } from "./modelos/fontes.js";
import { criarPaleta, escolherFonte, marcarPaleta, mostrarFonte, perguntarImpressao, registrarAbridor, salvarEmMeusModelos } from "./modelos-ui.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { motorDaTela } from "./modelos/manifold.js";
import { criarPrevia2d, miniatura } from "./modelos/previa2d.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);

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
let previa2d = null;
let projetoAtual = null; // { id, nome } quando veio de Meus modelos

// Símbolo: a imagem reduzida e os contornos por cor (refeitos só quando a imagem, as cores ou o fundo mudam).
const LADO_SIMBOLO = 360;
const MESA = [260, 260]; // Anycubic Kobra X
let simboloImagem = null; // { width, height, data, nome, canvas }
let coresSimbolo = null;
let chaveSimbolo = "";
// Vários nomes: chaveiros gerados (para exportar) e a "foto" das opções que os geraram.
let lote = null; // { chave, itens: [{ nome, partes, tamanho, gramas }], placas }

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
  mostrarFonte($("ch-fonte"), opcoes.fonte);
  $("ch-fonte-amostra").style.fontFamily = familiaCss(opcoes.fonte);
  for (const b of document.querySelectorAll("#tela-chaveiro [data-estilo]")) b.setAttribute("aria-pressed", String(b.dataset.estilo === opcoes.estilo));
  marcarPaleta($("ch-paleta-base"), opcoes.corBase);
  marcarPaleta($("ch-paleta-texto"), opcoes.corTexto);
  const pronto = Object.entries(MODELOS_PRONTOS).find(([, p]) => p.borda === opcoes.borda && p.base === opcoes.base && p.relevo === opcoes.relevo);
  $("ch-pronto").value = pronto ? pronto[0] : "";
}

function lerMedida(id) {
  const n = Number(String($(id).value).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * fator() * 1000) / 1000 : NaN;
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
  if ("texto" in mudancas || "fonte" in mudancas || "estilo" in mudancas || "simbolo" in mudancas) mudancas.argola = null;
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  if (guardar) lembrar();
  if (imediato) gerar();
  else agendar();
}

// Cancela pedidos antigos e impede exportar a peça anterior enquanto há alterações.
function invalidar() {
  clearTimeout(temporizador);
  geracao += 1;
  habilitar(false);
}

function agendar() {
  invalidar();
  status("Atualizando a peça…");
  temporizador = setTimeout(gerar, 220);
}

// ---------- Símbolo ----------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distanciaCor = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

// Vetoriza a imagem do símbolo de novo só quando a imagem, o número de cores ou o fundo mudam.
// Cores novas: sobem em relevo as que lembram mais a cor do texto do que a da base.
function atualizarSimbolo() {
  if (!simboloImagem || !opcoes.simbolo) {
    coresSimbolo = null;
    chaveSimbolo = "";
    return;
  }
  const quantas = opcoes.simboloCores ?? 2;
  const fundo = opcoes.simboloFundo !== false;
  const chave = `${simboloImagem.nome}|${simboloImagem.width}x${simboloImagem.height}|${quantas}|${fundo}`;
  if (chave === chaveSimbolo && coresSimbolo) return;
  const { svg } = vetorizar(simboloImagem, { modo: "cores", cores: quantas + (fundo ? 1 : 0), detalhe: "medio", suavizar: true, removerFundo: fundo });
  coresSimbolo = coresDoSvg(svg);
  const novas = coresSimbolo.map((c) => c.cor.toLowerCase());
  if (chaveSimbolo && chaveSimbolo !== chave) {
    // mudou a vetorização: as cores são outras, refaz a escolha automática
    opcoes = { ...opcoes, simbolo: { ...opcoes.simbolo, relevo: novas.filter((c) => distanciaCor(c, opcoes.corTexto) < distanciaCor(c, opcoes.corBase)) } };
  } else if (!opcoes.simbolo.relevo?.some((c) => novas.includes(c))) {
    opcoes = { ...opcoes, simbolo: { ...opcoes.simbolo, relevo: novas.filter((c) => distanciaCor(c, opcoes.corTexto) < distanciaCor(c, opcoes.corBase)) } };
  }
  chaveSimbolo = chave;
}

function mostrarSimbolo() {
  const s = opcoes.simbolo;
  $("ch-simbolo-opcoes").hidden = !s || !simboloImagem;
  $("ch-simbolo-remover").hidden = !s || !simboloImagem;
  $("ch-simbolo-escolher").textContent = simboloImagem ? "Trocar imagem" : "Escolher imagem";
  $("ch-simbolo-nome").textContent = simboloImagem && s ? simboloImagem.nome : "";
  if (!s) return;
  for (const b of document.querySelectorAll("#tela-chaveiro [data-lado]")) b.setAttribute("aria-pressed", String(b.dataset.lado === s.lado && !s.dx && !s.dy));
  $("ch-simbolo-tamanho").value = String(s.tamanho);
  $("ch-simbolo-tamanho-valor").textContent = `${s.tamanho}%`;
  $("ch-simbolo-cores").value = String(opcoes.simboloCores ?? 2);
  $("ch-simbolo-cores-valor").textContent = String(opcoes.simboloCores ?? 2);
  $("ch-simbolo-fundo").checked = opcoes.simboloFundo !== false;
  $("ch-simbolo-lista").replaceChildren(
    ...(coresSimbolo ?? []).map(({ cor }) => {
      const c = cor.toLowerCase();
      const ligado = s.relevo.includes(c);
      const b = el("button", "ch-simbolo-cor");
      b.type = "button";
      b.setAttribute("aria-pressed", String(ligado));
      const amostra = el("span", "amostra-cor");
      amostra.style.background = c;
      b.append(amostra, el("span", "", ligado ? "Em relevo" : "Só na base"));
      b.addEventListener("click", () => {
        const relevo = ligado ? s.relevo.filter((x) => x !== c) : [...s.relevo, c];
        mudar({ simbolo: { ...opcoes.simbolo, relevo } });
      });
      return b;
    }),
  );
}

async function carregarSimbolo(arquivo, salvo = null) {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_SIMBOLO / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    simboloImagem = { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data, nome: arquivo.name, canvas };
    chaveSimbolo = "";
    coresSimbolo = null;
    if (!salvo) {
      mudar({ simbolo: { lado: "esquerda", dx: 0, dy: 0, tamanho: 100, relevo: [] }, simboloCores: 2, simboloFundo: true, argola: null });
    }
  } catch {
    mostrarAviso("Não foi possível abrir essa imagem. Use PNG, JPEG ou WebP.");
  }
}

// O símbolo foi arrastado na prévia: guarda o deslocamento em alturas do nome.
async function simboloSolto(delta) {
  const s = opcoes.simbolo;
  const h = modelo?.simbolo?.alturaNome;
  if (!s || !h) return;
  const limite = LIMITES_SIMBOLO.deslocamento;
  const prender = (v) => Math.max(-limite, Math.min(limite, Math.round(v * 1000) / 1000));
  const anterior = s;
  opcoes = { ...opcoes, simbolo: { ...s, dx: prender(s.dx + delta[0] / h), dy: prender(s.dy + delta[1] / h) }, argola: null };
  await gerar();
  if ($("ch-status").classList.contains("erro")) {
    const motivo = $("ch-status").textContent;
    opcoes = { ...opcoes, simbolo: anterior };
    await gerar();
    status(motivo, true);
  } else lembrar();
}

// ---------- Geração ----------
async function gerar() {
  invalidar();
  const minha = ++geracao;
  try {
    atualizarSimbolo();
  } catch (erro) {
    status(erro.message, true);
  }
  mostrarSimbolo();
  const pedido = { ...opcoes, simbolo: simboloImagem ? opcoes.simbolo : null };
  try {
    conferirMedidas(MEDIDAS, LIMITES_CHAVEIRO, lerMedida, (n) => `${formatar(n)} ${unidade}`);
    const [M, fonte] = await Promise.all([motorDaTela(), carregarFonte(pedido.fonte)]);
    if (minha !== geracao) return;
    const resultado = gerarChaveiro(M, fonte, pedido, coresSimbolo);
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
  previa2d.mostrar(modelo);
  mostrarLote();
}

function habilitar(pronto) {
  for (const id of ["ch-3mf", "ch-stl", "ch-fatiador", "ch-custo", "ch-salvar-modelo"]) $(id).disabled = !pronto;
}

function mostrarMedidas() {
  if (!modelo) {
    $("ch-medidas").textContent = "";
    return;
  }
  $("ch-medidas").textContent = `${modelo.dimensoes.map((d) => formatar(d)).join(" × ")} ${unidade} · ${pesoCurto(modelo.malhas, densidadeDoModelo())}`;
}

// A argola foi solta num ponto da borda: tenta a nova posição; se não servir, volta e explica.
async function argolaSolta(t) {
  const anterior = opcoes.argola;
  opcoes = { ...opcoes, argola: t };
  await gerar();
  if ($("ch-status").classList.contains("erro")) {
    const motivo = $("ch-status").textContent;
    opcoes = { ...opcoes, argola: anterior };
    await gerar();
    status(motivo, true);
  } else lembrar();
}

// ---------- Prévia 2D/3D e zoom ----------
function mudarModo(novo) {
  modo = novo;
  previa3d = mudarPrevia("ch", modo, previa2d, previa3d, partes);
}

function zoom(f) {
  zoomPrevia(modo, previa2d, previa3d, f);
}

function ajustar() {
  ajustarPrevia(modo, previa2d, previa3d);
}

// ---------- Exportação ----------
const nomeArquivo = () => `Chaveiro ${modelo.opcoes.texto}`;

function partesComSlots() {
  const slots = [Number($("ch-slot-base").value), Number($("ch-slot-texto").value)];
  return partes.map((p, i) => ({ ...p, slot: slots[i] }));
}

// 3MF conforme a impressão: com AMS (cada parte no seu filamento) ou sem AMS (tudo no filamento 1
// e uma pausa na primeira camada do texto para trocar à mão). null = cancelado.
async function arquivo3mf() {
  const base = modelo.opcoes.base;
  const escolha = await perguntarImpressao((camada, primeira) => camadaDaTroca(base, camada, primeira));
  if (!escolha) return null;
  if (escolha.ams) return { bytes: gerar3mf(partesComSlots(), { titulo: nomeArquivo() }), aviso: "" };
  const mm = escolha.z.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return {
    bytes: gerar3mf(
      partes.map((p) => ({ ...p, slot: 1 })),
      { titulo: nomeArquivo(), pausas: [escolha.z] },
    ),
    aviso: ` Pausa para trocar o filamento na camada ${escolha.numero} (${mm} mm).`,
  };
}

async function salvar(extensao) {
  if (!partes) return;
  await salvarModeloComo(extensao, partes, nomeArquivo(), arquivo3mf);
}

// ---------- Vários nomes ----------
const nomesDoLote = () => [
  ...new Set(
    $("ch-lote-nomes")
      .value.split(/\r?\n/)
      .map((n) => n.normalize("NFC").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  ),
];
const chaveDoLote = () => JSON.stringify({ opcoes, nomes: nomesDoLote(), modo: $("ch-lote-tamanho").value, simbolo: chaveSimbolo });
const gramas = (g) => `${g.toLocaleString("pt-BR", { maximumFractionDigits: g < 10 ? 1 : 0 })} g`;

function mostrarLote() {
  const nomes = nomesDoLote();
  const valido = lote && lote.chave === chaveDoLote();
  $("ch-lote-gerar").disabled = !nomes.length || !modelo;
  $("ch-lote-gerar").textContent = nomes.length ? `Preparar ${nomes.length} chaveiro(s)` : "Preparar chaveiros";
  $("ch-lote-3mf").disabled = !valido || !lote.itens.length;
  $("ch-lote-fatiador").disabled = !valido || !lote.itens.length;
  if (!lote) {
    $("ch-lote-resumo").textContent = nomes.length ? "Todos saem com o estilo, as cores e o símbolo do chaveiro acima." : "";
    $("ch-lote-lista").replaceChildren();
    return;
  }
  if (!valido) $("ch-lote-resumo").textContent = "Algo mudou desde a última preparação. Prepare de novo antes de exportar.";
}

async function prepararLote() {
  const nomes = nomesDoLote();
  if (!nomes.length || !modelo) return;
  const chave = chaveDoLote();
  $("ch-lote-gerar").disabled = true;
  try {
    const [M, fonte] = await Promise.all([motorDaTela(), carregarFonte(opcoes.fonte)]);
    const pedidoBase = { ...opcoes, argola: null, simbolo: simboloImagem ? opcoes.simbolo : null };
    // "mesma altura de letra": a escala do nome deste chaveiro vale para todos
    const escala = modelo.larguraTexto / larguraNaFonte(fonte, modelo.opcoes.texto);
    const densidade = densidadeDoModelo();
    const itens = [];
    const linhas = [];
    for (const [i, nome] of nomes.entries()) {
      $("ch-lote-resumo").textContent = `Preparando ${i + 1} de ${nomes.length}…`;
      await new Promise((r) => setTimeout(r, 0)); // deixa a tela atualizar
      try {
        const pedido = { ...pedidoBase, texto: nome };
        const r =
          $("ch-lote-tamanho").value === "letra"
            ? gerarChaveiroComLarguraDoTexto(M, fonte, pedido, escala * larguraNaFonte(fonte, nome), coresSimbolo)
            : gerarChaveiro(M, fonte, pedido, coresSimbolo);
        const p = r.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
        const tamanho = posicionarNaOrigem(p.map((x) => x.geometria));
        const g = pesoDasMalhas(r.malhas, densidade).total;
        itens.push({ nome, partes: p, tamanho, gramas: g, base: r.opcoes.base });
        linhas.push(el("li", "", `${nome} · ${formatar(tamanho.x, 1)} × ${formatar(tamanho.y, 1)} ${unidade} · ≈ ${gramas(g)}`));
      } catch (erro) {
        linhas.push(el("li", "erro", `${nome}: ${erro.message}`));
      }
    }
    let placas = 0;
    let posicoes = [];
    if (itens.length) {
      posicoes = arrumarNaMesa(
        itens.map((it) => ({ largura: it.tamanho.x, altura: it.tamanho.y })),
        { mesa: MESA },
      );
      placas = Math.max(...posicoes.map((p) => p.placa)) + 1;
    }
    lote = { chave, itens: itens.map((it, i) => ({ ...it, placa: posicoes[i].placa, posicao: [posicoes[i].x, posicoes[i].y] })), placas };
    $("ch-lote-lista").replaceChildren(...linhas);
    const total = itens.reduce((s, it) => s + it.gramas, 0);
    const falhas = nomes.length - itens.length;
    $("ch-lote-resumo").textContent = itens.length
      ? `${itens.length} chaveiro(s) · ≈ ${gramas(total)} no total · ${placas} placa(s) da Kobra X${falhas ? ` · ${falhas} nome(s) com problema` : ""}.`
      : "Nenhum nome pôde ser gerado. Veja os motivos abaixo.";
    if (itens.length) mostrarAviso(`${itens.length} chaveiro(s) prontos para exportar.`);
  } catch (erro) {
    lote = null;
    mostrarLote();
    $("ch-lote-resumo").textContent = erro.message;
    return;
  }
  mostrarLote();
}

// Um 3MF com todos: com AMS (cada parte no seu filamento) ou sem AMS (pausa na primeira camada do texto).
async function arquivoDoLote() {
  if (!lote || lote.chave !== chaveDoLote() || !lote.itens.length) return null;
  const base = lote.itens[0].base;
  const escolha = await perguntarImpressao((camada, primeira) => camadaDaTroca(base, camada, primeira));
  if (!escolha) return null;
  const slots = escolha.ams ? [Number($("ch-slot-base").value), Number($("ch-slot-texto").value)] : [1, 1];
  const objetos = lote.itens.map((it) => ({
    nome: it.nome,
    placa: it.placa,
    posicao: it.posicao,
    partes: it.partes.map((p, i) => ({ ...p, slot: slots[i] ?? 1 })),
  }));
  const titulo = `Chaveiros (${lote.itens.length})`;
  const bytes = gerar3mfVarios(objetos, { titulo, pausas: escolha.ams ? [] : [escolha.z], mesa: MESA });
  const mm = escolha.ams ? "" : escolha.z.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return { bytes, titulo, aviso: escolha.ams ? "" : ` Pausa para trocar o filamento na camada ${escolha.numero} (${mm} mm), em todas as placas.` };
}

function rotuloFatiador() {
  const nome = estado.config.fatiador?.nome;
  $("ch-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
}

// ---------- Início ----------
export function iniciarChaveiro() {
  for (const [id, chave] of [["ch-paleta-base", "corBase"], ["ch-paleta-texto", "corTexto"]]) {
    criarPaleta($(id), (cor, final) => mudar({ [chave]: cor }, { lembrar: final }));
  }
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
      invalidar();
      const [minimo, maximo] = LIMITES_CHAVEIRO[chave];
      if (!Number.isFinite(valor) || valor < minimo || valor > maximo) {
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
      gerar();
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

  // símbolo
  $("ch-simbolo-escolher").addEventListener("click", () => $("ch-simbolo-arquivo").click());
  $("ch-simbolo-arquivo").addEventListener("change", () => {
    const arquivo = $("ch-simbolo-arquivo").files[0];
    $("ch-simbolo-arquivo").value = "";
    if (arquivo) carregarSimbolo(arquivo);
  });
  $("ch-simbolo-remover").addEventListener("click", () => {
    simboloImagem = null;
    mudar({ simbolo: null });
  });
  for (const b of document.querySelectorAll("#tela-chaveiro [data-lado]")) {
    b.addEventListener("click", () => opcoes.simbolo && mudar({ simbolo: { ...opcoes.simbolo, lado: b.dataset.lado, dx: 0, dy: 0 } }));
  }
  $("ch-simbolo-tamanho").addEventListener("input", () => {
    const tamanho = Number($("ch-simbolo-tamanho").value);
    $("ch-simbolo-tamanho-valor").textContent = `${tamanho}%`;
    if (opcoes.simbolo) mudar({ simbolo: { ...opcoes.simbolo, tamanho } }, { lembrar: false, imediato: false });
  });
  $("ch-simbolo-tamanho").addEventListener("change", lembrar);
  $("ch-simbolo-cores").addEventListener("input", () => {
    $("ch-simbolo-cores-valor").textContent = $("ch-simbolo-cores").value;
    mudar({ simboloCores: Number($("ch-simbolo-cores").value) }, { lembrar: false, imediato: false });
  });
  $("ch-simbolo-cores").addEventListener("change", lembrar);
  $("ch-simbolo-fundo").addEventListener("change", () => mudar({ simboloFundo: $("ch-simbolo-fundo").checked }));

  // vários nomes
  $("ch-lote-nomes").addEventListener("input", mostrarLote);
  $("ch-lote-tamanho").addEventListener("change", mostrarLote);
  $("ch-lote-gerar").addEventListener("click", prepararLote);
  $("ch-lote-3mf").addEventListener("click", async () => {
    const a = await arquivoDoLote();
    if (a) await salvarArquivoModelo(a.bytes, a.titulo, "3mf", a.aviso);
  });
  $("ch-lote-fatiador").addEventListener("click", async () => {
    const a = await arquivoDoLote();
    if (!a) return;
    await abrirNoFatiador(a.bytes, a.titulo, "3mf");
    if (a.aviso) mostrarAviso(a.aviso.trim());
  });
  for (const b of document.querySelectorAll("#tela-chaveiro .ch-abas button")) {
    b.addEventListener("click", () => $(b.dataset.alvo).scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  $("ch-fonte").addEventListener("click", async () => {
    const id = await escolherFonte(opcoes.fonte);
    if (id && id !== opcoes.fonte) mudar({ fonte: id });
  });

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
  previa2d = criarPrevia2d($("ch-2d"), {
    aoComecar: () => status("Posicione a argola. A peça é refeita ao soltar."),
    aoSoltar: argolaSolta,
    aoComecarSimbolo: () => status("Posicione o símbolo. A peça é refeita ao soltar."),
    aoSoltarSimbolo: simboloSolto,
  });

  $("ch-3mf").addEventListener("click", () => salvar("3mf"));
  $("ch-stl").addEventListener("click", () => salvar("stl"));
  $("ch-salvar-modelo").addEventListener("click", async () => {
    if (!modelo) return;
    const r = await salvarEmMeusModelos({
      tipo: "chaveiro",
      atual: projetoAtual,
      nomePadrao: nomeArquivo(),
      montar: async () => ({
        opcoes: { ...opcoes, simbolo: simboloImagem ? opcoes.simbolo : null, nomeSimbolo: simboloImagem?.nome, loteNomes: $("ch-lote-nomes").value.slice(0, 4000) },
        miniatura: miniatura(modelo),
        imagem: simboloImagem ? await imagemComoTexto(simboloImagem.canvas) : "",
      }),
    });
    if (r) {
      projetoAtual = r;
      mostrarAviso(`"${r.nome}" salvo em Meus modelos.`);
    }
  });
  registrarAbridor("chaveiro", async (p) => {
    const { nomeSimbolo, loteNomes, ...resto } = p.opcoes;
    opcoes = { ...PADRAO_CHAVEIRO, ...resto };
    simboloImagem = null;
    if (p.imagem && opcoes.simbolo) await carregarSimbolo(arquivoDeTexto(p.imagem, nomeSimbolo || "simbolo.png"), p);
    else opcoes.simbolo = null;
    $("ch-lote-nomes").value = loteNomes ?? "";
    lote = null;
    projetoAtual = { id: p.id, nome: p.nome };
    historico = [];
    posicao = -1;
    preencherCampos();
    lembrar();
    gerar();
  });
  $("ch-custo").addEventListener("click", () => {
    if (!modelo) return;
    calcularCustoModelo(modelo, nomeArquivo());
  });
  $("ch-fatiador").addEventListener("click", async () => {
    if (!partes) return;
    await enviarModeloAoFatiador(partes, nomeArquivo(), arquivo3mf);
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
