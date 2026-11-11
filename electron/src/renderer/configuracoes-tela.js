// Tela de Configurações: dados da calculadora, dados do orçamento (empresa, condições, PDF) e geral.
import { formatarDocumento, formatarTelefone } from "../core/formatos.js";
import { abrirSeletorFatiador } from "./fatiador-ui.js";
import { aoMudarConfig, confirmar, estado, mostrarAviso, registrarAoAbrir, salvarConfig } from "./shell.js";
import { el } from "./util-tela.js";

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

  $("c-orc-validade").value = String(o.validadeDias ?? 7);
  $("c-orc-prazo").value = o.prazoProducao ?? "";
  $("c-orc-entrega").value = o.entrega ?? "retirada";
  $("c-orc-frete").value = centavosCampo(o.freteCentavos);
  marcarChaves($("c-orc-formas"), o.formasPagamento ?? []);
  $("c-orc-descricao").value = o.descricaoComplementar ?? "";
  $("c-orc-obs").value = o.observacoes ?? "";
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
    },
    orcamento: {
      validadeDias: $("c-orc-validade").value,
      prazoProducao: $("c-orc-prazo").value,
      entrega: $("c-orc-entrega").value,
      frete: $("c-orc-frete").value,
      formasPagamento: chavesMarcadas($("c-orc-formas")),
      descricaoComplementar: $("c-orc-descricao").value,
      observacoes: $("c-orc-obs").value,
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
  if (!/^image\/(png|jpeg)$/.test(arquivo.type)) throw new Error("Escolha uma imagem PNG ou JPG.");
  if (arquivo.size > LOGO_ARQUIVO_MAX) throw new Error("A imagem passa de 2 MB. Escolha uma menor.");
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LOGO_LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL(arquivo.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
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

async function abrirPasta() {
  const resposta = await window.dados.abrirPasta();
  if (!resposta.ok) mostrarAviso(resposta.erro);
}

export function iniciarConfiguracoes() {
  montarChaves($("c-orc-formas"), FORMAS, "c-orc-forma");
  montarChaves($("c-orc-pdf"), CAMPOS_PDF, "c-orc-pdf");
  for (const b of document.querySelectorAll(".config-aba")) b.addEventListener("click", () => mostrarSecao(b.dataset.secao));
  $("form-config").addEventListener("submit", salvarGeral);
  $("cfg-calculadora").addEventListener("submit", salvarCalculadora);
  $("cfg-orcamento").addEventListener("submit", salvarOrcamento);
  $("c-logo-escolher").addEventListener("click", () => $("c-logo-arquivo").click());
  $("c-logo-arquivo").addEventListener("change", aoEscolherLogo);
  $("c-logo-remover").addEventListener("click", () => {
    logoAtual = "";
    mostrarLogo();
  });
  $("abrir-pasta-dados").addEventListener("click", abrirPasta);
  $("c-teste-recriar").addEventListener("click", recriarTeste);
  $("c-teste-limpar").addEventListener("click", limparTestes);
  $("c-escolher-fatiador").addEventListener("click", () => abrirSeletorFatiador());
  aoMudarConfig(mostrarFatiador);
  registrarAoAbrir("configuracoes", () => {
    preencher();
    mostrarSecao(secaoAtual);
  });
  mostrarSecao(secaoAtual);
}
