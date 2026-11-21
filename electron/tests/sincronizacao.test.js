import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import core from "../src/core/sincronizacao.cjs";
import motor from "../src/main/sincronizacao.cjs";
import nuvemMod from "../src/main/nuvem.cjs";
import contaMod from "../src/main/conta.cjs";
import clientesMod from "../src/main/clientes.cjs";
import projetosMod from "../src/main/projetos.cjs";
import configMod from "../src/main/configuracoes.cjs";
import clienteCore from "../src/core/cliente.cjs";
import projetoCore from "../src/core/projeto.cjs";

const { mesclar, resumo } = core;
const validarSimples = (i) => {
  if (!i || typeof i.id !== "string") throw new Error("inválido");
};
const item = (id, nome, atualizadoEm = "2026-11-21T10:00:00.000Z") => ({ id, nome, atualizadoEm });

describe("mesclar", () => {
  it("sobe o que é novo aqui e desce o que é novo lá", () => {
    const a = item("a", "Aqui");
    const b = item("b", "Lá");
    const m = mesclar({ locais: [a], remotos: [{ id: "b", item: b }], base: {}, validar: validarSimples });
    expect(m.itens.map((i) => i.id)).toEqual(["a", "b"]);
    expect(m.mudouLocal).toBe(true);
    expect(m.enviar.map((i) => i.id)).toEqual(["a"]);
    expect(m.excluir).toEqual([]);
  });

  it("edição só na nuvem substitui a local", () => {
    const antigo = item("a", "Antigo");
    const novo = item("a", "Novo", "2026-11-21T11:00:00.000Z");
    const m = mesclar({ locais: [antigo], remotos: [{ id: "a", item: novo }], base: { a: resumo(antigo) }, validar: validarSimples });
    expect(m.itens[0].nome).toBe("Novo");
    expect(m.enviar).toEqual([]);
  });

  it("editado nos dois: fica o mais recente", () => {
    const base = item("a", "Base");
    const aqui = item("a", "Aqui", "2026-11-21T12:00:00.000Z");
    const la = item("a", "Lá", "2026-11-21T11:00:00.000Z");
    const m = mesclar({ locais: [aqui], remotos: [{ id: "a", item: la }], base: { a: resumo(base) }, validar: validarSimples });
    expect(m.itens[0].nome).toBe("Aqui");
    expect(m.enviar.map((i) => i.nome)).toEqual(["Aqui"]);
  });

  it("primeiro contato sem data (configurações): vale a nuvem", () => {
    const m = mesclar({ locais: [{ id: "nome", valor: "" }], remotos: [{ id: "nome", item: { id: "nome", valor: "Pedro" } }], base: {}, validar: validarSimples });
    expect(m.itens[0].valor).toBe("Pedro");
    expect(m.enviar).toEqual([]);
  });

  it("excluído lá e editado aqui: a edição fica e sobe de novo", () => {
    const base = item("a", "Base");
    const aqui = item("a", "Aqui", "2026-11-21T12:00:00.000Z");
    const m = mesclar({ locais: [aqui], remotos: [{ id: "a", item: null }], base: { a: resumo(base) }, validar: validarSimples });
    expect(m.itens).toHaveLength(1);
    expect(m.enviar.map((i) => i.id)).toEqual(["a"]);
  });

  it("excluído lá e sem mudança aqui: some daqui", () => {
    const a = item("a", "A");
    const m = mesclar({ locais: [a], remotos: [{ id: "a", item: null }], base: { a: resumo(a) }, validar: validarSimples });
    expect(m.itens).toEqual([]);
    expect(m.base).toEqual({});
    expect(m.excluir).toEqual([]);
  });

  it("releitura da mesma versão da nuvem não desfaz uma exclusão feita aqui", () => {
    const a = item("a", "A");
    const m = mesclar({ locais: [], remotos: [{ id: "a", item: a }], base: { a: resumo(a) }, validar: validarSimples });
    expect(m.itens).toEqual([]);
    expect(m.excluir).toEqual(["a"]);
  });

  it("excluído aqui sobe como exclusão", () => {
    const a = item("a", "A");
    const m = mesclar({ locais: [], remotos: [], base: { a: resumo(a) }, validar: validarSimples });
    expect(m.excluir).toEqual(["a"]);
  });

  it("ignora item inválido vindo da nuvem", () => {
    const a = item("a", "A");
    const m = mesclar({ locais: [a], remotos: [{ id: "a", item: { quebrado: true } }], base: { a: resumo(a) }, validar: validarSimples });
    expect(m.itens).toEqual([a]);
    expect(m.mudouLocal).toBe(false);
  });
});

