// Monta o HTML do orçamento para virar PDF. Todo texto do usuário é escapado.
"use strict";

const { calcularTotais, dataValidade } = require("./orcamento.cjs");

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
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

const linhas = (...partes) => partes.filter(Boolean).map(escapar).join("<br>");

function numeroFormatado(n) {
  return String(n).padStart(4, "0");
}

function gerarHtmlOrcamento(o, empresa = {}) {
  const t = calcularTotais(o);
  const nomeEmpresa = empresa.nome || "Orçamento";
  const contatoEmpresa = linhas(
    telefone(empresa.telefone),
    empresa.email,
    empresa.site,
    [empresa.cidade, documento(empresa.documento)].filter(Boolean).join(" · "),
  );
  const cliente = o.cliente
    ? linhas(o.cliente.nome, telefone(o.cliente.telefone), o.cliente.email, documento(o.cliente.documento), o.cliente.cidade)
    : "—";

  const itens = o.itens
    .map((item) => {
      const totalItem = BigInt(item.quantidade) * BigInt(item.precoUnitarioCentavos);
      return `<tr><td>${escapar(item.descricao)}</td><td class="n">${item.quantidade}</td><td class="n">${reais(BigInt(item.precoUnitarioCentavos))}</td><td class="n">${reais(totalItem)}</td></tr>`;
    })
    .join("");

  const linhasTotais = [
    `<tr><td>Subtotal</td><td class="n">${reais(t.subtotal)}</td></tr>`,
    t.desconto > 0n ? `<tr><td>Desconto</td><td class="n">- ${reais(t.desconto)}</td></tr>` : "",
    t.frete > 0n ? `<tr><td>Frete</td><td class="n">${reais(t.frete)}</td></tr>` : "",
    `<tr class="total"><td>Total</td><td class="n">${reais(t.total)}</td></tr>`,
  ].join("");

  const condicoes = [
    ["Validade", `${o.validadeDias} dia(s), até ${data(dataValidade(o))}`],
    o.prazoProducao ? ["Prazo de produção", o.prazoProducao] : null,
    o.formaPagamento ? ["Forma de pagamento", o.formaPagamento] : null,
  ]
    .filter(Boolean)
    .map(([rotulo, valor]) => `<div><dt>${escapar(rotulo)}</dt><dd>${escapar(valor)}</dd></div>`)
    .join("");

  const observacoes = o.observacoes
    ? `<section><h2>Observações</h2><p class="obs">${escapar(o.observacoes).replace(/\n/g, "<br>")}</p></section>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Orçamento ${numeroFormatado(o.numero)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #1a2033; font-size: 11pt; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 14px; border-bottom: 3px solid #3f72e0; }
  .empresa h1 { margin: 0 0 6px; font-size: 18pt; }
  .empresa p, .doc p { margin: 0; color: #5d6880; font-size: 9.5pt; line-height: 1.5; }
  .doc { text-align: right; }
  .doc .titulo { margin: 0; color: #3f72e0; font-size: 10pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
  .doc .numero { margin: 2px 0 6px; font-size: 20pt; font-weight: 700; color: #1a2033; }
  section { margin-top: 18px; }
  h2 { margin: 0 0 6px; color: #5d6880; font-size: 9pt; letter-spacing: 1px; text-transform: uppercase; }
  .cliente { line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  .itens th { padding: 8px 10px; background: #eef1f7; color: #5d6880; font-size: 9pt; text-align: left; }
  .itens td { padding: 9px 10px; border-bottom: 1px solid #e3e7f0; vertical-align: top; }
  .n, .itens th.n { text-align: right; white-space: nowrap; }
  .totais { width: 46%; margin-left: auto; margin-top: 10px; }
  .totais td { padding: 5px 10px; }
  .totais .total td { padding-top: 9px; border-top: 2px solid #1a2033; font-size: 13pt; font-weight: 700; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 0; }
  dt { color: #5d6880; font-size: 9pt; }
  dd { margin: 0; }
  .obs { margin: 0; line-height: 1.5; }
  footer { margin-top: 28px; color: #98a2b8; font-size: 8.5pt; text-align: center; }
</style></head>
<body>
<header>
  <div class="empresa"><h1>${escapar(nomeEmpresa)}</h1><p>${contatoEmpresa}</p></div>
  <div class="doc"><p class="titulo">Orçamento</p><p class="numero">Nº ${numeroFormatado(o.numero)}</p><p>Emitido em ${data(o.criadoEm)}</p></div>
</header>
<section><h2>Cliente</h2><div class="cliente">${cliente}</div></section>
<section>
  <table class="itens"><thead><tr><th>Descrição</th><th class="n">Qtd.</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead>
  <tbody>${itens}</tbody></table>
  <table class="totais"><tbody>${linhasTotais}</tbody></table>
</section>
<section><h2>Condições</h2><dl>${condicoes}</dl></section>
${observacoes}
<footer>Orçamento nº ${numeroFormatado(o.numero)}${empresa.nome ? ` · ${escapar(empresa.nome)}` : ""}</footer>
</body></html>`;
}

function nomeArquivoPdf(o) {
  const cliente = (o.cliente?.nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `Orcamento-${numeroFormatado(o.numero)}${cliente ? `-${cliente}` : ""}.pdf`;
}

module.exports = { escapar, gerarHtmlOrcamento, nomeArquivoPdf, reais };
