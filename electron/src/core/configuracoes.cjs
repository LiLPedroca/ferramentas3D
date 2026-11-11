// Configurações do usuário: validação e mesclagem. Em CommonJS (processo principal e testes).
"use strict";

const { ErroValidacao, texto, textoLongo } = require("./validacao.cjs");
const { documentoDeTexto, emailDeTexto, telefoneDeTexto } = require("./cliente.cjs");

class ConfiguracaoInvalida extends ErroValidacao {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ConfiguracaoInvalida";
  }
}

const EMPRESA_VAZIA = { nome: "", telefone: "", email: "", documento: "", cidade: "", site: "" };
const ORCAMENTO_PADRAO = { validadeDias: 7, prazoProducao: "", formaPagamento: "", observacoes: "" };

const PADRAO = { nome: "", nomePerguntado: false, empresa: EMPRESA_VAZIA, orcamento: ORCAMENTO_PADRAO };

// Tenta validar; se falhar, usa o valor de reserva (para leitura tolerante do que está gravado).
function ou(funcao, reserva) {
  try {
    return funcao();
  } catch {
    return reserva;
  }
}

function empresaDe(e, estrito) {
  const v = e && typeof e === "object" ? e : {};
  const campo = (funcao, reserva = "") => (estrito ? funcao() : ou(funcao, reserva));
  return {
    nome: campo(() => texto(v.nome, "Nome da empresa", 120)),
    telefone: campo(() => telefoneDeTexto(v.telefone)),
    email: campo(() => emailDeTexto(v.email)),
    documento: campo(() => documentoDeTexto(v.documento)),
    cidade: campo(() => texto(v.cidade, "Cidade", 80)),
    site: campo(() => texto(v.site, "Site ou Instagram", 120)),
  };
}

function orcamentoDe(o, estrito) {
  const v = o && typeof o === "object" ? o : {};
  const campo = (funcao, reserva) => (estrito ? funcao() : ou(funcao, reserva));
  return {
    validadeDias: campo(() => {
      const n = Number(String(v.validadeDias ?? "7").trim());
      if (!Number.isInteger(n) || n < 1 || n > 365) throw new ConfiguracaoInvalida("Validade padrão: use de 1 a 365 dias.");
      return n;
    }, 7),
    prazoProducao: campo(() => texto(v.prazoProducao, "Prazo de produção padrão", 80), ""),
    formaPagamento: campo(() => texto(v.formaPagamento, "Forma de pagamento padrão", 160), ""),
    observacoes: campo(() => textoLongo(v.observacoes, "Observações padrão", 1000), ""),
  };
}

// Fatiador escolhido: nome e caminho absoluto de um .exe (ou vazio).
function fatiadorDe(f, estrito) {
  const v = f && typeof f === "object" ? f : {};
  const validar = () => {
    const caminho = String(v.caminho ?? "").trim();
    if (!caminho) return { nome: "", caminho: "" };
    if (caminho.length > 400 || !/^[A-Za-z]:\\.+\.exe$/i.test(caminho) || /[\x00-\x1f]/.test(caminho)) {
      throw new ConfiguracaoInvalida("Fatiador: escolha o programa (.exe) do fatiador.");
    }
    return { nome: texto(v.nome, "Nome do fatiador", 60) || caminho.split("\\").pop().replace(/\.exe$/i, ""), caminho };
  };
  return estrito ? validar() : ou(validar, { nome: "", caminho: "" });
}

// Categorias de produtos criadas pelo usuário: textos únicos (sem diferenciar maiúsculas e acentos).
const LIMITE_CATEGORIAS = 100;
const chaveCategoria = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function categoriasDe(lista, estrito) {
  if (!Array.isArray(lista)) {
    if (estrito) throw new ConfiguracaoInvalida("Categorias inválidas.");
    return [];
  }
  if (estrito && lista.length > LIMITE_CATEGORIAS) throw new ConfiguracaoInvalida(`Use no máximo ${LIMITE_CATEGORIAS} categorias.`);
  const vistas = new Set();
  const resultado = [];
  for (const item of lista.slice(0, LIMITE_CATEGORIAS)) {
    const nome = estrito ? texto(item, "Categoria", 60, { Erro: ConfiguracaoInvalida }) : ou(() => texto(item, "Categoria", 60), "");
    if (!nome || vistas.has(chaveCategoria(nome))) continue;
    vistas.add(chaveCategoria(nome));
    resultado.push(nome);
  }
  return resultado.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Avisos de novidade já vistos (ids), opção de não mostrar e a versão da primeira abertura.
function novidadesVistasDe(lista, estrito) {
  if (!Array.isArray(lista)) {
    if (estrito) throw new ConfiguracaoInvalida("Novidades inválidas.");
    return [];
  }
  const ids = lista.filter((x) => typeof x === "string" && /^[a-z0-9-]{1,60}$/.test(x));
  if (estrito && ids.length !== lista.length) throw new ConfiguracaoInvalida("Novidades inválidas.");
  return [...new Set(ids)].slice(-300);
}

function versaoDe(v, estrito) {
  const t = String(v ?? "");
  if (/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(t)) return t;
  if (estrito) throw new ConfiguracaoInvalida("Versão inválida.");
  return "";
}

// Fatiadores cadastrados neste computador (o ativo fica em "fatiador").
const LIMITE_FATIADORES = 20;

function fatiadoresDe(lista, ativo, estrito) {
  if (lista !== undefined && !Array.isArray(lista) && estrito) throw new ConfiguracaoInvalida("Fatiadores inválidos.");
  const entrada = Array.isArray(lista) ? lista : [];
  if (estrito && entrada.length > LIMITE_FATIADORES) throw new ConfiguracaoInvalida(`Use no máximo ${LIMITE_FATIADORES} fatiadores.`);
  const vistos = new Set();
  const resultado = [];
  for (const item of [...entrada, ativo]) {
    const f = fatiadorDe(item, estrito);
    if (!f.caminho || vistos.has(f.caminho.toLowerCase()) || resultado.length >= LIMITE_FATIADORES) continue;
    vistos.add(f.caminho.toLowerCase());
    resultado.push(f);
  }
  return resultado;
}

// ---------- Paquímetro: calibração "real × modelo" e medidas guardadas por arquivo ----------
const LIMITE_CALIBRACOES = 300;
const LIMITE_ARQUIVOS_MEDIDOS = 100;
const LIMITE_MEDIDAS_POR_ARQUIVO = 60;
const TIPOS_CALIBRACAO = ["furo", "pino", "externa"];

const numeroEntre = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const vetor3 = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => numeroEntre(x, -1e6, 1e6));

