// Firestore pela API REST (sem SDK): gravar itens, buscar o que mudou e ler partes de itens grandes.
// Tudo fica em usuarios/<uid>/<colecao>/<id>. Itens grandes: usuarios/<uid>/partes/<colecao>~<id>~<n>.
"use strict";

const { dividir } = require("../core/sincronizacao.cjs");

const LIMITE_COMMIT = 8_000_000; // bytes por gravação (o Firestore aceita até ~10 MB)
const LIMITE_ESCRITAS = 400; // por gravação (o Firestore aceita até 500)

class ErroNuvem extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

function criarNuvem({ projectId, token, fetch = globalThis.fetch }) {
  const raiz = `projects/${projectId}/databases/(default)/documents`;
  const url = `https://firestore.googleapis.com/v1/${raiz}`;

  async function chamar(caminho, corpo, metodo = "POST") {
    const resposta = await fetch(`${url}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      /* resposta sem JSON */
    }
    if (!resposta.ok) {
      const detalhe = Array.isArray(json) ? json[0]?.error?.message : json?.error?.message;
      throw new ErroNuvem(detalhe || `Erro ${resposta.status} na nuvem.`, resposta.status);
    }
    return json;
  }

  const nomeDoc = (uid, colecao, id) => `${raiz}/usuarios/${uid}/${colecao}/${id}`;
  const nomeParte = (uid, colecao, id, n) => `${raiz}/usuarios/${uid}/partes/${colecao}~${id}~${n}`;

  // Um item vira 1 escrita (ou 1 + partes). item null = marca de excluído.
  function escritasDe(uid, colecao, id, item) {
    const marcar = [{ fieldPath: "servidorEm", setToServerValue: "REQUEST_TIME" }];
    if (!item) {
      return [{ update: { name: nomeDoc(uid, colecao, id), fields: { excluido: { booleanValue: true } } }, updateTransforms: marcar }];
    }
    const texto = JSON.stringify(item);
    const campos = { atualizadoEm: { stringValue: String(item.atualizadoEm ?? "") } };
    const partes = dividir(texto);
    if (partes.length === 1) {
      return [{ update: { name: nomeDoc(uid, colecao, id), fields: { ...campos, json: { stringValue: texto } } }, updateTransforms: marcar }];
    }
    return [
      ...partes.map((p, n) => ({ update: { name: nomeParte(uid, colecao, id, n), fields: { json: { stringValue: p } } } })),
      { update: { name: nomeDoc(uid, colecao, id), fields: { ...campos, partes: { integerValue: String(partes.length) } } }, updateTransforms: marcar },
    ];
  }

  // Arquivos (PDFs): bytes em partes de até 900 KB em usuarios/<uid>/arquivos/<chave>~<n>,
  // e o documento usuarios/<uid>/arquivos/<chave> diz quantas partes há (gravado por último).
  const PARTE_BYTES = 900_000;
  const nomeArquivo = (uid, chave, n) => `${raiz}/usuarios/${uid}/arquivos/${chave}${n === undefined ? "" : `~${n}`}`;

  async function gravarArquivo(uid, chave, bytes) {
    const partes = Math.max(1, Math.ceil(bytes.length / PARTE_BYTES));
    let lote = [];
    let tamanho = 0;
    for (let n = 0; n < partes; n++) {
      const pedaco = Buffer.from(bytes.subarray(n * PARTE_BYTES, (n + 1) * PARTE_BYTES)).toString("base64");
      if (lote.length && tamanho + pedaco.length > LIMITE_COMMIT) {
        await chamar(":commit", { writes: lote });
        lote = [];
        tamanho = 0;
      }
      lote.push({ update: { name: nomeArquivo(uid, chave, n), fields: { dados: { bytesValue: pedaco } } } });
      tamanho += pedaco.length;
    }
    lote.push({ update: { name: nomeArquivo(uid, chave), fields: { partes: { integerValue: String(partes) }, tamanho: { integerValue: String(bytes.length) } } } });
    await chamar(":commit", { writes: lote });
  }

  async function lerArquivo(uid, chave) {
    const principal = await chamar(`/usuarios/${uid}/arquivos/${chave}`, undefined, "GET");
    const partes = Number(principal?.fields?.partes?.integerValue ?? 0);
    if (!partes) throw new ErroNuvem("Arquivo incompleto na nuvem.", 404);
    const pedacos = [];
    for (let n = 0; n < partes; n++) {
      const doc = await chamar(`/usuarios/${uid}/arquivos/${chave}~${n}`, undefined, "GET");
      pedacos.push(Buffer.from(doc?.fields?.dados?.bytesValue ?? "", "base64"));
    }
    return Buffer.concat(pedacos);
  }

  return {
    gravarArquivo,
    lerArquivo,

    // alteracoes: [{ id, item | null }]. Junta em poucas gravações, cada uma atômica.
    async gravar(uid, colecao, alteracoes) {
      let lote = [];
      let bytes = 0;
      const enviar = async () => {
        if (lote.length) await chamar(":commit", { writes: lote });
        lote = [];
        bytes = 0;
      };
      for (const { id, item } of alteracoes) {
        const escritas = escritasDe(uid, colecao, id, item);
        const tamanho = escritas.reduce((s, e) => s + JSON.stringify(e).length, 0);
        if (lote.length && (bytes + tamanho > LIMITE_COMMIT || lote.length + escritas.length > LIMITE_ESCRITAS)) await enviar();
        lote.push(...escritas);
        bytes += tamanho;
      }
      await enviar();
    },

    // O que mudou na nuvem depois de "desde" (texto de data/hora do servidor, ou vazio = tudo).
    // Devolve { remotos: [{ id, item | null }], ultimo }.
    async mudancas(uid, colecao, desde) {
      const consulta = { from: [{ collectionId: colecao }], orderBy: [{ field: { fieldPath: "servidorEm" }, direction: "ASCENDING" }] };
      if (desde) consulta.where = { fieldFilter: { field: { fieldPath: "servidorEm" }, op: "GREATER_THAN", value: { timestampValue: desde } } };
      const linhas = (await chamar(`/usuarios/${uid}:runQuery`, { structuredQuery: consulta })) ?? [];
      const remotos = [];
      let ultimo = desde;
      for (const { document: doc } of linhas) {
        if (!doc) continue;
        const id = doc.name.split("/").pop();
        const f = doc.fields ?? {};
        const servidorEm = f.servidorEm?.timestampValue;
        if (servidorEm && (!ultimo || servidorEm > ultimo)) ultimo = servidorEm;
        if (f.excluido?.booleanValue) {
          remotos.push({ id, item: null });
          continue;
        }
        let texto = f.json?.stringValue;
        const partes = Number(f.partes?.integerValue ?? 0);
        if (texto === undefined && partes > 0) {
          const pedacos = [];
          for (let n = 0; n < partes; n++) {
            const parte = await chamar(`/usuarios/${uid}/partes/${colecao}~${id}~${n}`, undefined, "GET");
            pedacos.push(parte?.fields?.json?.stringValue ?? "");
          }
          texto = pedacos.join("");
        }
        try {
          remotos.push({ id, item: JSON.parse(texto) });
        } catch {
          /* documento incompleto: ignora */
        }
      }
      return { remotos, ultimo };
    },
  };
}

module.exports = { ErroNuvem, criarNuvem };
