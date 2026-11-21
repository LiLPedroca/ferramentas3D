import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import drive from "../src/main/google-drive.cjs";

const pastas = [];
afterEach(async () => {
  for (const p of pastas.splice(0)) await rm(p, { recursive: true, force: true });
});
async function temporaria() {
  const p = await mkdtemp(join(tmpdir(), "drive ção "));
  pastas.push(p);
  return p;
}

describe("Google Drive para computador", () => {
  it("acha o Meu Drive entre os lugares possíveis", async () => {
    const base = await temporaria();
    const meu = join(base, "Meu Drive");
    await mkdir(meu);
    expect(await drive.acharMeuDrive({ lista: [join(base, "nada"), meu], letras: "" })).toBe(meu);
    expect(await drive.acharMeuDrive({ lista: [join(base, "nada")], letras: "" })).toBe("");
  });

  it("acha pelo nome do volume \"Google Drive\" quando a pasta tem nome desconhecido", async () => {
    const base = await temporaria();
    const raizG = join(base, "G");
    await mkdir(join(raizG, "Unidade X"), { recursive: true });
    await mkdir(join(raizG, "Drives partilhados"));
    await mkdir(join(raizG, ".shortcut-targets-by-id"));
    const raizH = join(base, "H");
    await mkdir(join(raizH, "Coisas"), { recursive: true });
    const opcoes = { lista: [], letras: "HG", raizDe: (l) => join(base, l), rotulo: async (l) => (l === "G" ? " O volume na unidade G é Google Drive" : " Volume in drive H is Dados") };
    expect(await drive.acharMeuDrive(opcoes)).toBe(join(raizG, "Unidade X"));
    expect(await drive.acharMeuDrive({ ...opcoes, letras: "H" })).toBe("");
  });

  it("procura nas letras e na pasta do usuário", () => {
    const lista = drive.candidatos({ letras: "G", pessoal: "C:\\Users\\Pedro Henrique" });
    expect(lista).toContain("G:\\Meu Drive");
    expect(lista).toContain("G:\\My Drive");
    expect(lista).toContain(join("C:\\Users\\Pedro Henrique", "Google Drive", "Meu Drive"));
  });

  it("sabe se a pasta está dentro do Meu Drive", () => {
    expect(drive.dentroDe("G:\\Meu Drive\\Programa Ferramentas 3D\\Modelos 3D", "G:\\Meu Drive")).toBe(true);
    expect(drive.dentroDe("g:\\meu drive", "G:\\Meu Drive")).toBe(true);
    expect(drive.dentroDe("C:\\Users\\Pedro\\Documents\\Modelos 3D", "G:\\Meu Drive")).toBe(false);
    expect(drive.dentroDe("G:\\Meu Drive 2", "G:\\Meu Drive")).toBe(false);
    expect(drive.dentroDe("", "G:\\Meu Drive")).toBe(false);
  });

  it("destino fica em Programa Ferramentas 3D\\Modelos 3D", () => {
    expect(drive.destinoNoDrive("G:\\Meu Drive")).toBe(join("G:\\Meu Drive", "Programa Ferramentas 3D", "Modelos 3D"));
  });

  it("copia os modelos sem apagar a origem nem sobrescrever o que já está no Drive", async () => {
    const base = await temporaria();
    const origem = join(base, "Modelos 3D");
    const destino = join(base, "Meu Drive", "Programa Ferramentas 3D", "Modelos 3D");
    await mkdir(join(origem, "Copos"), { recursive: true });
    await writeFile(join(origem, "chaveiro Ana.stl"), "ana");
    await writeFile(join(origem, "Copos", "copo.3mf"), "copo");
    await mkdir(destino, { recursive: true });
    await writeFile(join(destino, "chaveiro Ana.stl"), "versão do outro PC");

    expect(await drive.copiarModelos(origem, destino)).toBe(1);
    expect(await readFile(join(destino, "Copos", "copo.3mf"), "utf8")).toBe("copo");
    expect(await readFile(join(destino, "chaveiro Ana.stl"), "utf8")).toBe("versão do outro PC");
    expect((await readdir(origem)).sort()).toEqual(["Copos", "chaveiro Ana.stl"]);
    // de novo: nada a copiar
    expect(await drive.copiarModelos(origem, destino)).toBe(0);
  });

  it("origem inexistente ou igual ao destino: só cria a pasta", async () => {
    const base = await temporaria();
    const destino = join(base, "Drive", "Modelos 3D");
    expect(await drive.copiarModelos(join(base, "não existe"), destino)).toBe(0);
    expect(await readdir(destino)).toEqual([]);
    expect(await drive.copiarModelos(destino, destino)).toBe(0);
  });
});
