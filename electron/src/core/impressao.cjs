// Minhas Impressões: cada item guarda um arquivo de impressão (STL, 3MF, OBJ ou PLY) copiado para a
// pasta de dados, com miniatura, peso, tempo, material e as configurações que deram certo.
// CommonJS: processo principal (que grava) e testes.
"use strict";

const { ErroValidacao, ID, dataValida, texto, textoLongo } = require("./validacao.cjs");
const { medidaDeTexto } = require("./produto.cjs");

const LIMITES = { nome: 120, categoria: 60, curto: 80, arquivo: 200, observacoes: 1000, impressoes: 5_000, imagem: 400_000, bytes: 300 * 1024 * 1024 };
const EXTENSOES = ["stl", "3mf", "obj", "ply"];
const SUPORTE = ["", "sim", "nao"];
const IMAGEM = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const HASH = /^[0-9a-f]{64}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaValido(d) {
  if (!DIA.test(d)) return false;
  const [a, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, dd));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === dd;
}

// "nome.do arquivo.3MF" -> "3mf" (ou "" se não for aceito)
function extensaoDe(nome) {
  const ext = String(nome ?? "").toLowerCase().split(".").pop();
  return EXTENSOES.includes(ext) ? ext : "";
}

// Nome do cartão a partir do arquivo: sem extensão, "_" e "-" viram espaço.
function nomeDoArquivo(nome) {
  const base = String(nome ?? "").replace(/\.[^.]+$/, "").replace(/\.gcode$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return (base || "Impressão").slice(0, LIMITES.nome);
}

function inteiroDeTexto(valor, nome, maximo) {
  const t = String(valor ?? "").trim();
  if (!t) return "";
  if (!/^\d{1,7}$/.test(t) || Number(t) > maximo) throw new ErroValidacao(`${nome}: use um número inteiro entre 0 e ${maximo}.`);
  return String(Number(t));
}

// Tempo: horas e minutos da tela -> minutos totais ("" quando vazio).
function tempoDeTexto(horas, minutos) {
  const h = inteiroDeTexto(horas, "Horas", 9999);
  const m = inteiroDeTexto(minutos, "Minutos", 59);
  if (h === "" && m === "") return "";
  return String(Number(h || 0) * 60 + Number(m || 0));
}

function imagemOpcional(v, nome) {
  if (v === undefined || v === "") return undefined;
  if (typeof v !== "string" || v.length > LIMITES.imagem || !IMAGEM.test(v)) throw new ErroValidacao(`${nome} inválida ou muito grande.`);
  return v;
}

function validarArquivo(a) {
  if (!a || typeof a !== "object") throw new ErroValidacao("Arquivo inválido.");
  texto(a.nome, "Nome do arquivo", LIMITES.arquivo, { obrigatorio: true });
  if (!EXTENSOES.includes(a.extensao)) throw new ErroValidacao("Formato de arquivo inválido.");
  if (!Number.isInteger(a.tamanho) || a.tamanho < 1 || a.tamanho > LIMITES.bytes) throw new ErroValidacao("Arquivo inválido.");
  if (!HASH.test(String(a.hash))) throw new ErroValidacao("Arquivo inválido.");
  return { nome: a.nome, extensao: a.extensao, tamanho: a.tamanho, hash: a.hash };
}

function validarImpressao(i) {
  if (!i || typeof i !== "object") throw new ErroValidacao("Impressão inválida.");
  if (typeof i.id !== "string" || !ID.test(i.id)) throw new ErroValidacao("Identificador inválido.");
  texto(i.nome, "Nome", LIMITES.nome, { obrigatorio: true });
  texto(i.categoria, "Categoria", LIMITES.categoria);
  validarArquivo(i.arquivo);
  imagemOpcional(i.miniatura, "Miniatura");
  imagemOpcional(i.foto, "Foto");
  for (const [k, n] of [["pesoG", "Peso"], ["camadaMm", "Altura de camada"]]) {
    if (typeof i[k] !== "string") throw new ErroValidacao(`${n} inválido.`);
    medidaDeTexto(i[k], n);
  }
  if (typeof i.tempoMin !== "string" || (i.tempoMin && !/^\d{1,7}$/.test(i.tempoMin))) throw new ErroValidacao("Tempo inválido.");
  if (typeof i.preenchimentoPct !== "string" || (i.preenchimentoPct && (!/^\d{1,3}$/.test(i.preenchimentoPct) || Number(i.preenchimentoPct) > 100))) {
    throw new ErroValidacao("Preenchimento inválido.");
  }
  for (const [k, n] of [["material", "Material"], ["cor", "Cor"], ["perfil", "Perfil"]]) texto(i[k], n, LIMITES.curto);
  if (!SUPORTE.includes(i.suporte)) throw new ErroValidacao("Suporte inválido.");
  textoLongo(i.observacoes, "Observações", LIMITES.observacoes);
  if (!Number.isInteger(i.vezesImpressa) || i.vezesImpressa < 0 || i.vezesImpressa > 1_000_000) throw new ErroValidacao("Contagem inválida.");
  if (typeof i.ultimaImpressao !== "string" || (i.ultimaImpressao && !diaValido(i.ultimaImpressao))) throw new ErroValidacao("Data inválida.");
  if (!dataValida(i.criadoEm) || !dataValida(i.atualizadoEm)) throw new ErroValidacao("Data inválida.");
  return i;
}

// valores (da tela): { nome, categoria, pesoG, tempoH, tempoM, material, cor, camadaMm, preenchimentoPct, suporte,
//   perfil, observacoes, foto, removerFoto, miniatura }
// arquivo: só o processo principal informa (ao adicionar). Ao editar, vem do anterior.
function montarImpressao(valores, { id, anterior, arquivo, agora = new Date().toISOString() }) {
  const v = valores ?? {};
  const item = {
    id,
    nome: texto(v.nome, "Nome", LIMITES.nome, { obrigatorio: true }),
    categoria: texto(v.categoria, "Categoria", LIMITES.categoria),
    arquivo: validarArquivo(arquivo ?? anterior?.arquivo),
    pesoG: medidaDeTexto(v.pesoG, "Peso"),
    tempoMin: tempoDeTexto(v.tempoH, v.tempoM),
    material: texto(v.material, "Material", LIMITES.curto),
    cor: texto(v.cor, "Cor", LIMITES.curto),
    camadaMm: medidaDeTexto(v.camadaMm, "Altura de camada"),
    preenchimentoPct: inteiroDeTexto(v.preenchimentoPct, "Preenchimento", 100),
    suporte: SUPORTE.includes(v.suporte) ? v.suporte : "",
    perfil: texto(v.perfil, "Perfil", LIMITES.curto),
    observacoes: textoLongo(v.observacoes, "Observações", LIMITES.observacoes),
    vezesImpressa: anterior?.vezesImpressa ?? 0,
    ultimaImpressao: anterior?.ultimaImpressao ?? "",
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  const miniatura = imagemOpcional(v.miniatura, "Miniatura") ?? anterior?.miniatura;
  if (miniatura) item.miniatura = miniatura;
  if (typeof v.foto === "string" && v.foto) item.foto = imagemOpcional(v.foto, "Foto");
  else if (!v.removerFoto && anterior?.foto) item.foto = anterior.foto;
  return validarImpressao(item);
}

// "Marquei que imprimi": +1 e a data de hoje.
function marcarImpressa(i, { hoje, agora = new Date().toISOString() }) {
  if (!diaValido(hoje)) throw new ErroValidacao("Data inválida.");
  return validarImpressao({ ...i, vezesImpressa: i.vezesImpressa + 1, ultimaImpressao: hoje, atualizadoEm: agora });
}

// 130 -> "2h10"
function tempoTexto(min) {
  if (!min) return "";
  const n = Number(min);
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}

module.exports = { EXTENSOES, LIMITES, extensaoDe, marcarImpressa, montarImpressao, nomeDoArquivo, tempoDeTexto, tempoTexto, validarImpressao };
