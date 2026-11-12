// Backup em UM arquivo .zip: "dados.json" (o backup de sempre) + os arquivos de Minhas Impressões em
// "impressoes/<nome da impressão> [<id>].<ext>". O nome legível ajuda a achar o arquivo abrindo o .zip no
// Windows; o [id] diz a qual impressão ele pertence ao restaurar.
// Grava e lê em partes (streaming), para não carregar arquivos grandes inteiros na memória.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } = require("fflate");
const { ErroValidacao } = require("../core/validacao.cjs");

const DADOS = "dados.json";
const LIMITE_DADOS = 200 * 1024 * 1024;
const ARQUIVO_IMPRESSAO = /^impressoes\/[^/]*\[([A-Za-z0-9-]{8,64})\]\.(stl|3mf|obj|ply)$/i;

// "Chaveiro: Delorean?" -> "Chaveiro Delorean" (sem caracteres proibidos no Windows)
function nomeSeguro(nome) {
  const limpo = String(nome ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80);
  return limpo || "Impressão";
}

const nomeNoZip = (a) => `impressoes/${nomeSeguro(a.nome)} [${a.id}].${a.extensao}`;

// texto: conteúdo do backup (JSON). arquivos: [{ id, nome, extensao, caminho }].
async function gravarZip(destino, texto, arquivos) {
  const temporario = `${destino}.tmp`;
  const fd = fs.openSync(temporario, "w");
  let falha = null;
  let terminou;
  const pronto = new Promise((r) => (terminou = r));
  const zip = new Zip((erro, pedaco, final) => {
    if (falha) return;
    if (erro) falha = erro;
    else fs.writeSync(fd, pedaco);
    if (erro || final) terminou();
  });
  try {
    const dados = new ZipDeflate(DADOS, { level: 6 });
    zip.add(dados);
    dados.push(new TextEncoder().encode(texto), true);
    for (const a of arquivos) {
      // 3MF já é compactado: só guarda. STL/OBJ/PLY compactam bem.
      const entrada = a.extensao === "3mf" ? new ZipPassThrough(nomeNoZip(a)) : new ZipDeflate(nomeNoZip(a), { level: 6 });
      zip.add(entrada);
      for await (const pedaco of fs.createReadStream(a.caminho, { highWaterMark: 1 << 20 })) {
        if (falha) break;
        entrada.push(pedaco, false);
      }
      entrada.push(new Uint8Array(0), true);
    }
    zip.end();
    await pronto;
  } finally {
    fs.closeSync(fd);
  }
  if (falha) {
    fs.rmSync(temporario, { force: true });
    throw falha;
  }
  fs.renameSync(temporario, destino);
}

// Extrai um backup .zip para a pasta "destino": devolve o texto do dados.json; os arquivos das
// impressões vão para destino/<id>.<ext> (o formato que impressoes.recuperarArquivos procura).
async function lerZip(caminho, destino) {
  fs.mkdirSync(destino, { recursive: true });
  const pedacosDados = [];
  let tamanhoDados = 0;
  let achouDados = false;
  let falha = null;
  const abertos = new Set();

  const unzip = new Unzip((arquivo) => {
    if (arquivo.name === DADOS) {
      achouDados = true;
      arquivo.ondata = (erro, pedaco) => {
        if (erro) return (falha ??= erro);
        tamanhoDados += pedaco.length;
        if (tamanhoDados > LIMITE_DADOS) return (falha ??= new ErroValidacao("Backup grande demais."));
        pedacosDados.push(pedaco);
      };
      arquivo.start();
      return;
    }
    const m = ARQUIVO_IMPRESSAO.exec(arquivo.name);
    if (!m) return; // qualquer outra coisa no .zip é ignorada
    const fd = fs.openSync(path.join(destino, `${m[1]}.${m[2].toLowerCase()}`), "w");
    abertos.add(fd);
    arquivo.ondata = (erro, pedaco, final) => {
      if (erro) falha ??= erro;
      else if (pedaco.length) fs.writeSync(fd, pedaco);
      if (erro || final) {
        fs.closeSync(fd);
        abertos.delete(fd);
      }
    };
    arquivo.start();
  });
  unzip.register(UnzipInflate);
  try {
    for await (const pedaco of fs.createReadStream(caminho, { highWaterMark: 1 << 20 })) {
      unzip.push(pedaco, false);
      if (falha) break;
    }
    if (!falha) unzip.push(new Uint8Array(0), true);
  } catch {
    falha ??= new ErroValidacao("Não foi possível ler este .zip. Ele pode estar danificado.");
  } finally {
    for (const fd of abertos) fs.closeSync(fd);
  }
  if (falha) throw falha instanceof ErroValidacao ? falha : new ErroValidacao("Não foi possível ler este .zip. Ele pode estar danificado.");
  if (!achouDados) throw new ErroValidacao("Este .zip não é um backup do Programa Ferramentas 3D.");
  return new TextDecoder().decode(Buffer.concat(pedacosDados));
}

module.exports = { gravarZip, lerZip, nomeNoZip, nomeSeguro };
