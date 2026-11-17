import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { criarPdfsOrcamentos, gravarPdf } = require("../src/main/pdfs-orcamentos.cjs");

const pastas = [];
async function pastaTemp() {
  const p = await fs.mkdtemp(path.join(os.tmpdir(), "pdfs orç "));
  pastas.push(p);
  return p;
}
afterEach(async () => {
  for (const p of pastas.splice(0)) await fs.rm(p, { recursive: true, force: true });
});

describe("PDF do orçamento editado", () => {
  it("lembra onde o PDF foi salvo e devolve o mesmo caminho enquanto o arquivo existe", async () => {
    const pasta = await pastaTemp();
    const pdfs = criarPdfsOrcamentos(pasta);
    expect(await pdfs.caminhoExistente("o1")).toBeNull();
    const arquivo = path.join(pasta, "Orçamento - Ana - 17-11-2026.pdf");
    await gravarPdf(arquivo, Buffer.from("v1"));
    await pdfs.lembrar("o1", arquivo);
    expect(await pdfs.caminhoExistente("o1")).toBe(arquivo);
    // de novo no mesmo arquivo: o conteúdo é trocado
    await gravarPdf(arquivo, Buffer.from("v2"));
    expect(await fs.readFile(arquivo, "utf8")).toBe("v2");
    // outro serviço na mesma pasta (programa reaberto) também lembra
    expect(await criarPdfsOrcamentos(pasta).caminhoExistente("o1")).toBe(arquivo);
  });

  it("se o PDF foi apagado ou movido, pergunta outra vez (sem caminho lembrado)", async () => {
    const pasta = await pastaTemp();
    const pdfs = criarPdfsOrcamentos(pasta);
    const arquivo = path.join(pasta, "x.pdf");
    await pdfs.lembrar("o1", arquivo);
    expect(await pdfs.caminhoExistente("o1")).toBeNull();
    await pdfs.lembrar("o2", "relativo.pdf");
    expect(await pdfs.caminhoExistente("o2")).toBeNull();
  });
});
