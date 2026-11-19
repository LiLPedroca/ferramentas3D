// Recibos: um por pagamento de uma venda (sinal, parcela, saldo ou pagamento inteiro), numerados
// R-0001, R-0002… O registro de cada recibo fica dentro da venda (venda.recibos), então entra no
// backup e não some se o pagamento for apagado (aparece como "Cancelado").
// Aqui ficam as regras e o HTML do PDF (todo texto do usuário escapado). CommonJS: main, tela e testes.
"use strict";

const { ErroValidacao, ID } = require("./validacao.cjs");

const ROTULOS_FORMA = { debito: "Débito", credito: "Crédito", pix: "Pix", dinheiro: "Dinheiro" };
const TIPOS = ["pagamento", "sinal", "parcela", "saldo"];
const ROTULOS_TIPO = { pagamento: "Pagamento", sinal: "Sinal", parcela: "Parcela", saldo: "Saldo" };
const DIGITOS = /^\d{1,13}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const ASSINATURA = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const LOGO = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const numeroRecibo = (n) => `R-${String(n).padStart(4, "0")}`;

// ---------- Valor por extenso ----------
const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

// 0 a 999
function ate999(n) {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else partes.push(DEZENAS[Math.floor(resto / 10)] + (resto % 10 ? ` e ${UNIDADES[resto % 10]}` : ""));
  }
  return partes.join(" e ");
}

// Inteiro (até 999.999.999.999) por extenso.
function inteiroPorExtenso(n) {
  if (n === 0) return "zero";
  const grupos = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const nomes = [
    ["", ""],
    ["mil", "mil"],
    ["milhão", "milhões"],
    ["bilhão", "bilhões"],
  ];
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const texto = i === 1 && g === 1 ? "mil" : `${ate999(g)}${i ? ` ${g === 1 ? nomes[i][0] : nomes[i][1]}` : ""}`;
    partes.push({ texto, g, i });
  }
  // "e" antes do último grupo quando ele é menor que 100 ou é centena exata (mil e cem, mil e vinte)
  return partes
    .map((p, k) => {
      if (k === 0) return p.texto;
      const ultimo = k === partes.length - 1;
      return ultimo && (p.g < 100 || p.g % 100 === 0) ? ` e ${p.texto}` : `, ${p.texto}`;
    })
    .join("")
    .replace(/^, /, "");
}

// BigInt de centavos -> "trezentos e trinta reais", "um real e cinquenta centavos"
function valorPorExtenso(centavos) {
  const c = BigInt(centavos);
  const reais = Number(c / 100n);
  const cent = Number(c % 100n);
  const r = reais ? `${inteiroPorExtenso(reais)}${reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}` : "";
  const ct = cent ? `${inteiroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
  if (r && ct) return `${r} e ${ct}`;
  return r || ct || "zero real";
}

function reais(centavos) {
  const c = BigInt(centavos);
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}R$ ${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(a % 100n).toString().padStart(2, "0")}`;
}

