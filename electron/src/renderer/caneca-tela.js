import { calcularCustoModelo, salvarModeloComo, enviarModeloAoFatiador, arquivoDeTexto, imagemComoTexto, salvarArquivoModelo, zoomPrevia, ajustarPrevia } from "./modelos-acoes.js";
// Tela da Caneca de chopp: medidas (padrão = copo showroom), emblema, faixas e cores à esquerda,
// prévia 3D à direita.
import { capacidadeMl, COPO_SHOWROOM, FAIXAS, gerarCaneca, LIMITES_CANECA, PADRAO_CANECA, trocaDoEmblema, trocasDeCor } from "./modelos/caneca.js";
import { lacosDoEmblema } from "./modelos/emblema.js";
import { pesoCurto } from "./modelos/estimativa.js";
import { gerar3mf } from "./modelos/exportar.js";
import { carregarFonte } from "./modelos/fontes.js";
import { geometriaDaMalha } from "./modelos/geometria.js";
import { motorDaTela } from "./modelos/manifold.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { criarPaleta, escolherFonte, marcarPaleta, mostrarFonte, perguntarImpressao, registrarAbridor, salvarEmMeusModelos } from "./modelos-ui.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const LADO = 400; // resolução do emblema (px no lado maior)

// campos numéricos: id → chave nas opções
const MEDIDAS = {
  "cn-boca": "boca",
  "cn-altura": "altura",
  "cn-parede": "parede",
  "cn-fundo": "fundo",
  "cn-faixa": "faixa",
  "cn-letra": "letra",
  "cn-relevo": "relevo",
  "cn-escada": "escada",
  "cn-emblema-tamanho": "emblemaTamanho",
  "cn-aro": "aro",
  "cn-textura-tamanho": "texturaTamanho",
};
const CAIXAS = { "cn-alca": "alca", "cn-textura": "textura", "cn-textura-atras": "texturaAtras", "cn-inverter": "inverter" };

let opcoes = structuredClone(PADRAO_CANECA);
let emblema = null; // { canvas, nome } — imagem do emblema (reduzida)
let lacos = null; // laços do emblema (refeitos quando a imagem, o limiar ou a inversão mudam)
let modelo = null;
let partes = null;
let previa3d = null;
let temporizador = null;
let geracao = 0;
let projetoAtual = null;

