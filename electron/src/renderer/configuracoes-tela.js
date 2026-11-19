// Tela de Configurações: dados da calculadora, dados do orçamento (empresa, condições, PDF) e geral.
import { formatarDocumento, formatarTelefone } from "../core/formatos.js";
import { abrirSeletorFatiador } from "./fatiador-ui.js";
import { aoMudarConfig, confirmar, estado, mostrarAviso, registrarAoAbrir, salvarConfig } from "./shell.js";
import { el } from "./util-tela.js";
import { abrirImagem, arquivoEhHeic } from "./imagem-arquivo.js";
import modeloWhatsapp from "../core/whatsapp-orcamento.cjs";
import modeloPix from "../core/pix.cjs";

const { CAMPOS_MENSAGEM, MENSAGEM_PADRAO, montarMensagem } = modeloWhatsapp;
const { TIPOS_CHAVE, chaveParaMostrar } = modeloPix;

const $ = (id) => document.getElementById(id);

export const FORMAS = [
  ["debito", "Débito"],
  ["credito", "Crédito"],
  ["pix", "Pix"],
  ["dinheiro", "Dinheiro"],
];
// ---------- Dados de teste ----------
async function recriarTeste() {
  const r = await window.dados.teste.recriar();
  $("erro-teste").textContent = r.ok ? "" : r.erro;
  if (r.ok) mostrarAviso("Cliente Teste e Peça teste prontos.");
}

async function limparTestes() {
  const ok = await confirmar({
    titulo: "Limpar testes?",
    texto: "Os orçamentos e as vendas do Cliente Teste serão apagados. Seus dados reais não mudam. Essa ação não pode ser desfeita.",
    botao: "Limpar testes",
  });
  if (!ok) return;
  const r = await window.dados.teste.limpar();
  $("erro-teste").textContent = r.ok ? "" : r.erro;
  if (r.ok) mostrarAviso(`${r.dados.orcamentos} orçamento(s) e ${r.dados.vendas} venda(s) de teste apagados.`);
}

export const CAMPOS_PDF = [
  ["numero", "Número do orçamento"],
  ["nome", "Nome do produto"],
  ["quantidade", "Quantidade"],
  ["precoUnitario", "Preço unitário"],
  ["dimensoes", "Dimensões"],
];

const LOGO_LADO_MAX = 600;
const LOGO_ARQUIVO_MAX = 2 * 1024 * 1024;
let logoAtual = ""; // data URL da logo em edição
let secaoAtual = "cfg-calculadora";

// "0.9" -> "0,90" para os campos em reais; outros números com vírgula.
const virgula = (t) => String(t ?? "").replace(".", ",");
const reaisCampo = (t) => (t === "" ? "" : Number(t).toFixed(2).replace(".", ","));
const centavosCampo = (c) => (c && c !== "0" ? (Number(c) / 100).toFixed(2).replace(".", ",") : "");

// Interruptores (checkbox com cara de chave) dentro de um contêiner.
export function montarChaves(conteiner, opcoes, prefixo) {
  conteiner.replaceChildren(
    ...opcoes.map(([valor, rotulo]) => {
      const l = el("label", "chave-linha chave-cartao");
      const c = el("input", "chave");
      c.type = "checkbox";
      c.setAttribute("role", "switch");
      c.dataset.valor = valor;
      c.id = `${prefixo}-${valor}`;
      l.append(c, rotulo);
      return l;
    }),
  );
}
export const chavesMarcadas = (conteiner) => [...conteiner.querySelectorAll("input.chave")].filter((c) => c.checked).map((c) => c.dataset.valor);
export function marcarChaves(conteiner, valores) {
  for (const c of conteiner.querySelectorAll("input.chave")) c.checked = valores.includes(c.dataset.valor);
}

function mostrarSecao(id) {
  secaoAtual = id;
  for (const s of document.querySelectorAll(".config-secao")) s.hidden = s.id !== id;
  for (const b of document.querySelectorAll(".config-aba")) b.classList.toggle("ativa", b.dataset.secao === id);
}

