// Orçamentos: lista (com busca e filtro por situação) e editor com totais ao vivo e PDF.
import modeloOrcamento from "../core/orcamento.cjs";
import modeloProduto from "../core/produto.cjs";
import { normalizar } from "../core/inicio.js";
import { icone } from "./icones.js";
import { confirmar, estado, irPara, mostrarAviso } from "./shell.js";

const { ROTULOS_SITUACAO, calcularTotais, centavosParaTexto } = modeloOrcamento;
const { centavosDeTexto } = modeloProduto;

const $ = (id) => document.getElementById(id);

let orcamentos = [];
let clientes = [];
let produtos = [];
let editando = null; // orçamento gravado em edição (null = novo)
let itens = []; // [{ produtoId?, custoUnitarioCentavos?, descricao, quantidade, preco }]

// ---------- Utilidades ----------
function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export function reais(centavos) {
  const c = BigInt(centavos);
  const negativo = c < 0n;
  const abs = negativo ? -c : c;
  const inteiro = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${inteiro},${(abs % 100n).toString().padStart(2, "0")}`;
}

const dataCurta = (iso) => new Date(iso).toLocaleDateString("pt-BR");
export const numeroOrcamento = (n) => `#${String(n).padStart(4, "0")}`;

function chipSituacao(situacao) {
  return el("span", `chip-situacao ${situacao}`, ROTULOS_SITUACAO[situacao] ?? situacao);
}

async function carregarApoio() {
  const [rc, rp] = await Promise.all([window.dados.clientes.listar(), window.dados.produtos.listar()]);
  clientes = rc.ok ? rc.dados : [];
  produtos = rp.ok ? rp.dados : [];
}

// ---------- Lista ----------
function linhaOrcamento(o) {
  const linha = el("button", "linha-orcamento");
  linha.type = "button";
  linha.setAttribute("aria-label", `Abrir orçamento ${numeroOrcamento(o.numero)}`);
  const total = calcularTotais(o).total;
  linha.append(
    el("span", "orc-numero", numeroOrcamento(o.numero)),
    el("span", "orc-cliente", o.cliente?.nome ?? "Sem cliente"),
    el("span", "orc-data", dataCurta(o.criadoEm)),
    el("span", "orc-total", reais(total)),
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
    const texto = normalizar(`${numeroOrcamento(o.numero)} ${o.numero} ${o.cliente?.nome ?? ""} ${o.itens.map((i) => i.descricao).join(" ")}`);
    return palavras.every((p) => texto.includes(p));
  });
  $("lista-orcamentos").replaceChildren(...filtrados.map(linhaOrcamento));
  $("lista-orcamentos").hidden = filtrados.length === 0;
  $("vazio-orcamentos").hidden = orcamentos.length > 0;
  $("sem-resultado-orcamentos").hidden = orcamentos.length === 0 || filtrados.length > 0;
  $("orcamentos-resumo").textContent =
    orcamentos.length === 1 ? "1 orçamento" : `${orcamentos.length} orçamentos`;
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

// ---------- Editor: cliente ----------
function preencherClientes(selecionadoId, nomeAvulso) {
  const seletor = $("o-cliente");
  const opcoes = [new Option("Sem cliente", ""), new Option("Outro (digitar o nome)", "__avulso")];
  for (const c of clientes) opcoes.push(new Option(c.nome, c.id));
  // Cliente excluído depois do orçamento: mantém a opção com o nome guardado.
  if (selecionadoId && !clientes.some((c) => c.id === selecionadoId) && editando?.cliente?.nome) {
    opcoes.push(new Option(`${editando.cliente.nome} (excluído do cadastro)`, selecionadoId));
  }
  seletor.replaceChildren(...opcoes);
  seletor.value = selecionadoId || (nomeAvulso ? "__avulso" : "");
  $("o-cliente-nome").value = nomeAvulso ?? "";
  $("campo-cliente-nome").hidden = seletor.value !== "__avulso";
}

// ---------- Editor: itens ----------
function totalItem(item) {
  try {
    const q = String(item.quantidade).trim();
    const preco = centavosDeTexto(item.preco, "Preço");
    if (!/^\d+$/.test(q) || !preco) return null;
    return BigInt(q) * BigInt(preco);
  } catch {
    return null;
  }
}

function linhaItem(item, indice) {
  const linha = el("div", "item-orcamento");

  const descricao = el("input", "item-descricao");
  descricao.value = item.descricao;
  descricao.maxLength = 160;
  descricao.setAttribute("aria-label", `Descrição do item ${indice + 1}`);
  descricao.addEventListener("input", () => {
    item.descricao = descricao.value;
  });

  const quantidade = el("input", "item-qtd");
  quantidade.value = item.quantidade;
  quantidade.inputMode = "numeric";
  quantidade.setAttribute("aria-label", `Quantidade do item ${indice + 1}`);

  const preco = el("input", "item-preco");
  preco.value = item.preco;
  preco.inputMode = "decimal";
  preco.setAttribute("aria-label", `Preço unitário do item ${indice + 1}`);

  const total = el("span", "item-total");
  const atualizarLinha = () => {
    const t = totalItem(item);
    total.textContent = t === null ? "—" : reais(t);
    atualizarTotais();
  };
  quantidade.addEventListener("input", () => {
    item.quantidade = quantidade.value;
    atualizarLinha();
  });
  preco.addEventListener("input", () => {
    item.preco = preco.value;
    atualizarLinha();
  });

  const remover = el("button", "item-remover");
  remover.type = "button";
  remover.setAttribute("aria-label", `Remover item ${indice + 1}`);
  remover.textContent = "×";
  remover.addEventListener("click", () => {
    itens.splice(indice, 1);
    renderizarItens();
  });

  const t = totalItem(item);
  total.textContent = t === null ? "—" : reais(t);
  linha.append(descricao, quantidade, preco, total, remover);
  return linha;
}

function renderizarItens() {
  $("o-itens").replaceChildren(...itens.map(linhaItem));
  $("o-itens-vazio").hidden = itens.length > 0;
  $("o-itens-cabecalho").hidden = itens.length === 0;
  atualizarTotais();
}

function adicionarProduto(id) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;
  itens.push({
    produtoId: p.id,
    custoUnitarioCentavos: p.custo?.custoUnitarioCentavos,
    descricao: p.nome,
    quantidade: "1",
    preco: centavosParaTexto(p.precoCentavos),
  });
  renderizarItens();
}

