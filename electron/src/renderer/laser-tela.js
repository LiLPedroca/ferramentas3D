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
import { el } from "./util-tela.js";

const { LIMITES, calcularLaser, itensDoOrcamento, nomesDasCores } = modeloLaser;
const { centavosParaTexto } = modeloOrcamento;
const { CORES } = modeloImpressao;
const $ = (id) => document.getElementById(id);

let produtos = [];
let produtoId = ""; // produto escolhido em Meus produtos
let calculo = null; // último cálculo válido
let lista = []; // produtos já calculados: { itens, rotulo, detalhe, totalCentavos }

const areaEscolhida = () => document.querySelector('input[name="laser-area"]:checked')?.value ?? "";

function valores() {
  return {
    nome: $("laser-nome").value,
    variacoes: linhas.map((l) => ({ cores: l.cores, quantidade: l.quantidade })),
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

// ---------- Cor e quantidade ----------
// Cada linha: uma ou mais cores (produto de duas cores, como "Preto e Dourado") e a quantidade.
// A lista de cores é própria (a do Windows não mostra as cores) e deixa marcar várias.
let linhas = [{ cores: [], quantidade: "1" }];
let aberta = -1; // linha com a lista de cores aberta

function amostra(cor) {
  const s = document.createElement("span");
  s.className = "laser-cor-amostra";
  s.setAttribute("aria-hidden", "true");
  s.style.background = cor?.hex || "";
  s.classList.toggle("vazia", !cor);
  s.classList.toggle("transparente", cor?.id === "transparente");
  return s;
}

const coresDaLinha = (i) => CORES.filter((c) => linhas[i].cores.includes(c.id));

function rotuloDaLinha(i) {
  const cores = coresDaLinha(i);
  return cores.length ? nomesDasCores(cores) : "Escolher a cor";
}

// Atualiza o botão (amostras + nomes) e as marcas da lista de uma linha, sem refazer a linha.
function pintarLinha(i) {
  const linha = $("laser-variacoes").children[i];
  if (!linha) return;
  const botao = linha.querySelector(".laser-cor-botao");
  const cores = coresDaLinha(i);
  botao.querySelector(".laser-amostras").replaceChildren(...(cores.length ? cores.map(amostra) : [amostra(null)]));
  botao.querySelector(".laser-cor-nome").textContent = rotuloDaLinha(i);
  botao.classList.toggle("sem-cor", !cores.length);
  const cheio = cores.length >= LIMITES.coresPorLinha;
  for (const li of linha.querySelectorAll(".laser-cor-lista li[data-cor]")) {
    const marcada = linhas[i].cores.includes(li.dataset.cor);
    li.setAttribute("aria-selected", String(marcada));
    li.setAttribute("aria-disabled", String(!marcada && cheio));
  }
}

function montarLinhas() {
  $("laser-variacoes").replaceChildren(
    ...linhas.map((l, i) => {
      const linha = el("div", "laser-variacao");
      const botao = el("button", "seletor laser-cor-botao");
      botao.type = "button";
      botao.setAttribute("aria-haspopup", "listbox");
      botao.setAttribute("aria-expanded", "false");
      botao.setAttribute("aria-label", `Cor da linha ${i + 1}`);
      const chevron = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
      botao.append(el("span", "laser-amostras"), el("span", "laser-cor-nome"));
      botao.insertAdjacentHTML("beforeend", chevron);
      botao.addEventListener("click", () => (aberta === i ? fecharCores() : abrirCores(i)));
      botao.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          abrirCores(i);
        }
      });

      const lista = el("ul", "laser-cor-lista");
      lista.setAttribute("role", "listbox");
      lista.setAttribute("aria-multiselectable", "true");
      lista.setAttribute("aria-label", "Cores do produto (escolha uma ou mais)");
      lista.hidden = true;
      const dica = el("li", "laser-cor-dica", `Escolha uma ou mais cores (até ${LIMITES.coresPorLinha})`);
      dica.setAttribute("role", "presentation");
      const opcoes = CORES.map((c) => {
        const li = el("li");
        li.setAttribute("role", "option");
        li.tabIndex = -1;
        li.dataset.cor = c.id;
        li.append(amostra(c), el("span", "", c.nome));
        li.addEventListener("click", () => alternarCor(i, c.id));
        return li;
      });
      const pronto = el("li", "laser-cor-pronto");
      pronto.setAttribute("role", "presentation");
      const limpar = el("button", "botao-texto", "Sem cor");
      limpar.type = "button";
      limpar.addEventListener("click", () => {
        linhas[i].cores = [];
        pintarLinha(i);
        atualizar();
      });
      const ok = el("button", "botao-secundario", "Pronto");
      ok.type = "button";
      ok.addEventListener("click", () => fecharCores());
      pronto.append(limpar, ok);
      lista.append(dica, ...opcoes, pronto);
      lista.addEventListener("keydown", teclaNaLista);

      const qtd = el("div", "entrada");
      const entrada = el("input");
      entrada.inputMode = "numeric";
      entrada.autocomplete = "off";
      entrada.value = l.quantidade;
      entrada.setAttribute("aria-label", `Quantidade da linha ${i + 1}`);
      entrada.addEventListener("input", () => {
        linhas[i].quantidade = entrada.value;
        atualizar();
      });
      qtd.append(entrada, el("em", "", "peças"));

      linha.append(botao, qtd);
      if (linhas.length > 1) {
        const remover = el("button", "laser-lista-remover", "×");
        remover.type = "button";
        remover.title = "Tirar esta cor";
        remover.setAttribute("aria-label", `Tirar a linha ${i + 1}`);
        remover.addEventListener("click", () => {
          linhas.splice(i, 1);
          aberta = -1;
          montarLinhas();
          atualizar();
        });
        linha.append(remover);
      }
      linha.append(lista);
      return linha;
    }),
  );
  linhas.forEach((_l, i) => pintarLinha(i));
  $("laser-mais-cor").hidden = linhas.length >= LIMITES.variacoes;
}