// Abre as Configurações direto numa seção (usado pelo checklist do financeiro).
export function abrirSecaoConfig(id) {
  mostrarSecao(id);
}

function mostrarLogo() {
  const previa = $("c-logo-previa");
  previa.replaceChildren();
  if (logoAtual) {
    const img = el("img");
    img.src = logoAtual;
    img.alt = "Logo da empresa";
    previa.append(img);
  } else previa.append(el("span", "ajuda", "Nenhuma imagem selecionada"));
  $("c-logo-remover").hidden = !logoAtual;
}

function preencher() {
  const c = estado.config;
  const e = c.empresa ?? {};
  const o = c.orcamento ?? {};
  const k = c.calculadora ?? {};
  $("c-nome").value = c.nome ?? "";
  $("cc-preco-kg").value = reaisCampo(k.precoKg ?? "100");
  $("cc-potencia").value = virgula(k.potenciaW ?? "200");
  $("cc-tarifa").value = reaisCampo(k.tarifaKwh ?? "0.9");
  $("cc-custo-hora").value = reaisCampo(k.custoHora ?? "2");
  $("cc-mao-obra").value = reaisCampo(k.maoDeObra ?? "15");
  $("cc-lucro").value = virgula(k.lucroPct ?? "100");
  $("cc-valor-impressora").value = k.valorImpressora ? reaisCampo(k.valorImpressora) : "";

  $("c-emp-nome").value = e.nome ?? "";
  $("c-emp-telefone").value = formatarTelefone(e.telefone);
  $("c-emp-email").value = e.email ?? "";
  $("c-emp-documento").value = formatarDocumento(e.documento);
  $("c-emp-endereco").value = e.endereco || e.cidade || "";
  $("c-emp-site").value = e.site ?? "";
  logoAtual = e.logo ?? "";
  mostrarLogo();
  assinaturaAtual = e.assinatura ?? "";
  mostrarAssinatura();
  $("c-assinatura-nome").value = e.assinaturaNome ?? "";
  const pix = e.pix ?? {};
  $("c-pix-tipo").value = pix.tipo ?? "";
  $("c-pix-chave").value = chaveParaMostrar(pix.tipo, pix.chave);
  $("c-pix-nome").value = pix.nome ?? "";
  $("c-pix-cidade").value = pix.cidade ?? "";
  $("c-pix-sempre").checked = pix.sempre === true;

  $("c-orc-validade").value = String(o.validadeDias ?? 7);
  $("c-orc-prazo").value = o.prazoProducao ?? "";
  $("c-orc-entrega").value = o.entrega ?? "retirada";
  $("c-orc-frete").value = centavosCampo(o.freteCentavos);
  marcarChaves($("c-orc-formas"), o.formasPagamento ?? []);
  $("c-orc-descricao").value = o.descricaoComplementar ?? "";
  $("c-orc-obs").value = o.observacoes ?? "";
  $("c-orc-wpp").value = o.mensagemWhatsapp || MENSAGEM_PADRAO;
  mostrarPreviaWhatsapp();
  marcarChaves($("c-orc-pdf"), Object.entries(o.exibirPdf ?? {}).filter(([, v]) => v).map(([k2]) => k2));
  $("c-orc-arquivo").value = o.nomeArquivo === "manual" ? "manual" : "automatico";
  $("c-orc-numero").value = String(o.proximoNumero ?? 1);
  for (const id of ["erro-config", "erro-cfg-calculadora", "erro-cfg-orcamento"]) $(id).textContent = "";
}

async function salvarGeral(ev) {
  ev.preventDefault();
  const resposta = await salvarConfig({ nome: $("c-nome").value, nomePerguntado: true });
  if (!resposta.ok) {
    $("erro-config").textContent = resposta.erro;
    return;
  }
  preencher();
  mostrarAviso("Configurações salvas.");
}