// "2026-11-19" -> "19/11/2026" e "19 de novembro de 2026"
const dataCurta = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const dataExtenso = (d) => `${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;

// ---------- Pagamentos e recibos de uma venda ----------
// Pagamentos em ordem de data (empate: ordem de registro), cada um com o tipo e quanto faltava depois.
function linhasDaVenda(venda) {
  const total = BigInt(venda.valorCentavos);
  const ordenados = venda.pagamentos.map((p, i) => ({ p, i })).sort((a, b) => a.p.data.localeCompare(b.p.data) || a.i - b.i);
  let pago = 0n;
  const linhas = ordenados.map(({ p }, k) => {
    const antes = pago;
    pago += BigInt(p.valorCentavos);
    const quitou = pago >= total;
    const tipo = k === 0 ? (quitou ? "pagamento" : "sinal") : quitou ? "saldo" : "parcela";
    const recibo = (venda.recibos ?? []).find((r) => r.pagamentoId === p.id) ?? null;
    return { pagamento: p, tipo, antesCentavos: antes, depoisCentavos: pago, restaCentavos: total - pago, recibo, cancelado: false };
  });
  linhas.forEach((l, k) => (l.anteriores = linhas.slice(0, k)));
  // recibos de pagamentos que não existem mais
  const ids = new Set(venda.pagamentos.map((p) => p.id));
  for (const r of venda.recibos ?? []) {
    if (!ids.has(r.pagamentoId)) linhas.push({ pagamento: null, tipo: r.tipo, recibo: r, cancelado: true });
  }
  return linhas;
}

function validarRecibos(lista) {
  if (lista === undefined) return;
  if (!Array.isArray(lista) || lista.length > 500) throw new ErroValidacao("Recibos inválidos.");
  for (const r of lista) {
    if (!r || typeof r !== "object" || !Number.isInteger(r.numero) || r.numero < 1 || typeof r.pagamentoId !== "string" || !ID.test(r.pagamentoId)) {
      throw new ErroValidacao("Recibos inválidos.");
    }
    if (!TIPOS.includes(r.tipo) || !DIA.test(String(r.data)) || !DIGITOS.test(String(r.valorCentavos))) throw new ErroValidacao("Recibos inválidos.");
    if (r.caminho !== undefined && typeof r.caminho !== "string") throw new ErroValidacao("Recibos inválidos.");
  }
}

// Próximo número: maior entre o último guardado nas Configurações e os já usados nas vendas, + 1.
function proximoNumero(vendas, ultimo = 0) {
  let maior = Number.isInteger(ultimo) ? ultimo : 0;
  for (const v of vendas) for (const r of v.recibos ?? []) maior = Math.max(maior, r.numero);
  return maior + 1;
}

// ---------- PDF ----------
function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function documentoCliente(d) {
  const x = String(d ?? "").replace(/\D/g, "");
  if (x.length === 11) return `CPF ${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}`;
  if (x.length === 14) return `CNPJ ${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`;
  return "CPF não informado";
}

function telefone(d) {
  const x = String(d ?? "").replace(/\D/g, "");
  if (x.length === 11) return `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}`;
  if (x.length === 10) return `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}`;
  return x;
}

function formasTexto(p) {
  if (p.divisao?.length) return p.divisao.map((d) => `${ROTULOS_FORMA[d.forma] ?? d.forma} ${reais(d.valorCentavos)}`).join(" + ");
  return (p.formas ?? []).map((f) => ROTULOS_FORMA[f] ?? f).join(", ") || "Não informada";
}

const CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  .rec { font-family: Arial, "Segoe UI", sans-serif; color: #111; font-size: 10pt; line-height: 1.5; }
  .rec .topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #111; }
  .rec .emp { display: flex; gap: 12px; align-items: center; }
  .rec .emp img { max-width: 110px; max-height: 64px; object-fit: contain; }
  .rec .emp b { font-size: 12pt; }
  .rec .sub { color: #555; font-size: 8.5pt; }
  .rec .titulo { text-align: right; }
  .rec .titulo h1 { margin: 0; font-size: 20pt; letter-spacing: 3px; text-transform: uppercase; }
  .rec .valor { display: flex; justify-content: space-between; align-items: center; margin: 16px 0; padding: 10px 14px; border: 1px solid #111; border-radius: 5px; }
  .rec .valor strong { font-size: 17pt; }
  .rec p.texto { margin: 0 0 14px; font-size: 10.5pt; }
  .rec table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 12px; }
  .rec th { text-align: left; color: #555; font-weight: 400; border-bottom: 1px solid #111; padding: 4px 0; }
  .rec td { border-bottom: 1px solid #ddd; padding: 4px 0; }
  .rec .n { text-align: right; }
  .rec .resumo { width: 55%; margin-left: auto; }
  .rec .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 9.5pt; margin: 4px 0 34px; }
  .rec .info span { display: block; color: #555; }
  .rec .ok { color: #157a3d; font-weight: 700; }
  .rec .falta { color: #a15c00; font-weight: 700; }
  .rec .cancelado { color: #b42318; font-weight: 700; }
  .rec .rodape { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; break-inside: avoid; }
  .rec .assina { text-align: center; width: 72mm; }
  .rec .assina img { display: block; max-width: 60mm; max-height: 22mm; margin: 0 auto -1mm; }
  .rec .espaco { height: 18mm; }
  .rec .linha { border-top: 1px solid #111; padding-top: 4px; }
`;

