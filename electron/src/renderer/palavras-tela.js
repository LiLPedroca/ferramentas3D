// Tela das Palavras decorativas: até 3 linhas, placa ou letreiro, prévia 2D/3D.
import { preencherDoModelo } from "./calculadora-tela.js";
import { abrirNoFatiador } from "./fatiador-ui.js";
import { pesoCurto, pesoDasMalhas, textoDoPeso } from "./modelos/estimativa.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { carregarFonte } from "./modelos/fontes.js";
import { geometriaDaMalha, posicionarNaOrigem } from "./modelos/geometria.js";
import { motorDaTela } from "./modelos/manifold.js";
import { camadaDaTroca } from "./modelos/chaveiro.js";
import { gerarPalavras, LIMITES_PALAVRAS, PADRAO_PALAVRAS } from "./modelos/palavras.js";
import { criarPrevia2d, miniatura } from "./modelos/previa2d.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { criarPaleta, escolherFonte, marcarPaleta, mostrarFonte, perguntarImpressao, registrarAbridor, salvarEmMeusModelos } from "./modelos-ui.js";
import { estado, mostrarAviso, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);
const MEDIDAS = { "pl-largura": "largura", "pl-espacamento": "espacamento", "pl-espessura": "espessura", "pl-relevo": "relevo", "pl-borda": "borda", "pl-ligacao": "ligacao" };
const NOMES = { largura: "Largura total", espacamento: "Espaço entre linhas", espessura: "Espessura", relevo: "Relevo", borda: "Borda", ligacao: "Ligação" };

let opcoes = {
  ...PADRAO_PALAVRAS,
  linhas: [...PADRAO_PALAVRAS.linhas.map((l) => ({ ...l })), { texto: "", fonte: "Fredoka", tamanho: 45 }],
};
let modelo = null;
let partes = null;
let modo = "2d";
let previa2d = null;
let projetoAtual = null; // { id, nome } quando veio de Meus modelos
let previa3d = null;
let temporizador = null;
let geracao = 0;

const formatar = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const status = (texto, erro = false) => {
  $("pl-status").textContent = texto;
  $("pl-status").classList.toggle("erro", erro);
};

function preencherCampos() {
  opcoes.linhas.forEach((l, i) => {
    $(`pl-texto-${i + 1}`).value = l.texto;
    $(`pl-tamanho-${i + 1}`).value = formatar(l.tamanho);
    mostrarFonte($(`pl-fonte-${i + 1}`), l.fonte);
  });
  for (const [id, chave] of Object.entries(MEDIDAS)) $(id).value = formatar(opcoes[chave]);
  const letreiro = opcoes.modo === "letreiro";
  for (const b of document.querySelectorAll("[data-pl-modo]")) b.setAttribute("aria-pressed", String(b.dataset.plModo === opcoes.modo));
  for (const b of document.querySelectorAll("[data-pl-estilo]")) b.setAttribute("aria-pressed", String(b.dataset.plEstilo === opcoes.estilo));
  $("pl-so-placa").hidden = letreiro;
  $("campo-pl-relevo").hidden = letreiro;
  $("campo-pl-borda").hidden = letreiro;
  $("campo-pl-ligacao").hidden = !letreiro;
  $("pl-modo-ajuda").textContent = letreiro
    ? "Letras com a espessura toda, ligadas entre si e a uma barra embaixo: a peça fica em pé."
    : "Texto em relevo sobre uma base.";
  $("pl-rotulo-espessura").textContent = letreiro ? "Espessura das letras" : "Espessura da placa";
  $("pl-rotulo-cor-base").textContent = letreiro ? "Barra" : "Placa";
  $("pl-rotulo-cor-texto").textContent = letreiro ? "Letras" : "Texto";
  marcarPaleta($("pl-paleta-base"), opcoes.corBase);
  marcarPaleta($("pl-paleta-texto"), opcoes.corTexto);
}

function mudar(mudancas) {
  opcoes = { ...opcoes, ...mudancas };
  preencherCampos();
  gerar();
}

function agendar() {
  clearTimeout(temporizador);
  status("Atualizando a peça…");
  temporizador = setTimeout(gerar, 250);
}

function habilitar(pronto) {
  for (const id of ["pl-3mf", "pl-stl", "pl-fatiador", "pl-custo", "pl-salvar-modelo"]) $(id).disabled = !pronto;
}

