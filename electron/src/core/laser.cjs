// Calculadora gravação a laser: valor do produto + gravação (frente ou frente e verso).
// Os dois valores de gravação são opcionais: o que estiver preenchido vira uma opção.
// Com os dois, o orçamento leva as duas versões e a pessoa escolhe qual enviar (ou envia as duas).
// Cores: cada linha de "Cor e quantidade" tem uma ou mais cores (produto de duas cores, como
// "Preto e Dourado") e a quantidade daquela cor; cada linha vira uma linha do orçamento.
// Gravação separada: o produto sai numa linha (uma por cor) e a gravação noutra, com a quantidade
// total. Sem valor do produto (cliente trouxe o produto), sai só a gravação.
// CommonJS: usado na tela e nos testes.
"use strict";

const { ErroValidacao } = require("./validacao.cjs");
const { centavosDeTexto } = require("./produto.cjs");
const { CORES } = require("./impressao.cjs");

const AREAS = [
  { id: "frente", rotulo: "Frente", sufixo: "gravação frente" },
  { id: "frenteVerso", rotulo: "Frente e verso", sufixo: "gravação frente e verso" },
];
const LIMITES = { variacoes: 10, coresPorLinha: 4 };

function quantidadeDe(valor) {
  const t = String(valor ?? "").trim();
  if (!/^\d{1,5}$/.test(t) || Number(t) < 1) throw new ErroValidacao("Quantidade: use um número inteiro a partir de 1.");
  return Number(t);
}

// Cor do produto: uma das 14 cores do programa (id de CORES) ou vazio.
function corDe(valor) {
  const id = String(valor ?? "").trim();
  if (!id) return null;
  const cor = CORES.find((c) => c.id === id);
  if (!cor) throw new ErroValidacao("Cor do produto: escolha uma cor da lista.");
  return cor;
}

