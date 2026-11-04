// Gravação dos dados do usuário em arquivos JSON na pasta de dados do programa.
// Cada gravação: grava num .tmp, copia o arquivo atual para .bak e renomeia (troca atômica).
// Assim, uma queda de energia no meio da gravação não corrompe os dados.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

// Lê { versao: 1, <campo>: ... }. Se o principal estiver danificado, tenta o .bak.
// Arquivo inexistente devolve "vazio". Nada legível: lança erro (e nada é sobrescrito).
async function lerJson(arquivo, campo, valido, vazio) {
  const lerUm = async (caminho) => {
    const dados = JSON.parse(await fs.readFile(caminho, "utf8"));
    if (!dados || dados.versao !== 1 || !valido(dados[campo])) throw new Error("formato desconhecido");
    return dados[campo];
  };
  try {
    return await lerUm(arquivo);
  } catch (erro) {
    if (erro.code === "ENOENT") return vazio();
    try {
      return await lerUm(`${arquivo}.bak`);
    } catch {
      throw new Error(`Não foi possível ler ${path.basename(arquivo)}. O arquivo foi preservado sem alterações.`);
    }
  }
}

async function gravarJson(arquivo, campo, valor) {
  await fs.mkdir(path.dirname(arquivo), { recursive: true });
  const temporario = `${arquivo}.tmp`;
  await fs.writeFile(temporario, JSON.stringify({ versao: 1, [campo]: valor }, null, 2), "utf8");
  try {
    await fs.copyFile(arquivo, `${arquivo}.bak`);
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
  await fs.rename(temporario, arquivo);
}

// Base comum: uma alteração de cada vez (sem gravações simultâneas).
class Armazem {
  constructor(pasta, nome, campo, valido, vazio) {
    this.arquivo = path.join(pasta, `${nome}.json`);
    this.campo = campo;
    this.valido = valido;
    this.vazio = vazio;
    this.fila = Promise.resolve();
  }

  ler() {
    return lerJson(this.arquivo, this.campo, this.valido, this.vazio);
  }

  // funcao(atual) devolve { novo, resultado }.
  alterarValor(funcao) {
    const tarefa = this.fila.then(async () => {
      const { novo, resultado } = await funcao(await this.ler());
      await gravarJson(this.arquivo, this.campo, novo);
      return resultado;
    });
    this.fila = tarefa.catch(() => {});
    return tarefa;
  }
}

// Lista de itens (produtos, clientes...).
class Colecao extends Armazem {
  constructor(pasta, nome) {
    super(pasta, nome, "itens", Array.isArray, () => []);
  }

  // funcao(itens) devolve { itens, resultado }.
  alterar(funcao) {
    return this.alterarValor(async (itens) => {
      const { itens: novos, resultado } = await funcao(itens);
      return { novo: novos, resultado };
    });
  }
}

// Um único objeto (configurações).
class Documento extends Armazem {
  constructor(pasta, nome) {
    super(pasta, nome, "dados", (d) => Boolean(d) && typeof d === "object" && !Array.isArray(d), () => ({}));
  }
}

module.exports = { Colecao, Documento };
