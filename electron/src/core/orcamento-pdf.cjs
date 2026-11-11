// Monta o HTML do orçamento para virar PDF (e para a prévia na tela). Todo texto do usuário é escapado.
"use strict";

const { ROTULOS_ENTREGA, calcularTotais, dataValidade, exibirPdfDe, valorSinal } = require("./orcamento.cjs");

const ROTULOS_FORMA = { debito: "Débito", credito: "Crédito", pix: "Pix", dinheiro: "Dinheiro" };
const LOGO = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/;

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// BigInt de centavos -> "R$ 1.234,56"
function reais(centavos) {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const inteiro = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negativo ? "-" : ""}R$ ${inteiro},${frac}`;
}

function data(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function telefone(d) {
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function documento(d) {
  if (!d) return "";
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

const numeroFormatado = (n) => String(n).padStart(4, "0");
const medida = (t) => String(t).replace(".", ",");

// Linhas "Rótulo: valor" só com o que estiver preenchido.
const linhasRotuladas = (pares) =>
  pares
    .filter(([, v]) => v)
    .map(([r, v]) => `<div>${escapar(r)}: ${escapar(v)}</div>`)
    .join("");

const bloco = (titulo, linhas) =>
  linhas ? `<table class="bloco"><tr><th>${escapar(titulo)}</th></tr>${linhas}</table>` : "";
const linha = (texto) => `<tr><td>${texto}</td></tr>`;

const CSS = `
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  .orc { margin: 0; font-family: Arial, "Segoe UI", sans-serif; color: #000; font-size: 9pt; background: #fff; }
  .orc .topo { display: grid; grid-template-columns: 1fr 26%; border: 1px solid #000; }
  .orc .empresa { display: flex; align-items: center; gap: 14px; padding: 8px 10px; border-right: 1px solid #000; }
  .orc .empresa img { max-width: 110px; max-height: 70px; object-fit: contain; }
  .orc .empresa .dados { line-height: 1.35; }
  .orc .empresa strong { font-size: 10.5pt; }
  .orc .datas div { padding: 5px 8px; border-bottom: 1px solid #000; }
  .orc .datas div:last-child { border-bottom: 0; }
  .orc .datas b { display: block; }
  .orc h1 { margin: 12px 0 6px; font-size: 15pt; text-align: center; }
  .orc table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .orc th, .orc td { padding: 3px 6px; border: 1px solid #000; text-align: left; vertical-align: top; }
  .orc th { background: #000; color: #fff; font-size: 8.5pt; text-transform: uppercase; }
  .orc .bloco th { text-transform: none; }
  .orc .n { text-align: right; white-space: nowrap; }
  .orc .totais { width: 46%; margin-left: auto; }
  .orc .totais td:first-child { font-weight: 600; }
  .orc .totais .final td { font-weight: 700; font-size: 10.5pt; }
  .orc .texto { white-space: normal; line-height: 1.4; }
`;

function corpoOrcamento(o, empresa = {}) {
  const t = calcularTotais(o);
  const ver = exibirPdfDe(o.exibirPdf);
  const logo = LOGO.test(String(empresa.logo ?? "")) ? `<img src="${empresa.logo}" alt="">` : "";
  const dadosEmpresa = [
    empresa.nome ? `<strong>${escapar(empresa.nome)}</strong>` : "",
    linhasRotuladas([
      ["Endereço", empresa.endereco || empresa.cidade],
      ["WhatsApp", telefone(empresa.telefone)],
      ["CPF/CNPJ", documento(empresa.documento)],
      ["E-mail", empresa.email],
      ["Site", empresa.site],
    ]),
  ].join("");

  const datas = [
    ver.numero ? `<div>Orçamento<b>Nº ${numeroFormatado(o.numero)}</b></div>` : "",
    `<div>Criado em<b>${data(o.criadoEm)}</b></div>`,
    `<div>Válido até<b>${data(dataValidade(o))}</b></div>`,
  ].join("");

  const c = o.cliente;
  const cliente = c
    ? [
        ["Nome", c.nome],
        ["Telefone / WhatsApp", telefone(c.telefone)],
        ["CPF/CNPJ", documento(c.documento)],
        ["E-mail", c.email],
        ["Endereço", c.endereco || c.cidade],
      ]
        .filter(([, v]) => v)
        .map(([r, v]) => linha(`${escapar(r)}: ${escapar(v)}`))
        .join("")
    : "";

  const colunas = [
    ver.nome ? ["Descrição", (i) => escapar(i.descricao), ""] : null,
    ver.dimensoes && o.itens.some((i) => i.alturaMm || i.larguraMm || i.comprimentoMm)
      ? ["Dimensões (mm)", (i) => (i.alturaMm || i.larguraMm || i.comprimentoMm ? [i.alturaMm, i.larguraMm, i.comprimentoMm].map((d) => (d ? medida(d) : "—")).join(" × ") : ""), ""]
      : null,
    ver.quantidade ? ["Qtd", (i) => String(i.quantidade), "n"] : null,
    ver.precoUnitario ? ["Preço unit.", (i) => reais(BigInt(i.precoUnitarioCentavos)), "n"] : null,
    ["Total", (i) => reais(BigInt(i.quantidade) * BigInt(i.precoUnitarioCentavos)), "n"],
  ].filter(Boolean);
  const itens = `<table class="itens"><tr>${colunas.map(([r, , cl]) => `<th class="${cl}">${escapar(r)}</th>`).join("")}</tr>${o.itens
    .map((i) => `<tr>${colunas.map(([, f, cl]) => `<td class="${cl}">${f(i)}</td>`).join("")}</tr>`)
    .join("")}</table>`;

  const totais = `<table class="totais">
    <tr><td>Subtotal</td><td class="n">${reais(t.subtotal)}</td></tr>
    ${t.desconto > 0n ? `<tr><td>Desconto</td><td class="n">- ${reais(t.desconto)}</td></tr>` : ""}
    ${t.frete > 0n ? `<tr><td>Frete</td><td class="n">${reais(t.frete)}</td></tr>` : ""}
    <tr class="final"><td>Total final</td><td class="n">${reais(t.total)}</td></tr></table>`;

  const formas = (o.formasPagamento ?? []).map((f) => ROTULOS_FORMA[f]).join(", ") || o.formaPagamento;
  const condicoes = [
    formas ? `Pagamento: ${escapar(formas)}` : "",
    o.entrega ? `Entrega: ${escapar(ROTULOS_ENTREGA[o.entrega] ?? o.entrega)}` : "",
    o.prazoProducao ? `Prazo de produção: ${escapar(o.prazoProducao)}` : "",
    `Validade: ${o.validadeDias} dia(s)`,
  ]
    .filter(Boolean)
    .map(linha)
    .join("");

  const sinal = o.cobrarSinal ? valorSinal(o, t.total) : null;
  const blocoSinal =
    sinal !== null
      ? bloco("Sinal e saldo", linha(`Sinal solicitado: ${reais(sinal)}`) + linha(`Saldo restante: ${reais(t.total - sinal)}`))
      : "";
  const textoLivre = (titulo, texto) => (texto ? bloco(titulo, linha(`<div class="texto">${escapar(texto).replace(/\n/g, "<br>")}</div>`)) : "");

  return `<div class="orc">
<div class="topo"><div class="empresa">${logo}<div class="dados">${dadosEmpresa}</div></div><div class="datas">${datas}</div></div>
<h1>Orçamento</h1>
${bloco("Cliente", cliente)}
${itens}
${totais}
${bloco("Condições", condicoes)}
${blocoSinal}
${textoLivre("Descrição", o.descricaoComplementar)}
${textoLivre("Observações", o.observacoes)}
</div>`;
}

function gerarHtmlOrcamento(o, empresa = {}) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>Orçamento ${numeroFormatado(o.numero)}</title>
<style>body { margin: 0; } ${CSS}</style></head>
<body>${corpoOrcamento(o, empresa)}</body></html>`;
}

// Rodapé do PDF (Electron preenche os números de página).
const RODAPE_PDF = `<div style="width:100%;padding:0 12mm;font:7pt Arial,sans-serif;text-align:right;color:#444">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`;

// Nome do arquivo: "Orçamento - Cliente - DD-MM-AAAA.pdf" (data da geração) ou o escolhido no orçamento.
function nomeArquivoPdf(o, { hoje = new Date() } = {}) {
  const limpar = (t) => String(t ?? "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
  const escolhido = limpar(o.nomeArquivo).replace(/\.pdf$/i, "");
  if (escolhido) return `${escolhido}.pdf`;
  const p = (n) => String(n).padStart(2, "0");
  const dia = `${p(hoje.getDate())}-${p(hoje.getMonth() + 1)}-${hoje.getFullYear()}`;
  const cliente = limpar(o.cliente?.nome);
  return `Orçamento - ${cliente ? `${cliente} - ` : `${numeroFormatado(o.numero)} - `}${dia}.pdf`;
}

module.exports = { CSS_ORCAMENTO: CSS, RODAPE_PDF, corpoOrcamento, escapar, gerarHtmlOrcamento, nomeArquivoPdf, reais };
