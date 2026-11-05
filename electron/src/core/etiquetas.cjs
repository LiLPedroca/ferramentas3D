// Etiquetas em PDF (produtos e pedidos), com QR code opcional do WhatsApp da empresa.
// O HTML é montado aqui, com todo texto escapado, e vira PDF numa janela sem JavaScript.
"use strict";

const qrcode = require("qrcode-generator");
const { ErroValidacao } = require("./validacao.cjs");

// Tamanhos de etiqueta (mm). Folha: etiquetas em grade numa A4. Térmica: uma etiqueta por página.
const TAMANHOS = {
  "a4-70x37": { nome: "A4 · 3 × 8 (70 × 37 mm)", largura: 70, altura: 37, colunas: 3, linhas: 8, folha: true },
  "a4-99x57": { nome: "A4 · 2 × 5 (99 × 57 mm)", largura: 99, altura: 57, colunas: 2, linhas: 5, folha: true },
  "termica-50x30": { nome: "Térmica 50 × 30 mm", largura: 50, altura: 30 },
  "termica-60x40": { nome: "Térmica 60 × 40 mm", largura: 60, altura: 40 },
  "termica-100x150": { nome: "Térmica 100 × 150 mm", largura: 100, altura: 150 },
};
const LIMITES = { etiquetas: 2000, copias: 500 };

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// BigInt/strings de centavos → "R$ 1.234,56"
function reais(centavos) {
  const c = BigInt(centavos);
  const inteiro = (c / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${inteiro},${(c % 100n).toString().padStart(2, "0")}`;
}

function telefone(d) {
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function linkWhatsApp(digitos, mensagem) {
  const d = String(digitos ?? "").replace(/\D/g, "");
  let numero = null;
  if (d.length === 10 || d.length === 11) numero = `55${d}`;
  else if ((d.length === 12 || d.length === 13) && d.startsWith("55")) numero = d;
  if (!numero) return null;
  return `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`;
}

// QR code como SVG (módulos pretos num quadrado), texto em UTF-8.
function qrSvg(texto) {
  const qr = qrcode(0, "M");
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  qr.addData(texto, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const margem = 2;
  let caminho = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (qr.isDark(y, x)) caminho += `M${x + margem} ${y + margem}h1v1h-1z`;
  }
  const lado = n + 2 * margem;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"><rect width="${lado}" height="${lado}" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`;
}

function medida(mm) {
  return mm ? `${String(mm).replace(".", ",")} mm` : "";
}

// ---------- Conteúdo das etiquetas ----------
// produtos: [{ produto, copias }]. Devolve [{ topo, titulo, destaque, linhas, qr }].
function etiquetasDeProdutos(itens, { empresa = {}, mostrarPreco = true, qr = false } = {}) {
  return itens.flatMap(({ produto: p, copias }) => {
    const medidas = [p.larguraMm, p.alturaMm, p.comprimentoMm].filter(Boolean);
    const linhas = [
      p.pesoG ? `${String(p.pesoG).replace(".", ",")} g` : "",
      medidas.length ? medidas.map((m) => String(m).replace(".", ",")).join(" × ") + " mm" : "",
    ].filter(Boolean);
    const etiqueta = {
      topo: empresa.nome ?? "",
      titulo: p.nome,
      destaque: mostrarPreco ? reais(p.precoCentavos) : "",
      linhas: [linhas.join(" · ")].filter(Boolean),
      qr: qr ? linkWhatsApp(empresa.telefone, `Olá! Tenho interesse em: ${p.nome}`) : null,
    };
    return Array.from({ length: copias }, () => etiqueta);
  });
}

// pedidos (orçamentos): etiqueta de envio/identificação.
function etiquetasDePedidos(itens, { empresa = {}, qr = false } = {}) {
  return itens.flatMap(({ orcamento: o, copias }) => {
    const c = o.cliente ?? {};
    const numero = `Pedido nº ${String(o.numero).padStart(4, "0")}`;
    const etiqueta = {
      topo: numero,
      titulo: c.nome || "Cliente",
      destaque: "",
      linhas: [telefone(c.telefone), c.cidade ?? "", empresa.nome ? `Remetente: ${empresa.nome}${empresa.cidade ? ` · ${empresa.cidade}` : ""}` : ""].filter(Boolean),
      qr: qr ? linkWhatsApp(empresa.telefone, `Olá! Sobre o ${numero}.`) : null,
    };
    return Array.from({ length: copias }, () => etiqueta);
  });
}

// ---------- HTML ----------
function htmlDaEtiqueta(e, t) {
  const comQr = Boolean(e.qr);
  // letras proporcionais à altura da etiqueta
  const base = Math.max(6.5, Math.min(11, t.altura * 0.21));
  const qrLado = Math.min(t.altura - 6, t.largura * 0.36);
  return (
    `<div class="etiqueta" style="--base:${base.toFixed(2)}pt">` +
    `<div class="texto">` +
    (e.topo ? `<div class="topo">${escapar(e.topo)}</div>` : "") +
    `<div class="titulo">${escapar(e.titulo)}</div>` +
    (e.destaque ? `<div class="destaque">${escapar(e.destaque)}</div>` : "") +
    e.linhas.map((l) => `<div class="linha">${escapar(l)}</div>`).join("") +
    `</div>` +
    (comQr ? `<div class="qr" style="width:${qrLado.toFixed(1)}mm;height:${qrLado.toFixed(1)}mm">${qrSvg(e.qr)}</div>` : "") +
    `</div>`
  );
}

function gerarHtmlEtiquetas(etiquetas, chaveTamanho) {
  const t = TAMANHOS[chaveTamanho];
  if (!t) throw new ErroValidacao("Tamanho de etiqueta inválido.");
  if (!etiquetas.length) throw new ErroValidacao("Escolha pelo menos um item.");
  if (etiquetas.length > LIMITES.etiquetas) throw new ErroValidacao(`Use no máximo ${LIMITES.etiquetas} etiquetas por vez.`);
  const estilo =
    `*{box-sizing:border-box;margin:0;padding:0}` +
    `body{font-family:"Segoe UI",Arial,sans-serif;color:#111}` +
    `.etiqueta{width:${t.largura}mm;height:${t.altura}mm;padding:2.2mm 2.6mm;display:flex;gap:2mm;align-items:center;overflow:hidden}` +
    `.texto{flex:1;min-width:0;display:flex;flex-direction:column;gap:0.6mm}` +
    `.topo{font-size:calc(var(--base)*0.72);color:#555;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}` +
    `.titulo{font-size:var(--base);font-weight:700;line-height:1.15;max-height:3.5em;overflow:hidden}` +
    `.destaque{font-size:calc(var(--base)*1.45);font-weight:800}` +
    `.linha{font-size:calc(var(--base)*0.8);color:#333;line-height:1.2}` +
    `.qr{flex-shrink:0}.qr svg{width:100%;height:100%;display:block}`;
  let paginas;
  if (t.folha) {
    const porFolha = t.colunas * t.linhas;
    const margemX = (210 - t.colunas * t.largura) / 2;
    const margemY = (297 - t.linhas * t.altura) / 2;
    paginas = [];
    for (let i = 0; i < etiquetas.length; i += porFolha) {
      const celulas = etiquetas.slice(i, i + porFolha).map((e) => htmlDaEtiqueta(e, t));
      paginas.push(
        `<section class="folha" style="padding:${margemY.toFixed(2)}mm ${margemX.toFixed(2)}mm;display:grid;grid-template-columns:repeat(${t.colunas},${t.largura}mm);grid-auto-rows:${t.altura}mm">${celulas.join("")}</section>`,
      );
    }
    return (
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` +
      `<style>@page{size:A4;margin:0}${estilo}.folha{width:210mm;height:297mm;page-break-after:always}.folha:last-child{page-break-after:auto}</style></head><body>${paginas.join("")}</body></html>`
    );
  }
  paginas = etiquetas.map((e) => `<section class="pagina">${htmlDaEtiqueta(e, t)}</section>`);
  return (
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` +
    `<style>@page{size:${t.largura}mm ${t.altura}mm;margin:0}${estilo}.pagina{width:${t.largura}mm;height:${t.altura}mm;page-break-after:always}.pagina:last-child{page-break-after:auto}</style></head><body>${paginas.join("")}</body></html>`
  );
}

// Valida o pedido vindo da tela: { tipo: "produtos"|"pedidos", itens: [{ id, copias }], tamanho, mostrarPreco, qr }.
function validarPedidoEtiquetas(p) {
  if (!p || typeof p !== "object") throw new ErroValidacao("Pedido de etiquetas inválido.");
  if (!["produtos", "pedidos"].includes(p.tipo)) throw new ErroValidacao("Tipo de etiqueta inválido.");
  if (!Object.hasOwn(TAMANHOS, p.tamanho)) throw new ErroValidacao("Tamanho de etiqueta inválido.");
  if (!Array.isArray(p.itens) || p.itens.length === 0) throw new ErroValidacao("Escolha pelo menos um item.");
  const itens = p.itens.map((i) => {
    const copias = Number(i?.copias);
    if (typeof i?.id !== "string" || !Number.isInteger(copias) || copias < 1 || copias > LIMITES.copias) {
      throw new ErroValidacao(`Cópias: use de 1 a ${LIMITES.copias} por item.`);
    }
    return { id: i.id, copias };
  });
  return { tipo: p.tipo, itens, tamanho: p.tamanho, mostrarPreco: p.mostrarPreco !== false, qr: p.qr === true };
}

module.exports = {
  LIMITES,
  TAMANHOS,
  etiquetasDePedidos,
  etiquetasDeProdutos,
  gerarHtmlEtiquetas,
  linkWhatsApp,
  qrSvg,
  validarPedidoEtiquetas,
};