// Nuvem falsa em memória, com o mesmo contrato do nuvem.cjs.
function nuvemFalsa() {
  const docs = new Map(); // `${uid}/${colecao}/${id}` -> { item, servidorEm }
  let relogio = Date.parse("2026-11-21T00:00:00.000Z");
  let leituras = 0;
  return {
    docs,
    get leituras() {
      return leituras;
    },
    async gravar(uid, colecao, alteracoes) {
      relogio += 1000;
      const servidorEm = new Date(relogio).toISOString();
      for (const { id, item: i } of alteracoes) docs.set(`${uid}/${colecao}/${id}`, { item: i ? structuredClone(i) : null, servidorEm });
    },
    async mudancas(uid, colecao, desde) {
      const remotos = [];
      let ultimo = desde;
      for (const [chave, d] of docs) {
        const [u, c, id] = chave.split("/");
        if (u !== uid || c !== colecao || (desde && d.servidorEm <= desde)) continue;
        leituras++;
        remotos.push({ id, item: d.item ? structuredClone(d.item) : null });
        if (!ultimo || d.servidorEm > ultimo) ultimo = d.servidorEm;
      }
      return { remotos, ultimo };
    },
  };
}

const pastas = [];
afterEach(async () => {
  for (const p of pastas.splice(0)) await rm(p, { recursive: true, force: true });
});

async function pc(nuvem, uid = "pedro") {
  const pasta = await mkdtemp(join(tmpdir(), "sinc-"));
  pastas.push(pasta);
  const clientes = clientesMod.criarServicoClientes(pasta);
  const projetos = projetosMod.criarServicoProjetos(pasta);
  const configuracoes = configMod.criarServicoConfiguracoes(pasta);
  const avisos = [];
  const sinc = motor.criarSincronizacao({
    pasta,
    conta: { estado: async () => ({ uid, email: "pedro@exemplo.com" }) },
    nuvem,
    colecoes: {
      clientes: { colecao: clientes.colecao, validar: clienteCore.validarCliente },
      projetos: { colecao: projetos.colecao, validar: projetoCore.validarProjeto },
    },
    configuracoes,
    aoMudar: (a) => avisos.push(a),
  });
  return { pasta, clientes, projetos, configuracoes, sinc, avisos };
}

