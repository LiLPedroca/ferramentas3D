import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const et = require("../src/core/etiquetas.cjs");

const produto = { id: "p1", nome: "Chaveiro <Pedro>", precoCentavos: "1990", pesoG: 3.8, larguraMm: 70, alturaMm: 23 };
const empresa = { nome: "Ateliê 3D", telefone: "31987654321", cidade: "BH" };

describe("etiquetas", () => {
  it("produtos: cópias, preço, medidas e texto escapado", () => {
    const lista = et.etiquetasDeProdutos([{ produto, copias: 3 }], { empresa, mostrarPreco: true });
    expect(lista).toHaveLength(3);
    expect(lista[0]).toMatchObject({ topo: "Ateliê 3D", titulo: "Chaveiro <Pedro>", destaque: "R$ 19,90", qr: null });
    expect(lista[0].linhas[0]).toBe("3,8 g · 70 × 23 mm");
    const html = et.gerarHtmlEtiquetas(lista, "a4-70x37");
    expect(html).toContain("Chaveiro &lt;Pedro&gt;");
    expect(html).not.toContain("<Pedro>");
    expect(html).toContain("@page{size:A4;margin:0}");
    expect(html.match(/class="etiqueta"/g)).toHaveLength(3);
  });

  it("folha A4 3 × 8: 25 etiquetas viram 2 folhas; térmica: uma por página", () => {
    const lista = et.etiquetasDeProdutos([{ produto, copias: 25 }], { empresa });
    expect(et.gerarHtmlEtiquetas(lista, "a4-70x37").match(/class="folha"/g)).toHaveLength(2);
    const termica = et.gerarHtmlEtiquetas(lista.slice(0, 4), "termica-50x30");
    expect(termica).toContain("@page{size:50mm 30mm;margin:0}");
    expect(termica.match(/class="pagina"/g)).toHaveLength(4);
  });

  it("QR do WhatsApp da empresa com a mensagem do produto, em SVG", () => {
    const [e] = et.etiquetasDeProdutos([{ produto, copias: 1 }], { empresa, qr: true });
    expect(e.qr).toBe(`https://wa.me/5531987654321?text=${encodeURIComponent("Olá! Tenho interesse em: Chaveiro <Pedro>")}`);
    const svg = et.qrSvg(e.qr);
    expect(svg).toMatch(/^<svg/);
    expect(svg.match(/h1v1h-1z/g).length).toBeGreaterThan(200);
    expect(et.linkWhatsApp("123")).toBeNull();
  });

  it("pedidos: número, cliente, telefone e remetente", () => {
    const orcamento = { numero: 7, cliente: { nome: "Ana", telefone: "31999990000", cidade: "Contagem" } };
    const [e] = et.etiquetasDePedidos([{ orcamento, copias: 1 }], { empresa });
    expect(e.topo).toBe("Pedido nº 0007");
    expect(e.titulo).toBe("Ana");
    expect(e.linhas).toEqual(["(31) 99999-0000", "Contagem", "Remetente: Ateliê 3D · BH"]);
  });

  it("valida o pedido vindo da tela", () => {
    expect(() => et.validarPedidoEtiquetas({ tipo: "x", itens: [], tamanho: "a4-70x37" })).toThrow(/Tipo/);
    expect(() => et.validarPedidoEtiquetas({ tipo: "produtos", itens: [], tamanho: "a4-70x37" })).toThrow(/pelo menos um/);
    expect(() => et.validarPedidoEtiquetas({ tipo: "produtos", itens: [{ id: "a", copias: 0 }], tamanho: "a4-70x37" })).toThrow(/Cópias/);
    expect(() => et.validarPedidoEtiquetas({ tipo: "produtos", itens: [{ id: "a", copias: 1 }], tamanho: "gigante" })).toThrow(/Tamanho/);
    expect(et.validarPedidoEtiquetas({ tipo: "pedidos", itens: [{ id: "a", copias: "2" }], tamanho: "termica-50x30", qr: true })).toEqual({
      tipo: "pedidos",
      itens: [{ id: "a", copias: 2 }],
      tamanho: "termica-50x30",
      mostrarPreco: true,
      qr: true,
    });
  });
});
