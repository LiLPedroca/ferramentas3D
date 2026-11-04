import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fatiadorMod from "../src/main/fatiador.cjs";

const { abrirFatiador, detectarFatiadores } = fatiadorMod;

describe("Meu fatiador", () => {
  let base;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "fatiador-teste-"));
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const criar = async (...partes) => {
    await mkdir(join(base, ...partes.slice(0, -1)), { recursive: true });
    await writeFile(join(base, ...partes), "x");
  };

  it("encontra fatiadores em pastas fixas e com versão no nome (pega a mais nova)", async () => {
    await criar("Bambu Studio", "bambu-studio.exe");
    await criar("UltiMaker Cura 5.7.0", "UltiMaker-Cura.exe");
    await criar("UltiMaker Cura 5.8.1", "UltiMaker-Cura.exe");
    await criar("OrcaSlicer", "leia-me.txt"); // pasta sem o programa: não conta
    const achados = await detectarFatiadores([base]);
    expect(achados.map((a) => a.nome)).toEqual(["Bambu Studio", "UltiMaker Cura 5.8.1"]);
  });

  it("abre com o arquivo do modelo como argumento", async () => {
    await criar("OrcaSlicer", "orca-slicer.exe");
    const chamadas = [];
    const iniciar = (exe, args, opcoes) => {
      chamadas.push({ exe, args, opcoes });
      return { unref() {} };
    };
    await abrirFatiador(join(base, "OrcaSlicer", "orca-slicer.exe"), "C:\\temp\\chaveiro.3mf", { iniciar });
    expect(chamadas[0].args).toEqual(["C:\\temp\\chaveiro.3mf"]);
    expect(chamadas[0].opcoes.detached).toBe(true);
  });

  it("recusa caminhos que não são programas ou não existem", async () => {
    await expect(abrirFatiador("", null)).rejects.toThrow(/Configurações/);
    await expect(abrirFatiador("relativo.exe", null)).rejects.toThrow(/Configurações/);
    await expect(abrirFatiador(join(base, "nao-existe.exe"), null)).rejects.toThrow(/não foi encontrado/);
    await expect(abrirFatiador(join(base, "arquivo.txt"), null)).rejects.toThrow(/Configurações/);
  });
});
