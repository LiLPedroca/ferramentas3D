// "Meus modelos": chaveiros e placas salvos para reabrir e reeditar (CommonJS: processo principal e testes).
// Guarda as opções da ferramenta (como a tela as usa), uma miniatura e, no logo e na caneca, a imagem reduzida.
"use strict";

const { ErroValidacao, ID, dataValida, texto } = require("./validacao.cjs");

const TIPOS = { chaveiro: "Chaveiro de nome", logo: "Chaveiro de logo", palavras: "Palavras decorativas", caneca: "Caneca de chopp" };
const LIMITES = { nome: 80, projetos: 2000, opcoes: 20_000, miniatura: 300_000, imagem: 2_000_000 };
const IMAGEM = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

function imagemDe(valor, nome, maximo) {
  const v = String(valor ?? "");
  if (!v) return "";
  if (v.length > maximo || !IMAGEM.test(v)) throw new ErroValidacao(`${nome}: imagem inválida ou grande demais.`);
  return v;
}

function opcoesDe(valor) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new ErroValidacao("Opções do modelo inválidas.");
  const json = JSON.stringify(valor);
  if (json.length > LIMITES.opcoes) throw new ErroValidacao("Opções do modelo grandes demais.");
  return JSON.parse(json); // cópia limpa (só dados)
}

// valores: { tipo, nome, opcoes, miniatura, imagem }
function montarProjeto(valores, { id, anterior, agora = new Date().toISOString() } = {}) {
  const v = valores ?? {};
  const tipo = anterior?.tipo ?? v.tipo;
  if (!Object.hasOwn(TIPOS, tipo)) throw new ErroValidacao("Tipo de modelo inválido.");
  const projeto = {
    id,
    tipo,
    nome: texto(v.nome, "Nome", LIMITES.nome, { obrigatorio: true }),
    opcoes: opcoesDe(v.opcoes),
    miniatura: imagemDe(v.miniatura, "Miniatura", LIMITES.miniatura),
    // chaveiro de nome: a imagem do símbolo (opcional)
    imagem: ["logo", "caneca", "chaveiro"].includes(tipo) ? imagemDe(v.imagem, "Imagem do logo", LIMITES.imagem) : "",
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  if (tipo === "logo" && !projeto.imagem) throw new ErroValidacao("Falta a imagem do logo.");
  validarProjeto(projeto);
  return projeto;
}

function validarProjeto(p) {
  if (!p || typeof p !== "object") throw new ErroValidacao("Modelo inválido.");
  if (typeof p.id !== "string" || !ID.test(p.id)) throw new ErroValidacao("Identificador inválido.");
  if (!Object.hasOwn(TIPOS, p.tipo)) throw new ErroValidacao("Tipo de modelo inválido.");
  texto(p.nome, "Nome", LIMITES.nome, { obrigatorio: true });
  opcoesDe(p.opcoes);
  imagemDe(p.miniatura, "Miniatura", LIMITES.miniatura);
  imagemDe(p.imagem, "Imagem do logo", LIMITES.imagem);
  if (!dataValida(p.criadoEm) || !dataValida(p.atualizadoEm)) throw new ErroValidacao("Data inválida.");
  return true;
}

module.exports = { LIMITES, TIPOS, montarProjeto, validarProjeto };
