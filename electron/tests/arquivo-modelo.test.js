import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gravarSemSobrescrever, nomeLimpo } from "../src/main/arquivo-modelo.cjs";

describe("gravar modelos na pasta", () => {
  it("mantém acentos e tira o que o Windows não aceita", () => {
    expect(nomeLimpo("João: copo/1? - Criae3D")).toBe("João copo 1 - Criae3D");
    expect(nomeLimpo("  ...  ")).toBe("Modelo");
    expect(nomeLimpo("CON")).toBe("Modelo");
  });

  it("nunca sobrescreve: numera o próximo", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "modelos com espaço é "));
    writeFileSync(join(pasta, "Maria - Criae3D.3mf"), "antigo");
    const a = await gravarSemSobrescrever(pasta, "Maria - Criae3D", "3mf", new Uint8Array([1]));
    const b = await gravarSemSobrescrever(pasta, "Maria - Criae3D", "3mf", new Uint8Array([2]));
    expect(a).toBe(join(pasta, "Maria - Criae3D (2).3mf"));
    expect(b).toBe(join(pasta, "Maria - Criae3D (3).3mf"));
    expect(readFileSync(join(pasta, "Maria - Criae3D.3mf"), "utf8")).toBe("antigo");
    expect(readdirSync(pasta)).toHaveLength(3);
  });
});