describe("sincronização entre dois PCs", () => {
  it("o que salvo no trabalho aparece em casa, e volta", async () => {
    const nuvem = nuvemFalsa();
    const trabalho = await pc(nuvem);
    const casa = await pc(nuvem);

    const maria = await trabalho.clientes.salvar({ nome: "Maria" });
    await trabalho.configuracoes.salvar({ nome: "Pedro" });
    await trabalho.sinc.sincronizar();

    await casa.sinc.sincronizar();
    expect((await casa.clientes.listar()).map((c) => c.nome)).toEqual(["Maria"]);
    expect((await casa.configuracoes.ler()).nome).toBe("Pedro");
    expect(casa.avisos.at(-1).nomes).toEqual(["clientes", "configuracoes"]);

    await casa.clientes.salvar({ nome: "Maria Souza" }, maria.id);
    await casa.clientes.salvar({ nome: "João" });
    await casa.sinc.sincronizar();
    await trabalho.sinc.sincronizar();
    expect((await trabalho.clientes.listar()).map((c) => c.nome).sort()).toEqual(["João", "Maria Souza"]);

    await trabalho.clientes.excluir(maria.id);
    await trabalho.sinc.sincronizar();
    await casa.sinc.sincronizar();
    expect((await casa.clientes.listar()).map((c) => c.nome)).toEqual(["João"]);
    expect(casa.avisos.at(-1).estado.erro).toBe("");
  });

  it("sincronizar sem mudanças não sobe nada de novo", async () => {
    const nuvem = nuvemFalsa();
    const a = await pc(nuvem);
    await a.clientes.salvar({ nome: "Ana" });
    await a.sinc.sincronizar();
    const antes = nuvem.docs.size;
    const gravacoes = [];
    const gravarOriginal = nuvem.gravar;
    nuvem.gravar = async (...args) => {
      gravacoes.push(args);
      return gravarOriginal(...args);
    };
    await a.sinc.sincronizar();
    expect(gravacoes).toEqual([]);
    expect(nuvem.docs.size).toBe(antes);
  });

  it("dados de outra conta não se misturam", async () => {
    const nuvem = nuvemFalsa();
    const pedro = await pc(nuvem, "pedro");
    const amigo = await pc(nuvem, "amigo");
    await pedro.clientes.salvar({ nome: "Cliente do Pedro" });
    await pedro.sinc.sincronizar();
    await amigo.sinc.sincronizar();
    expect(await amigo.clientes.listar()).toEqual([]);
  });

  it("não guarda o fatiador nem as novidades vistas deste PC na nuvem", async () => {
    const nuvem = nuvemFalsa();
    const a = await pc(nuvem);
    await a.configuracoes.salvar({ novidadesVistas: ["x"] });
    await a.sinc.sincronizar();
    const chaves = [...nuvem.docs.keys()].filter((k) => k.startsWith("pedro/configuracoes/")).map((k) => k.split("/")[2]);
    expect(chaves).not.toContain("novidadesVistas");
    expect(chaves).not.toContain("fatiador");
    expect(chaves).toContain("nome");
  });

  it("guarda o estado em sincronizacao.json", async () => {
    const nuvem = nuvemFalsa();
    const a = await pc(nuvem);
    await a.clientes.salvar({ nome: "Ana" });
    await a.sinc.sincronizar();
    const estado = JSON.parse(await readFile(join(a.pasta, "sincronizacao.json"), "utf8"));
    expect(estado.uid).toBe("pedro");
    expect(Object.keys(estado.colecoes.clientes.base)).toHaveLength(1);
    expect((await a.sinc.situacao()).ultima).not.toBe("");
  });

  it("sem internet: avisa e não perde nada", async () => {
    const nuvem = nuvemFalsa();
    nuvem.mudancas = async () => {
      throw new TypeError("fetch failed");
    };
    const a = await pc(nuvem);
    await a.clientes.salvar({ nome: "Ana" });
    await a.sinc.sincronizar();
    expect(a.avisos.at(-1).estado.erro).toMatch(/Sem internet/);
    expect((await a.clientes.listar()).map((c) => c.nome)).toEqual(["Ana"]);
  });
});

describe("nuvem.cjs (REST)", () => {
  function fetchFalso() {
    const chamadas = [];
    const fetch = async (url, init) => {
      chamadas.push({ url, init, corpo: init.body ? JSON.parse(init.body) : undefined });
      return { ok: true, status: 200, text: async () => "{}" };
    };
    return { chamadas, fetch };
  }

  it("item grande vai em partes, na mesma gravação", async () => {
    const { chamadas, fetch } = fetchFalso();
    const nuvem = nuvemMod.criarNuvem({ projectId: "p", token: async () => "t", fetch });
    const grande = { id: "x1", atualizadoEm: "2026", imagem: "a".repeat(core.TAMANHO_PARTE * 2 + 10) };
    await nuvem.gravar("u", "projetos", [{ id: "x1", item: grande }]);
    expect(chamadas).toHaveLength(1);
    const escritas = chamadas[0].corpo.writes;
    expect(escritas).toHaveLength(4); // 3 partes + o documento principal
    expect(escritas.at(-1).update.fields.partes.integerValue).toBe("3");
    expect(escritas.at(-1).update.name).toBe("projects/p/databases/(default)/documents/usuarios/u/projetos/x1");
    expect(escritas.at(-1).updateTransforms[0].fieldPath).toBe("servidorEm");
    expect(chamadas[0].init.headers.Authorization).toBe("Bearer t");
  });

  it("lê mudanças, exclusões e partes", async () => {
    const texto = JSON.stringify({ id: "b", nome: "Grande" });
    const fetch = async (url) => {
      if (url.endsWith(":runQuery")) {
        const linhas = [
          { document: { name: ".../clientes/a", fields: { json: { stringValue: JSON.stringify({ id: "a" }) }, servidorEm: { timestampValue: "2026-11-21T10:00:00Z" } } } },
          { document: { name: ".../clientes/b", fields: { partes: { integerValue: "2" }, servidorEm: { timestampValue: "2026-11-21T10:00:02Z" } } } },
          { document: { name: ".../clientes/c", fields: { excluido: { booleanValue: true }, servidorEm: { timestampValue: "2026-11-21T10:00:01Z" } } } },
          { readTime: "x" },
        ];
        return { ok: true, status: 200, text: async () => JSON.stringify(linhas) };
      }
      const n = Number(url.split("~").pop());
      const pedaco = n === 0 ? texto.slice(0, 10) : texto.slice(10);
      return { ok: true, status: 200, text: async () => JSON.stringify({ fields: { json: { stringValue: pedaco } } }) };
    };
    const nuvem = nuvemMod.criarNuvem({ projectId: "p", token: async () => "t", fetch });
    const { remotos, ultimo } = await nuvem.mudancas("u", "clientes", "");
    expect(remotos).toEqual([
      { id: "a", item: { id: "a" } },
      { id: "b", item: { id: "b", nome: "Grande" } },
      { id: "c", item: null },
    ]);
    expect(ultimo).toBe("2026-11-21T10:00:02Z");
  });

  it("erro da nuvem vira ErroNuvem com o status", async () => {
    const fetch = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error: { message: "Missing or insufficient permissions." } }) });
    const nuvem = nuvemMod.criarNuvem({ projectId: "p", token: async () => "t", fetch });
    await expect(nuvem.mudancas("u", "clientes", "")).rejects.toMatchObject({ status: 403 });
  });
});