const formatar = (n, casas = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const status = (texto, erro = false) => {
  $("cn-status").textContent = texto;
  $("cn-status").classList.toggle("erro", erro);
};

// ---------- Campos ----------
function preencherCampos() {
  for (const [id, chave] of Object.entries(MEDIDAS)) $(id).value = formatar(opcoes[chave], 3);
  for (const [id, chave] of Object.entries(CAIXAS)) $(id).checked = opcoes[chave];
  $("cn-formato").value = opcoes.emblemaFormato;
  $("cn-limiar").value = String(opcoes.limiar);
  $("cn-limiar-valor").textContent = formatar(opcoes.limiar);
  for (const { id } of FAIXAS) {
    $(`cn-texto-${id}-frente`).value = opcoes.textos[`${id}Frente`];
    $(`cn-texto-${id}-verso`).value = opcoes.textos[`${id}Verso`];
    $(`cn-cor-${id}`).value = opcoes.corFaixa[id];
  }
  mostrarFonte($("cn-fonte"), opcoes.fonte);
  marcarPaleta($("cn-paleta-principal"), opcoes.corPrincipal);
  marcarPaleta($("cn-paleta-segunda"), opcoes.corSegunda);
  mostrarReferencia();
}

function mostrarReferencia() {
  const igual = opcoes.boca === COPO_SHOWROOM.boca && opcoes.altura === COPO_SHOWROOM.altura;
  $("cn-referencia").textContent = igual
    ? `Medidas do copo showroom: boca interna de ${formatar(COPO_SHOWROOM.boca)} mm e ${formatar(COPO_SHOWROOM.altura)} mm de altura.`
    : `Medidas personalizadas. O copo showroom tem boca interna de ${formatar(COPO_SHOWROOM.boca)} mm e ${formatar(COPO_SHOWROOM.altura)} mm de altura.`;
  $("cn-showroom").hidden = igual;
  try {
    $("cn-capacidade").textContent = `Capacidade ≈ ${formatar(Math.round(capacidadeMl(opcoes) / 5) * 5, 0)} ml até a boca`;
  } catch {
    $("cn-capacidade").textContent = "";
  }
}

function montarFaixas() {
  const blocos = FAIXAS.map(({ id, nome }) => {
    const bloco = el("div", "cn-faixa");
    const topo = el("div", "cn-faixa-topo");
    const cor = el("select", "seletor");
    cor.id = `cn-cor-${id}`;
    cor.setAttribute("aria-label", `Cor da ${nome.toLowerCase()}`);
    cor.append(new Option("2ª cor", "segunda"), new Option("Cor principal", "principal"));
    cor.addEventListener("change", () => mudar({ corFaixa: { ...opcoes.corFaixa, [id]: cor.value } }));
    topo.append(el("strong", "", nome), cor);
    const linha = el("div", "linha");
    for (const lado of ["Frente", "Verso"]) {
      const rotulo = el("label", "campo");
      const entrada = el("div", "entrada");
      const campo = el("input");
      campo.id = `cn-texto-${id}-${lado.toLowerCase()}`;
      campo.maxLength = 30;
      campo.autocomplete = "off";
      campo.addEventListener("input", () => {
        opcoes = { ...opcoes, textos: { ...opcoes.textos, [`${id}${lado}`]: campo.value } };
        agendar();
      });
      entrada.append(campo);
      rotulo.append(el("span", "", lado), entrada);
      linha.append(rotulo);
    }
    bloco.append(topo, linha);
    return bloco;
  });
  $("cn-faixas").replaceChildren(...blocos);
}

function mudar(mudancas) {
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  agendar();
}

// ---------- Emblema ----------
function refazerLacos() {
  lacos = null;
  if (!emblema) return;
  const ctx = emblema.canvas.getContext("2d");
  const { width, height } = emblema.canvas;
  lacos = lacosDoEmblema({ width, height, data: ctx.getImageData(0, 0, width, height).data }, { limiar: opcoes.limiar, inverter: opcoes.inverter });
}

function mostrarEmblema() {
  const caixa = $("cn-emblema-imagem");
  caixa.replaceChildren(...(emblema ? [emblema.canvas] : [el("span", "cliente-sub", "Sem emblema")]));
  $("cn-sem-emblema").hidden = !emblema;
  for (const id of ["cn-formato", "cn-emblema-tamanho", "cn-aro", "cn-limiar", "cn-inverter", "cn-textura", "cn-textura-atras", "cn-textura-tamanho"]) $(id).disabled = !emblema;
}

function usarCanvas(canvas, nome) {
  emblema = { canvas, nome };
  mostrarEmblema();
  try {
    refazerLacos();
  } catch (erro) {
    status(erro.message, true);
  }
  agendar();
}

// imagem (File/Blob ou ImageBitmap) → canvas reduzido
async function canvasDaImagem(origem) {
  const bitmap = origem instanceof ImageBitmap ? origem : await createImageBitmap(origem);
  const escala = Math.min(1, LADO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Emblema de exemplo, desenhado aqui mesmo: escudo redondo escuro com aro, estrela e iniciais claras.
function emblemaExemplo() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 320;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1d2a4a";
  ctx.beginPath();
  ctx.arc(160, 160, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(160, 160, 126, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 26 : 62;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(160 + r * Math.cos(a), 125 + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  ctx.font = "bold 64px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FC", 160, 245);
  return canvas;
}

async function carregarArquivo(arquivo) {
  try {
    usarCanvas(await canvasDaImagem(arquivo), arquivo.name);
  } catch {
    mostrarAviso("Não foi possível abrir essa imagem. Use PNG, JPEG ou WebP.");
  }
}

// ---------- Geração ----------
// Cancela pedidos antigos e impede exportar a peça anterior enquanto há alterações.
function invalidar() {
  clearTimeout(temporizador);
  geracao += 1;
  habilitar(false);
}

function agendar() {
  invalidar();
  status("Atualizando a caneca…");
  temporizador = setTimeout(gerar, 350);
}

async function gerar() {
  invalidar();
  const minha = ++geracao;
  const pedido = structuredClone(opcoes);
  try {
    if (emblema && !lacos) refazerLacos();
    const [M, fonte] = await Promise.all([motorDaTela(), carregarFonte(pedido.fonte)]);
    if (minha !== geracao) return;
    const resultado = gerarCaneca(M, fonte, emblema ? lacos : null, pedido);
    modelo = resultado;
    partes = resultado.malhas.map((m) => ({ nome: m.nome, cor: m.cor, slot: m.slot, peca: m.peca, geometria: geometriaDaMalha(m) }));
    previa3d ??= criarPrevia($("cn-3d"));
    previa3d.mostrar(partes);
    status(resultado.avisos.join(" ") || "Caneca pronta. Gire a prévia para conferir as faixas e a alça.");
    habilitar(true);
  } catch (erro) {
    if (minha !== geracao) return;
    status(erro.message, true);
    habilitar(false);
  }
  mostrarMedidas();
}

function habilitar(pronto) {
  for (const id of ["cn-3mf", "cn-stl", "cn-fatiador", "cn-custo", "cn-salvar-modelo"]) $(id).disabled = !pronto;
  $("cn-emblema-3mf").disabled = !pronto || !partes?.some((p) => p.peca === "emblema");
}

function mostrarMedidas() {
  if (!modelo) {
    $("cn-medidas").textContent = "";
    return;
  }
  const [l, p, a] = modelo.dimensoes;
  $("cn-medidas").textContent = `Caneca ${formatar(l, 1)} × ${formatar(p, 1)} × ${formatar(a, 1)} mm · ${pesoCurto(modelo.malhas)}`;
}

// ---------- Exportação ----------
const nomeArquivo = () => {
  const t = modelo.opcoes.textos;
  const nome = t.cimaFrente || t.f1Frente || "personalizada";
  return `Caneca ${nome}`.slice(0, 60);
};
const NOME_COR = { principal: "cor principal", segunda: "2ª cor" };

// 3MF da caneca (e do emblema, com AMS). Sem AMS: só a caneca, tudo no filamento 1, com uma pausa
// em cada troca de faixa. null = cancelado.
async function arquivoCaneca() {
  const o = modelo.opcoes;
  const escolha = await perguntarImpressao((camada, primeira) => trocasDeCor(o, camada, primeira));
  if (!escolha) return null;
  if (escolha.ams) return { bytes: gerar3mf(partes, { titulo: nomeArquivo() }), aviso: "" };
  const trocas = escolha.trocas;
  const caneca = partes.filter((p) => p.peca === "caneca").map((p) => ({ ...p, slot: 1 }));
  const primeiraCor = modelo.regioes[0].cor;
  const passos = trocas.map((t) => `camada ${t.numero} → ${NOME_COR[t.cor]}`).join("; ");
  const semEmblema = partes.some((p) => p.peca === "emblema") ? " O emblema fica de fora: salve-o em “Salvar só o emblema”." : "";
  return {
    bytes: gerar3mf(caneca, { titulo: nomeArquivo(), pausas: trocas.map((t) => t.z) }),
    aviso: ` Comece com a ${NOME_COR[primeiraCor]}. Trocas: ${passos}.${semEmblema}`,
  };
}

async function arquivoEmblema() {
  const escolha = await perguntarImpressao(trocaDoEmblema);
  if (!escolha) return null;
  const pecas = partes.filter((p) => p.peca === "emblema");
  const titulo = `${nomeArquivo()} - emblema`;
  if (escolha.ams) return { bytes: gerar3mf(pecas, { titulo }), titulo, aviso: "" };
  return {
    bytes: gerar3mf(
      pecas.map((p) => ({ ...p, slot: 1 })),
      { titulo, pausas: [escolha.z] },
    ),
    titulo,
    aviso: ` Comece com a cor principal; pausa na camada ${escolha.numero} para a 2ª cor.`,
  };
}


// miniatura para Meus modelos: a prévia 3D reduzida
function miniaturaDaPrevia() {
  const origem = $("cn-3d").querySelector("canvas");
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 200;
  if (origem?.width) {
    const escala = Math.min(c.width / origem.width, c.height / origem.height);
    const w = origem.width * escala;
    const h = origem.height * escala;
    c.getContext("2d").drawImage(origem, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }
  return c.toDataURL("image/png");
}


// ---------- Início ----------
export function iniciarCaneca() {
  montarFaixas();
  criarPaleta($("cn-paleta-principal"), (cor, final) => (final ? mudar({ corPrincipal: cor }) : null));
  criarPaleta($("cn-paleta-segunda"), (cor, final) => (final ? mudar({ corSegunda: cor }) : null));

  for (const [id, chave] of Object.entries(MEDIDAS)) {
    $(id).addEventListener("input", () => {
      const valor = Number(String($(id).value).replace(",", "."));
      invalidar();
      const [minimo, maximo] = LIMITES_CANECA[chave];
      if (!Number.isFinite(valor) || valor < minimo || valor > maximo) {
        status(`Use de ${formatar(minimo)} a ${formatar(maximo)} mm.`, true);
        habilitar(false);
        return;
      }
      opcoes = { ...opcoes, [chave]: valor };
      mostrarReferencia();
      agendar();
    });
    $(id).addEventListener("change", preencherCampos);
  }
  for (const [id, chave] of Object.entries(CAIXAS)) {
    $(id).addEventListener("change", () => {
      if (chave === "inverter") {
        opcoes = { ...opcoes, inverter: $(id).checked };
        lacos = null;
        agendar();
        return;
      }
      mudar({ [chave]: $(id).checked });
    });
  }
  $("cn-formato").addEventListener("change", () => mudar({ emblemaFormato: $("cn-formato").value }));
  $("cn-limiar").addEventListener("input", () => {
    opcoes = { ...opcoes, limiar: Number($("cn-limiar").value) };
    $("cn-limiar-valor").textContent = formatar(opcoes.limiar);
    lacos = null;
    agendar();
  });
  $("cn-showroom").addEventListener("click", () => mudar({ boca: COPO_SHOWROOM.boca, altura: COPO_SHOWROOM.altura }));
  $("cn-fonte").addEventListener("click", async () => {
    const id = await escolherFonte(opcoes.fonte);
    if (id && id !== opcoes.fonte) mudar({ fonte: id });
  });
  $("cn-escolher").addEventListener("click", () => $("cn-entrada").click());
  $("cn-entrada").addEventListener("change", () => {
    const [arquivo] = $("cn-entrada").files;
    $("cn-entrada").value = "";
    if (arquivo) carregarArquivo(arquivo);
  });
  $("cn-exemplo").addEventListener("click", () => usarCanvas(emblemaExemplo(), "Exemplo"));
  $("cn-sem-emblema").addEventListener("click", () => {
    emblema = null;
    lacos = null;
    mostrarEmblema();
    agendar();
  });
  for (const b of document.querySelectorAll("#tela-caneca .ch-abas button")) {
    b.addEventListener("click", () => $(b.dataset.alvo).scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  $("cn-zoom-menos").addEventListener("click", () => zoomPrevia("3d", null, previa3d, 1.25));
  $("cn-zoom-mais").addEventListener("click", () => zoomPrevia("3d", null, previa3d, 0.8));
  $("cn-ajustar").addEventListener("click", () => ajustarPrevia("3d", null, previa3d));

  $("cn-3mf").addEventListener("click", async () => {
    if (!partes) return;
    const arquivo = await arquivoCaneca();
    if (arquivo) await salvarArquivoModelo(arquivo.bytes, nomeArquivo(), "3mf", arquivo.aviso);
  });
  $("cn-stl").addEventListener("click", () => partes && salvarModeloComo("stl", partes, nomeArquivo()));
  $("cn-emblema-3mf").addEventListener("click", async () => {
    if (!partes) return;
    const arquivo = await arquivoEmblema();
    if (arquivo) await salvarArquivoModelo(arquivo.bytes, arquivo.titulo, "3mf", arquivo.aviso);
  });
  $("cn-fatiador").addEventListener("click", async () => {
    if (!partes) return;
    await enviarModeloAoFatiador(partes, nomeArquivo(), arquivoCaneca);
  });
  $("cn-custo").addEventListener("click", () => {
    if (!modelo) return;
    calcularCustoModelo(modelo, nomeArquivo());
  });
  $("cn-salvar-modelo").addEventListener("click", async () => {
    if (!modelo) return;
    const r = await salvarEmMeusModelos({
      tipo: "caneca",
      atual: projetoAtual,
      nomePadrao: nomeArquivo(),
      montar: async () => ({
        opcoes: structuredClone(opcoes),
        miniatura: miniaturaDaPrevia(),
        imagem: emblema ? await imagemComoTexto(emblema.canvas) : "",
      }),
    });
    if (r) {
      projetoAtual = r;
      mostrarAviso(`"${r.nome}" salvo em Meus modelos.`);
    }
  });
  registrarAbridor("caneca", async (p) => {
    opcoes = { ...structuredClone(PADRAO_CANECA), ...p.opcoes };
    projetoAtual = { id: p.id, nome: p.nome };
    preencherCampos();
    if (p.imagem) {
      try {
        usarCanvas(await canvasDaImagem(arquivoDeTexto(p.imagem)), p.nome);
        return;
      } catch {
        mostrarAviso("Não foi possível abrir a imagem do emblema salvo.");
      }
    }
    emblema = null;
    lacos = null;
    mostrarEmblema();
    agendar();
  });

  preencherCampos();
  let primeira = true;
  registrarAoAbrir("caneca", () => {
    const nome = estado.config.fatiador?.nome;
    $("cn-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
    if (primeira) {
      primeira = false;
      if (!projetoAtual) {
        usarCanvas(emblemaExemplo(), "Exemplo");
        return;
      }
    }
    if (!partes) gerar();
  });
}
