// Consulta o Printables a partir do processo principal (a tela não acessa a internet).
// Guarda as buscas por 5 minutos e só baixa miniaturas que vieram nas buscas.
"use strict";

const { API, corpoBusca, lerResposta, miniaturaPermitida } = require("../core/printables.cjs");

const CABECALHOS = { "User-Agent": "ProgramaFerramentas3D (busca de modelos)", Accept: "application/json" };

function criarServicoPrintables({ buscar = globalThis.fetch, agora = Date.now } = {}) {
  const cache = new Map();
  const miniaturas = new Map();
  const permitidas = new Set();

  async function pedir(url, opcoes, limite) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 12000);
    try {
      const r = await buscar(url, { ...opcoes, redirect: "error", credentials: "omit", signal: controle.signal });
      if (!r.ok) throw new Error(r.status === 429 ? "O Printables recebeu muitas buscas. Espere um pouco e tente de novo." : `O Printables não respondeu (erro ${r.status}).`);
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length > limite) throw new Error("A resposta do Printables veio grande demais.");
      return { bytes, tipo: (r.headers.get("content-type") || "").split(";")[0] };
    } catch (erro) {
      if (erro.name === "AbortError") throw new Error("O Printables demorou para responder. Tente de novo.");
      if (erro.name === "TypeError") throw new Error("Sem conexão com o Printables. Confira sua internet.");
      throw erro;
    } finally {
      clearTimeout(relogio);
    }
  }

  async function pesquisar(termo, pagina = 1) {
    const corpo = corpoBusca(termo, pagina);
    const salvo = cache.get(corpo);
    if (salvo && agora() - salvo.em < 5 * 60 * 1000) return salvo.valor;
    const { bytes } = await pedir(API, { method: "POST", headers: { ...CABECALHOS, "Content-Type": "application/json" }, body: corpo }, 3_000_000);
    let json;
    try {
      json = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("O Printables respondeu num formato diferente do esperado.");
    }
    const valor = lerResposta(json, pagina);
    for (const item of valor.itens) if (item.imagem) permitidas.add(item.imagem);
    cache.set(corpo, { em: agora(), valor });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return valor;
  }

  // Devolve a miniatura como data URL (a tela só aceita imagens locais).
  async function miniatura(url) {
    if (!permitidas.has(url) || !miniaturaPermitida(url)) throw new Error("Miniatura não disponível.");
    if (miniaturas.has(url)) return miniaturas.get(url);
    const { bytes, tipo } = await pedir(url, { method: "GET", headers: { ...CABECALHOS, Accept: "image/jpeg,image/png,image/webp" } }, 1_500_000);
    if (!["image/jpeg", "image/png", "image/webp"].includes(tipo)) throw new Error("Miniatura em formato não aceito.");
    const dados = `data:${tipo};base64,${bytes.toString("base64")}`;
    miniaturas.set(url, dados);
    if (miniaturas.size > 150) miniaturas.delete(miniaturas.keys().next().value);
    return dados;
  }

  return { pesquisar, miniatura };
}

module.exports = { criarServicoPrintables };
