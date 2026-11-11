// Modelo de orçamento: itens, totais, condições e situação.
// CommonJS: usado no processo principal (grava e gera o PDF) e na tela (totais ao vivo).
"use strict";

const { ErroValidacao, ID, dataValida, texto, textoLongo } = require("./validacao.cjs");
const { centavosDeTexto, medidaDeTexto } = require("./produto.cjs");
const { validarCalculo } = require("./calculo-salvo.cjs");

const LIMITES = {
  itens: 200,
  descricao: 160,
  quantidade: 100_000,
  observacoes: 1000,
  pagamento: 160,
  prazo: 80,
  validadeMaxDias: 365,
  orcamentos: 20_000,
  centavos: 99_999_999_99n,
};

const SITUACOES = ["rascunho", "enviado", "aprovado", "recusado", "finalizado"];
const ROTULOS_SITUACAO = { rascunho: "Rascunho", enviado: "Enviado", aprovado: "Aprovado", recusado: "Cancelado", finalizado: "Finalizado" };
const FORMAS = ["debito", "credito", "pix", "dinheiro"];
const ENTREGAS = ["retirada", "entrega", "envio"];
const ROTULOS_ENTREGA = { retirada: "Retirada", entrega: "Entrega no endereço", envio: "Envio pelos Correios ou transportadora" };
const CAMPOS_PDF = ["numero", "nome", "quantidade", "precoUnitario", "dimensoes"];
const PDF_PADRAO = { numero: true, nome: true, quantidade: true, precoUnitario: true, dimensoes: true };

const DIGITOS = /^\d{1,13}$/;

function inteiro(valor, nome, minimo, maximo) {
  const t = String(valor ?? "").trim();
  if (!/^\d{1,7}$/.test(t)) throw new ErroValidacao(`${nome}: use um número inteiro.`);
  const n = Number(t);
  if (n < minimo || n > maximo) throw new ErroValidacao(`${nome}: use um valor entre ${minimo} e ${maximo}.`);
  return n;
}

function montarItem(v, i) {
  const n = i + 1;
  const item = {
    descricao: texto(v?.descricao, `Descrição do item ${n}`, LIMITES.descricao, { obrigatorio: true }),
    quantidade: inteiro(v?.quantidade, `Quantidade do item ${n}`, 1, LIMITES.quantidade),
    precoUnitarioCentavos: centavosDeTexto(v?.preco, `Preço do item ${n}`, { obrigatorio: true }),
  };
  const produtoId = String(v?.produtoId ?? "");
  if (produtoId) {
    if (!ID.test(produtoId)) throw new ErroValidacao(`Item ${n}: produto inválido.`);
    item.produtoId = produtoId;
  }
  const custo = String(v?.custoUnitarioCentavos ?? "");
  if (custo) {
    if (!DIGITOS.test(custo)) throw new ErroValidacao(`Item ${n}: custo inválido.`);
    item.custoUnitarioCentavos = custo;
  }
  if (v?.calculo) item.calculo = validarCalculo(v.calculo);
  // Dimensões do produto (para a coluna do PDF), em mm.
  const dims = ["alturaMm", "larguraMm", "comprimentoMm"].map((k) => medidaDeTexto(v?.[k], "Dimensão"));
  if (dims.some(Boolean)) [item.alturaMm, item.larguraMm, item.comprimentoMm] = dims;
  return item;
}

// Sinal: { tipo: "reais" | "percentual", valor } — reais em centavos; percentual em centésimos de % ("3000" = 30%).
function validarSinal(s) {
  if (!s || typeof s !== "object" || !["reais", "percentual"].includes(s.tipo) || !DIGITOS.test(String(s.valor))) {
    throw new ErroValidacao("Sinal inválido.");
  }
  if (s.tipo === "percentual" && BigInt(s.valor) > 10000n) throw new ErroValidacao("Sinal: use no máximo 100%.");
  return { tipo: s.tipo, valor: String(s.valor) };
}

function sinalDeFormulario(v) {
  const tipo = v?.tipo === "percentual" ? "percentual" : "reais";
  const t = String(v?.valor ?? "").trim();
  if (!t) return { tipo, valor: "0" };
  if (tipo === "reais") return { tipo, valor: centavosDeTexto(t, "Sinal") };
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(t.replace("%", "").trim());
  if (!m) throw new ErroValidacao("Sinal: use uma porcentagem como 30 ou 12,5.");
  const valor = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
  if (valor > 10000n) throw new ErroValidacao("Sinal: use no máximo 100%.");
  return { tipo, valor: valor.toString() };
}

