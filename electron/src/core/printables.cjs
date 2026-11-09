// Busca de modelos no Printables (resultados dentro do programa).
// Usa a mesma API GraphQL que o site do Printables usa. Ela não é documentada e pode mudar:
// se a resposta vier diferente, a tela avisa e oferece abrir a busca no navegador.
"use strict";

const { ErroValidacao } = require("./validacao.cjs");

const API = "https://api.printables.com/graphql/";
const MIDIA = "https://media.printables.com/";
const POR_PAGINA = 24;
const MAX_PAGINAS = 20;

const CONSULTA = `query Busca($q: String!, $limit: Int!, $offset: Int!) {
  searchPrints2(query: $q, limit: $limit, offset: $offset) {
    totalCount
    items { id name slug likesCount downloadCount premium price user { publicUsername } image { filePath } }
  }
}`;

function corpoBusca(termo, pagina = 1) {
  const q = String(termo ?? "").trim();
  if (!q || q.length > 120) throw new ErroValidacao("Digite uma busca de até 120 caracteres.");
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > MAX_PAGINAS) throw new ErroValidacao("Página inválida.");
  return JSON.stringify({ query: CONSULTA, variables: { q, limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA } });
}

// Miniatura 320×240 a partir do caminho da imagem. Só caminhos de media/prints, sem "..".
// A pasta da miniatura precisa combinar com o arquivo: "jpg" para .jpg/.jpeg, "png" para o resto.
function urlMiniatura(caminho) {
  if (typeof caminho !== "string" || caminho.length > 600) return null;
  if (!/^media\/prints\/\d+\/[A-Za-z0-9_\-./%]+$/.test(caminho) || caminho.includes("..")) return null;
  const barra = caminho.lastIndexOf("/");
  const arquivo = caminho.slice(barra + 1);
  const formato = /\.jpe?g$/i.test(arquivo) ? "jpg" : "png";
  return `${MIDIA}${caminho.slice(0, barra)}/thumbs/inside/320x240/${formato}/${arquivo}`;
}

function miniaturaPermitida(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "media.printables.com" && !u.port && !u.username && u.pathname.startsWith("/media/prints/");
  } catch {
    return false;
  }
}

const numero = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : null);

function normalizarItem(item) {
  if (!item || !/^\d{1,12}$/.test(String(item.id)) || typeof item.name !== "string" || !item.name.trim()) return null;
  const slug = typeof item.slug === "string" && /^[a-z0-9-]{1,200}$/.test(item.slug) ? `-${item.slug}` : "";
  const preco = Number(item.price);
  return {
    id: `printables:${item.id}`,
    titulo: item.name.trim().slice(0, 140),
    autor: typeof item.user?.publicUsername === "string" ? item.user.publicUsername.trim().slice(0, 80) : "",
    url: `https://www.printables.com/model/${item.id}${slug}`,
    imagem: urlMiniatura(item.image?.filePath),
    curtidas: numero(item.likesCount),
    downloads: numero(item.downloadCount),
    preco: item.premium === true || preco > 0 ? "pago" : item.premium === false ? "gratuito" : "desconhecido",
  };
}

// Resposta da API -> { total, itens, temMais }. Lança se o formato não for o esperado.
function lerResposta(json, pagina = 1) {
  const dados = json?.data?.searchPrints2;
  if (!dados || !Array.isArray(dados.items)) throw new Error("O Printables respondeu num formato diferente do esperado.");
  const vistos = new Set();
  const itens = dados.items
    .slice(0, POR_PAGINA)
    .map(normalizarItem)
    .filter((i) => i && !vistos.has(i.id) && vistos.add(i.id));
  const total = numero(dados.totalCount) ?? itens.length;
  return { total, itens, pagina, temMais: pagina < MAX_PAGINAS && pagina * POR_PAGINA < total && dados.items.length > 0 };
}

module.exports = { API, POR_PAGINA, corpoBusca, lerResposta, miniaturaPermitida, normalizarItem, urlMiniatura };
