import { describe, expect, it } from "vitest";
import stl from "../src/core/stl.cjs";

const { detectarSite, montarFavorito, sugerirTitulo, urlBusca, urlSegura } = stl;
const ID = "11111111-2222-3333-4444-555555555555";

describe("busca nos sites", () => {
  it("monta a URL com o termo codificado", () => {
    expect(urlBusca("printables", "vaso espiral")).toBe("https://www.printables.com/search/models?q=vaso%20espiral");
    expect(urlBusca("thangs", "dragão")).toBe("https://thangs.com/search/drag%C3%A3o?scope=all");
    expect(urlBusca("printables", "  ")).toBeNull();
    expect(urlBusca("inexistente", "x")).toBeNull();
  });
});

describe("links", () => {
  it("aceita só https", () => {
    expect(urlSegura("https://www.printables.com/model/1#comentarios")).toBe("https://www.printables.com/model/1");
    expect(() => urlSegura("http://exemplo.com")).toThrow(/https/);
    expect(() => urlSegura("javascript:alert(1)")).toThrow();
    expect(() => urlSegura("printables.com/model/1")).toThrow(/endereço completo/);
  });

  it("reconhece o site", () => {
    expect(detectarSite("https://www.printables.com/model/1")).toBe("printables");
    expect(detectarSite("https://makerworld.com/en/models/123")).toBe("makerworld");
    expect(detectarSite("https://exemplo.com/x")).toBe("outro");
    expect(detectarSite("https://falso-printables.com/x")).toBe("outro");
  });

  it("sugere o título pelo endereço", () => {
    expect(sugerirTitulo("https://www.printables.com/model/12345-articulated-dragon")).toBe("Articulated Dragon");
    expect(sugerirTitulo("https://cults3d.com/en/3d-model/home/vaso-espiral_decorativo")).toBe("Vaso Espiral Decorativo");
    expect(sugerirTitulo("https://www.thingiverse.com/thing:12345")).toBe("");
  });
});

describe("favoritos", () => {
  it("monta com título sugerido e recusa link repetido", () => {
    const f = montarFavorito({ url: "https://www.printables.com/model/99-cat-planter", preco: "gratuito" }, { id: ID });
    expect(f).toMatchObject({ titulo: "Cat Planter", site: "printables", preco: "gratuito" });
    expect(() =>
      montarFavorito({ url: "https://www.printables.com/model/99-cat-planter" }, { id: "22222222-2222-3333-4444-555555555555", existentes: [f] }),
    ).toThrow(/já está/);
  });

  it("sem título possível, pede o título", () => {
    expect(() => montarFavorito({ url: "https://www.thingiverse.com/thing:1" }, { id: ID })).toThrow(/Título/);
  });
});
