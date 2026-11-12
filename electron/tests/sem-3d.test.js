// @vitest-environment happy-dom
// Computador sem WebGL: a prévia vira um aviso em português e não quebra a tela.
import { describe, expect, it, vi } from "vitest";
import { criarPrevia } from "../src/renderer/modelos/previa3d.js";
import { SEM_3D } from "../src/renderer/modelos/webgl.js";

describe("sem 3D (WebGL)", () => {
  it("mostra o aviso em pt-BR e devolve uma prévia que não faz nada", () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // o three avisa no console ao falhar
    const caixa = document.createElement("div");
    document.body.append(caixa);
    const previa = criarPrevia(caixa);
    expect(previa.sem3d).toBe(true);
    expect(caixa.querySelector(".sem-3d").textContent).toBe(SEM_3D);
    expect(SEM_3D).toMatch(/placa de vídeo/);
    expect(() => {
      previa.mostrar([]);
      previa.enquadrar();
      previa.colorir([]);
      previa.mostrarGrade(false);
      previa.verBase();
      previa.zoom(0.9);
    }).not.toThrow();
    criarPrevia(caixa); // de novo na mesma caixa: um aviso só
    expect(caixa.querySelectorAll(".sem-3d")).toHaveLength(1);
  });
});
