// Gestão financeira: vendas (com pagamentos dentro, gravados juntos), despesas e indicadores.
// Valores em centavos (texto com dígitos; contas em BigInt). Datas de lançamento em "AAAA-MM-DD".
"use strict";

const { ErroValidacao, ID, dataValida, texto } = require("./validacao.cjs");
const { centavosDeTexto } = require("./produto.cjs");
const { validarCalculo } = require("./calculo-salvo.cjs");
const { calcularTotais } = require("./orcamento.cjs");

const LIMITES = { vendas: 50_000, despesas: 50_000, pagamentos: 500, itens: 200, descricao: 160 };
const FORMAS = ["debito", "credito", "pix", "dinheiro"];
const ROTULOS_FORMA = { debito: "Débito", credito: "Crédito", pix: "Pix", dinheiro: "Dinheiro" };
const PRODUCAO = ["em-producao", "finalizado"];
const ROTULOS_PRODUCAO = { "em-producao": "Em produção", finalizado: "Finalizado" };
const DIGITOS = /^\d{1,13}$/;
const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

// ---------- Datas ----------
function diaValido(d) {
  const m = DIA.exec(String(d ?? ""));
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
}

function diaDeTexto(valor, nome = "Data") {
  const t = String(valor ?? "").trim();
  if (!diaValido(t)) throw new ErroValidacao(`${nome}: escolha uma data válida.`);
  return t;
}

