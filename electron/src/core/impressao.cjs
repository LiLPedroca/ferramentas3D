// Minhas Impressões: cada item guarda um arquivo de impressão (STL, 3MF, OBJ ou PLY) copiado para a
// pasta de dados, com miniatura, peso, tempo, material e as configurações que deram certo.
// CommonJS: processo principal (que grava) e testes.
"use strict";

const { ErroValidacao, ID, dataValida, texto, textoLongo } = require("./validacao.cjs");
const { medidaDeTexto } = require("./produto.cjs");

const LIMITES = { nome: 120, categoria: 60, curto: 80, arquivo: 200, observacoes: 1000, impressoes: 5_000, imagem: 400_000, bytes: 300 * 1024 * 1024 };
const EXTENSOES = ["stl", "3mf", "obj", "ply"];
const SUPORTE = ["", "sim", "nao"];
// A tela só deixa escolher estes materiais e estas cores (valores antigos digitados continuam guardados).
const MATERIAIS = ["PLA", "PLA Silk", "PETG", "ABS", "TPU"];
const CORES = [
  { id: "branco", nome: "Branco", hex: "#f4f4f4" },
  { id: "preto", nome: "Preto", hex: "#1b1b1b" },
  { id: "cinza", nome: "Cinza", hex: "#8a8a8a" },
  { id: "prata", nome: "Prata", hex: "#c4c7cc" },
  { id: "vermelho", nome: "Vermelho", hex: "#d6322f" },
  { id: "laranja", nome: "Laranja", hex: "#f27a1a" },
  { id: "amarelo", nome: "Amarelo", hex: "#f6c832" },
  { id: "dourado", nome: "Dourado", hex: "#c9a23a" },
  { id: "verde", nome: "Verde", hex: "#2e9d4f" },
  { id: "azul", nome: "Azul", hex: "#2463d8" },
  { id: "roxo", nome: "Roxo", hex: "#7c43c4" },
  { id: "rosa", nome: "Rosa", hex: "#e8649f" },
  { id: "marrom", nome: "Marrom", hex: "#7a4b2b" },
  { id: "transparente", nome: "Transparente", hex: "" },
];
const IDS_CORES = new Set(CORES.map((c) => c.id));

function coresValidas(lista) {
  if (!Array.isArray(lista) || lista.length > CORES.length) throw new ErroValidacao("Cores inválidas.");
  const unicas = [...new Set(lista)];
  if (unicas.some((c) => !IDS_CORES.has(c))) throw new ErroValidacao("Cores inválidas.");
  return CORES.map((c) => c.id).filter((c) => unicas.includes(c)); // sempre na ordem da paleta
}

const nomesDasCores = (ids) => ids.map((id) => CORES.find((c) => c.id === id).nome).join(", ");

// Texto antigo de cor ("preto e branco", "Azul/Rosa") -> ids da paleta, se TODAS as partes forem reconhecidas.
function coresDoTexto(textoCor) {
  const sem = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const partes = String(textoCor ?? "").split(/,|\/|\+| e /i).map(sem).filter(Boolean);
  const ids = partes.map((p) => CORES.find((c) => sem(c.nome) === p)?.id);
  return partes.length && ids.every(Boolean) ? coresValidas(ids) : null;
}
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
  if (i.cores !== undefined) coresValidas(i.cores);
  if (!SUPORTE.includes(i.suporte)) throw new ErroValidacao("Suporte inválido.");
  textoLongo(i.observacoes, "Observações", LIMITES.observacoes);
  if (!Number.isInteger(i.vezesImpressa) || i.vezesImpressa < 0 || i.vezesImpressa > 1_000_000) throw new ErroValidacao("Contagem inválida.");
  if (typeof i.ultimaImpressao !== "string" || (i.ultimaImpressao && !diaValido(i.ultimaImpressao))) throw new ErroValidacao("Data inválida.");
  if (!dataValida(i.criadoEm) || !dataValida(i.atualizadoEm)) throw new ErroValidacao("Data inválida.");
  return i;
}

// valores (da tela): { nome, categoria, pesoG, tempoH, tempoM, material, cores, cor, foto, removerFoto, miniatura }
// camadaMm, preenchimentoPct, suporte, perfil e observacoes saíram da tela (v0.49): quando não vêm,
// ficam os valores já guardados. cores: ids da paleta; cor = os nomes delas (ou o texto antigo, se não houver cores).
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
    cor: texto(v.cor ?? anterior?.cor, "Cor", LIMITES.curto),
    camadaMm: v.camadaMm === undefined ? anterior?.camadaMm ?? "" : medidaDeTexto(v.camadaMm, "Altura de camada"),
    preenchimentoPct: v.preenchimentoPct === undefined ? anterior?.preenchimentoPct ?? "" : inteiroDeTexto(v.preenchimentoPct, "Preenchimento", 100),
    suporte: v.suporte === undefined ? anterior?.suporte ?? "" : SUPORTE.includes(v.suporte) ? v.suporte : "",
    perfil: v.perfil === undefined ? anterior?.perfil ?? "" : texto(v.perfil, "Perfil", LIMITES.curto),
    observacoes: v.observacoes === undefined ? anterior?.observacoes ?? "" : textoLongo(v.observacoes, "Observações", LIMITES.observacoes),
    vezesImpressa: anterior?.vezesImpressa ?? 0,
    ultimaImpressao: anterior?.ultimaImpressao ?? "",
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  const cores = v.cores === undefined ? anterior?.cores : coresValidas(v.cores);
  if (cores?.length) {
    item.cores = cores;
    item.cor = nomesDasCores(cores);
  } else if (cores) item.cores = [];
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

module.exports = { CORES, MATERIAIS, coresDoTexto, EXTENSOES, LIMITES, extensaoDe, marcarImpressa, montarImpressao, nomeDoArquivo, tempoDeTexto, tempoTexto, validarImpressao };