// dados: { venda, orcamento (ou null), empresa (com assinatura e assinaturaNome), linha (de linhasDaVenda), numero, assinar }
function corpoRecibo({ venda, orcamento, empresa = {}, linha, numero, assinar }) {
  const assinaturaNome = empresa.assinaturaNome;
  const p = linha.pagamento;
  const valor = BigInt(p.valorCentavos);
  const total = BigInt(venda.valorCentavos);
  const cliente = orcamento?.cliente?.nome || venda.cliente || "Cliente";
  const doc = documentoCliente(orcamento?.cliente?.documento);
  const numOrc = orcamento ? `${orcamento.teste ? "T-" : ""}${String(orcamento.numero).padStart(4, "0")}` : venda.orcamentoNumero ? String(venda.orcamentoNumero).padStart(4, "0") : "";
  const referente = numOrc ? `do orçamento nº ${numOrc}` : `da venda "${escapar(venda.descricao)}"`;
  const frase = {
    pagamento: `referente ${numOrc ? `ao orçamento nº ${numOrc}` : `à venda "${escapar(venda.descricao)}"`}, dando plena quitação deste valor.`,
    sinal: `como <b>sinal</b> ${referente}.`,
    parcela: `como parte do pagamento ${referente}.`,
    saldo: `referente ao <b>saldo</b> ${referente}, dando plena quitação ${numOrc ? "do orçamento" : "da venda"}.`,
  }[linha.tipo];

  const logo = LOGO.test(String(empresa.logo ?? "")) ? `<img src="${empresa.logo}" alt="">` : "";
  const docEmpresa = documentoCliente(empresa.documento);
  const contato = [docEmpresa.includes("não informado") ? "" : docEmpresa, telefone(empresa.telefone)].filter(Boolean).join(" · ");
  const local = [empresa.endereco || empresa.cidade, empresa.site].filter(Boolean).join(" · ");

  const itens = (orcamento?.itens?.length ? orcamento.itens : venda.itens) ?? [];
  const tabelaItens = itens.length
    ? `<table><tr><th>Descrição</th><th class="n">Qtd</th><th class="n">Total</th></tr>${itens
        .map((i) => `<tr><td>${escapar(i.descricao)}</td><td class="n">${escapar(i.quantidade)}</td><td class="n">${reais(BigInt(i.quantidade) * BigInt(i.precoUnitarioCentavos))}</td></tr>`)
        .join("")}</table>`
    : "";

  // Resumo: só quando não é um pagamento único que quita tudo.
  let resumo = "";
  if (linha.tipo !== "pagamento") {
    const anteriores = (linha.anteriores ?? [])
      .map((a) => `<tr><td>${ROTULOS_TIPO[a.tipo]} (${dataCurta(a.pagamento.data)}${a.recibo ? `, recibo ${numeroRecibo(a.recibo.numero)}` : ""})</td><td class="n">${reais(a.pagamento.valorCentavos)}</td></tr>`)
      .join("");
    resumo = `<table class="resumo"><tr><td>Total ${numOrc ? "do orçamento" : "da venda"}</td><td class="n">${reais(total)}</td></tr>${anteriores}<tr><td>Este pagamento (${ROTULOS_TIPO[linha.tipo].toLowerCase()})</td><td class="n">${reais(valor)}</td></tr>${
      linha.restaCentavos > 0n ? `<tr><td><b>Falta pagar</b></td><td class="n"><b>${reais(linha.restaCentavos)}</b></td></tr>` : ""
    }</table>`;
  }

  const situacao =
    linha.restaCentavos > 0n
      ? `<b class="falta">${linha.tipo === "sinal" ? "Sinal" : "Parcial"} — restam ${reais(linha.restaCentavos)}</b>`
      : `<b class="ok">Quitado</b>`;

  const cidade = String(empresa.cidade || empresa.pix?.cidade || "").trim();
  const quando = `${cidade ? `${escapar(cidade)}, ` : ""}${dataExtenso(p.data)}`;
  const nomeAssina = escapar(assinaturaNome || empresa.nome || "");
  const imagemAssinatura = assinar && ASSINATURA.test(String(empresa.assinatura ?? "")) ? `<img src="${empresa.assinatura}" alt="">` : `<div class="espaco"></div>`;

  return `<div class="rec">
<div class="topo">
  <div class="emp">${logo}<div>${empresa.nome ? `<b>${escapar(empresa.nome)}</b>` : ""}${contato ? `<div class="sub">${escapar(contato)}</div>` : ""}${local ? `<div class="sub">${escapar(local)}</div>` : ""}</div></div>
  <div class="titulo"><h1>Recibo</h1><div class="sub">Nº ${numeroRecibo(numero)}</div><div class="sub">${dataCurta(p.data)}</div></div>
</div>
<div class="valor"><span class="sub" style="font-size:10pt">Valor recebido${linha.tipo === "pagamento" ? "" : ` (${ROTULOS_TIPO[linha.tipo].toLowerCase()})`}</span><strong>${reais(valor)}</strong></div>
<p class="texto">Recebi de <b>${escapar(cliente)}</b>, ${escapar(doc)}, a importância de <b>${reais(valor)}</b> (${valorPorExtenso(valor)}), ${frase}</p>
${tabelaItens}
${resumo}
<div class="info"><div><span>Forma de pagamento</span>${escapar(formasTexto(p))}</div><div><span>Data do pagamento</span>${dataCurta(p.data)}</div><div><span>Situação</span>${situacao}</div></div>
<div class="rodape">
  <div class="sub">${quando}</div>
  <div class="assina">${imagemAssinatura}<div class="linha">${nomeAssina}</div>${empresa.nome && assinaturaNome ? `<div class="sub">${escapar(empresa.nome)}</div>` : ""}</div>
</div>
</div>`;
}

