// Calculadora gravação a laser: valor do produto + gravação (frente ou frente e verso).
// Os dois valores de gravação são opcionais: o que estiver preenchido vira uma opção.
// Com os dois, o orçamento leva as duas versões e a pessoa escolhe qual enviar (ou envia as duas).
// CommonJS: usado na tela e nos testes.
"use strict";

const { ErroValidacao } = require("./validacao.cjs");
const { centavosDeTexto } = require("./produto.cjs");
const { CORES } = require("./impressao.cjs");

const AREAS = [
  { id: "frente", rotulo: "Frente", sufixo: "gravação frente" },
  { id: "frenteVerso", rotulo: "Frente e verso", sufixo: "gravação frente e verso" },
];

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

// v: { nome, cor, quantidade, valorProduto, valorFrente, valorFrenteVerso }
// Devolve { nome, cor (nome da cor ou ""), quantidade, produtoCentavos, opcoes: [{ id, rotulo, descricao, gravacaoCentavos, porPecaCentavos, totalCentavos }] }
// (BigInt nos valores). Lança ErroValidacao com a mensagem para a tela.
function calcularLaser(v) {
  const nome = String(v?.nome ?? "").trim().replace(/\s+/g, " ");
  const cor = corDe(v?.cor);
  const quantidade = quantidadeDe(v?.quantidade);
  const produto = BigInt(centavosDeTexto(v?.valorProduto, "Valor do produto", { obrigatorio: true }));
  const valores = [centavosDeTexto(v?.valorFrente, "Valor frente"), centavosDeTexto(v?.valorFrenteVerso, "Valor frente e verso")];
  const opcoes = [];
  AREAS.forEach((a, i) => {
    if (valores[i] === "") return;
    const gravacao = BigInt(valores[i]);
    const porPeca = produto + gravacao;
    opcoes.push({
      id: a.id,
      rotulo: a.rotulo,
      descricao: `${nome || "Produto"} (${cor ? `${cor.nome}, ` : ""}${a.sufixo})`.slice(0, 160),
      gravacaoCentavos: gravacao,
      porPecaCentavos: porPeca,
      totalCentavos: porPeca * BigInt(quantidade),
    });
  });
  if (!opcoes.length) throw new ErroValidacao("Informe o valor da gravação (frente, frente e verso ou os dois).");
  return { nome, cor: cor?.nome ?? "", quantidade, produtoCentavos: produto, opcoes };
}

// Item para o orçamento, com a opção escolhida e, havendo duas, as duas guardadas.
function itemDoOrcamento(calculo, escolhida, produtoId) {
  const i = Math.max(0, calculo.opcoes.findIndex((o) => o.id === escolhida));
  const op = calculo.opcoes[i];
  const item = { descricao: op.descricao, quantidade: calculo.quantidade, precoUnitarioCentavos: op.porPecaCentavos.toString() };
  if (produtoId) item.produtoId = produtoId;
  if (calculo.opcoes.length === 2) {
    item.opcoes = calculo.opcoes.map((o) => ({ rotulo: o.rotulo, descricao: o.descricao, precoUnitarioCentavos: o.porPecaCentavos.toString() }));
    item.opcao = i;
  }
  return item;
}

module.exports = { AREAS, calcularLaser, itemDoOrcamento };
