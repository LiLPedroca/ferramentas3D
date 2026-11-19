// Tela da Calculadora gravação a laser: produto + gravação (frente ou frente e verso).
// Os valores da gravação são sempre digitados (não ficam guardados). O produto pode ser
// digitado ou escolhido em Meus produtos (aí a linha do orçamento fica ligada ao estoque dele).
// "Adicionar outro produto" guarda o cálculo numa lista e limpa o produto; no fim, um botão leva
// a lista inteira (e o produto que está na tela) para o orçamento.
import modeloLaser from "../core/laser.cjs";
import modeloOrcamento from "../core/orcamento.cjs";
import modeloImpressao from "../core/impressao.cjs";
import { adicionarItensDoCalculo, reais } from "./orcamentos.js";
import { registrarAoAbrir } from "./shell.js";

const { calcularLaser, itemDoOrcamento } = modeloLaser;
const { centavosParaTexto } = modeloOrcamento;
const { CORES } = modeloImpressao;
const $ = (id) => document.getElementById(id);

let produtos = [];
let produtoId = ""; // produto escolhido em Meus produtos
let calculo = null; // último cálculo válido
let lista = []; // produtos já calculados: { item, rotulo, detalhe, totalCentavos }

const areaEscolhida = () => document.querySelector('input[name="laser-area"]:checked')?.value ?? "";

function valores() {
  return {
    nome: $("laser-nome").value,
    cor: $("laser-cor").value,
    quantidade: $("laser-quantidade").value,
    valorProduto: $("laser-valor").value,
    valorFrente: $("laser-frente").value,
    valorFrenteVerso: $("laser-frente-verso").value,
  };
}

// Botões de área: o do campo vazio fica apagado; com um só preenchido, ele fica escolhido.
function ajustarAreas() {
  const preenchido = { frente: $("laser-frente").value.trim() !== "", frenteVerso: $("laser-frente-verso").value.trim() !== "" };
  for (const r of document.querySelectorAll('input[name="laser-area"]')) r.disabled = !preenchido[r.value];
  const atual = areaEscolhida();
  if (!atual || !preenchido[atual]) {
    const primeiro = ["frente", "frenteVerso"].find((a) => preenchido[a]);
    for (const r of document.querySelectorAll('input[name="laser-area"]')) r.checked = r.value === primeiro;
  }
}

function mostrar(op, c) {
  $("laser-por-peca").textContent = op ? reais(op.porPecaCentavos) : "R$ 0,00";
  $("laser-r-produto").textContent = c ? reais(c.produtoCentavos) : "R$ 0,00";
  $("laser-r-gravacao-rotulo").textContent = op ? `Gravação ${op.rotulo.toLowerCase()}` : "Gravação";
  $("laser-r-gravacao").textContent = op ? reais(op.gravacaoCentavos) : "R$ 0,00";
  $("laser-r-peca").textContent = op ? reais(op.porPecaCentavos) : "R$ 0,00";
  $("laser-r-quantidade").textContent = c ? String(c.quantidade) : "0";
  $("laser-total").textContent = op ? reais(op.totalCentavos) : "R$ 0,00";
}

function atualizar() {
  ajustarAreas();
  const v = valores();
  // Ainda sem valor nenhum: tela limpa, sem mensagem de erro.
  const vazio = !v.valorProduto.trim() && !v.valorFrente.trim() && !v.valorFrenteVerso.trim();
  try {
    calculo = calcularLaser(v);
    $("laser-erro").textContent = "";
    mostrar(calculo.opcoes.find((o) => o.id === areaEscolhida()) ?? calculo.opcoes[0], calculo);
  } catch (erro) {
    calculo = null;
    $("laser-erro").textContent = vazio ? "" : erro.message;
    mostrar(null, null);
  }
  $("laser-outro").disabled = !calculo;
  ajustarBotaoOrcamento();
}

function ajustarBotaoOrcamento() {
  const n = lista.length + (calculo ? 1 : 0);
  $("laser-orcamento").disabled = n === 0;
  $("laser-orcamento").textContent = lista.length ? `Adicionar ${n} ${n === 1 ? "produto" : "produtos"} ao orçamento →` : "Adicionar ao orçamento →";
}

function preencherCores() {
  $("laser-cor").replaceChildren(new Option("Escolher a cor", ""), ...CORES.map((c) => new Option(c.nome, c.id)));
  mostrarCor();
}

function mostrarCor() {
  const cor = CORES.find((c) => c.id === $("laser-cor").value);
  const amostra = $("laser-cor-amostra");
  amostra.style.background = cor?.hex || "";
  amostra.classList.toggle("vazia", !cor);
  amostra.classList.toggle("transparente", cor?.id === "transparente");
}