async function gerar() {
  clearTimeout(temporizador);
  const minha = ++geracao;
  const pedido = structuredClone(opcoes);
  try {
    const usadas = pedido.linhas.filter((l) => l.texto.trim());
    const [M, ...lista] = await Promise.all([motorDaTela(), ...usadas.map((l) => carregarFonte(l.fonte))]);
    if (minha !== geracao) return;
    const fontes = new Map(usadas.map((l, i) => [l.fonte, lista[i]]));
    modelo = gerarPalavras(M, fontes, pedido);
    partes = modelo.malhas.map((m) => ({ nome: m.nome, cor: m.cor, geometria: geometriaDaMalha(m) }));
    posicionarNaOrigem(partes.map((p) => p.geometria));
    if (modo === "3d") previa3d?.mostrar(partes);
    status(modelo.avisos.join(" ") || "Peça pronta. Confira a prévia e as medidas antes de exportar.");
    $("pl-partes").textContent = `${partes[0].nome} no filamento 1 · ${partes[1].nome} no filamento 2`;
    habilitar(true);
  } catch (erro) {
    if (minha !== geracao) return;
    status(erro.message, true);
    habilitar(false);
  }
  $("pl-medidas").textContent = modelo ? `${modelo.dimensoes.map(formatar).join(" × ")} mm · ${pesoCurto(modelo.malhas)}` : "";
  previa2d.mostrar(modelo);
}

function mudarModo(novo) {
  modo = novo;
  $("pl-ver-2d").setAttribute("aria-pressed", String(modo === "2d"));
  $("pl-ver-3d").setAttribute("aria-pressed", String(modo === "3d"));
  previa2d.ativar(modo === "2d");
  $("pl-3d").hidden = modo !== "3d";
  if (modo === "3d") {
    previa3d ??= criarPrevia($("pl-3d"));
    if (partes) previa3d.mostrar(partes);
  }
}

const nomeArquivo = () => `Palavras ${modelo.opcoes.linhas.map((l) => l.texto).join(" ")}`.slice(0, 60);

// Placa: cores em camadas diferentes (placa embaixo, texto em cima) → pergunta se é com AMS; sem AMS,
// tudo no filamento 1 e pausa na primeira camada do texto. Letreiro: as cores dividem as mesmas
// camadas, então só existe a impressão com AMS.
async function arquivo3mf() {
  const titulo = nomeArquivo();
  if (modelo.opcoes.modo !== "placa") return { bytes: gerar3mf(partes, { titulo }), aviso: "" };
  const base = modelo.opcoes.espessura;
  const escolha = await perguntarImpressao((camada, primeira) => camadaDaTroca(base, camada, primeira));
  if (!escolha) return null;
  if (escolha.ams) return { bytes: gerar3mf(partes, { titulo }), aviso: "" };
  const mm = escolha.z.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return {
    bytes: gerar3mf(
      partes.map((p) => ({ ...p, slot: 1 })),
      { titulo, pausas: [escolha.z] },
    ),
    aviso: ` Pausa para trocar o filamento na camada ${escolha.numero} (${mm} mm).`,
  };
}