function alternarCor(i, id) {
  const atual = linhas[i].cores;
  if (atual.includes(id)) linhas[i].cores = atual.filter((c) => c !== id);
  else if (atual.length < LIMITES.coresPorLinha) linhas[i].cores = [...atual, id];
  pintarLinha(i);
  atualizar();
}

const listaDaLinha = (i) => $("laser-variacoes").children[i]?.querySelector(".laser-cor-lista");

function abrirCores(i) {
  fecharCores(false);
  const lista = listaDaLinha(i);
  if (!lista) return;
  aberta = i;
  lista.hidden = false;
  lista.previousElementSibling; // (a lista fica embaixo da linha)
  $("laser-variacoes").children[i].querySelector(".laser-cor-botao").setAttribute("aria-expanded", "true");
  const primeira = lista.querySelector('li[aria-selected="true"]') ?? lista.querySelector("li[data-cor]");
  primeira?.focus();
}

function fecharCores(voltarFoco = true) {
  if (aberta < 0) return;
  const i = aberta;
  aberta = -1;
  const lista = listaDaLinha(i);
  if (lista) lista.hidden = true;
  const botao = $("laser-variacoes").children[i]?.querySelector(".laser-cor-botao");
  botao?.setAttribute("aria-expanded", "false");
  if (voltarFoco) botao?.focus();
}

function teclaNaLista(e) {
  const opcoes = [...e.currentTarget.querySelectorAll("li[data-cor]")];
  const k = opcoes.indexOf(document.activeElement);
  const ir = (n) => {
    e.preventDefault();
    opcoes[Math.max(0, Math.min(opcoes.length - 1, n))].focus();
  };
  if (e.key === "ArrowDown") ir(k + 1);
  else if (e.key === "ArrowUp") ir(k - 1);
  else if (e.key === "Home") ir(0);
  else if (e.key === "End") ir(opcoes.length - 1);
  else if (e.key === " " && k >= 0) {
    e.preventDefault();
    alternarCor(aberta, opcoes[k].dataset.cor);
  } else if (e.key === "Enter" || e.key === "Escape") {
    e.preventDefault();
    fecharCores();
  } else if (e.key === "Tab") fecharCores(false);
}

function ligarCores() {
  $("laser-mais-cor").addEventListener("click", () => {
    linhas.push({ cores: [], quantidade: "1" });
    montarLinhas();
    atualizar();
    $("laser-variacoes").lastElementChild?.querySelector(".laser-cor-botao")?.focus();
  });
  // Clique fora da linha aberta fecha a lista.
  document.addEventListener("mousedown", (e) => {
    if (aberta >= 0 && !$("laser-variacoes").children[aberta]?.contains(e.target)) fecharCores(false);
  });
}

// Cálculo da tela (com a área escolhida) para a lista ou o orçamento.
function entradaAtual() {
  const area = areaEscolhida();
  const op = calculo.opcoes.find((o) => o.id === area) ?? calculo.opcoes[0];
  const cores = calculo.variacoes.length > 1 ? calculo.variacoes.map((v) => `${v.rotuloCores || "Sem cor"} (${v.quantidade})`).join(", ") : calculo.cor;
  return {
    itens: itensDoOrcamento(calculo, area, produtoId || undefined),
    rotulo: [calculo.nome || "Produto", cores].filter(Boolean).join(" · "),
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
  linhas = [{ cores: [], quantidade: "1" }];
  aberta = -1;
  montarLinhas();
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
  const itens = [...lista, ...(calculo ? [entradaAtual()] : [])].flatMap((e) => e.itens);
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
  for (const id of ["laser-nome", "laser-valor", "laser-frente", "laser-frente-verso"]) $(id).addEventListener("input", atualizar);
  for (const r of document.querySelectorAll('input[name="laser-area"]')) r.addEventListener("change", atualizar);
  $("laser-produto").addEventListener("change", escolherProduto);
  ligarCores();
  $("laser-outro").addEventListener("click", adicionarOutro);
  $("laser-orcamento").addEventListener("click", adicionar);
  $("laser-novo").addEventListener("click", novo);
  registrarAoAbrir("laser", carregarProdutos);
  montarLinhas();
  atualizar();
}
