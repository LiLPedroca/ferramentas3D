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

// Lê o que estiver gravado, ignorando campos estranhos ou inválidos (nunca falha).
function normalizarGravado(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  return {
    nome: ou(() => texto(d.nome, "Nome", 80), ""),
    nomePerguntado: d.nomePerguntado === true,
    empresa: empresaDe(d.empresa, false),
    orcamento: orcamentoDe(d.orcamento, false),
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
  return novo;
}

module.exports = { ConfiguracaoInvalida, PADRAO, aplicarAlteracao, normalizarGravado };
