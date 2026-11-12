// Backup em um .zip só: dados + arquivos de Minhas Impressões, gravado e lido em partes.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { gravarZip, lerZip, nomeSeguro } = require("../src/main/backup-zip.cjs");
const { unzipSync, zipSync } = require("fflate");

const pastas = [];
const temporaria = () => {
  const p = mkdtempSync(path.join(os.tmpdir(), "bkzip Ação "));
  pastas.push(p);
  return p;
};
afterEach(() => pastas.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));

describe("backup .zip", () => {
  it("grava dados e arquivos com nome legível e lê de volta", async () => {
    const pasta = temporaria();
    const stl = new Uint8Array(3_000_000).map((_, i) => i % 251);
    const tresmf = new Uint8Array(1234).fill(7);
    writeFileSync(path.join(pasta, "a.stl"), stl);
    writeFileSync(path.join(pasta, "b.3mf"), tresmf);
    const destino = path.join(pasta, "Backup teste.zip");
    const texto = JSON.stringify({ tipo: "teste", acento: "ção" });
    await gravarZip(destino, texto, [
      { id: "id-aaaa-0001", nome: "Chaveiro: Delorean?", extensao: "stl", caminho: path.join(pasta, "a.stl") },
      { id: "id-bbbb-0002", nome: "Vaso", extensao: "3mf", caminho: path.join(pasta, "b.3mf") },
    ]);
    expect(existsSync(`${destino}.tmp`)).toBe(false);
    const nomes = Object.keys(unzipSync(readFileSync(destino)));
    expect(nomes).toEqual(["dados.json", "impressoes/Chaveiro Delorean [id-aaaa-0001].stl", "impressoes/Vaso [id-bbbb-0002].3mf"]);

    const saida = path.join(pasta, "extraido");
    expect(await lerZip(destino, saida)).toBe(texto);
    expect(readdirSync(saida).sort()).toEqual(["id-aaaa-0001.stl", "id-bbbb-0002.3mf"]);
    expect(new Uint8Array(readFileSync(path.join(saida, "id-aaaa-0001.stl")))).toEqual(stl);
    expect(new Uint8Array(readFileSync(path.join(saida, "id-bbbb-0002.3mf")))).toEqual(tresmf);
  });

  it("ignora entradas estranhas (sem escrever fora da pasta)", async () => {
    const pasta = temporaria();
    const zip = zipSync({
      "dados.json": new TextEncoder().encode("{}"),
      "../fora [id-cccc-0003].stl": new Uint8Array([1]),
      "impressoes/../../x [id-dddd-0004].stl": new Uint8Array([1]),
      "impressoes/ok [id-eeee-0005].exe": new Uint8Array([1]),
    });
    writeFileSync(path.join(pasta, "b.zip"), zip);
    const saida = path.join(pasta, "saida");
    expect(await lerZip(path.join(pasta, "b.zip"), saida)).toBe("{}");
    expect(readdirSync(saida)).toEqual([]);
    expect(readdirSync(pasta).sort()).toEqual(["b.zip", "saida"]);
  });

  it("recusa .zip que não é backup e .zip danificado com mensagem em português", async () => {
    const pasta = temporaria();
    writeFileSync(path.join(pasta, "outro.zip"), zipSync({ "foto.png": new Uint8Array([1, 2]) }));
    await expect(lerZip(path.join(pasta, "outro.zip"), path.join(pasta, "s1"))).rejects.toThrow(/não é um backup/);
    writeFileSync(path.join(pasta, "ruim.zip"), new Uint8Array([80, 75, 3, 4, 9, 9, 9]));
    await expect(lerZip(path.join(pasta, "ruim.zip"), path.join(pasta, "s2"))).rejects.toThrow(/danificado|não é um backup/);
  });

  it("nome seguro para o Windows", () => {
    expect(nomeSeguro(String.raw`a<b>c:"d/e\f|g?h*i[j]`)).toBe("a b c d e f g h i j");
    expect(nomeSeguro("  ...  ")).toBe("Impressão");
    expect(nomeSeguro("Peça.")).toBe("Peça");
  });
});