function preencherProdutos() {
  const seletor = $("o-add-produto");
  seletor.replaceChildren(
    new Option(produtos.length ? "+ Adicionar produto…" : "Nenhum produto cadastrado", ""),
    ...produtos.map((p) => new Option(`${p.nome} — ${reais(p.precoCentavos)}`, p.id)),
  );
  seletor.disabled = produtos.length === 0;
}

// ---------- Editor: totais ao vivo ----------
function valoresDoFormulario() {
  const clienteSel = $("o-cliente").value;
  return {
    clienteId: clienteSel && clienteSel !== "__avulso" ? clienteSel : "",
    clienteNome: clienteSel === "__avulso" ? $("o-cliente-nome").value : "",
    itens: itens.map((i) => ({
      descricao: i.descricao,
      quantidade: i.quantidade,
      preco: i.preco,
      produtoId: i.produtoId ?? "",
      custoUnitarioCentavos: i.custoUnitarioCentavos ?? "",
    })),
    desconto: $("o-desconto").value,
    frete: $("o-frete").value,
    validadeDias: $("o-validade").value,
    prazoProducao: $("o-prazo").value,
    formaPagamento: $("o-pagamento").value,
    observacoes: $("o-obs").value,
    situacao: $("o-situacao").value,
  };
}

function atualizarTotais() {
  const prontos = [];
  let todosValidos = true;
  for (const item of itens) {
    const t = totalItem(item);
    if (t === null) {
      todosValidos = false;
      continue;
    }
    prontos.push({
      quantidade: Number(item.quantidade),
      precoUnitarioCentavos: centavosDeTexto(item.preco, "Preço"),
      custoUnitarioCentavos: item.custoUnitarioCentavos,
    });
  }
  let desconto = "0";
  let frete = "0";
  try {
    desconto = centavosDeTexto($("o-desconto").value, "Desconto") || "0";
    frete = centavosDeTexto($("o-frete").value, "Frete") || "0";
  } catch {
    todosValidos = false;
  }
  const t = calcularTotais({ itens: prontos, descontoCentavos: desconto, freteCentavos: frete });
  $("o-subtotal").textContent = reais(t.subtotal);
  $("o-res-desconto").textContent = t.desconto > 0n ? `- ${reais(t.desconto)}` : reais(0n);
  $("o-res-frete").textContent = reais(t.frete);
  $("o-total").textContent = reais(t.total);
  $("o-total").classList.toggle("negativo", t.total < 0n);

  const mostrarLucro = todosValidos && t.lucro !== null;
  $("o-bloco-lucro").hidden = !mostrarLucro;
  if (mostrarLucro) {
    $("o-custo").textContent = reais(t.custo);
    $("o-lucro").textContent = reais(t.lucro);
    $("o-lucro").classList.toggle("negativo", t.lucro < 0n);
  }
}