// Medida que o usuário conferiu na peça impressa: { filamento, tipo, modelo, real, data }
function calibracaoDe(c) {
  if (!c || typeof c !== "object") throw new ConfiguracaoInvalida("Calibração inválida.");
  if (!TIPOS_CALIBRACAO.includes(c.tipo)) throw new ConfiguracaoInvalida("Calibração: tipo inválido.");
  if (!numeroEntre(c.modelo, 0.1, 2000) || !numeroEntre(c.real, 0.1, 2000)) throw new ConfiguracaoInvalida("Calibração: use medidas de 0,1 a 2000 mm.");
  if (Math.abs(c.real - c.modelo) > Math.max(5, c.modelo * 0.2)) throw new ConfiguracaoInvalida("A medida real está longe demais da medida do modelo. Confira o valor.");
  const data = typeof c.data === "string" && !Number.isNaN(Date.parse(c.data)) ? c.data : new Date().toISOString();
  return { filamento: texto(c.filamento, "Filamento", 80) || "Geral", tipo: c.tipo, modelo: c.modelo, real: c.real, data };
}

function calibracoesDe(lista, estrito) {
  if (!Array.isArray(lista)) {
    if (estrito) throw new ConfiguracaoInvalida("Calibrações inválidas.");
    return [];
  }
  const validas = [];
  for (const c of lista.slice(-LIMITE_CALIBRACOES)) {
    if (estrito) validas.push(calibracaoDe(c));
    else {
      const v = ou(() => calibracaoDe(c), null);
      if (v) validas.push(v);
    }
  }
  return validas;
}

function medidaGuardadaDe(m) {
  if (!m || typeof m !== "object") throw new ConfiguracaoInvalida("Medida inválida.");
  const comReal = (obj) => (numeroEntre(m.real, 0.01, 1e5) ? { ...obj, real: m.real } : obj);
  return comReal(medidaSemRealDe(m));
}

function medidaSemRealDe(m) {
  if (m.tipo === "diametro") {
    const f = m.furo ?? {};
    if (!vetor3(f.centro) || !vetor3(f.eixo) || !vetor3(f.inicio ?? f.centro) || !numeroEntre(f.raio, 1e-4, 1e5)) throw new ConfiguracaoInvalida("Medida inválida.");
    return {
      tipo: "diametro",
      furo: {
        centro: f.centro,
        eixo: f.eixo,
        raio: f.raio,
        rms: numeroEntre(f.rms, 0, 1e5) ? f.rms : 0,
        lados: Number.isInteger(f.lados) && f.lados >= 0 && f.lados < 1e6 ? f.lados : 0,
        tipo: f.tipo === "pino" ? "pino" : "furo",
      },
    };
  }
  if (m.tipo === "redondo") {
    // boca, furo ou pino do paquímetro de passar o mouse: Ø de fora e/ou de dentro
    const lado = (l) => {
      if (l === null || l === undefined) return null;
      if (!numeroEntre(l.raio, 1e-4, 1e5)) throw new ConfiguracaoInvalida("Medida inválida.");
      return { raio: l.raio, rms: numeroEntre(l.rms, 0, 1e5) ? l.rms : 0, lados: Number.isInteger(l.lados) && l.lados >= 0 && l.lados < 1e6 ? l.lados : 0 };
    };
    const [externo, interno] = [lado(m.externo), lado(m.interno)];
    if (!vetor3(m.centro) || !vetor3(m.eixo) || (!externo && !interno)) throw new ConfiguracaoInvalida("Medida inválida.");
    const r = { tipo: "redondo", centro: m.centro, eixo: m.eixo, externo, interno };
    if (numeroEntre(m.profundidade, 0, 1e5)) r.profundidade = m.profundidade;
    if (numeroEntre(m.altura, 0, 1e5)) r.altura = m.altura;
    if (m.passante === true) r.passante = true;
    return r;
  }
  if (!["distancia", "profundidade", "aresta", "parede"].includes(m.tipo)) throw new ConfiguracaoInvalida("Medida inválida.");
  // aresta e parede não têm normal nos dois pontos
  const ponto = (p) => {
    if (!p || !vetor3(p.p) || (p.n !== null && p.n !== undefined && !vetor3(p.n))) throw new ConfiguracaoInvalida("Medida inválida.");
    if (m.tipo !== "aresta" && m.tipo !== "parede" && !vetor3(p.n)) throw new ConfiguracaoInvalida("Medida inválida.");
    return { p: p.p, n: p.n ?? null };
  };
  return { tipo: m.tipo, a: ponto(m.a), b: ponto(m.b) };
}