// Para preencher o formulário com o sinal guardado.
function sinalParaTexto(s) {
  if (!s || s.valor === "0") return "";
  if (s.tipo === "reais") return centavosParaTexto(s.valor);
  const v = BigInt(s.valor);
  const frac = (v % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${v / 100n}${frac ? `,${frac}` : ""}`;
}

// Valor do sinal pedido (não quer dizer que foi pago). Percentual: sobre o total, já com desconto.
function valorSinal(o, total = calcularTotais(o).total) {
  if (!o.cobrarSinal || !o.sinal) return 0n;
  if (o.sinal.tipo === "reais") return BigInt(o.sinal.valor) > total ? total : BigInt(o.sinal.valor);
  return (total * BigInt(o.sinal.valor) + 5000n) / 10000n;
}

function exibirPdfDe(v) {
  const r = {};
  for (const k of CAMPOS_PDF) r[k] = v && typeof v === "object" && k in v ? v[k] === true : PDF_PADRAO[k];
  return r;
}

function formasDe(lista) {
  if (lista === undefined) return [];
  if (!Array.isArray(lista) || lista.some((f) => !FORMAS.includes(f))) throw new ErroValidacao("Formas de pagamento inválidas.");
  return FORMAS.filter((f) => lista.includes(f));
}

// Totais em centavos (BigInt). Lucro só quando todos os itens têm custo conhecido.
function calcularTotais(o) {
  let subtotal = 0n;
  let custo = 0n;
  let custoConhecido = o.itens.length > 0;
  for (const item of o.itens) {
    const q = BigInt(item.quantidade);
    subtotal += q * BigInt(item.precoUnitarioCentavos);
    if (item.custoUnitarioCentavos) custo += q * BigInt(item.custoUnitarioCentavos);
    else custoConhecido = false;
  }
  const desconto = BigInt(o.descontoCentavos || "0");
  const frete = BigInt(o.freteCentavos || "0");
  const total = subtotal - desconto + frete;
  const resultado = { subtotal, desconto, frete, total, custo: null, lucro: null };
  if (custoConhecido) {
    resultado.custo = custo;
    resultado.lucro = subtotal - desconto - custo; // o frete só passa pelo orçamento
  }
  return resultado;
}

function validarCliente(c) {
  if (c === null) return null;
  if (!c || typeof c !== "object") throw new ErroValidacao("Cliente do orçamento inválido.");
  const cliente = {
    nome: texto(c.nome, "Nome do cliente", 120, { obrigatorio: true }),
    telefone: String(c.telefone ?? ""),
    email: texto(c.email, "E-mail do cliente", 120),
    documento: String(c.documento ?? ""),
    cidade: texto(c.cidade, "Cidade do cliente", 80),
  };
  if (c.endereco) cliente.endereco = texto(c.endereco, "Endereço do cliente", 200);
  if (c.id !== undefined && c.id !== "") {
    if (typeof c.id !== "string" || !ID.test(c.id)) throw new ErroValidacao("Cliente do orçamento inválido.");
    cliente.id = c.id;
  }
  if (!/^\d{0,13}$/.test(cliente.telefone) || !/^\d{0,14}$/.test(cliente.documento)) {
    throw new ErroValidacao("Cliente do orçamento inválido.");
  }
  return cliente;
}

function validarOrcamento(o) {
  if (!o || typeof o !== "object") throw new ErroValidacao("Orçamento inválido.");
  if (typeof o.id !== "string" || !ID.test(o.id)) throw new ErroValidacao("Identificador inválido.");
  if (!Number.isInteger(o.numero) || o.numero < 1) throw new ErroValidacao("Número do orçamento inválido.");
  validarCliente(o.cliente);
  if (!Array.isArray(o.itens) || o.itens.length < 1 || o.itens.length > LIMITES.itens) {
    throw new ErroValidacao("O orçamento precisa ter pelo menos um item.");
  }
  o.itens.forEach((item, i) => {
    montarItem({ ...item, preco: item.precoUnitarioCentavos ? centavosParaTexto(item.precoUnitarioCentavos) : "" }, i);
  });
  for (const campo of ["descontoCentavos", "freteCentavos"]) {
    if (!DIGITOS.test(String(o[campo]))) throw new ErroValidacao("Valores do orçamento inválidos.");
  }
  if (calcularTotais(o).total < 0n) {
    throw new ErroValidacao("O desconto não pode ser maior que o subtotal mais o frete.");
  }
  inteiro(o.validadeDias, "Validade", 1, LIMITES.validadeMaxDias);
  texto(o.prazoProducao, "Prazo de produção", LIMITES.prazo);
  texto(o.formaPagamento, "Forma de pagamento", LIMITES.pagamento);
  textoLongo(o.observacoes, "Observações", LIMITES.observacoes);
  if (!SITUACOES.includes(o.situacao)) throw new ErroValidacao("Situação inválida.");
  // Campos da versão 0.43 (opcionais em orçamentos antigos).
  if (o.formasPagamento !== undefined) formasDe(o.formasPagamento);
  if (o.cobrarSinal !== undefined && typeof o.cobrarSinal !== "boolean") throw new ErroValidacao("Sinal inválido.");
  if (o.sinal !== undefined) validarSinal(o.sinal);
  if (o.entrega !== undefined && !ENTREGAS.includes(o.entrega)) throw new ErroValidacao("Entrega inválida.");
  if (o.descricaoComplementar !== undefined) textoLongo(o.descricaoComplementar, "Descrição complementar", LIMITES.observacoes);
  if (o.exibirPdf !== undefined && (!o.exibirPdf || typeof o.exibirPdf !== "object")) throw new ErroValidacao("Opções do PDF inválidas.");
  if (o.nomeArquivo !== undefined) texto(o.nomeArquivo, "Nome do arquivo PDF", 100);
  if (!dataValida(o.criadoEm) || !dataValida(o.atualizadoEm)) throw new ErroValidacao("Data inválida.");
  return o;
}

// "123456" -> "1234,56" (para reaproveitar o leitor de valores).
function centavosParaTexto(centavos) {
  const c = String(centavos).padStart(3, "0");
  return `${c.slice(0, -2)},${c.slice(-2)}`;
}

// valores: { cliente (objeto já resolvido ou null), itens: [{ descricao, quantidade, preco, produtoId?, custoUnitarioCentavos? }],
//            desconto, frete, validadeDias, prazoProducao, formaPagamento, observacoes, situacao }
// existentes: os orçamentos já gravados (para o próximo número).
function montarOrcamento(valores, { id, anterior, existentes = [], agora = new Date().toISOString() }) {
  const v = valores ?? {};
  if (!Array.isArray(v.itens) || v.itens.length === 0) {
    throw new ErroValidacao("Adicione pelo menos um item ao orçamento.");
  }
  if (v.itens.length > LIMITES.itens) throw new ErroValidacao(`Use no máximo ${LIMITES.itens} itens.`);

  const proximo = Math.max(
    existentes.reduce((max, o) => Math.max(max, Number.isInteger(o.numero) ? o.numero : 0), 0) + 1,
    Number.isInteger(v.proximoNumero) ? v.proximoNumero : 1,
  );
  const situacao = SITUACOES.includes(v.situacao) ? v.situacao : "rascunho";
  // Número escolhido na tela: precisa ser único.
  let numero = anterior?.numero ?? proximo;
  if (v.numero !== undefined && String(v.numero).trim() !== "") {
    numero = inteiro(v.numero, "Número do orçamento", 1, 9_999_999);
    if (existentes.some((o) => o.numero === numero && o.id !== id)) throw new ErroValidacao(`Já existe um orçamento com o número ${numero}.`);
  }

  const orcamento = {
    id,
    numero,
    cliente: validarCliente(v.cliente ?? null),
    itens: v.itens.map(montarItem),
    descontoCentavos: centavosDeTexto(v.desconto, "Desconto") || "0",
    freteCentavos: centavosDeTexto(v.frete, "Frete") || "0",
    validadeDias: inteiro(v.validadeDias ?? "7", "Validade", 1, LIMITES.validadeMaxDias),
    prazoProducao: texto(v.prazoProducao, "Prazo de produção", LIMITES.prazo),
    formaPagamento: texto(v.formaPagamento, "Forma de pagamento", LIMITES.pagamento),
    observacoes: textoLongo(v.observacoes, "Observações", LIMITES.observacoes),
    situacao,
    formasPagamento: formasDe(v.formasPagamento ?? []),
    cobrarSinal: v.cobrarSinal === true,
    sinal: sinalDeFormulario(v.sinal), // da tela: { tipo, valor em texto ("30,00" ou "30") }
    entrega: ENTREGAS.includes(v.entrega) ? v.entrega : "retirada",
    descricaoComplementar: textoLongo(v.descricaoComplementar, "Descrição complementar", LIMITES.observacoes),
    exibirPdf: exibirPdfDe(v.exibirPdf),
    nomeArquivo: texto(v.nomeArquivo, "Nome do arquivo PDF", 100),
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  return validarOrcamento(orcamento);
}

// Data de validade = criação + dias (texto ISO).
function dataValidade(o) {
  const d = new Date(o.criadoEm);
  d.setDate(d.getDate() + o.validadeDias);
  return d.toISOString();
}

module.exports = {
  CAMPOS_PDF,
  ENTREGAS,
  FORMAS,
  LIMITES,
  PDF_PADRAO,
  ROTULOS_ENTREGA,
  ROTULOS_SITUACAO,
  SITUACOES,
  exibirPdfDe,
  sinalDeFormulario,
  sinalParaTexto,
  valorSinal,
  calcularTotais,
  centavosParaTexto,
  dataValidade,
  montarOrcamento,
  validarOrcamento,
};
