import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import motor from "../src/main/sincronizacao.cjs";
import pdfsMod from "../src/main/pdfs-nuvem.cjs";
import configMod from "../src/main/configuracoes.cjs";
import nuvemMod from "../src/main/nuvem.cjs";

const pastas = [];
afterEach(async () => {
  for (const p of pastas.splice(0)) await rm(p, { recursive: true, force: true });
});
async function temporaria() {
  const p = await mkdtemp(join(tmpdir(), "pdfs ção "));
  pastas.push(p);
  return p;
}

// Nuvem falsa: documentos (como no sincronizacao.test.js) + arquivos em bytes.
function nuvemFalsa() {
  const docs = new Map();
  const arquivos = new Map();
  let relogio = Date.parse("2026-11-21T00:00:00.000Z");
  return {
    arquivos,
    async gravar(uid, colecao, alteracoes) {
      relogio += 1000;
      const servidorEm = new Date(relogio).toISOString();
      for (const { id, item } of alteracoes) docs.set(`${uid}/${colecao}/${id}`, { item: item ? structuredClone(item) : null, servidorEm });
    },
    async mudancas(uid, colecao, desde) {
      const remotos = [];
      let ultimo = desde;
      for (const [chave, d] of docs) {
        const [u, c, id] = chave.split("/");
        if (u !== uid || c !== colecao || (desde && d.servidorEm <= desde)) continue;
        remotos.push({ id, item: d.item ? structuredClone(d.item) : null });
        if (!ultimo || d.servidorEm > ultimo) ultimo = d.servidorEm;
      }
      return { remotos, ultimo };
    },
    async gravarArquivo(uid, chave, bytes) {
      arquivos.set(`${uid}/${chave}`, Buffer.from(bytes));
    },
    async lerArquivo(uid, chave) {
      const b = arquivos.get(`${uid}/${chave}`);
      if (!b) throw new Error("não existe");
      return b;
    },
  };
}

async function pc(nuvem) {
  const raiz = await temporaria();
  const pasta = join(raiz, "dados");
  const minhas = join(raiz, "Programa Ferramentas 3D");
  const pastaDe = async (tipo) => {
    const p = join(minhas, { orcamentos: "Orçamentos", recibos: "Recibos", etiquetas: "Etiquetas" }[tipo]);
    await mkdir(p, { recursive: true });
    return p;
  };
  const pdfs = pdfsMod.criarPdfsNuvem({ pasta, pastaDe });
  const sinc = motor.criarSincronizacao({
    pasta,
    conta: { estado: async () => ({ uid: "pedro", email: "p@x.com" }) },
    nuvem,
    colecoes: {
      pdfs: {
        colecao: pdfs.colecao,
        validar: pdfs.validar,
        antesDeEnviar: (uid, itens) => pdfs.antesDeEnviar(nuvem, uid, itens),
        depoisDeReceber: (uid, itens) => pdfs.depoisDeReceber(nuvem, uid, itens),
      },
    },
    configuracoes: configMod.criarServicoConfiguracoes(pasta),
  });
  return { raiz, pasta, pastaDe, pdfs, sinc };
}

// Um "PDF" qualquer (bytes que não se repetem, para a compressão não esconder erro).
const pdfFalso = (texto) => Buffer.concat([Buffer.from(`%PDF-1.4 ${texto}\n`), Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7 + texto.length) % 256))]);