describe("conta.cjs", () => {
  it("mensagens do Firebase em português", () => {
    expect(contaMod.mensagemDe("EMAIL_EXISTS")).toMatch(/Já existe uma conta/);
    expect(contaMod.mensagemDe("WEAK_PASSWORD : Password should be at least 6 characters")).toMatch(/6 caracteres/);
    expect(contaMod.mensagemDe("INVALID_LOGIN_CREDENTIALS")).toBe("E-mail ou senha incorretos.");
    expect(contaMod.mensagemDe("QUALQUER")).toMatch(/internet/);
  });

  it("entra, guarda a sessão cifrada e renova o token", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "conta-"));
    pastas.push(pasta);
    const urls = [];
    const fetch = async (url) => {
      urls.push(url);
      if (url.includes("signInWithPassword")) {
        return { ok: true, json: async () => ({ localId: "u1", email: "a@b.com", idToken: "id1", refreshToken: "r1", expiresIn: "1" }) };
      }
      return { ok: true, json: async () => ({ id_token: "id2", refresh_token: "r1", expires_in: "3600" }) };
    };
    const opcoes = { pasta, apiKey: "k", cifrar: (t) => `cifrado:${t}`, decifrar: (t) => t.replace("cifrado:", ""), fetch };
    const conta = contaMod.criarConta(opcoes);
    expect(await conta.entrar("a@b.com", "123456")).toEqual({ uid: "u1", email: "a@b.com" });
    const salvo = JSON.parse(await readFile(join(pasta, "conta.json"), "utf8"));
    expect(salvo.refresh).toBe("cifrado:r1");
    expect(JSON.stringify(salvo)).not.toContain("123456");

    // Nova abertura do programa: lê a sessão e renova o token (o anterior expira em 1 s).
    const reaberta = contaMod.criarConta(opcoes);
    expect(await reaberta.estado()).toEqual({ uid: "u1", email: "a@b.com" });
    expect(await reaberta.token()).toBe("id2");
    expect(urls.at(-1)).toContain("securetoken.googleapis.com");

    await reaberta.sair();
    expect(await contaMod.criarConta(opcoes).estado()).toBeNull();
  });

  it("valida e-mail e senha antes de chamar a internet", async () => {
    const conta = contaMod.criarConta({ pasta: tmpdir(), apiKey: "k", cifrar: String, decifrar: String, fetch: async () => { throw new Error("não devia chamar"); } });
    await expect(conta.entrar("sem-arroba", "x")).rejects.toThrow("Digite um e-mail válido.");
    await expect(conta.criar("a@b.com", "123")).rejects.toThrow(/6 caracteres/);
    expect(conta.googleDisponivel()).toBe(false);
  });
});
