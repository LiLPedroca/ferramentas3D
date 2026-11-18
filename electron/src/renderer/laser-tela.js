// Tela da Calculadora gravação a laser: produto + gravação (frente ou frente e verso).
// Os valores da gravação são sempre digitados (não ficam guardados). O produto pode ser
// digitado ou escolhido em Meus produtos (aí a linha do orçamento fica ligada ao estoque dele).
import modeloLaser from "../core/laser.cjs";
import modeloOrcamento from "../core/orcamento.cjs";
import { adicionarItemDoCalculo, reais } from "./orcamentos.js";
import { registrarAoAbrir } from "./shell.js";

const { calcularLaser, itemDoOrcamento } = modeloLaser;
const { centavosParaTexto } = modeloOrcamento;
const $ = (id) => document.getElementById(id);

let produtos = [];
let produtoId = ""; // produto escolhido em Meus produtos
let calculo = null; // último cálculo válido

const areaEscolhida = () => document.querySelector('input[name="laser-area"]:checked')?.value ?? "";

function valores() {
  return {
    nome: $("laser-nome").value,
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
  $("laser-orcamento").disabled = !calculo;
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
  if (!calculo) return;
  const item = itemDoOrcamento(calculo, areaEscolhida(), produtoId || undefined);
  adicionarItemDoCalculo(item);
}

function novo() {
  for (const id of ["laser-nome", "laser-valor", "laser-frente", "laser-frente-verso"]) $(id).value = "";
  $("laser-quantidade").value = "1";
  $("laser-produto").value = "";
  produtoId = "";
  for (const r of document.querySelectorAll('input[name="laser-area"]')) r.checked = false;
  atualizar();
  $("laser-nome").focus();
}

export function iniciarLaser() {
  for (const id of ["laser-nome", "laser-quantidade", "laser-valor", "laser-frente", "laser-frente-verso"]) $(id).addEventListener("input", atualizar);
  for (const r of document.querySelectorAll('input[name="laser-area"]')) r.addEventListener("change", atualizar);
  $("laser-produto").addEventListener("change", escolherProduto);
  $("laser-orcamento").addEventListener("click", adicionar);
  $("laser-novo").addEventListener("click", novo);
  registrarAoAbrir("laser", carregarProdutos);
  atualizar();
}