async function salvar(extensao) {
  if (!partes) return;
  let bytes;
  let aviso = "";
  if (extensao === "3mf") {
    const arquivo = await arquivo3mf();
    if (!arquivo) return;
    ({ bytes, aviso } = arquivo);
  } else bytes = gerarStl(partes);
  const resposta = await window.modelos.salvar(bytes, nomeArquivo(), extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.${aviso}`);
}

export function iniciarPalavras() {
  criarPaleta($("pl-paleta-base"), (cor) => mudar({ corBase: cor }));
  criarPaleta($("pl-paleta-texto"), (cor) => mudar({ corTexto: cor }));
  for (let n = 1; n <= 3; n++) {
    const i = n - 1;
    $(`pl-texto-${n}`).addEventListener("input", () => {
      opcoes.linhas[i] = { ...opcoes.linhas[i], texto: $(`pl-texto-${n}`).value };
      agendar();
    });
    $(`pl-tamanho-${n}`).addEventListener("input", () => {
      const v = Number(String($(`pl-tamanho-${n}`).value).replace(",", "."));
      const [minimo, maximo] = LIMITES_PALAVRAS.tamanho;
      if (!Number.isFinite(v) || v < minimo || v > maximo) {
        status(`Tamanho da linha ${n}: use de ${minimo} a ${maximo}%.`, true);
        habilitar(false);
        return;
      }
      opcoes.linhas[i] = { ...opcoes.linhas[i], tamanho: v };
      agendar();
    });
    $(`pl-fonte-${n}`).addEventListener("click", async () => {
      const id = await escolherFonte(opcoes.linhas[i].fonte);
      if (!id || id === opcoes.linhas[i].fonte) return;
      opcoes.linhas[i] = { ...opcoes.linhas[i], fonte: id };
      mudar({});
    });
  }
  for (const [id, chave] of Object.entries(MEDIDAS)) {
    $(id).addEventListener("input", () => {
      const v = Number(String($(id).value).replace(",", "."));
      const [minimo, maximo] = LIMITES_PALAVRAS[chave];
      if (!Number.isFinite(v) || v < minimo || v > maximo) {
        status(`${NOMES[chave]}: use de ${formatar(minimo)} a ${formatar(maximo)} mm.`, true);
        habilitar(false);
        return;
      }
      opcoes = { ...opcoes, [chave]: v };
      agendar();
    });
    $(id).addEventListener("change", preencherCampos);
  }
  for (const b of document.querySelectorAll("[data-pl-modo]")) b.addEventListener("click", () => mudar({ modo: b.dataset.plModo }));
  for (const b of document.querySelectorAll("[data-pl-estilo]")) b.addEventListener("click", () => mudar({ estilo: b.dataset.plEstilo }));
  for (const b of document.querySelectorAll("#tela-palavras .ch-abas button")) {
    b.addEventListener("click", () => $(b.dataset.alvo).scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  previa2d = criarPrevia2d($("pl-2d"));
  $("pl-ver-2d").addEventListener("click", () => mudarModo("2d"));
  $("pl-ver-3d").addEventListener("click", () => mudarModo("3d"));
  $("pl-zoom-menos").addEventListener("click", () => (modo === "3d" ? previa3d?.zoom(1.25) : previa2d.zoom(1.25)));
  $("pl-zoom-mais").addEventListener("click", () => (modo === "3d" ? previa3d?.zoom(0.8) : previa2d.zoom(0.8)));
  $("pl-ajustar").addEventListener("click", () => (modo === "3d" ? previa3d?.enquadrar() : previa2d.ajustar()));

  $("pl-3mf").addEventListener("click", () => salvar("3mf"));
  $("pl-stl").addEventListener("click", () => salvar("stl"));
  $("pl-salvar-modelo").addEventListener("click", async () => {
    if (!modelo) return;
    const r = await salvarEmMeusModelos({
      tipo: "palavras",
      atual: projetoAtual,
      nomePadrao: nomeArquivo(),
      montar: async () => ({ opcoes: structuredClone(opcoes), miniatura: miniatura(modelo) }),
    });
    if (r) {
      projetoAtual = r;
      mostrarAviso(`"${r.nome}" salvo em Meus modelos.`);
    }
  });
  registrarAbridor("palavras", (p) => {
    const linhas = [...(p.opcoes.linhas ?? [])].slice(0, 3);
    while (linhas.length < 3) linhas.push({ texto: "", fonte: "Fredoka", tamanho: 45 });
    opcoes = { ...PADRAO_PALAVRAS, ...p.opcoes, linhas };
    projetoAtual = { id: p.id, nome: p.nome };
    preencherCampos();
    gerar();
  });
  $("pl-custo").addEventListener("click", () => {
    if (!modelo) return;
    const peso = pesoDasMalhas(modelo.malhas);
    preencherDoModelo({ nome: nomeArquivo(), pesoG: peso.total, detalhe: textoDoPeso(peso).replace(/^≈ /, "") });
  });
  $("pl-fatiador").addEventListener("click", async () => {
    if (!partes) return;
    const arquivo = await arquivo3mf();
    if (!arquivo) return;
    await abrirNoFatiador(arquivo.bytes, nomeArquivo(), "3mf");
    if (arquivo.aviso) mostrarAviso(arquivo.aviso.trim());
  });
  preencherCampos();
  registrarAoAbrir("palavras", () => {
    const nome = estado.config.fatiador?.nome;
    $("pl-fatiador").textContent = nome ? `Abrir no ${nome}` : "Abrir no fatiador";
    status("Preparando a peça…");
    gerar();
  });
}