describe("PDFs na nuvem", () => {
  it("o PDF gerado no trabalho aparece em casa igualzinho, na pasta certa", async () => {
    const nuvem = nuvemFalsa();
    const trabalho = await pc(nuvem);
    const casa = await pc(nuvem);

    // No trabalho o usuário salvou o PDF numa pasta qualquer (janela Salvar como).
    const outraPasta = join(trabalho.raiz, "Área de trabalho");
    await mkdir(outraPasta);
    const bytes = pdfFalso("Orçamento 12");
    const caminho = join(outraPasta, "Orçamento 12 - Maria.pdf");
    await writeFile(caminho, bytes);
    await trabalho.pdfs.registrar("orcamentos", caminho, bytes);
    await trabalho.sinc.sincronizar();
    expect(nuvem.arquivos.size).toBe(1);
    expect([...nuvem.arquivos.values()][0].length).toBeLessThan(bytes.length); // subiu comprimido

    await casa.sinc.sincronizar();
    const pastaCasa = await casa.pastaDe("orcamentos");
    expect(await readdir(pastaCasa)).toEqual(["Orçamento 12 - Maria.pdf"]);
    expect(Buffer.compare(await readFile(join(pastaCasa, "Orçamento 12 - Maria.pdf")), bytes)).toBe(0);
  });

  it("PDF refeito (mesmo nome) substitui a cópia dos outros PCs", async () => {
    const nuvem = nuvemFalsa();
    const trabalho = await pc(nuvem);
    const casa = await pc(nuvem);
    const pastaT = await trabalho.pastaDe("recibos");
    const caminho = join(pastaT, "Recibo 3.pdf");
    await writeFile(caminho, pdfFalso("v1"));
    await trabalho.pdfs.registrar("recibos", caminho, pdfFalso("v1"));
    await trabalho.sinc.sincronizar();
    await casa.sinc.sincronizar();

    await writeFile(caminho, pdfFalso("versão 2"));
    await trabalho.pdfs.registrar("recibos", caminho, pdfFalso("versão 2"));
    await trabalho.sinc.sincronizar();
    await casa.sinc.sincronizar();
    const pastaC = await casa.pastaDe("recibos");
    expect(await readdir(pastaC)).toEqual(["Recibo 3.pdf"]);
    expect(Buffer.compare(await readFile(join(pastaC, "Recibo 3.pdf")), pdfFalso("versão 2"))).toBe(0);
  });

  it("não sobrescreve um arquivo do usuário com o mesmo nome", async () => {
    const nuvem = nuvemFalsa();
    const trabalho = await pc(nuvem);
    const casa = await pc(nuvem);
    const pastaC = await casa.pastaDe("etiquetas");
    await writeFile(join(pastaC, "Etiquetas.pdf"), "meu arquivo");

    const pastaT = await trabalho.pastaDe("etiquetas");
    await writeFile(join(pastaT, "Etiquetas.pdf"), pdfFalso("etq"));
    await trabalho.pdfs.registrar("etiquetas", join(pastaT, "Etiquetas.pdf"), pdfFalso("etq"));
    await trabalho.sinc.sincronizar();
    await casa.sinc.sincronizar();
    expect((await readdir(pastaC)).sort()).toEqual(["Etiquetas (2).pdf", "Etiquetas.pdf"]);
    expect(await readFile(join(pastaC, "Etiquetas.pdf"), "utf8")).toBe("meu arquivo");
  });

  it("PDFs que já estavam nas pastas entram na nuvem (só uma vez)", async () => {
    const nuvem = nuvemFalsa();
    const trabalho = await pc(nuvem);
    const casa = await pc(nuvem);
    const pastaT = await trabalho.pastaDe("orcamentos");
    await writeFile(join(pastaT, "Antigo 1.pdf"), pdfFalso("a1"));
    await writeFile(join(pastaT, "anotacao.txt"), "não é PDF");
    await writeFile(join(await trabalho.pastaDe("recibos"), "Recibo 1.pdf"), pdfFalso("r1"));
    expect(await trabalho.pdfs.registrarPastas()).toBe(2);
    expect(await trabalho.pdfs.registrarPastas()).toBe(0);
    await trabalho.sinc.sincronizar();
    await casa.sinc.sincronizar();
    expect(await readdir(await casa.pastaDe("orcamentos"))).toEqual(["Antigo 1.pdf"]);
    expect(await readdir(await casa.pastaDe("recibos"))).toEqual(["Recibo 1.pdf"]);
    // Em casa, os que desceram não são registrados de novo.
    expect(await casa.pdfs.registrarPastas()).toBe(0);
  });

  it("PDF apagado antes de subir fica de fora (e não quebra a sincronização)", async () => {
    const nuvem = nuvemFalsa();
    const trabalho = await pc(nuvem);
    const caminho = join(await trabalho.pastaDe("orcamentos"), "Sumiu.pdf");
    await writeFile(caminho, pdfFalso("x"));
    await trabalho.pdfs.registrar("orcamentos", caminho, pdfFalso("x"));
    await rm(caminho);
    await trabalho.sinc.sincronizar();
    expect(nuvem.arquivos.size).toBe(0);
  });

  it("valida o que vem da nuvem (nome com pasta não passa)", () => {
    const base = { tipo: "orcamentos", tamanho: 10, sha: "a".repeat(64), criadoEm: "2026-11-21T10:00:00.000Z", atualizadoEm: "2026-11-21T10:00:00.000Z" };
    const ok = { ...base, nome: "Orçamento 1.pdf", id: pdfsMod.idDe("orcamentos", "Orçamento 1.pdf") };
    expect(pdfsMod.validarPdf(ok)).toBe(true);
    const ruim = { ...base, nome: "..\\..\\Windows\\x.pdf", id: pdfsMod.idDe("orcamentos", "..\\..\\Windows\\x.pdf") };
    expect(() => pdfsMod.validarPdf(ruim)).toThrow();
    expect(() => pdfsMod.validarPdf({ ...ok, tipo: "modelos" })).toThrow();
  });
});

describe("nuvem.cjs: arquivos em bytes", () => {
  it("divide em partes de 900 KB e junta de volta", async () => {
    const guardado = new Map();
    const fetch = async (url, init) => {
      if (init.method === "GET") {
        const nome = decodeURIComponent(url.split("/documents/")[1]);
        const doc = guardado.get(nome);
        return { ok: Boolean(doc), status: doc ? 200 : 404, text: async () => JSON.stringify(doc ?? {}) };
      }
      for (const w of JSON.parse(init.body).writes) guardado.set(w.update.name.split("/documents/")[1], { fields: w.update.fields });
      return { ok: true, status: 200, text: async () => "{}" };
    };
    const nuvem = nuvemMod.criarNuvem({ projectId: "p", token: async () => "t", fetch });
    const bytes = Buffer.from(Array.from({ length: 2_000_000 }, (_, i) => i % 251));
    await nuvem.gravarArquivo("u", "pdf-1~abc", bytes);
    expect(guardado.get("usuarios/u/arquivos/pdf-1~abc").fields.partes.integerValue).toBe("3");
    expect(Buffer.compare(await nuvem.lerArquivo("u", "pdf-1~abc"), bytes)).toBe(0);
  });
});