// [{ chave, nome, data, medidas }] — chave identifica o arquivo (nome, tamanho e triângulos)
function medidasSalvasDe(lista, estrito) {
  if (!Array.isArray(lista)) {
    if (estrito) throw new ConfiguracaoInvalida("Medidas inválidas.");
    return [];
  }
  const resultado = [];
  for (const item of lista.slice(-LIMITE_ARQUIVOS_MEDIDOS)) {
    const validar = () => {
      if (!item || typeof item !== "object") throw new ConfiguracaoInvalida("Medidas inválidas.");
      const chave = texto(item.chave, "Arquivo", 300);
      if (!chave) throw new ConfiguracaoInvalida("Medidas inválidas.");
      if (!Array.isArray(item.medidas) || item.medidas.length > LIMITE_MEDIDAS_POR_ARQUIVO) throw new ConfiguracaoInvalida("Medidas demais para um arquivo.");
      const data = typeof item.data === "string" && !Number.isNaN(Date.parse(item.data)) ? item.data : new Date().toISOString();
      return { chave, nome: texto(item.nome, "Nome do arquivo", 160), data, medidas: item.medidas.map(medidaGuardadaDe) };
    };
    if (estrito) resultado.push(validar());
    else {
      const v = ou(validar, null);
      if (v) resultado.push(v);
    }
  }
  return resultado;
}

// Lê o que estiver gravado, ignorando campos estranhos ou inválidos (nunca falha).
function normalizarGravado(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  return {
    nome: ou(() => texto(d.nome, "Nome", 80), ""),
    nomePerguntado: d.nomePerguntado === true,
    empresa: empresaDe(d.empresa, false),
    orcamento: orcamentoDe(d.orcamento, false),
    fatiador: fatiadorDe(d.fatiador, false),
    fatiadores: fatiadoresDe(d.fatiadores, d.fatiador, false),
    categorias: categoriasDe(d.categorias, false),
    novidadesVistas: novidadesVistasDe(d.novidadesVistas, false),
    ocultarNovidades: d.ocultarNovidades === true,
    primeiraVersao: versaoDe(d.primeiraVersao, false),
    calibracoes: calibracoesDe(d.calibracoes, false),
    medidasSalvas: medidasSalvasDe(d.medidasSalvas, false),
  };
}

// Aplica uma alteração parcial vinda da tela. Só campos conhecidos são aceitos.
function aplicarAlteracao(atual, alteracao) {
  const base = normalizarGravado(atual);
  const a = alteracao && typeof alteracao === "object" ? alteracao : {};
  const novo = { ...base };
  if ("nome" in a) novo.nome = texto(a.nome, "Nome", 80, { Erro: ConfiguracaoInvalida });
  if ("nomePerguntado" in a) novo.nomePerguntado = a.nomePerguntado === true;
  if ("empresa" in a) novo.empresa = empresaDe(a.empresa, true);
  if ("orcamento" in a) novo.orcamento = orcamentoDe(a.orcamento, true);
  if ("fatiador" in a) novo.fatiador = fatiadorDe(a.fatiador, true);
  if ("fatiadores" in a || "fatiador" in a) novo.fatiadores = fatiadoresDe("fatiadores" in a ? a.fatiadores : base.fatiadores, novo.fatiador, true);
  if ("categorias" in a) novo.categorias = categoriasDe(a.categorias, true);
  if ("novidadesVistas" in a) novo.novidadesVistas = novidadesVistasDe(a.novidadesVistas, true);
  if ("ocultarNovidades" in a) novo.ocultarNovidades = a.ocultarNovidades === true;
  if ("primeiraVersao" in a && !base.primeiraVersao) novo.primeiraVersao = versaoDe(a.primeiraVersao, true);
  if ("calibracoes" in a) novo.calibracoes = calibracoesDe(a.calibracoes, true);
  if ("medidasSalvas" in a) novo.medidasSalvas = medidasSalvasDe(a.medidasSalvas, true);
  return novo;
}

module.exports = { ConfiguracaoInvalida, PADRAO, aplicarAlteracao, normalizarGravado };
