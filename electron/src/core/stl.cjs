// Caçador de STL: sites de busca, reconhecimento de links e favoritos.
"use strict";

const { ErroValidacao, ID, dataValida, texto, textoLongo } = require("./validacao.cjs");

const SITES = [
  { id: "printables", nome: "Printables", dominio: "printables.com", busca: "https://www.printables.com/search/models?q=" },
  { id: "thingiverse", nome: "Thingiverse", dominio: "thingiverse.com", busca: "https://www.thingiverse.com/search?type=things&q=" },
  { id: "makerworld", nome: "MakerWorld", dominio: "makerworld.com", busca: "https://makerworld.com/en/search/models?keyword=" },
  { id: "cults3d", nome: "Cults3D", dominio: "cults3d.com", busca: "https://cults3d.com/en/search?q=" },
  { id: "myminifactory", nome: "MyMiniFactory", dominio: "myminifactory.com", busca: "https://www.myminifactory.com/search/?query=" },
  { id: "thangs", nome: "Thangs", dominio: "thangs.com", busca: "https://thangs.com/search/", sufixo: "?scope=all" },
];

const PRECOS = ["gratuito", "pago", "desconhecido"];
const LIMITES = { titulo: 140, url: 600, observacoes: 500, favoritos: 5000, termo: 120 };

function urlBusca(siteId, termo) {
  const site = SITES.find((s) => s.id === siteId);
  const t = String(termo ?? "").trim();
  if (!site || !t) return null;
  return `${site.busca}${encodeURIComponent(t.slice(0, LIMITES.termo))}${site.sufixo ?? ""}`;
}

// Só https, com host. Devolve a URL normalizada ou lança.
function urlSegura(valor) {
  let url;
  try {
    url = new URL(String(valor ?? "").trim());
  } catch {
    throw new ErroValidacao("Link: cole um endereço completo, começando com https://");
  }
  if (url.protocol !== "https:" || !url.hostname) throw new ErroValidacao("Link: use um endereço https://");
  if (url.toString().length > LIMITES.url) throw new ErroValidacao("Link muito longo.");
  url.hash = "";
  return url.toString();
}

function detectarSite(valor) {
  try {
    const host = new URL(String(valor)).hostname.toLowerCase();
    const site = SITES.find((s) => host === s.dominio || host.endsWith(`.${s.dominio}`));
    return site ? site.id : "outro";
  } catch {
    return "outro";
  }
}

// "https://www.printables.com/model/12345-articulated-dragon" -> "Articulated Dragon"
function sugerirTitulo(valor) {
  try {
    const partes = new URL(String(valor)).pathname.split("/").filter(Boolean);
    const candidatas = partes.filter((p) => /[a-z]/i.test(p) && !["model", "models", "thing", "things", "en", "pt", "3d-model", "object"].includes(p.toLowerCase()));
    const ultima = candidatas[candidatas.length - 1];
    if (!ultima) return "";
    const limpa = decodeURIComponent(ultima)
      .replace(/^\d+[-_]?/, "")
      .replace(/^thing:\d+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    return limpa ? limpa.replace(/\b\p{L}/gu, (l) => l.toUpperCase()).slice(0, LIMITES.titulo) : "";
  } catch {
    return "";
  }
}

function validarFavorito(f) {
  if (!f || typeof f !== "object") throw new ErroValidacao("Favorito inválido.");
  if (typeof f.id !== "string" || !ID.test(f.id)) throw new ErroValidacao("Identificador inválido.");
  texto(f.titulo, "Título", LIMITES.titulo, { obrigatorio: true });
  if (urlSegura(f.url) !== f.url) throw new ErroValidacao("Link inválido.");
  if (f.site !== "outro" && !SITES.some((s) => s.id === f.site)) throw new ErroValidacao("Site inválido.");
  if (!PRECOS.includes(f.preco)) throw new ErroValidacao("Preço inválido.");
  textoLongo(f.observacoes, "Observações", LIMITES.observacoes);
  if (!dataValida(f.criadoEm) || !dataValida(f.atualizadoEm)) throw new ErroValidacao("Data inválida.");
  return f;
}

// valores: { url, titulo, preco, observacoes }
function montarFavorito(valores, { id, anterior, existentes = [], agora = new Date().toISOString() }) {
  const v = valores ?? {};
  const url = urlSegura(v.url);
  if (existentes.some((f) => f.url === url && f.id !== id)) {
    throw new ErroValidacao("Este link já está nos seus favoritos.");
  }
  const titulo = texto(v.titulo, "Título", LIMITES.titulo) || sugerirTitulo(url);
  if (!titulo) throw new ErroValidacao("Preencha o campo: Título.");
  return validarFavorito({
    id,
    titulo,
    url,
    site: detectarSite(url),
    preco: PRECOS.includes(v.preco) ? v.preco : "desconhecido",
    observacoes: textoLongo(v.observacoes, "Observações", LIMITES.observacoes),
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  });
}

module.exports = { LIMITES, PRECOS, SITES, detectarSite, montarFavorito, sugerirTitulo, urlBusca, urlSegura, validarFavorito };