// Date local -> "AAAA-MM-DD"
function diaLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function somarDias(dia, n) {
  const [a, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// "30" | "90" | "tudo" -> { inicio, fim } (inicio null = todo o histórico)
function periodoDe(chave, hoje = diaLocal()) {
  if (chave === "tudo") return { inicio: null, fim: hoje };
  const dias = chave === "90" ? 90 : 30;
  return { inicio: somarDias(hoje, -(dias - 1)), fim: hoje };
}

const noPeriodo = (dia, p) => (!p.inicio || dia >= p.inicio) && dia <= p.fim;

// ---------- Validação ----------
function formasDe(lista, nome = "Formas de pagamento") {
  if (lista === undefined) return [];
  if (!Array.isArray(lista) || lista.some((f) => !FORMAS.includes(f))) throw new ErroValidacao(`${nome}: escolha entre Débito, Crédito, Pix e Dinheiro.`);
  return FORMAS.filter((f) => lista.includes(f));
}

function validarPagamento(p) {
  if (!p || typeof p !== "object" || typeof p.id !== "string" || !ID.test(p.id)) throw new ErroValidacao("Pagamento inválido.");
  if (!diaValido(p.data) || !DIGITOS.test(String(p.valorCentavos)) || BigInt(p.valorCentavos) <= 0n) throw new ErroValidacao("Pagamento inválido.");
  const formas = formasDe(p.formas);
  // Divisão entre as formas (pagamentos com duas ou mais formas, a partir da 0.45).
  if (p.divisao !== undefined) {
    const d = p.divisao;
    if (
      !Array.isArray(d) ||
      d.length !== formas.length ||
      d.some((x, i) => !x || x.forma !== formas[i] || !DIGITOS.test(String(x.valorCentavos)) || BigInt(x.valorCentavos) <= 0n) ||
      d.reduce((s, x) => s + BigInt(x.valorCentavos), 0n) !== BigInt(p.valorCentavos)
    ) {
      throw new ErroValidacao("Pagamento inválido.");
    }
  }
  return p;
}

// Divide o valor de um recebimento entre as formas usadas (só com duas ou mais formas).
// lista: [{ forma, valor (texto) ou valorCentavos }]. A soma precisa ser igual ao valor recebido agora.
function divisaoDe(lista, formas, valorCentavos) {
  if (formas.length < 2) return undefined;
  if (!Array.isArray(lista)) throw new ErroValidacao("Distribua o valor entre as formas de pagamento.");
  let soma = 0n;
  const divisao = formas.map((forma) => {
    const d = lista.find((x) => x && x.forma === forma);
    const c = d?.valorCentavos !== undefined ? String(d.valorCentavos) : centavosDeTexto(d?.valor, ROTULOS_FORMA[forma], { obrigatorio: true });
    if (!DIGITOS.test(c) || BigInt(c) <= 0n) throw new ErroValidacao(`${ROTULOS_FORMA[forma]}: informe um valor maior que zero.`);
    soma += BigInt(c);
    return { forma, valorCentavos: c };
  });
  if (soma !== BigInt(valorCentavos)) {
    throw new ErroValidacao(`A divisão soma ${reaisTexto(soma)}, mas o recebimento é de ${reaisTexto(BigInt(valorCentavos))}.`);
  }
  return divisao;
}

function validarItemVenda(i) {
  if (!i || typeof i !== "object") throw new ErroValidacao("Item da venda inválido.");
  texto(i.descricao, "Descrição do item", LIMITES.descricao, { obrigatorio: true });
  if (!Number.isInteger(i.quantidade) || i.quantidade < 1) throw new ErroValidacao("Item da venda inválido.");
  if (!DIGITOS.test(String(i.precoUnitarioCentavos))) throw new ErroValidacao("Item da venda inválido.");
  if (i.custoUnitarioCentavos !== undefined && !DIGITOS.test(String(i.custoUnitarioCentavos))) throw new ErroValidacao("Item da venda inválido.");
  validarCalculo(i.calculo);
  return i;
}

function validarVenda(v) {
  if (!v || typeof v !== "object" || typeof v.id !== "string" || !ID.test(v.id)) throw new ErroValidacao("Venda inválida.");
  texto(v.descricao, "Descrição", LIMITES.descricao, { obrigatorio: true });
  texto(v.cliente, "Cliente", 120);
  if (v.orcamentoId !== undefined && (typeof v.orcamentoId !== "string" || !ID.test(v.orcamentoId))) throw new ErroValidacao("Venda inválida.");
  if (v.orcamentoNumero !== undefined && (!Number.isInteger(v.orcamentoNumero) || v.orcamentoNumero < 1)) throw new ErroValidacao("Venda inválida.");
  if (!diaValido(v.data)) throw new ErroValidacao("Data da venda inválida.");
  if (!DIGITOS.test(String(v.valorCentavos))) throw new ErroValidacao("Valor da venda inválido.");
  if (!DIGITOS.test(String(v.freteCentavos ?? "0"))) throw new ErroValidacao("Venda inválida.");
  if (v.custoCentavos !== null && !DIGITOS.test(String(v.custoCentavos))) throw new ErroValidacao("Custo da venda inválido.");
  if (!Array.isArray(v.itens) || v.itens.length > LIMITES.itens) throw new ErroValidacao("Venda inválida.");
  v.itens.forEach(validarItemVenda);
  if (!Array.isArray(v.pagamentos) || v.pagamentos.length > LIMITES.pagamentos) throw new ErroValidacao("Venda inválida.");
  v.pagamentos.forEach(validarPagamento);
  if (recebido(v) > BigInt(v.valorCentavos)) throw new ErroValidacao("A venda recebeu mais do que o valor total.");
  if (!PRODUCAO.includes(v.producao)) throw new ErroValidacao("Venda inválida.");
  if (v.teste !== undefined && typeof v.teste !== "boolean") throw new ErroValidacao("Venda inválida.");
  if (!dataValida(v.criadoEm) || !dataValida(v.atualizadoEm)) throw new ErroValidacao("Venda inválida.");
  return v;
}

function validarDespesa(d) {
  if (!d || typeof d !== "object" || typeof d.id !== "string" || !ID.test(d.id)) throw new ErroValidacao("Despesa inválida.");
  texto(d.descricao, "Descrição", LIMITES.descricao, { obrigatorio: true });
  if (!diaValido(d.data) || !DIGITOS.test(String(d.valorCentavos)) || BigInt(d.valorCentavos) <= 0n) throw new ErroValidacao("Despesa inválida.");
  if (!dataValida(d.criadoEm) || !dataValida(d.atualizadoEm)) throw new ErroValidacao("Despesa inválida.");
  return d;
}

// ---------- Contas de uma venda ----------
const recebido = (v) => v.pagamentos.reduce((s, p) => s + BigInt(p.valorCentavos), 0n);
const restante = (v) => BigInt(v.valorCentavos) - recebido(v);

function situacaoVenda(v) {
  const r = recebido(v);
  if (r >= BigInt(v.valorCentavos)) return "quitado";
  return r > 0n ? "parcial" : "pendente";
}
const ROTULOS_SITUACAO = { pendente: "Pendente", parcial: "Sinal pago / parcial", quitado: "Quitado" };

// Lucro = valor − frete − custo; null quando o custo não é conhecido (nunca conta como zero).
function lucroVenda(v) {
  if (v.custoCentavos === null) return null;
  return BigInt(v.valorCentavos) - BigInt(v.freteCentavos ?? "0") - BigInt(v.custoCentavos);
}

// ---------- Montagem ----------
function valorPositivo(valor, nome) {
  const c = centavosDeTexto(valor, nome, { obrigatorio: true });
  if (BigInt(c) <= 0n) throw new ErroValidacao(`${nome}: informe um valor maior que zero.`);
  return c;
}

// Venda lançada à mão ("Novo registro"). Sem itens, o custo é desconhecido.
function montarVendaManual(valores, { id, anterior, agora = new Date().toISOString() }) {
  const v = valores ?? {};
  const venda = {
    id,
    descricao: texto(v.descricao, "Descrição", LIMITES.descricao, { obrigatorio: true }),
    cliente: texto(v.cliente, "Cliente", 120),
    data: diaDeTexto(v.data),
    valorCentavos: valorPositivo(v.valor, "Valor"),
    freteCentavos: "0",
    custoCentavos: anterior?.custoCentavos ?? null,
    itens: anterior?.itens ?? [],
    pagamentos: anterior?.pagamentos ?? [],
    producao: anterior?.producao ?? "em-producao",
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  if (anterior?.orcamentoId) {
    venda.orcamentoId = anterior.orcamentoId;
    venda.orcamentoNumero = anterior.orcamentoNumero;
  }
  if (recebido(venda) > BigInt(venda.valorCentavos)) throw new ErroValidacao("O valor ficou menor que o já recebido nesta venda.");
  return validarVenda(venda);
}

function montarDespesa(valores, { id, anterior, agora = new Date().toISOString() }) {
  const v = valores ?? {};
  return validarDespesa({
    id,
    descricao: texto(v.descricao, "Descrição", LIMITES.descricao, { obrigatorio: true }),
    data: diaDeTexto(v.data),
    valorCentavos: valorPositivo(v.valor, "Valor"),
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  });
}

// Dados da venda que vêm do orçamento (valor, itens, custos). Os pagamentos ficam como estão.
function dadosDoOrcamento(o) {
  const t = calcularTotais(o);
  const itens = o.itens.map((i) => {
    const item = { descricao: i.descricao, quantidade: i.quantidade, precoUnitarioCentavos: i.precoUnitarioCentavos };
    if (i.custoUnitarioCentavos) item.custoUnitarioCentavos = i.custoUnitarioCentavos;
    if (i.calculo) item.calculo = i.calculo;
    return item;
  });
  return {
    descricao: `Orçamento ${o.teste ? "teste " : ""}#${String(o.numero).padStart(4, "0")}`,
    cliente: o.cliente?.nome ?? "",
    orcamentoId: o.id,
    orcamentoNumero: o.numero,
    valorCentavos: t.total.toString(),
    freteCentavos: t.frete.toString(),
    custoCentavos: t.custo === null ? null : t.custo.toString(),
    itens,
    teste: o.teste === true, // venda de teste: fica fora dos números do painel
  };
}

// pagamento: { valor (texto) ou valorCentavos, formas, data } — novo recebimento.
function novoPagamento(pagamento, { id, hoje = diaLocal() }) {
  const p = pagamento ?? {};
  const valorCentavos = p.valorCentavos !== undefined ? String(p.valorCentavos) : valorPositivo(p.valor, "Valor recebido");
  if (!DIGITOS.test(valorCentavos) || BigInt(valorCentavos) <= 0n) throw new ErroValidacao("Valor recebido: informe um valor maior que zero.");
  const formas = formasDe(p.formas);
  const novo = { id, data: p.data ? diaDeTexto(p.data) : hoje, valorCentavos, formas };
  const divisao = divisaoDe(p.divisao, formas, valorCentavos);
  if (divisao) novo.divisao = divisao;
  return validarPagamento(novo);
}

function registrarPagamento(venda, pagamento, { id, agora = new Date().toISOString(), hoje } = {}) {
  if (situacaoVenda(venda) === "quitado") throw new ErroValidacao("Esta venda já está quitada.");
  const p = novoPagamento(pagamento, { id, hoje });
  if (BigInt(p.valorCentavos) > restante(venda)) {
    throw new ErroValidacao(`O valor passa do que falta receber (${reaisTexto(restante(venda))}).`);
  }
  return validarVenda({ ...venda, pagamentos: [...venda.pagamentos, p], atualizadoEm: agora });
}

// Cria ou atualiza a venda ligada a um orçamento (finalizar, salvar de novo, revisar antigo).
// recebidoTotal: quanto o cliente já pagou no total, segundo a resposta da janela
//   (0 = não pagou; total = integral). Só a diferença para o já registrado vira pagamento novo.
function sincronizarVendaDoOrcamento(o, existente, { recebidoTotalCentavos, formas, divisao, data, idPagamento, idVenda, agora = new Date().toISOString(), hoje = diaLocal() }) {
  const dados = dadosDoOrcamento(o);
  const base = existente ?? {
    id: idVenda,
    data: hoje,
    pagamentos: [],
    producao: "em-producao",
    criadoEm: agora,
  };
  const venda = { ...base, ...dados, atualizadoEm: agora };
  if (recebido(venda) > BigInt(venda.valorCentavos)) {
    throw new ErroValidacao("O total do orçamento ficou menor que o já recebido nesta venda. Ajuste os pagamentos no financeiro.");
  }
  if (recebidoTotalCentavos !== undefined && recebidoTotalCentavos !== null) {
    const alvo = BigInt(recebidoTotalCentavos);
    if (alvo < 0n || alvo > BigInt(venda.valorCentavos)) throw new ErroValidacao("O valor recebido não pode passar do total do orçamento.");
    const diferenca = alvo - recebido(venda);
    if (diferenca > 0n) {
      venda.pagamentos = [...venda.pagamentos, novoPagamento({ valorCentavos: diferenca.toString(), formas, divisao, data }, { id: idPagamento, hoje })];
    }
  }
  return validarVenda(venda);
}

function reaisTexto(c) {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}R$ ${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(a % 100n).toString().padStart(2, "0")}`;
}

// ---------- Indicadores do painel ----------
// periodo: { inicio, fim }. "A receber" considera todas as vendas até o fim do período.
// Vendas de teste ficam de fora.
function resumoFinanceiro(todasVendas, despesas, periodo) {
  const vendas = todasVendas.filter((v) => v.teste !== true);
  let vendasPeriodo = 0n;
  let recebidoPeriodo = 0n;
  let despesasPeriodo = 0n;
  let aReceber = 0n;
  let lucro = 0n;
  let semCusto = 0;
  let comCusto = 0;
  const porDia = new Map(); // dia -> { recebido, despesas }
  const dia = (d) => {
    if (!porDia.has(d)) porDia.set(d, { recebido: 0n, despesas: 0n });
    return porDia.get(d);
  };
  for (const v of vendas) {
    if (v.data <= periodo.fim) aReceber += restante(v);
    if (noPeriodo(v.data, periodo)) {
      vendasPeriodo += BigInt(v.valorCentavos);
      const l = lucroVenda(v);
      if (l === null) semCusto += 1;
      else {
        lucro += l;
        comCusto += 1;
      }
    }
    for (const p of v.pagamentos) {
      if (!noPeriodo(p.data, periodo)) continue;
      recebidoPeriodo += BigInt(p.valorCentavos);
      dia(p.data).recebido += BigInt(p.valorCentavos);
    }
  }
  for (const d of despesas) {
    if (!noPeriodo(d.data, periodo)) continue;
    despesasPeriodo += BigInt(d.valorCentavos);
    dia(d.data).despesas += BigInt(d.valorCentavos);
  }
  return {
    vendas: vendasPeriodo,
    recebido: recebidoPeriodo,
    despesas: despesasPeriodo,
    aReceber,
    lucro: comCusto ? lucro : null,
    vendasSemCusto: semCusto,
    caixa: recebidoPeriodo - despesasPeriodo,
    porDia: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ dia: d, ...v })),
  };
}

// Orçamentos que ainda não têm venda e precisam de revisão (fora rascunhos e cancelados).
function orcamentosSemVenda(orcamentos, vendas) {
  const ligados = new Set(vendas.map((v) => v.orcamentoId).filter(Boolean));
  return orcamentos.filter((o) => o.teste !== true && !ligados.has(o.id) && !["rascunho", "recusado"].includes(o.situacao));
}

module.exports = {
  FORMAS,
  LIMITES,
  PRODUCAO,
  ROTULOS_FORMA,
  ROTULOS_PRODUCAO,
  ROTULOS_SITUACAO,
  dadosDoOrcamento,
  diaDeTexto,
  diaLocal,
  diaValido,
  divisaoDe,
  formasDe,
  lucroVenda,
  montarDespesa,
  montarVendaManual,
  orcamentosSemVenda,
  periodoDe,
  recebido,
  registrarPagamento,
  restante,
  resumoFinanceiro,
  situacaoVenda,
  sincronizarVendaDoOrcamento,
  somarDias,
  validarDespesa,
  validarVenda,
};
