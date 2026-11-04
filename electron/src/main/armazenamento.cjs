// Gravação dos dados do usuário em arquivos JSON na pasta de dados do programa.
// Cada gravação: copia o arquivo atual para .bak, grava num .tmp e renomeia (troca atômica).
// Assim, uma queda de energia no meio da gravação não corrompe os dados.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

class Colecao {
  constructor(pasta, nome) {
    this.arquivo = path.join(pasta, `${nome}.json`);
    this.fila = Promise.resolve();
  }

  async #lerArquivo(arquivo) {
    const texto = await fs.readFile(arquivo, "utf8");
    const dados = JSON.parse(texto);
    if (!dados || dados.versao !== 1 || !Array.isArray(dados.itens)) throw new Error("formato desconhecido");
    return dados.itens;
  }

  // Lê os itens. Se o arquivo principal estiver danificado, tenta o .bak.
  async ler() {
    try {
      return await this.#lerArquivo(this.arquivo);
    } catch (erro) {
      if (erro.code === "ENOENT") return [];
      try {
        return await this.#lerArquivo(`${this.arquivo}.bak`);
      } catch {
        throw new Error(`Não foi possível ler ${path.basename(this.arquivo)}. O arquivo foi preservado sem alterações.`);
      }
    }
  }

  async #gravar(itens) {
    await fs.mkdir(path.dirname(this.arquivo), { recursive: true });
    const conteudo = JSON.stringify({ versao: 1, itens }, null, 2);
    const temporario = `${this.arquivo}.tmp`;
    await fs.writeFile(temporario, conteudo, "utf8");
    try {
      await fs.copyFile(this.arquivo, `${this.arquivo}.bak`);
    } catch (erro) {
      if (erro.code !== "ENOENT") throw erro;
    }
    await fs.rename(temporario, this.arquivo);
  }

  // Lê, aplica a alteração e grava, uma de cada vez (sem gravações simultâneas).
  alterar(funcao) {
    const tarefa = this.fila.then(async () => {
      const itens = await this.ler();
      const { itens: novos, resultado } = await funcao(itens);
      await this.#gravar(novos);
      return resultado;
    });
    this.fila = tarefa.catch(() => {});
    return tarefa;
  }
}

module.exports = { Colecao };