// "Preto", "Preto e Dourado", "Preto, Branco e Dourado"
function nomesDasCores(cores) {
  const n = cores.map((c) => c.nome);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} e ${n.at(-1)}`;
}

// Linhas de cor e quantidade. Sem "variacoes", usa os campos antigos "cor" e "quantidade".
function variacoesDe(v) {
  const lista = Array.isArray(v?.variacoes) ? v.variacoes : [{ cores: v?.cor ? [v.cor] : [], quantidade: v?.quantidade }];
  if (!lista.length || lista.length > LIMITES.variacoes) throw new ErroValidacao(`Use de 1 a ${LIMITES.variacoes} linhas de cor.`);
  return lista.map((x) => {
    const ids = [...new Set((Array.isArray(x?.cores) ? x.cores : []).filter(Boolean))];
    if (ids.length > LIMITES.coresPorLinha) throw new ErroValidacao(`Use no máximo ${LIMITES.coresPorLinha} cores no mesmo produto.`);
    const cores = CORES.filter((c) => ids.includes(c.id)); // ordem da paleta
    if (cores.length !== ids.length) throw new ErroValidacao("Cor do produto: escolha uma cor da lista.");
    return { cores, rotuloCores: nomesDasCores(cores), quantidade: quantidadeDe(x?.quantidade) };
  });
}

const descricaoDe = (nome, rotuloCores, sufixo) => `${nome || "Produto"} (${rotuloCores ? `${rotuloCores}, ` : ""}${sufixo})`.slice(0, 160);

// v: { nome, variacoes: [{ cores: [ids], quantidade }] (ou cor + quantidade), valorProduto, valorFrente, valorFrenteVerso }
// Devolve { nome, cor (cores da 1ª linha), variacoes, quantidade (total), produtoCentavos,
//   opcoes: [{ id, rotulo, sufixo, descricao, gravacaoCentavos, porPecaCentavos, totalCentavos }] }
// (BigInt nos valores). Lança ErroValidacao com a mensagem para a tela.
function calcularLaser(v) {
  const nome = String(v?.nome ?? "").trim().replace(/\s+/g, " ");
  if (!Array.isArray(v?.variacoes)) corDe(v?.cor); // confere a cor do jeito antigo
  const variacoes = variacoesDe(v);
  const quantidade = variacoes.reduce((s, x) => s + x.quantidade, 0);
  const produto = BigInt(centavosDeTexto(v?.valorProduto, "Valor do produto") || "0");
  const valores = [centavosDeTexto(v?.valorFrente, "Valor frente"), centavosDeTexto(v?.valorFrenteVerso, "Valor frente e verso")];
  const opcoes = [];
  AREAS.forEach((a, i) => {
    if (valores[i] === "") return;
    const gravacao = BigInt(valores[i]);
    const porPeca = produto + gravacao;
    opcoes.push({
      id: a.id,
      rotulo: a.rotulo,
      sufixo: a.sufixo,
      descricao: descricaoDe(nome, variacoes.length === 1 ? variacoes[0].rotuloCores : "", a.sufixo),
      gravacaoCentavos: gravacao,
      porPecaCentavos: porPeca,
      totalCentavos: porPeca * BigInt(quantidade),
    });
  });
  if (!opcoes.length) throw new ErroValidacao("Informe o valor da gravação (frente, frente e verso ou os dois).");
  return { nome, cor: variacoes[0].rotuloCores, variacoes, quantidade, produtoCentavos: produto, opcoes };
}

// Itens para o orçamento: uma linha por cor, com a opção escolhida e, havendo duas, as duas guardadas.
// separada: produto (uma linha por cor, só se tiver valor) + gravação numa linha só.
function itensDoOrcamento(calculo, escolhida, produtoId, { separada = false } = {}) {
  const i = Math.max(0, calculo.opcoes.findIndex((o) => o.id === escolhida));
  if (separada) return itensSeparados(calculo, i, produtoId);
  return calculo.variacoes.map((v) => {
    const op = calculo.opcoes[i];
    const item = { descricao: descricaoDe(calculo.nome, v.rotuloCores, op.sufixo), quantidade: v.quantidade, precoUnitarioCentavos: op.porPecaCentavos.toString() };
    if (produtoId) item.produtoId = produtoId;
    if (calculo.opcoes.length === 2) {
      item.opcoes = calculo.opcoes.map((o) => ({ rotulo: o.rotulo, descricao: descricaoDe(calculo.nome, v.rotuloCores, o.sufixo), precoUnitarioCentavos: o.porPecaCentavos.toString() }));
      item.opcao = i;
    }
    return item;
  });
}

const nomeComCores = (nome, rotuloCores) => `${nome || "Produto"}${rotuloCores ? ` (${rotuloCores})` : ""}`.slice(0, 160);
// "Gravação frente e verso: Copo térmico"
const descricaoGravacao = (nome, a) => `${a.rotulo === "Frente" ? "Gravação frente" : "Gravação frente e verso"}: ${nome || "Produto"}`.slice(0, 160);

function itensSeparados(calculo, i, produtoId) {
  const itens = [];
  if (calculo.produtoCentavos > 0n) {
    for (const v of calculo.variacoes) {
      const item = { descricao: nomeComCores(calculo.nome, v.rotuloCores), quantidade: v.quantidade, precoUnitarioCentavos: calculo.produtoCentavos.toString() };
      if (produtoId) item.produtoId = produtoId;
      itens.push(item);
    }
  }
  const op = calculo.opcoes[i];
  const gravacao = { descricao: descricaoGravacao(calculo.nome, op), quantidade: calculo.quantidade, precoUnitarioCentavos: op.gravacaoCentavos.toString() };
  if (calculo.opcoes.length === 2) {
    gravacao.opcoes = calculo.opcoes.map((o) => ({ rotulo: o.rotulo, descricao: descricaoGravacao(calculo.nome, o), precoUnitarioCentavos: o.gravacaoCentavos.toString() }));
    gravacao.opcao = i;
  }
  itens.push(gravacao);
  return itens;
}

// Um item só (cálculo com uma linha de cor).
const itemDoOrcamento = (calculo, escolhida, produtoId) => itensDoOrcamento(calculo, escolhida, produtoId)[0];

module.exports = { AREAS, LIMITES, calcularLaser, itemDoOrcamento, itensDoOrcamento, nomesDasCores };
