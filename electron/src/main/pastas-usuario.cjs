// Pastas do usuário: tudo o que o programa salva fica organizado em Documentos\Programa Ferramentas 3D,
// uma pasta para cada tipo de arquivo. Cada "Salvar" já abre na pasta certa (o usuário pode mudar).
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const NOME_RAIZ = "Programa Ferramentas 3D";

// tipo -> [nome da pasta, para que serve]
const PASTAS = {
  orcamentos: ["Orçamentos", "PDFs dos orçamentos"],
  recibos: ["Recibos", "PDFs dos recibos"],
  etiquetas: ["Etiquetas", "PDFs das etiquetas"],
  modelos: ["Modelos 3D", "STL e 3MF dos modelos"],
  backups: ["Backups", "Backups que você salva"],
  produtos: ["Produtos", "Produtos exportados para outro PC"],
};

// Pastas que o usuário pode trocar de lugar (ex.: "Modelos 3D" dentro do Google Drive).
const TROCAVEIS = ["modelos"];

function criarPastasUsuario(raiz) {
  const escolhidas = {}; // tipo -> caminho escolhido pelo usuário (vale só neste PC)
  const caminho = (tipo) => {
    if (tipo === "raiz") return raiz;
    if (!Object.hasOwn(PASTAS, tipo)) throw new Error(`Pasta desconhecida: ${tipo}`);
    return escolhidas[tipo] ?? path.join(raiz, PASTAS[tipo][0]);
  };
  return {
    raiz,
    caminho,
    // caminho vazio volta ao padrão (Documentos\Programa Ferramentas 3D\...).
    escolher(tipo, novo) {
      if (!TROCAVEIS.includes(tipo)) throw new Error(`Esta pasta não pode mudar de lugar: ${tipo}`);
      if (novo && typeof novo === "string" && path.isAbsolute(novo)) escolhidas[tipo] = novo;
      else delete escolhidas[tipo];
    },
    escolhidas: () => ({ ...escolhidas }),
    // Cria a pasta (se ainda não existe) e devolve o caminho.
    async garantir(tipo) {
      const c = caminho(tipo);
      await fs.mkdir(c, { recursive: true });
      return c;
    },
    async garantirTodas() {
      for (const tipo of Object.keys(PASTAS)) await fs.mkdir(caminho(tipo), { recursive: true });
      return raiz;
    },
    listar() {
      return Object.entries(PASTAS).map(([tipo, [nome, descricao]]) => ({
        tipo,
        nome,
        descricao,
        caminho: caminho(tipo),
        trocavel: TROCAVEIS.includes(tipo),
        escolhida: Object.hasOwn(escolhidas, tipo),
      }));
    },
  };
}

module.exports = { NOME_RAIZ, PASTAS, TROCAVEIS, criarPastasUsuario };
