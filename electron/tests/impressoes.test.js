import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import modelo from "../src/core/impressao.cjs";
import servicoMod from "../src/main/impressoes.cjs";
import backupCore from "../src/core/backup.cjs";

let pasta;
beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), "impressoes-"));
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const existe = (c) => access(c).then(() => true, () => false);
const bytes = (texto) => new TextEncoder().encode(texto);

describe("modelo de impressão", () => {
  it("nome vem do arquivo e tempo vira minutos", () => {
    expect(modelo.nomeDoArquivo("suporte_celular_v2.3mf")).toBe("suporte celular v2");
    expect(modelo.nomeDoArquivo("Vaso.gcode.3mf")).toBe("Vaso");
    expect(modelo.extensaoDe("A.STL")).toBe("stl");
    expect(modelo.extensaoDe("a.gcode")).toBe("");
    expect(modelo.tempoDeTexto("2", "10")).toBe("130");
    expect(modelo.tempoDeTexto("", "")).toBe("");
    expect(() => modelo.tempoDeTexto("1", "75")).toThrow(/Minutos/);
    expect(modelo.tempoTexto("130")).toBe("2h10");
    expect(modelo.tempoTexto("45")).toBe("45 min");
    expect(modelo.tempoTexto("120")).toBe("2h");
  });
});

describe("serviço de Minhas Impressões", () => {
  it("adiciona, recusa repetido, edita, marca impressa e exclui sem apagar o arquivo", async () => {
    const s = servicoMod.criarServicoImpressoes(pasta);
    const i = await s.adicionar({ bytes: bytes("solid a\nendsolid a\n"), nome: "Chaveiro_gato.stl", pesoG: "12.5", tempoMin: "75" });
    expect(i.nome).toBe("Chaveiro gato");
    expect(i.pesoG).toBe("12.5");
    expect(i.tempoMin).toBe("75");
    expect(await existe(join(pasta, "impressoes", `${i.id}.stl`))).toBe(true);

    await expect(s.adicionar({ bytes: bytes("solid a\nendsolid a\n"), nome: "outro nome.stl" })).rejects.toThrow(/já está em Minhas Impressões como "Chaveiro gato"/);
    await expect(s.adicionar({ bytes: bytes("x"), nome: "a.gcode" })).rejects.toThrow(/use arquivos/);
    // o repetido não deixou arquivo sobrando
    expect((await s.listar()).length).toBe(1);

    const editada = await s.salvar({ nome: "Gato", categoria: "Chaveiros", pesoG: "13", tempoH: "1", tempoM: "20", material: "PLA", cor: "Preto", camadaMm: "0,2", preenchimentoPct: "15", suporte: "nao", perfil: "0.20mm Standard", observacoes: "deitado" }, i.id);
    expect(editada).toMatchObject({ nome: "Gato", tempoMin: "80", camadaMm: "0.2", suporte: "nao", arquivo: i.arquivo });

    const m1 = await s.marcarImpressa(i.id, "2026-11-10");
    const m2 = await s.marcarImpressa(i.id, "2026-11-11");
    expect([m1.vezesImpressa, m2.vezesImpressa, m2.ultimaImpressao]).toEqual([1, 2, "2026-11-11"]);

    const lido = await s.lerArquivo(i.id);
    expect(new TextDecoder().decode(lido.bytes)).toBe("solid a\nendsolid a\n");

    await s.excluir(i.id);
    expect(await s.listar()).toEqual([]);
    expect(await existe(join(pasta, "impressoes", "excluidos", `${i.id}.stl`))).toBe(true);
  });

  it("backup exportado leva os arquivos e restaurar devolve o que falta", async () => {
    const s = servicoMod.criarServicoImpressoes(pasta);
    const i = await s.adicionar({ bytes: bytes("conteudo 3mf"), nome: "peca.3mf" });
    const destino = join(pasta, "backup", "Backup-X (arquivos)");
    expect(await s.copiarArquivosPara(destino)).toBe(1);
    expect(await readFile(join(destino, `${i.id}.3mf`), "utf8")).toBe("conteudo 3mf");

    // Arquivo sumiu da pasta de dados: volta da pasta do backup.
    await rm(join(pasta, "impressoes", `${i.id}.3mf`));
    expect((await s.listar())[0].arquivoAusente).toBe(true);
    expect(await s.recuperarArquivos(destino)).toBe(1);
    expect((await s.listar())[0].arquivoAusente).toBe(false);

    // Excluído e depois restaurado de um backup antigo: volta da pasta "excluidos".
    const json = await readFile(join(pasta, "impressoes.json"), "utf8");
    await s.excluir(i.id);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(pasta, "impressoes.json"), json);
    expect(await s.recuperarArquivos(null)).toBe(1);
    expect(await existe(join(pasta, "impressoes", `${i.id}.3mf`))).toBe(true);

    expect(servicoMod.pastaArquivosDoBackup("C:\\b\\Backup-2026.json")).toBe("C:\\b\\Backup-2026 (arquivos)");
  });

  it("entra no backup e backup antigo não apaga as impressões", async () => {
    const s = servicoMod.criarServicoImpressoes(pasta);
    const i = await s.adicionar({ bytes: bytes("abc"), nome: "a.obj" });
    const texto = JSON.stringify(backupCore.montarBackup({ impressoes: await s.colecao.ler() }, { versaoApp: "0.46.0" }));
    const lido = backupCore.lerBackup(texto);
    expect(lido.dados.impressoes.map((x) => x.id)).toEqual([i.id]);
    const antigo = JSON.parse(texto);
    delete antigo.dados.impressoes;
    expect(backupCore.lerBackup(JSON.stringify(antigo)).ausentes).toContain("impressoes");
  });
});
