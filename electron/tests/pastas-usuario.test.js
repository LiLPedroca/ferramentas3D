import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PASTAS, criarPastasUsuario } = require("../src/main/pastas-usuario.cjs");

const pastas = [];
afterEach(async () => {
  for (const p of pastas.splice(0)) await fs.rm(p, { recursive: true, force: true });
});

describe("Minhas pastas", () => {
  it("cada tipo de arquivo tem a sua pasta dentro da pasta principal", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "pastas ção "));
    pastas.push(base);
    const raiz = path.join(base, "Programa Ferramentas 3D");
    const p = criarPastasUsuario(raiz);
    expect(p.caminho("orcamentos")).toBe(path.join(raiz, "Orçamentos"));
    expect(p.caminho("modelos")).toBe(path.join(raiz, "Modelos 3D"));
    expect(p.caminho("raiz")).toBe(raiz);
    expect(() => p.caminho("../fora")).toThrow();
    // garantir cria só a pasta pedida; garantirTodas cria todas
    expect(await p.garantir("backups")).toBe(path.join(raiz, "Backups"));
    expect(await fs.readdir(raiz)).toEqual(["Backups"]);
    await p.garantirTodas();
    expect((await fs.readdir(raiz)).sort()).toEqual(Object.values(PASTAS).map(([n]) => n).sort());
    expect(p.listar().map((x) => x.tipo)).toEqual(["orcamentos", "etiquetas", "modelos", "backups", "produtos"]);
  });
});
