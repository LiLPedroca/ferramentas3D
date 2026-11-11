// Orçamentos em 4 etapas (Cliente, Produtos, Condições, Finalizar), com prévia do PDF ao vivo,
// rascunho salvo automaticamente, histórico e, ao finalizar, a pergunta sobre o pagamento.
import modeloOrcamento from "../core/orcamento.cjs";
import modeloProduto from "../core/produto.cjs";
import modeloPdf from "../core/orcamento-pdf.cjs";
import { normalizar } from "../core/inicio.js";
import { formatarDocumento, formatarTelefone } from "../core/formatos.js";
import { CAMPOS_PDF, FORMAS, abrirSecaoConfig, chavesMarcadas, marcarChaves, montarChaves } from "./configuracoes-tela.js";
import { abrirPagamentoOrcamento, contarRevisoes, abrirRevisao } from "./financeiro-tela.js";
import { confirmar, estado, irPara, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const { ROTULOS_SITUACAO, calcularTotais, centavosParaTexto, sinalDeFormulario, sinalParaTexto, valorSinal } = modeloOrcamento;
const { centavosDeTexto } = modeloProduto;
const { CSS_ORCAMENTO, corpoOrcamento } = modeloPdf;

const $ = (id) => document.getElementById(id);

let orcamentos = [];
let clientes = [];
let produtos = [];
let f = null; // estado do formulário (é o que vai para o rascunho)
let etapa = 1;
let timerRascunho = null;
let timerPrevia = null;
let folhaPrevia = null;

// ---------- Utilidades ----------
export function reais(centavos) {
  const c = BigInt(centavos);
  const negativo = c < 0n;
  const abs = negativo ? -c : c;
  const inteiro = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${inteiro},${(abs % 100n).toString().padStart(2, "0")}`;
}
const dataCurta = (iso) => new Date(iso).toLocaleDateString("pt-BR");
// Orçamentos de teste têm numeração própria: "Teste #0001".
export const numeroOrcamento = (n, teste = false) => `${teste ? "Teste " : ""}#${String(n).padStart(4, "0")}`;
const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function centavosOuNull(texto) {
  try {
    const c = centavosDeTexto(texto, "Valor");
    return c === "" ? null : BigInt(c);
  } catch {
    return null;
  }
}

// ---------- Estado do formulário ----------
function formularioNovo() {
  const o = estado.config.orcamento ?? {};
  return {
    editandoId: null,
    numero: "",
    clienteId: "",
    cliente: { nome: "", telefone: "", documento: "", email: "", endereco: "" },
    itens: [],
    desconto: "",
    frete: o.freteCentavos && o.freteCentavos !== "0" ? centavosParaTexto(o.freteCentavos) : "",
    formasPagamento: [...(o.formasPagamento ?? [])],
    cobrarSinal: false,
    sinalTipo: "reais",
    sinalValor: "",
    entrega: o.entrega ?? "retirada",
    validadeDias: String(o.validadeDias ?? 7),
    prazoProducao: o.prazoProducao ?? "",
    descricaoComplementar: o.descricaoComplementar ?? "",
    observacoes: o.observacoes ?? "",
    exibirPdf: { ...(o.exibirPdf ?? { numero: true, nome: true, quantidade: true, precoUnitario: true, dimensoes: true }) },
    nomeArquivoModo: o.nomeArquivo === "manual" ? "manual" : "automatico",
    nomeArquivo: "",
    criadoEm: null,
    situacao: "rascunho",
  };
}

function formularioDe(o) {
  const novo = formularioNovo();
  return {
    ...novo,
    editandoId: o.id,
    numero: String(o.numero),
    clienteId: o.cliente?.id ?? "",
    cliente: {
      nome: o.cliente?.nome ?? "",
      telefone: formatarTelefone(o.cliente?.telefone ?? ""),
      documento: formatarDocumento(o.cliente?.documento ?? ""),
      email: o.cliente?.email ?? "",
      endereco: o.cliente?.endereco || o.cliente?.cidade || "",
    },
    itens: o.itens.map((i) => ({
      produtoId: i.produtoId,
      descricao: i.descricao,
      quantidade: String(i.quantidade),
      preco: centavosParaTexto(i.precoUnitarioCentavos),
      custoUnitarioCentavos: i.custoUnitarioCentavos,
      calculo: i.calculo,
      alturaMm: i.alturaMm,
      larguraMm: i.larguraMm,
      comprimentoMm: i.comprimentoMm,
    })),
    desconto: o.descontoCentavos !== "0" ? centavosParaTexto(o.descontoCentavos) : "",
    frete: o.freteCentavos !== "0" ? centavosParaTexto(o.freteCentavos) : "",
    formasPagamento: [...(o.formasPagamento ?? [])],
    cobrarSinal: o.cobrarSinal === true,
    sinalTipo: o.sinal?.tipo ?? "reais",
    sinalValor: sinalParaTexto(o.sinal),
    entrega: o.entrega ?? "retirada",
    validadeDias: String(o.validadeDias),
    prazoProducao: o.prazoProducao ?? "",
    descricaoComplementar: o.descricaoComplementar ?? "",
    observacoes: o.observacoes ?? "",
    exibirPdf: { ...novo.exibirPdf, ...(o.exibirPdf ?? {}) },
    nomeArquivoModo: o.nomeArquivo ? "manual" : novo.nomeArquivoModo,
    nomeArquivo: o.nomeArquivo ?? "",
    criadoEm: o.criadoEm,
    situacao: o.situacao,
  };
}

// Valores para o processo principal (que valida e grava).
function valoresParaSalvar(situacao) {
  return {
    clienteId: f.clienteId,
    cliente: { ...f.cliente },
    numero: f.numero,
    itens: f.itens.map((i) => ({
      descricao: i.descricao,
      quantidade: i.quantidade,
      preco: i.preco,
      produtoId: i.produtoId ?? "",
      custoUnitarioCentavos: i.custoUnitarioCentavos ?? "",
      calculo: i.calculo,
      alturaMm: i.alturaMm ?? "",
      larguraMm: i.larguraMm ?? "",
      comprimentoMm: i.comprimentoMm ?? "",
    })),
    desconto: f.desconto,
    frete: f.frete,
    validadeDias: f.validadeDias,
    prazoProducao: f.prazoProducao,
    observacoes: f.observacoes,
    descricaoComplementar: f.descricaoComplementar,
    formasPagamento: f.formasPagamento,
    cobrarSinal: f.cobrarSinal,
    sinal: { tipo: f.sinalTipo, valor: f.sinalValor },
    entrega: f.entrega,
    exibirPdf: f.exibirPdf,
    nomeArquivo: f.nomeArquivoModo === "manual" ? f.nomeArquivo : "",
    situacao,
  };
}

// Orçamento "de mentira" para a prévia: só com o que já é válido.
function orcamentoParaPrevia() {
  const itens = [];
  for (const i of f.itens) {
    const preco = centavosOuNull(i.preco);
    const q = /^\d{1,7}$/.test(String(i.quantidade).trim()) ? Number(i.quantidade) : 0;
    if (!String(i.descricao).trim() || preco === null || q < 1) continue;
    itens.push({ descricao: i.descricao, quantidade: q, precoUnitarioCentavos: preco.toString(), custoUnitarioCentavos: i.custoUnitarioCentavos, alturaMm: i.alturaMm, larguraMm: i.larguraMm, comprimentoMm: i.comprimentoMm });
  }
  let sinal = { tipo: f.sinalTipo, valor: "0" };
  try {
    sinal = sinalDeFormulario({ tipo: f.sinalTipo, valor: f.sinalValor });
  } catch {
    // valor do sinal incompleto: a prévia mostra sem sinal
  }
  const dias = /^\d{1,3}$/.test(f.validadeDias) && Number(f.validadeDias) > 0 ? Number(f.validadeDias) : 7;
  const so = (t) => String(t ?? "").replace(/\D/g, "");
  return {
    numero: /^\d{1,7}$/.test(f.numero) ? Number(f.numero) : 1,
    criadoEm: f.criadoEm ?? new Date().toISOString(),
    validadeDias: dias,
    cliente: { nome: f.cliente.nome, telefone: so(f.cliente.telefone), documento: so(f.cliente.documento), email: f.cliente.email, endereco: f.cliente.endereco, cidade: "" },
    itens,
    descontoCentavos: (centavosOuNull(f.desconto) ?? 0n).toString(),
    freteCentavos: (centavosOuNull(f.frete) ?? 0n).toString(),
    prazoProducao: f.prazoProducao,
    formasPagamento: f.formasPagamento,
    cobrarSinal: f.cobrarSinal,
    sinal,
    entrega: f.entrega,
    descricaoComplementar: f.descricaoComplementar,
    observacoes: f.observacoes,
    exibirPdf: f.exibirPdf,
    teste: ehTeste(),
  };
}

// O orçamento em edição é de teste? (cliente de teste, ou um teste cujo cliente foi excluído)
function ehTeste() {
  if (!f?.clienteId) return false;
  const c = clientes.find((x) => x.id === f.clienteId);
  if (c) return c.teste === true;
  const o = orcamentos.find((x) => x.id === f.editandoId);
  return o?.teste === true && o.cliente?.id === f.clienteId;
}

// ---------- Rascunho ----------
function agendarRascunho() {
  clearTimeout(timerRascunho);
  timerRascunho = setTimeout(salvarRascunho, 1200);
}

async function salvarRascunho() {
  clearTimeout(timerRascunho);
  const r = await window.dados.rascunho.salvar({ formulario: f, etapa });
  $("o-rascunho-status").textContent = r.ok ? `Rascunho salvo às ${hora(r.dados)}` : "";
  return r.ok;
}

function temConteudo() {
  return Boolean(f.cliente.nome.trim() || f.itens.length);
}

// ---------- Formulário: preencher e ler ----------
function preencherClientes() {
  const opcoes = [new Option("Preencher manualmente", "")];
  for (const c of clientes) opcoes.push(new Option(c.nome, c.id));
  if (f.clienteId && !clientes.some((c) => c.id === f.clienteId)) opcoes.push(new Option(`${f.cliente.nome} (excluído do cadastro)`, f.clienteId));
  $("o-cliente").replaceChildren(...opcoes);
  $("o-cliente").value = f.clienteId;
}

function preencherTudo() {
  preencherClientes();
  $("o-cli-nome").value = f.cliente.nome;
  $("o-cli-telefone").value = f.cliente.telefone;
  $("o-cli-documento").value = f.cliente.documento;
  $("o-cli-email").value = f.cliente.email;
  $("o-cli-endereco").value = f.cliente.endereco;
  $("o-numero").value = f.numero;
  $("o-desconto").value = f.desconto;
  $("o-frete").value = f.frete;
  $("o-desconto-campo").hidden = !f.desconto;
  marcarChaves($("o-formas"), f.formasPagamento);
  $("o-cobrar-sinal").checked = f.cobrarSinal;
  $("o-sinal-campos").hidden = !f.cobrarSinal;
  $("o-sinal-tipo").value = f.sinalTipo;
  $("o-sinal-valor").value = f.sinalValor;
  $("o-entrega").value = f.entrega;
  $("o-validade").value = f.validadeDias;
  $("o-prazo").value = f.prazoProducao;
  $("o-descricao").value = f.descricaoComplementar;
  $("o-obs").value = f.observacoes;
  marcarChaves($("o-pdf"), Object.entries(f.exibirPdf).filter(([, v]) => v).map(([k]) => k));
  $("o-arquivo-modo").value = f.nomeArquivoModo;
  $("o-arquivo-nome").value = f.nomeArquivo;
  $("o-arquivo-nome-campo").hidden = f.nomeArquivoModo !== "manual";
  $("o-excluir").hidden = !f.editandoId;
  $("erro-orcamento").textContent = "";
  renderizarItens();
  atualizarCabecalho();
}

// Liga um campo ao estado: lê, guarda e atualiza a tela.
function ligar(id, gravar, evento = "input") {
  $(id).addEventListener(evento, () => {
    gravar($(id).value, $(id));
    aoMudar();
  });
}

function aoMudar() {
  atualizarTotais();
  agendarPrevia();
  agendarRascunho();
}

// ---------- Etapas ----------
function irEtapa(n) {
  etapa = n;
  for (const s of document.querySelectorAll(".orc-etapa")) s.hidden = Number(s.dataset.etapa) !== n;
  for (const b of document.querySelectorAll("#o-etapas button")) {
    const k = Number(b.dataset.etapa);
    b.parentElement.classList.toggle("atual", k === n);
    b.parentElement.classList.toggle("feita", k < n);
  }
  if (n === 4) atualizarPendencias();
  agendarRascunho();
}

function pendencias() {
  const p = [];
  if (!f.cliente.nome.trim()) p.push([1, "Preencha o nome do cliente."]);
  else if (!f.cliente.telefone.trim()) p.push([1, "Preencha o telefone do cliente."]);
  if (!f.itens.length) p.push([2, "Adicione pelo menos um produto."]);
  return p;
}

function atualizarPendencias() {
  const p = pendencias();
  $("o-pendencia").textContent = p.length ? p[0][1] : "Tudo pronto para finalizar.";
  $("o-pendencia").classList.toggle("ok", !p.length);
}

// ---------- Itens ----------
function totalItem(item) {
  const preco = centavosOuNull(item.preco);
  const q = String(item.quantidade).trim();
  if (preco === null || !/^\d{1,7}$/.test(q)) return null;
  return BigInt(q) * preco;
}

function linhaItem(item, indice) {
  const tr = el("tr");
  const descricao = el("input", "item-descricao");
  descricao.value = item.descricao;
  descricao.maxLength = 160;
  descricao.setAttribute("aria-label", `Produto ${indice + 1}`);
  descricao.addEventListener("input", () => {
    item.descricao = descricao.value;
    aoMudar();
  });
  const qtd = el("input", "item-qtd");
  qtd.value = item.quantidade;
  qtd.inputMode = "numeric";
  qtd.setAttribute("aria-label", `Quantidade do produto ${indice + 1}`);
  const preco = el("input", "item-preco");
  preco.value = item.preco;
  preco.inputMode = "decimal";
  preco.setAttribute("aria-label", `Preço unitário do produto ${indice + 1}`);
  const total = el("td", "n");
  const mostrarTotal = () => {
    const t = totalItem(item);
    total.textContent = t === null ? "—" : reais(t);
  };
  qtd.addEventListener("input", () => {
    item.quantidade = qtd.value;
    mostrarTotal();
    aoMudar();
  });
  preco.addEventListener("input", () => {
    item.preco = preco.value;
    mostrarTotal();
    aoMudar();
  });
  mostrarTotal();

  const acoes = el("td", "item-acoes");
  if (!item.produtoId) {
    const salvarProd = el("button", "botao-pequeno", "Salvar produto");
    salvarProd.type = "button";
    salvarProd.addEventListener("click", () => salvarItemComoProduto(item));
    acoes.append(salvarProd);
  }
  const remover = el("button", "botao-pequeno perigo", "Remover");
  remover.type = "button";
  remover.setAttribute("aria-label", `Remover produto ${indice + 1}`);
  remover.addEventListener("click", () => {
    f.itens.splice(indice, 1);
    renderizarItens();
    aoMudar();
  });
  acoes.append(remover);

  const td = (filho) => {
    const c = el("td");
    c.append(filho);
    return c;
  };
  tr.append(td(descricao), td(qtd), td(preco), total, acoes);
  return tr;
}

function renderizarItens() {
  $("o-itens").replaceChildren(...f.itens.map(linhaItem));
  $("o-tabela-itens").hidden = f.itens.length === 0;
  $("o-itens-vazio").hidden = f.itens.length > 0;
  atualizarTotais();
}

async function salvarItemComoProduto(item) {
  const resposta = await window.dados.produtos.salvar(
    {
      nome: item.descricao,
      preco: item.preco,
      custo: item.custoUnitarioCentavos
        ? { custoUnitarioCentavos: item.custoUnitarioCentavos, lucroPct: item.calculo?.lucroPct ?? "0", data: new Date().toISOString(), calculo: item.calculo }
        : undefined,
    },
    undefined,
  );
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  item.produtoId = resposta.dados.id;
  produtos.push(resposta.dados);
  renderizarItens();
  agendarRascunho();
  mostrarAviso(`"${resposta.dados.nome}" salvo em Produtos.`);
}

function adicionarProduto(p) {
  f.itens.push({
    produtoId: p.id,
    descricao: p.nome,
    quantidade: "1",
    preco: centavosParaTexto(p.precoCentavos),
    custoUnitarioCentavos: p.custo?.custoUnitarioCentavos,
    calculo: p.custo?.calculo,
    alturaMm: p.alturaMm || undefined,
    larguraMm: p.larguraMm || undefined,
    comprimentoMm: p.comprimentoMm || undefined,
  });
  renderizarItens();
  aoMudar();
}

// Chamado pela Calculadora ("Adicionar ao orçamento").
export async function adicionarItemDoCalculo({ descricao, quantidade, precoUnitarioCentavos, custoUnitarioCentavos, calculo }) {
  if (!f) await prepararFormulario();
  f.itens.push({ descricao, quantidade: String(quantidade), preco: centavosParaTexto(precoUnitarioCentavos), custoUnitarioCentavos, calculo });
  irPara("orcamentos");
  renderizarItens();
  irEtapa(2);
  aoMudar();
  mostrarAviso(`"${descricao}" adicionado ao orçamento.`);
}

function abrirEscolherProduto() {
  $("busca-escolher-produto").value = "";
  renderizarEscolherProduto();
  $("dialogo-escolher-produto").showModal();
  $("busca-escolher-produto").focus();
}

function renderizarEscolherProduto() {
  const palavras = normalizar($("busca-escolher-produto").value).split(/\s+/).filter(Boolean);
  const lista = produtos.filter((p) => palavras.every((w) => normalizar(`${p.nome} ${p.categoria}`).includes(w)));
  $("lista-escolher-produto").replaceChildren(
    ...(lista.length
      ? lista.map((p) => {
          const b = el("button", "escolher-produto");
          b.type = "button";
          const foto = el("span", "escolher-foto");
          if (p.foto) {
            const img = el("img");
            img.src = p.foto;
            img.alt = "";
            foto.append(img);
          }
          const texto = el("span", "escolher-texto");
          texto.append(el("strong", "", p.nome), el("span", "cliente-sub", [p.categoria, reais(p.precoCentavos)].filter(Boolean).join(" · ")));
          b.append(foto, texto);
          b.addEventListener("click", () => {
            $("dialogo-escolher-produto").close();
            adicionarProduto(p);
          });
          return b;
        })
      : [el("p", "ajuda", produtos.length ? "Nenhum produto com esse nome." : "Nenhum produto cadastrado ainda.")]),
  );
}

// ---------- Totais e prévia ----------
function totais() {
  const prontos = f.itens
    .map((i) => ({ q: totalItem(i), i }))
    .filter((x) => x.q !== null)
    .map(({ i }) => ({ quantidade: Number(i.quantidade), precoUnitarioCentavos: centavosDeTexto(i.preco, "Preço"), custoUnitarioCentavos: i.custoUnitarioCentavos }));
  return calcularTotais({ itens: prontos, descontoCentavos: (centavosOuNull(f.desconto) ?? 0n).toString(), freteCentavos: (centavosOuNull(f.frete) ?? 0n).toString() });
}

function atualizarTotais() {
  const t = totais();
  const unidades = f.itens.reduce((s, i) => s + (/^\d{1,7}$/.test(String(i.quantidade).trim()) ? Number(i.quantidade) : 0), 0);
  $("o-resumo-itens").textContent = f.itens.length ? `${unidades} unidade(s) · Subtotal dos produtos: ${reais(t.subtotal)}` : "";
  $("o-total-texto").textContent = `Total do orçamento: ${reais(t.total)}`;
  let sinal = 0n;
  try {
    sinal = valorSinal({ cobrarSinal: f.cobrarSinal, sinal: sinalDeFormulario({ tipo: f.sinalTipo, valor: f.sinalValor }) }, t.total);
  } catch {
    sinal = 0n;
  }
  $("o-sinal-resumo").textContent = f.cobrarSinal ? `Sinal: ${reais(sinal)} · Saldo restante: ${reais(t.total - sinal)}` : "";
}

function agendarPrevia() {
  clearTimeout(timerPrevia);
  timerPrevia = setTimeout(atualizarPrevia, 150);
}

function atualizarPrevia() {
  const mostrar = $("o-mostrar-previa").checked;
  $("o-previa-painel").hidden = !mostrar;
  $("o-layout").classList.toggle("sem-previa", !mostrar);
  if (!mostrar) return;
  const falta = !f.cliente.nome.trim() ? "Preencha o nome do cliente." : !f.itens.length ? "Adicione pelo menos um produto." : "";
  $("o-previa-vazia").hidden = !falta;
  $("o-previa").hidden = Boolean(falta);
  $("o-previa-falta").textContent = falta;
  if (falta) return;
  const raiz = $("o-previa").shadowRoot ?? $("o-previa").attachShadow({ mode: "open" });
  if (!folhaPrevia) {
    folhaPrevia = new CSSStyleSheet();
    folhaPrevia.replaceSync(`${CSS_ORCAMENTO.replace(/@page[^}]*}/, "")} .folha { padding: 22px 20px 34px; background: #fff; min-height: 100%; } .pagina { margin-top: 18px; font: 7pt Arial, sans-serif; text-align: right; color: #444; } .orc { position: relative; } .orc .marca-teste { position: absolute; top: 260px; font-size: 90pt; }`);
  }
  raiz.adoptedStyleSheets = [folhaPrevia];
  // corpoOrcamento escapa todo texto do usuário.
  raiz.innerHTML = `<div class="folha">${corpoOrcamento(orcamentoParaPrevia(), estado.config.empresa ?? {})}<div class="pagina">Página 1 de 1</div></div>`;
}

function atualizarCabecalho() {
  const n = f.numero ? `${ehTeste() ? "de teste " : ""}#${f.numero}` : "";
  $("o-titulo").textContent = f.editandoId ? `Orçamento ${n}` : `Orçamento ${n}`.trim();
}

// ---------- Histórico ----------
function chipSituacao(situacao) {
  return el("span", `chip-situacao ${situacao}`, ROTULOS_SITUACAO[situacao] ?? situacao);
}

function linhaOrcamento(o) {
  const linha = el("button", "linha-orcamento");
  linha.type = "button";
  linha.setAttribute("aria-label", `Abrir orçamento ${numeroOrcamento(o.numero, o.teste)}`);
  linha.append(
    el("span", "orc-numero", numeroOrcamento(o.numero, o.teste)),
    el("span", "orc-cliente", o.cliente?.nome ?? "Sem cliente"),
    el("span", "orc-data", dataCurta(o.criadoEm)),
    el("span", "orc-total", reais(calcularTotais(o).total)),
    chipSituacao(o.situacao),
  );
  linha.addEventListener("click", () => abrirEditor(o));
  return linha;
}

function renderizarLista() {
  const palavras = normalizar($("busca-orcamentos").value).split(/\s+/).filter(Boolean);
  const situacao = $("filtro-situacao").value;
  const filtrados = orcamentos.filter((o) => {
    if (situacao && o.situacao !== situacao) return false;
    const texto = normalizar(`${numeroOrcamento(o.numero, o.teste)} ${o.numero} ${o.cliente?.nome ?? ""} ${o.itens.map((i) => i.descricao).join(" ")}`);
    return palavras.every((p) => texto.includes(p));
  });
  $("lista-orcamentos").replaceChildren(...filtrados.map(linhaOrcamento));
  $("lista-orcamentos").hidden = filtrados.length === 0;
  $("vazio-orcamentos").hidden = orcamentos.length > 0;
  $("sem-resultado-orcamentos").hidden = orcamentos.length === 0 || filtrados.length > 0;
  $("orcamentos-resumo").textContent = orcamentos.length === 1 ? "· 1 orçamento" : `· ${orcamentos.length} orçamentos`;
}

export async function listarOrcamentos() {
  const resposta = await window.dados.orcamentos.listar();
  return resposta.ok ? resposta.dados : [];
}

export async function carregarOrcamentos() {
  const resposta = await window.dados.orcamentos.listar();
  if (!resposta.ok) {
    $("erro-orcamentos").textContent = resposta.erro;
    return;
  }
  $("erro-orcamentos").textContent = "";
  orcamentos = resposta.dados;
  renderizarLista();
}

async function atualizarAvisoRevisao() {
  const n = await contarRevisoes();
  $("o-aviso-revisao").hidden = n === 0;
  $("o-revisao-texto").textContent = `${n} orçamento(s) aguardam revisão de pagamento.`;
}

// ---------- Abrir, novo, finalizar ----------
async function carregarApoio() {
  const [rc, rp] = await Promise.all([window.dados.clientes.listar(), window.dados.produtos.listar()]);
  clientes = rc.ok ? rc.dados : [];
  produtos = rp.ok ? rp.dados : [];
}

// Orçamentos de teste seguem a própria numeração (começa em 1) e não gastam a real.
function proximoNumeroSugerido(teste = ehTeste()) {
  const maior = orcamentos.filter((o) => (o.teste === true) === teste).reduce((m, o) => Math.max(m, o.numero), 0) + 1;
  return String(teste ? maior : Math.max(maior, estado.config.orcamento?.proximoNumero ?? 1));
}

// Primeira abertura: recupera o rascunho salvo (ou começa um novo).
async function prepararFormulario() {
  await Promise.all([carregarApoio(), carregarOrcamentos()]);
  if (f) return;
  const r = await window.dados.rascunho.ler();
  const salvo = r.ok ? r.dados?.formulario : null;
  if (salvo && typeof salvo === "object" && Array.isArray(salvo.itens) && salvo.cliente) {
    f = { ...formularioNovo(), ...salvo, cliente: { ...formularioNovo().cliente, ...salvo.cliente } };
    etapa = [1, 2, 3, 4].includes(r.dados.etapa) ? r.dados.etapa : 1;
  } else {
    f = formularioNovo();
    f.numero = proximoNumeroSugerido();
    etapa = 1;
  }
  preencherTudo();
  irEtapa(etapa);
  agendarPrevia();
}

// Abre um orçamento gravado (do histórico ou de Clientes). Sem orçamento: novo, opcionalmente com cliente.
export async function abrirEditor(o, { clienteId } = {}) {
  await prepararFormulario();
  if (temConteudo() && !(await confirmar({ titulo: "Trocar o orçamento em andamento?", texto: "O rascunho atual será substituído. Os orçamentos já finalizados não mudam.", botao: "Trocar" }))) {
    irPara("orcamentos");
    return;
  }
  f = o ? formularioDe(o) : formularioNovo();
  if (!o && clienteId) {
    const c = clientes.find((x) => x.id === clienteId);
    if (c) aplicarCliente(c);
  }
  if (!o) f.numero = proximoNumeroSugerido();
  preencherTudo();
  irPara("orcamentos");
  irEtapa(1);
  aoMudar();
}

function aplicarCliente(c) {
  f.clienteId = c.id;
  f.cliente = {
    nome: c.nome,
    telefone: formatarTelefone(c.telefone),
    documento: formatarDocumento(c.documento),
    email: c.email ?? "",
    endereco: c.cidade ?? "",
  };
}

async function novoOrcamento() {
  if (temConteudo() && !(await confirmar({ titulo: "Começar um novo orçamento?", texto: "O rascunho atual será descartado.", botao: "Novo orçamento" }))) return;
  f = formularioNovo();
  f.numero = proximoNumeroSugerido();
  preencherTudo();
  irEtapa(1);
  aoMudar();
}

async function finalizar({ pdf }) {
  const p = pendencias();
  if (p.length) {
    $("erro-orcamento").textContent = p[0][1];
    irEtapa(p[0][0]);
    return;
  }
  const botoes = [$("o-finalizar"), $("o-finalizar-pdf")];
  botoes.forEach((b) => (b.disabled = true));
  try {
    const resposta = await window.dados.orcamentos.salvar(valoresParaSalvar("finalizado"), f.editandoId ?? undefined);
    if (!resposta.ok) {
      $("erro-orcamento").textContent = resposta.erro;
      return;
    }
    const salvo = resposta.dados;
    $("erro-orcamento").textContent = "";
    if (pdf) {
      const r = await window.dados.orcamentos.pdf(salvo.id);
      if (!r.ok) mostrarAviso(r.erro);
      else if (r.dados) mostrarAviso("PDF salvo e aberto.");
    }
    // Pergunta do pagamento: cria (ou atualiza) a venda no financeiro.
    await abrirPagamentoOrcamento(salvo);
    f = formularioNovo();
    f.numero = proximoNumeroSugerido();
    await carregarOrcamentos();
    f.numero = proximoNumeroSugerido();
    preencherTudo();
    irEtapa(1);
    aoMudar();
    atualizarAvisoRevisao();
    mostrarAviso(`Orçamento ${numeroOrcamento(salvo.numero, salvo.teste)} finalizado.`);
  } finally {
    botoes.forEach((b) => (b.disabled = false));
  }
}

async function excluir() {
  if (!f.editandoId) return;
  const o = orcamentos.find((x) => x.id === f.editandoId);
  const ok = await confirmar({
    titulo: "Excluir orçamento?",
    texto: `O orçamento ${o ? numeroOrcamento(o.numero, o.teste) : ""} será excluído. Uma venda já registrada no financeiro continua lá. Essa ação não pode ser desfeita.`,
    botao: "Excluir",
  });
  if (!ok) return;
  const resposta = await window.dados.orcamentos.excluir(f.editandoId);
  if (!resposta.ok) {
    $("erro-orcamento").textContent = resposta.erro;
    return;
  }
  mostrarAviso("Orçamento excluído.");
  f = formularioNovo();
  await carregarOrcamentos();
  f.numero = proximoNumeroSugerido();
  preencherTudo();
  irEtapa(1);
  aoMudar();
}

// ---------- Início ----------
export function iniciarOrcamentos() {
  montarChaves($("o-formas"), FORMAS, "o-forma");
  montarChaves($("o-pdf"), CAMPOS_PDF, "o-pdf");

  for (const b of document.querySelectorAll("#o-etapas button")) b.addEventListener("click", () => irEtapa(Number(b.dataset.etapa)));
  for (const b of document.querySelectorAll("#tela-orcamentos [data-ir]")) b.addEventListener("click", () => irEtapa(Number(b.dataset.ir)));

  $("o-cliente").addEventListener("change", () => {
    const antes = ehTeste();
    const c = clientes.find((x) => x.id === $("o-cliente").value);
    if (c) aplicarCliente(c);
    else f.clienteId = "";
    // Trocou entre cliente real e de teste: cada um tem a sua numeração.
    if (antes !== ehTeste()) f.numero = proximoNumeroSugerido();
    preencherTudo();
    aoMudar();
  });
  const cli = (campo) => (v) => {
    f.cliente[campo] = v;
  };
  ligar("o-cli-nome", cli("nome"));
  ligar("o-cli-telefone", cli("telefone"));
  ligar("o-cli-documento", cli("documento"));
  ligar("o-cli-email", cli("email"));
  ligar("o-cli-endereco", cli("endereco"));
  ligar("o-numero", (v) => {
    f.numero = v.trim();
    atualizarCabecalho();
  });
  $("o-config-numero").addEventListener("click", () => {
    abrirSecaoConfig("cfg-orcamento");
    irPara("configuracoes");
    abrirSecaoConfig("cfg-orcamento");
    document.getElementById("c-orc-numero")?.focus();
  });

  $("o-add-produto").addEventListener("click", abrirEscolherProduto);
  $("busca-escolher-produto").addEventListener("input", renderizarEscolherProduto);
  $("fechar-escolher-produto").addEventListener("click", () => $("dialogo-escolher-produto").close());
  $("o-calcular").addEventListener("click", () => irPara("calculadora"));
  $("o-add-manual").addEventListener("click", () => {
    f.itens.push({ descricao: "", quantidade: "1", preco: "" });
    renderizarItens();
    aoMudar();
    const campos = $("o-itens").querySelectorAll(".item-descricao");
    campos[campos.length - 1]?.focus();
  });

  $("o-desconto-abrir").addEventListener("click", () => {
    $("o-desconto-campo").hidden = !$("o-desconto-campo").hidden;
    if (!$("o-desconto-campo").hidden) $("o-desconto").focus();
  });
  ligar("o-desconto", (v) => (f.desconto = v));
  ligar("o-frete", (v) => (f.frete = v));
  $("o-formas").addEventListener("change", () => {
    f.formasPagamento = chavesMarcadas($("o-formas"));
    aoMudar();
  });
  ligar("o-cobrar-sinal", (_v, e) => {
    f.cobrarSinal = e.checked;
    $("o-sinal-campos").hidden = !e.checked;
  }, "change");
  ligar("o-sinal-tipo", (v) => (f.sinalTipo = v), "change");
  ligar("o-sinal-valor", (v) => (f.sinalValor = v));
  ligar("o-entrega", (v) => (f.entrega = v), "change");
  ligar("o-validade", (v) => (f.validadeDias = v));
  ligar("o-prazo", (v) => (f.prazoProducao = v));
  ligar("o-descricao", (v) => (f.descricaoComplementar = v));
  ligar("o-obs", (v) => (f.observacoes = v));
  $("o-pdf").addEventListener("change", () => {
    const marcados = chavesMarcadas($("o-pdf"));
    f.exibirPdf = Object.fromEntries(CAMPOS_PDF.map(([k]) => [k, marcados.includes(k)]));
    aoMudar();
  });
  ligar("o-arquivo-modo", (v) => {
    f.nomeArquivoModo = v;
    $("o-arquivo-nome-campo").hidden = v !== "manual";
  }, "change");
  ligar("o-arquivo-nome", (v) => (f.nomeArquivo = v));

  $("o-mostrar-previa").addEventListener("change", atualizarPrevia);
  $("o-novo").addEventListener("click", novoOrcamento);
  $("o-salvar-rascunho").addEventListener("click", async () => {
    if (await salvarRascunho()) mostrarAviso("Rascunho salvo.");
  });
  $("o-finalizar").addEventListener("click", () => finalizar({ pdf: false }));
  $("o-finalizar-pdf").addEventListener("click", () => finalizar({ pdf: true }));
  $("o-excluir").addEventListener("click", excluir);
  $("o-revisar").addEventListener("click", async () => {
    await abrirRevisao();
    atualizarAvisoRevisao();
  });

  $("busca-orcamentos").addEventListener("input", renderizarLista);
  $("filtro-situacao").addEventListener("change", renderizarLista);

  registrarAoAbrir("orcamentos", async () => {
    await prepararFormulario();
    await carregarApoio();
    preencherClientes();
    atualizarAvisoRevisao();
    agendarPrevia();
  });
}
