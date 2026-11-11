import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// Um id repetido faz getElementById pegar o elemento errado (na v0.46.0, a janela de Minhas Impressões
// abria no lugar da pergunta "Como você vai imprimir?" dos modelos).
it("index.html não tem ids repetidos", () => {
  const html = readFileSync(join(__dirname, "../src/renderer/index.html"), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(repetidos).toEqual([]);
});
