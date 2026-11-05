import { describe, expect, it } from "vitest";
import modelo from "../src/core/printables.cjs";
import servico from "../src/main/printables.cjs";

const { corpoBusca, lerResposta, miniaturaPermitida, urlMiniatura } = modelo;
const { criarServicoPrintables } = servico;

const FOTO = "media/prints/637161/images/5178460_abc/foto_f07ee4de.jpg";
const resposta = (items, totalCount = items.length) => ({ data: { searchPrints2: { totalCount, items } } });
const item = (extra = {}) => ({
  id: "637161",
  name: " Chaveiro fluminense ",
  slug: "chaveiro-fluminense",
  likesCount: 11,
  downloadCount: 214,
  premium: false,
  price: null,
  user: { publicUsername: "josue" },
  image: { filePath: FOTO },
  ...extra,
});

describe("Printables: consulta e leitura", () => {
  it("monta a consulta com variáveis (o termo não entra no texto da query)", () => {
    const corpo = JSON.parse(corpoBusca('vaso "espiral"', 2));
    expect(corpo.variables).toEqual({ q: 'vaso "espiral"', limit: 24, offset: 24 });
    expect(corpo.query).not.toContain("espiral");
  });

  it("recusa busca vazia, longa demais ou página inválida", () => {
    expect(() => corpoBusca("  ")).toThrow(/busca/);
    expect(() => corpoBusca("a".repeat(121))).toThrow(/busca/);
    expect(() => corpoBusca("vaso", 0)).toThrow(/Página/);
  });

  it("normaliza os itens: link, miniatura, preço e números", () => {
    const r = lerResposta(resposta([item(), item({ id: "2", name: "Pago", premium: true, slug: null, image: null })], 100));
    expect(r.itens[0]).toEqual({
      id: "printables:637161",
      titulo: "Chaveiro fluminense",
      autor: "josue",
      url: "https://www.printables.com/model/637161-chaveiro-fluminense",
      imagem: "https://media.printables.com/media/prints/637161/images/5178460_abc/thumbs/inside/320x240/jpg/foto_f07ee4de.jpg",
      curtidas: 11,
      downloads: 214,
      preco: "gratuito",
    });
    expect(r.itens[1]).toMatchObject({ url: "https://www.printables.com/model/2", imagem: null, preco: "pago" });
    expect(r.temMais).toBe(true);
  });

  it("ignora itens estranhos e repetidos", () => {
    const r = lerResposta(resposta([item(), item(), { id: "x", name: "a" }, { id: "3", name: "" }]));
    expect(r.itens).toHaveLength(1);
  });

  it("formato inesperado vira erro", () => {
    expect(() => lerResposta({ errors: [{ message: "x" }] })).toThrow(/formato/);
  });

  it("miniatura de PNG e WebP usa a pasta png", () => {
    expect(urlMiniatura("media/prints/1/images/2/a.png")).toBe("https://media.printables.com/media/prints/1/images/2/thumbs/inside/320x240/png/a.png");
    expect(urlMiniatura("media/prints/1/images/2/a.webp")).toContain("/320x240/png/a.webp");
  });

  it("miniaturas só do servidor de mídia do Printables", () => {
    expect(urlMiniatura("media/prints/1/../../segredo.jpg")).toBeNull();
    expect(urlMiniatura("https://outro.com/a.jpg")).toBeNull();
    expect(miniaturaPermitida("https://media.printables.com/media/prints/1/a.jpg")).toBe(true);
    expect(miniaturaPermitida("https://evil.com/media/prints/1/a.jpg")).toBe(false);
    expect(miniaturaPermitida("http://media.printables.com/media/prints/1/a.jpg")).toBe(false);
  });
});

function falsoFetch(rotas) {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    const r = rotas(url, opcoes);
    const bytes = typeof r.corpo === "string" ? new TextEncoder().encode(r.corpo) : r.corpo;
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: { get: () => r.tipo ?? "application/json" },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
  return { buscar, chamadas };
}

describe("Printables: serviço", () => {
  it("pesquisa, guarda em cache e baixa só miniaturas que vieram na busca", async () => {
    const { buscar, chamadas } = falsoFetch((url) =>
      url.includes("graphql") ? { corpo: JSON.stringify(resposta([item()])) } : { corpo: new Uint8Array([1, 2, 3]), tipo: "image/jpeg" },
    );
    const s = criarServicoPrintables({ buscar });
    const r = await s.pesquisar("chaveiro");
    await s.pesquisar("chaveiro");
    expect(chamadas).toHaveLength(1); // a segunda veio do cache
    expect(chamadas[0].opcoes.method).toBe("POST");

    await expect(s.miniatura("https://media.printables.com/media/prints/9/outra.jpg")).rejects.toThrow(/não disponível/);
    expect(await s.miniatura(r.itens[0].imagem)).toBe("data:image/jpeg;base64,AQID");
  });

  it("erros do site viram mensagens claras", async () => {
    const s = criarServicoPrintables({ buscar: falsoFetch(() => ({ status: 429, corpo: "" })).buscar });
    await expect(s.pesquisar("vaso")).rejects.toThrow(/muitas buscas/);
    const s2 = criarServicoPrintables({ buscar: falsoFetch(() => ({ corpo: "<html>" })).buscar });
    await expect(s2.pesquisar("vaso")).rejects.toThrow(/formato/);
  });
});