// Cálculo da tela (com a área escolhida) para a lista ou o orçamento.
function entradaAtual() {
  const area = areaEscolhida();
  const op = calculo.opcoes.find((o) => o.id === area) ?? calculo.opcoes[0];
  return {
    item: itemDoOrcamento(calculo, area, produtoId || undefined),
    rotulo: [calculo.nome || "Produto", calculo.cor].filter(Boolean).join(" · "),
    detalhe: `${calculo.quantidade} × ${reais(op.porPecaCentavos)} · ${op.rotulo.toLowerCase()}`,
    totalCentavos: op.totalCentavos,
  };
}

function mostrarLista() {
  $("laser-lista-bloco").hidden = !lista.length;
  $("laser-lista").replaceChildren(
    ...lista.map((e, i) => {
      const li = document.createElement("li");
      const texto = document.createElement("div");
      const nome = document.createElement("strong");
      nome.textContent = e.rotulo;
      const detalhe = document.createElement("span");
      detalhe.textContent = e.detalhe;
      texto.append(nome, detalhe);
      const total = document.createElement("strong");
      total.className = "laser-lista-valor";
      total.textContent = reais(e.totalCentavos);
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "laser-lista-remover";
      remover.textContent = "×";
      remover.title = "Tirar da lista";
      remover.setAttribute("aria-label", `Tirar ${e.rotulo} da lista`);
      remover.addEventListener("click", () => {
        lista.splice(i, 1);
        mostrarLista();
      });
      li.append(texto, total, remover);
      return li;
    }),
  );
  $("laser-lista-total").textContent = reais(lista.reduce((s, e) => s + e.totalCentavos, 0n));
  ajustarBotaoOrcamento();
}

// Guarda o produto da tela na lista e limpa os dados do produto (os valores da gravação ficam).
function adicionarOutro() {
  if (!calculo) return;
  lista.push(entradaAtual());
  limparProduto();
  mostrarLista();
  atualizar();
  $("laser-nome").focus();
}

function limparProduto() {
  for (const id of ["laser-nome", "laser-valor"]) $(id).value = "";
  $("laser-quantidade").value = "1";
  $("laser-cor").value = "";
  mostrarCor();
  $("laser-produto").value = "";
  produtoId = "";
}

function preencherProdutos() {
  const atual = produtoId;
  $("laser-produto").replaceChildren(
    new Option("Digitar o produto", ""),
    ...produtos.map((p) => new Option(`${p.nome} · ${reais(p.precoCentavos)}`, p.id)),
  );
  $("laser-produto").value = produtos.some((p) => p.id === atual) ? atual : "";
  produtoId = $("laser-produto").value;
}

async function carregarProdutos() {
  const r = await window.dados.produtos.listar();
  produtos = r.ok ? r.dados.filter((p) => !p.teste).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : [];
  preencherProdutos();
}

function escolherProduto() {
  produtoId = $("laser-produto").value;
  const p = produtos.find((x) => x.id === produtoId);
  if (p) {
    $("laser-nome").value = p.nome;
    $("laser-valor").value = centavosParaTexto(p.precoCentavos);
  }
  atualizar();
}

function adicionar() {
  const itens = [...lista, ...(calculo ? [entradaAtual()] : [])].map((e) => e.item);
  if (!itens.length) return;
  limparTudo();
  adicionarItensDoCalculo(itens);
}

function limparTudo() {
  limparProduto();
  for (const id of ["laser-frente", "laser-frente-verso"]) $(id).value = "";
  for (const r of document.querySelectorAll('input[name="laser-area"]')) r.checked = false;
  lista = [];
  mostrarLista();
  atualizar();
}

function novo() {
  limparTudo();
  $("laser-nome").focus();
}

export function iniciarLaser() {
  for (const id of ["laser-nome", "laser-quantidade", "laser-valor", "laser-frente", "laser-frente-verso"]) $(id).addEventListener("input", atualizar);
  for (const r of document.querySelectorAll('input[name="laser-area"]')) r.addEventListener("change", atualizar);
  $("laser-produto").addEventListener("change", escolherProduto);
  $("laser-cor").addEventListener("change", () => {
    mostrarCor();
    atualizar();
  });
  $("laser-outro").addEventListener("click", adicionarOutro);
  $("laser-orcamento").addEventListener("click", adicionar);
  $("laser-novo").addEventListener("click", novo);
  registrarAoAbrir("laser", carregarProdutos);
  preencherCores();
  atualizar();
}