function gerarHtmlRecibo(dados) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>Recibo ${numeroRecibo(dados.numero)}</title>
<style>${CSS}</style></head>
<body>${corpoRecibo(dados)}</body></html>`;
}

// "Recibo R-0007 - Maria da Silva - Orçamento 0012 - Sinal.pdf"
function nomeArquivoRecibo({ numero, cliente, orcamentoNumero, tipo, teste }) {
  const limpar = (t) => String(t ?? "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  const partes = [`Recibo ${numeroRecibo(numero)}`, limpar(cliente) || null, orcamentoNumero ? `Orçamento ${String(orcamentoNumero).padStart(4, "0")}` : null, ROTULOS_TIPO[tipo]];
  return `${teste ? "TESTE - " : ""}${partes.filter(Boolean).join(" - ")}.pdf`;
}

// Mensagem do WhatsApp do recibo.
function mensagemRecibo({ cliente, numero, orcamentoNumero }) {
  const primeiro = String(cliente ?? "").trim().split(/\s+/)[0];
  return `Olá${primeiro ? `, ${primeiro}` : ""}! Segue o recibo nº ${numeroRecibo(numero)}${orcamentoNumero ? ` do orçamento nº ${String(orcamentoNumero).padStart(4, "0")}` : ""}.`;
}

module.exports = {
  ROTULOS_TIPO,
  TIPOS,
  CSS_RECIBO: CSS,
  corpoRecibo,
  gerarHtmlRecibo,
  linhasDaVenda,
  mensagemRecibo,
  nomeArquivoRecibo,
  numeroRecibo,
  proximoNumero,
  validarRecibos,
  valorPorExtenso,
};