async function salvarCalculadora(ev) {
  ev.preventDefault();
  const resposta = await salvarConfig({
    calculadora: {
      precoKg: $("cc-preco-kg").value,
      potenciaW: $("cc-potencia").value,
      tarifaKwh: $("cc-tarifa").value,
      custoHora: $("cc-custo-hora").value,
      maoDeObra: $("cc-mao-obra").value,
      lucroPct: $("cc-lucro").value,
      valorImpressora: $("cc-valor-impressora").value,
    },
  });
  if (!resposta.ok) {
    $("erro-cfg-calculadora").textContent = resposta.erro;
    return;
  }
  preencher();
  mostrarAviso("Dados da calculadora salvos.");
}

async function salvarOrcamento(ev) {
  ev.preventDefault();
  const pdf = chavesMarcadas($("c-orc-pdf"));
  const resposta = await salvarConfig({
    empresaParcial: {
      nome: $("c-emp-nome").value,
      telefone: $("c-emp-telefone").value,
      email: $("c-emp-email").value,
      documento: $("c-emp-documento").value,
      endereco: $("c-emp-endereco").value,
      site: $("c-emp-site").value,
      logo: logoAtual,
      assinatura: assinaturaAtual,
      assinaturaNome: $("c-assinatura-nome").value,
      pix: {
        tipo: $("c-pix-tipo").value,
        chave: $("c-pix-chave").value,
        nome: $("c-pix-nome").value,
        cidade: $("c-pix-cidade").value,
        sempre: $("c-pix-sempre").checked,
      },
    },
    orcamento: {
      validadeDias: $("c-orc-validade").value,
      prazoProducao: $("c-orc-prazo").value,
      entrega: $("c-orc-entrega").value,
      frete: $("c-orc-frete").value,
      formasPagamento: chavesMarcadas($("c-orc-formas")),
      descricaoComplementar: $("c-orc-descricao").value,
      observacoes: $("c-orc-obs").value,
      // Igual à padrão: guarda vazio, para seguir a padrão se ela mudar.
      mensagemWhatsapp: $("c-orc-wpp").value.trim() === MENSAGEM_PADRAO ? "" : $("c-orc-wpp").value,
      exibirPdf: Object.fromEntries(CAMPOS_PDF.map(([k]) => [k, pdf.includes(k)])),
      nomeArquivo: $("c-orc-arquivo").value,
      proximoNumero: $("c-orc-numero").value,
    },
  });
  if (!resposta.ok) {
    $("erro-cfg-orcamento").textContent = resposta.erro;
    return;
  }
  preencher();
  mostrarAviso("Dados do orçamento salvos.");
}

