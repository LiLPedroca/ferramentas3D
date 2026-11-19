// Enviar orçamento pelo WhatsApp (sem API): número do cliente, mensagem com campos e o link
// que abre a conversa direto no WhatsApp (ou WhatsApp Business) instalado no PC.
// CommonJS: usado no processo principal, na tela e nos testes.
"use strict";

const { calcularTotais, dataValidade } = require("./orcamento.cjs");
const { chaveParaMostrar } = require("./pix.cjs");

const MENSAGEM_PADRAO = "Olá, {cliente}! Seu orçamento nº {numero} está pronto. Total: {total}. Segue o PDF.";
const LIMITE_MENSAGEM = 1000;

// Campos que a pessoa pode pôr na mensagem (botões em Configurações).
const CAMPOS_MENSAGEM = [
  { chave: "cliente", rotulo: "Cliente" },
  { chave: "numero", rotulo: "Nº do orçamento" },
  { chave: "total", rotulo: "Total" },
  { chave: "validade", rotulo: "Validade" },
  { chave: "pix", rotulo: "Pix" },
];

// Só números; põe o 55 (Brasil) na frente quando falta. Número que não parece telefone: null.
function numeroWhatsapp(telefone) {
  const d = String(telefone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

function reais(centavos) {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const inteiro = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${inteiro},${(abs % 100n).toString().padStart(2, "0")}`;
}

// Valores dos campos para um orçamento gravado. pix: o Pix das Configurações (chave mostrada formatada).
function valoresDaMensagem(o, pix) {
  return {
    cliente: String(o?.cliente?.nome ?? "").trim().split(/\s+/)[0] || "",
    numero: `${o?.teste ? "T-" : ""}${String(o?.numero ?? "").padStart(4, "0")}`,
    total: reais(calcularTotais(o).total),
    validade: new Date(dataValidade(o)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    pix: pix?.chave ? chaveParaMostrar(pix.tipo, pix.chave) : "",
  };
}

// Troca {cliente}, {numero}, {total}, {validade} e {pix}. Campo desconhecido fica como está.
function montarMensagem(modelo, valores) {
  const texto = String(modelo ?? "").trim() || MENSAGEM_PADRAO;
  return texto.replace(/\{(cliente|numero|total|validade|pix)\}/g, (_m, chave) => valores[chave] ?? "");
}

// Link que abre a conversa direto no aplicativo (sem passar pelo navegador).
function linkAppWhatsapp(numero, mensagem) {
  return `whatsapp://send?phone=${numero}&text=${encodeURIComponent(mensagem)}`;
}

// Reserva, se o aplicativo não estiver instalado: abre pelo navegador.
function linkWebWhatsapp(numero, mensagem) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

module.exports = { CAMPOS_MENSAGEM, LIMITE_MENSAGEM, MENSAGEM_PADRAO, linkAppWhatsapp, linkWebWhatsapp, montarMensagem, numeroWhatsapp, valoresDaMensagem };
