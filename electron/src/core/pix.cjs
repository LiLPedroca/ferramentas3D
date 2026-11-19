// Pix no orçamento: chave cadastrada nas Configurações e o código "Pix copia e cola" (BR Code
// estático, padrão do Banco Central) que vira o QR Code do PDF, já com o valor do orçamento.
// Não fala com banco nenhum: o cliente lê o QR no app do banco e paga para a chave.
// CommonJS: processo principal, tela e testes.
"use strict";

const { ErroValidacao } = require("./validacao.cjs");

const TIPOS_CHAVE = [
  { id: "cpf", rotulo: "CPF" },
  { id: "cnpj", rotulo: "CNPJ" },
  { id: "celular", rotulo: "Celular" },
  { id: "email", rotulo: "E-mail" },
  { id: "aleatoria", rotulo: "Chave aleatória" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Chave como o Pix espera: CPF/CNPJ só números, celular +55DDDNÚMERO, e-mail e aleatória em minúsculas.
function chavePix(tipo, valor, Erro = ErroValidacao) {
  const t = String(valor ?? "").trim();
  const d = t.replace(/\D/g, "");
  if (tipo === "cpf") {
    if (d.length !== 11) throw new Erro("Chave Pix: CPF tem 11 números.");
    return d;
  }
  if (tipo === "cnpj") {
    if (d.length !== 14) throw new Erro("Chave Pix: CNPJ tem 14 números.");
    return d;
  }
  if (tipo === "celular") {
    if (d.length === 10 || d.length === 11) return `+55${d}`;
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`;
    throw new Erro("Chave Pix: celular com DDD, como (11) 98765-4321.");
  }
  if (tipo === "email") {
    const e = t.toLowerCase();
    if (e.length > 77 || !EMAIL.test(e)) throw new Erro("Chave Pix: e-mail inválido.");
    return e;
  }
  if (tipo === "aleatoria") {
    const a = t.toLowerCase();
    if (!UUID.test(a)) throw new Erro("Chave Pix: a chave aleatória tem 32 letras e números com traços.");
    return a;
  }
  throw new Erro("Chave Pix: escolha o tipo da chave.");
}

// Chave para mostrar (PDF e WhatsApp): CPF, CNPJ e celular formatados.
function chaveParaMostrar(tipo, chave) {
  const c = String(chave ?? "");
  if (tipo === "cpf" && c.length === 11) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  if (tipo === "cnpj" && c.length === 14) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  if (tipo === "celular" && /^\+55\d{10,11}$/.test(c)) {
    const d = c.slice(3);
    return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return c;
}

// Nome e cidade no código: sem acentos e só letras, números, espaço, ponto e traço.
function textoPix(t, maximo) {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximo);
}

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o padrão.
function crc16(texto) {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(texto)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const campo = (id, valor) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

// pix: { chave (já no formato do Pix), nome, cidade }. valorCentavos: BigInt (0 = cliente digita o valor).
function codigoPix(pix, valorCentavos = 0n) {
  const nome = textoPix(pix.nome, 25);
  const cidade = textoPix(pix.cidade, 15);
  if (!pix.chave || !nome || !cidade) return "";
  const valor = valorCentavos > 0n ? `${valorCentavos / 100n}.${String(valorCentavos % 100n).padStart(2, "0")}` : "";
  const corpo =
    campo("00", "01") +
    campo("26", campo("00", "br.gov.bcb.pix") + campo("01", pix.chave)) +
    campo("52", "0000") +
    campo("53", "986") +
    (valor ? campo("54", valor) : "") +
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    campo("62", campo("05", "***")) +
    "6304";
  return corpo + crc16(corpo);
}

// Pix cadastrado e completo?
const pixPronto = (pix) => Boolean(pix?.chave && textoPix(pix.nome, 25) && textoPix(pix.cidade, 15));

// Mostrar no orçamento: sempre (se marcado) ou só quando a forma de pagamento tiver Pix.
const mostrarPixNoOrcamento = (pix, orcamento) => pixPronto(pix) && (pix.sempre === true || (orcamento?.formasPagamento ?? []).includes("pix"));

module.exports = { TIPOS_CHAVE, chaveParaMostrar, chavePix, codigoPix, crc16, mostrarPixNoOrcamento, pixPronto, textoPix };