// Reduz a logo para no máximo 600 px (PNG mantém transparência).
async function prepararLogo(arquivo) {
  const heic = await arquivoEhHeic(arquivo);
  if (!heic && !/^image\/(png|jpeg)$/.test(arquivo.type)) throw new Error("Escolha uma imagem PNG, JPG ou HEIC.");
  // foto HEIC do celular: pode ser maior, porque é reduzida aqui mesmo
  if (arquivo.size > (heic ? 20 * 1024 * 1024 : LOGO_ARQUIVO_MAX)) throw new Error(`A imagem passa de ${heic ? 20 : 2} MB. Escolha uma menor.`);
  const bitmap = await abrirImagem(arquivo);
  const escala = Math.min(1, LOGO_LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL(arquivo.type === "image/png" || heic ? "image/png" : "image/jpeg", 0.9);
}

async function aoEscolherLogo() {
  const arquivo = $("c-logo-arquivo").files[0];
  $("c-logo-arquivo").value = "";
  if (!arquivo) return;
  try {
    logoAtual = await prepararLogo(arquivo);
    mostrarLogo();
    $("erro-cfg-orcamento").textContent = "";
  } catch (e) {
    $("erro-cfg-orcamento").textContent = e.message;
  }
}

function mostrarFatiador(config) {
  const f = config.fatiador;
  const n = (config.fatiadores ?? []).length;
  $("c-fatiador-atual").textContent = f?.caminho
    ? `Ativo: ${f.nome}${n > 1 ? ` · ${n} fatiadores cadastrados` : ""}`
    : "Nenhum fatiador escolhido ainda.";
}

// ---------- Minhas pastas: cada tipo de arquivo na sua pasta, com botão para abrir no Explorador ----------
async function abrirPastaDo(tipo) {
  const resposta = await window.dados.pastas.abrir(tipo);
  if (!resposta.ok) mostrarAviso(resposta.erro);
}

async function mostrarPastas() {
  const r = await window.dados.pastas.listar();
  if (!r.ok) return;
  $("c-pastas-raiz").textContent = `Tudo o que você salva fica em ${r.dados.raiz}, separado por tipo.`;
  const linha = (nome, descricao, caminho, tipo) => {
    const item = document.createElement("div");
    item.className = "pasta-item";
    const texto = document.createElement("div");
    const forte = document.createElement("strong");
    forte.textContent = nome;
    const sub = document.createElement("span");
    sub.className = "ajuda";
    sub.textContent = descricao;
    sub.title = caminho;
    texto.append(forte, sub);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "botao-secundario";
    b.textContent = "Abrir";
    b.setAttribute("aria-label", `Abrir a pasta ${nome}`);
    b.addEventListener("click", () => abrirPastaDo(tipo));
    item.append(texto, b);
    return item;
  };
  $("c-pastas").replaceChildren(
    ...r.dados.pastas.map((p) => linha(p.nome, p.descricao, p.caminho, p.tipo)),
    linha("Dados do programa", "Produtos, clientes, orçamentos e configurações (com cópia automática)", r.dados.dados, "dados"),
  );
}

// ---------- Assinatura do recibo ----------
let assinaturaAtual = "";

function mostrarAssinatura() {
  const previa = $("c-assinatura-previa");
  previa.replaceChildren();
  if (assinaturaAtual) {
    const img = el("img");
    img.src = assinaturaAtual;
    img.alt = "Assinatura";
    previa.append(img);
  } else previa.append(el("span", "ajuda", "Sem assinatura"));
  $("c-assinatura-remover").hidden = !assinaturaAtual;
}

// Recorta a assinatura: fundo branco vira transparente (se a imagem não tiver transparência),
// corta as sobras e reduz para no máximo 600 × 200 px.
async function prepararAssinatura(arquivo) {
  if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw new Error("Escolha uma imagem PNG, JPG ou WEBP.");
  if (arquivo.size > 10 * 1024 * 1024) throw new Error("A imagem passa de 10 MB. Escolha uma menor.");
  const bitmap = await abrirImagem(arquivo);
  const tela = document.createElement("canvas");
  tela.width = bitmap.width;
  tela.height = bitmap.height;
  const ctx = tela.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const dados = ctx.getImageData(0, 0, tela.width, tela.height);
  const px = dados.data;
  let transparente = false;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { transparente = true; break; }
  if (!transparente) {
    // quanto mais claro, mais transparente (branco some; o traço fica com a cor dele)
    for (let i = 0; i < px.length; i += 4) {
      const luz = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i + 3] = Math.max(0, Math.min(255, Math.round(((235 - luz) * 255) / 175)));
    }
  }
  let x1 = tela.width, y1 = tela.height, x2 = -1, y2 = -1;
  for (let y = 0; y < tela.height; y++) {
    for (let x = 0; x < tela.width; x++) {
      if (px[(y * tela.width + x) * 4 + 3] > 20) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) throw new Error("Não achei a assinatura na imagem. Use uma imagem com o traço escuro.");
  ctx.putImageData(dados, 0, 0);
  const w = x2 - x1 + 1;
  const h = y2 - y1 + 1;
  const escala = Math.min(1, 600 / w, 200 / h);
  const saida = document.createElement("canvas");
  saida.width = Math.max(1, Math.round(w * escala));
  saida.height = Math.max(1, Math.round(h * escala));
  saida.getContext("2d").drawImage(tela, x1, y1, w, h, 0, 0, saida.width, saida.height);
  return saida.toDataURL("image/png");
}

async function aoEscolherAssinatura() {
  const arquivo = $("c-assinatura-arquivo").files[0];
  $("c-assinatura-arquivo").value = "";
  if (!arquivo) return;
  try {
    assinaturaAtual = await prepararAssinatura(arquivo);
    mostrarAssinatura();
    $("erro-cfg-orcamento").textContent = "";
    mostrarAviso("Assinatura pronta. Clique em Salvar dados do orçamento.");
  } catch (e) {
    $("erro-cfg-orcamento").textContent = e.message;
  }
}

// ---------- Mensagem do WhatsApp ----------
function mostrarPreviaWhatsapp() {
  const validade = new Date(Date.now() + 7 * 864e5).toLocaleDateString("pt-BR");
  const pix = estado.config?.empresa?.pix;
  const chave = pix?.chave ? chaveParaMostrar(pix.tipo, pix.chave) : "sua chave Pix";
  $("c-wpp-previa").textContent = montarMensagem($("c-orc-wpp").value, { cliente: "Maria", numero: "0012", total: "R$ 330,00", validade, pix: chave });
}

function inserirCampoWhatsapp(chave) {
  const t = $("c-orc-wpp");
  const inicio = t.selectionStart ?? t.value.length;
  const fim = t.selectionEnd ?? t.value.length;
  t.setRangeText(`{${chave}}`, inicio, fim, "end");
  t.focus();
  mostrarPreviaWhatsapp();
}

function montarCamposWhatsapp() {
  $("c-wpp-campos").replaceChildren(
    ...CAMPOS_MENSAGEM.map((c) => {
      const b = el("button", "botao-secundario wpp-campo", `+ ${c.rotulo}`);
      b.type = "button";
      b.title = `Inserir {${c.chave}}`;
      b.addEventListener("click", () => inserirCampoWhatsapp(c.chave));
      return b;
    }),
  );
  $("c-orc-wpp").addEventListener("input", mostrarPreviaWhatsapp);
  $("c-wpp-padrao").addEventListener("click", () => {
    $("c-orc-wpp").value = MENSAGEM_PADRAO;
    mostrarPreviaWhatsapp();
  });
}

export function iniciarConfiguracoes() {
  $("c-pix-tipo").replaceChildren(new Option("Escolha o tipo", ""), ...TIPOS_CHAVE.map((t) => new Option(t.rotulo, t.id)));
  montarCamposWhatsapp();
  montarChaves($("c-orc-formas"), FORMAS, "c-orc-forma");
  montarChaves($("c-orc-pdf"), CAMPOS_PDF, "c-orc-pdf");
  for (const b of document.querySelectorAll(".config-aba")) b.addEventListener("click", () => mostrarSecao(b.dataset.secao));
  $("form-config").addEventListener("submit", salvarGeral);
  $("cfg-calculadora").addEventListener("submit", salvarCalculadora);
  $("cfg-orcamento").addEventListener("submit", salvarOrcamento);
  $("c-logo-escolher").addEventListener("click", () => $("c-logo-arquivo").click());
  $("c-assinatura-escolher").addEventListener("click", () => $("c-assinatura-arquivo").click());
  $("c-assinatura-arquivo").addEventListener("change", aoEscolherAssinatura);
  $("c-assinatura-remover").addEventListener("click", () => {
    assinaturaAtual = "";
    mostrarAssinatura();
  });
  $("c-logo-arquivo").addEventListener("change", aoEscolherLogo);
  $("c-logo-remover").addEventListener("click", () => {
    logoAtual = "";
    mostrarLogo();
  });
  $("c-abrir-explorador").addEventListener("click", () => abrirPastaDo("raiz"));
  $("c-teste-recriar").addEventListener("click", recriarTeste);
  $("c-teste-limpar").addEventListener("click", limparTestes);
  $("c-escolher-fatiador").addEventListener("click", () => abrirSeletorFatiador());
  aoMudarConfig(mostrarFatiador);
  registrarAoAbrir("configuracoes", () => {
    mostrarPastas();
    preencher();
    mostrarSecao(secaoAtual);
  });
  mostrarSecao(secaoAtual);
}