// ---------- Editor: abrir, salvar, PDF, excluir ----------
export async function abrirEditor(o, { clienteId } = {}) {
  await carregarApoio();
  editando = o ?? null;
  const padrao = estado.config.orcamento ?? { validadeDias: 7, prazoProducao: "", formaPagamento: "", observacoes: "" };

  itens = o
    ? o.itens.map((i) => ({
        produtoId: i.produtoId,
        custoUnitarioCentavos: i.custoUnitarioCentavos,
        descricao: i.descricao,
        quantidade: String(i.quantidade),
        preco: centavosParaTexto(i.precoUnitarioCentavos),
      }))
    : [];

  const idCliente = o?.cliente?.id ?? clienteId ?? "";
  const nomeAvulso = o?.cliente && !o.cliente.id ? o.cliente.nome : "";
  preencherClientes(idCliente, nomeAvulso);
  preencherProdutos();

  $("o-desconto").value = o && o.descontoCentavos !== "0" ? centavosParaTexto(o.descontoCentavos) : "";
  $("o-frete").value = o && o.freteCentavos !== "0" ? centavosParaTexto(o.freteCentavos) : "";
  $("o-validade").value = String(o?.validadeDias ?? padrao.validadeDias);
  $("o-prazo").value = o?.prazoProducao ?? padrao.prazoProducao;
  $("o-pagamento").value = o?.formaPagamento ?? padrao.formaPagamento;
  $("o-obs").value = o?.observacoes ?? padrao.observacoes;
  $("o-situacao").value = o?.situacao ?? "rascunho";
  $("erro-orcamento").textContent = "";
  $("o-excluir").hidden = !o;
  atualizarCabecalho();
  renderizarItens();

  irPara("orcamento");
  atualizarCabecalho();
}

function atualizarCabecalho() {
  const titulo = editando ? `Orçamento ${numeroOrcamento(editando.numero)}` : "Novo orçamento";
  $("o-titulo").textContent = titulo;
  $("o-data").textContent = editando ? `Criado em ${dataCurta(editando.criadoEm)}` : "Ainda não salvo";
  if (!$("tela-orcamento").classList.contains("oculta")) $("titulo-tela").textContent = titulo;
}

async function salvar() {
  const botao = $("o-salvar");
  botao.disabled = true;
  try {
    const resposta = await window.dados.orcamentos.salvar(valoresDoFormulario(), editando?.id);
    if (!resposta.ok) {
      $("erro-orcamento").textContent = resposta.erro;
      return null;
    }
    const novo = !editando;
    editando = resposta.dados;
    $("erro-orcamento").textContent = "";
    $("o-excluir").hidden = false;
    atualizarCabecalho();
    mostrarAviso(novo ? `Orçamento ${numeroOrcamento(editando.numero)} criado.` : "Orçamento salvo.");
    return editando;
  } finally {
    botao.disabled = false;
  }
}

async function gerarPdf() {
  const botao = $("o-pdf");
  botao.disabled = true;
  try {
    const salvo = await salvar(); // o PDF sempre reflete o que está na tela
    if (!salvo) return;
    const resposta = await window.dados.orcamentos.pdf(salvo.id);
    if (!resposta.ok) {
      $("erro-orcamento").textContent = resposta.erro;
      return;
    }
    if (resposta.dados) mostrarAviso("PDF salvo e aberto.");
  } finally {
    botao.disabled = false;
  }
}

async function excluir() {
  if (!editando) return;
  const ok = await confirmar({
    titulo: "Excluir orçamento?",
    texto: `O orçamento ${numeroOrcamento(editando.numero)} será excluído. Essa ação não pode ser desfeita.`,
    botao: "Excluir",
  });
  if (!ok) return;
  const resposta = await window.dados.orcamentos.excluir(editando.id);
  if (!resposta.ok) {
    $("erro-orcamento").textContent = resposta.erro;
    return;
  }
  mostrarAviso("Orçamento excluído.");
  irPara("orcamentos");
}

export function iniciarOrcamentos() {
  $("vazio-orcamentos-icone").innerHTML = icone("orcamentos", 40);
  $("novo-orcamento").addEventListener("click", () => abrirEditor());
  $("vazio-novo-orcamento").addEventListener("click", () => abrirEditor());
  $("busca-orcamentos").addEventListener("input", renderizarLista);
  $("filtro-situacao").addEventListener("change", renderizarLista);

  $("o-cliente").addEventListener("change", () => {
    $("campo-cliente-nome").hidden = $("o-cliente").value !== "__avulso";
    if (!$("campo-cliente-nome").hidden) $("o-cliente-nome").focus();
  });
  $("o-add-produto").addEventListener("change", () => {
    adicionarProduto($("o-add-produto").value);
    $("o-add-produto").value = "";
  });
  $("o-add-item").addEventListener("click", () => {
    itens.push({ descricao: "", quantidade: "1", preco: "" });
    renderizarItens();
    const campos = $("o-itens").querySelectorAll(".item-descricao");
    campos[campos.length - 1]?.focus();
  });
  for (const id of ["o-desconto", "o-frete"]) $(id).addEventListener("input", atualizarTotais);
  $("o-salvar").addEventListener("click", salvar);
  $("o-pdf").addEventListener("click", gerarPdf);
  $("o-excluir").addEventListener("click", excluir);
}
