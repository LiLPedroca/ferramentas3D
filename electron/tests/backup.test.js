import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import backupCore from "../src/core/backup.cjs";
import backupMod from "../src/main/backup.cjs";
import produtosMod from "../src/main/produtos.cjs";
import clientesMod from "../src/main/clientes.cjs";
import orcamentosMod from "../src/main/orcamentos.cjs";
import configMod from "../src/main/configuracoes.cjs";

const { lerBackup, montarBackup } = backupCore;

function montarServicos(pasta) {
  const produtos = produtosMod.criarServicoProdutos(pasta);
  const clientes = clientesMod.criarServicoClientes(pasta);
  const orcamentos = orcamentosMod.criarServicoOrcamentos(pasta, { clientes });
  const configuracoes = configMod.criarServicoConfiguracoes(pasta);
  const backup = backupMod.criarServicoBackup(pasta, {
    colecoes: { produtos, clientes, orcamentos },
    configuracoes,
    versaoApp: "0.9.0",
  });
  return { produtos, clientes, orcamentos, configuracoes, backup };
}

describe("arquivo de backup", () => {
  it("recusa arquivos que não são backup", () => {
    expect(() => lerBackup("não é json")).toThrow(/não é um backup válido/);
    expect(() => lerBackup(JSON.stringify({ tipo: "outro", dados: {} }))).toThrow(/não é um backup do Programa/);
    expect(() =>
      lerBackup(JSON.stringify({ tipo: "programa-ferramentas-3d-backup", versao: 2, dados: {} })),
    ).toThrow(/versão mais nova/);
  });

  it("descarta itens inválidos e ids repetidos", () => {
    const cliente = {
      id: "11111111-2222-3333-4444-555555555555",
      nome: "Ana",
      telefone: "",
      email: "",
      documento: "",
      cidade: "",
      observacoes: "",
      criadoEm: "2026-11-04T10:00:00.000Z",
      atualizadoEm: "2026-11-04T10:00:00.000Z",
    };
    const texto = JSON.stringify(
      montarBackup({ clientes: [cliente, { ...cliente }, { id: "x" }] }, { versaoApp: "1", agora: "2026-11-04T10:00:00.000Z" }),
    );
    const lido = lerBackup(texto);
    expect(lido.resumo).toMatchObject({ clientes: 1, produtos: 0, orcamentos: 0 });
    expect(lido.descartados).toBe(2);
  });
});

describe("serviço de backup", () => {
  let pasta;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "backup-teste-"));
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it("exporta e restaura tudo, guardando antes uma cópia de segurança", async () => {
    const s = montarServicos(pasta);
    const cli = await s.clientes.salvar({ nome: "Maria" });
    await s.produtos.salvar({ nome: "Vaso", preco: "30" });
    await s.orcamentos.salvar({ clienteId: cli.id, itens: [{ descricao: "Vaso", quantidade: "1", preco: "30" }] });
    await s.configuracoes.salvar({ nome: "Pedro", empresa: { nome: "Estúdio" } });
    const texto = await s.backup.gerarTexto();

    // muda tudo depois do backup
    await s.clientes.salvar({ nome: "Outro cliente" });
    await s.configuracoes.salvar({ nome: "Mudou" });

    const lido = lerBackup(texto);
    const r = await s.backup.restaurar(lido);
    expect(r.seguranca).toMatch(/^antes-de-restaurar-/);
    expect((await s.clientes.listar()).map((c) => c.nome)).toEqual(["Maria"]);
    expect((await s.orcamentos.listar())[0].cliente.nome).toBe("Maria");
    expect((await s.configuracoes.ler()).nome).toBe("Pedro");

    // a cópia de segurança tem o estado de antes (com "Outro cliente")
    const seguranca = await s.backup.lerAutomatico(r.seguranca);
    expect(seguranca.resumo.clientes).toBe(2);
  });

  it("cópia diária: nada sem dados, uma por dia, mantém só as 10 mais recentes", async () => {
    const s = montarServicos(pasta);
    expect(await s.backup.copiaDiaria()).toBeNull();
    await s.clientes.salvar({ nome: "Ana" });
    expect(await s.backup.copiaDiaria()).not.toBeNull();
    expect(await s.backup.copiaDiaria()).toBeNull(); // já tem a de hoje

    const auto = join(pasta, "backups-automaticos");
    for (let i = 1; i <= 12; i++) await writeFile(join(auto, `diario-2020-01-${String(i).padStart(2, "0")}-0000.json`), "{}");
    await writeFile(join(auto, "antes-de-restaurar-2020-01-01-0000.json"), "{}");
    const original = Date.now;
    Date.now = () => original() + 2 * 24 * 60 * 60 * 1000; // dois dias depois
    try {
      await s.backup.copiaDiaria();
    } finally {
      Date.now = original;
    }
    const nomes = await readdir(auto);
    expect(nomes.filter((n) => n.startsWith("diario-"))).toHaveLength(10);
    expect(nomes).toContain("antes-de-restaurar-2020-01-01-0000.json");
  });

  it("resumo conta itens e lista arquivos", async () => {
    const s = montarServicos(pasta);
    await s.produtos.salvar({ nome: "Vaso", preco: "30" });
    const r = await s.backup.resumo();
    expect(r.contagem).toMatchObject({ produtos: 1, clientes: 0, orcamentos: 0 });
    expect(r.arquivos.find((a) => a.nome === "produtos").tamanho).toBeGreaterThan(0);
  });
});
