// Regras de negócio da calculadora de custo e preço de impressão 3D.
// Porte direto de app/core/calculadora.py (Python): mesmas fórmulas, mesma validação.
import { Racional } from "./racional.js";

export class EntradaInvalida extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "EntradaInvalida";
  }
}

const CAMPOS_NAO_NEGATIVOS = [
  "pesoG",
  "precoKg",
  "potenciaW",
  "horas",
  "tarifaKwh",
  "custoHoraImpressora",
  "maoDeObra",
  "lucroPct",
];

// Campos: todos Racional, exceto quantidade (inteiro >= 1) e lucroNaMaoDeObra (booleano; sem ele, true:
// o lucro vale também sobre a mão de obra, como sempre foi).
export function criarEntrada(campos) {
  const entrada = {};
  for (const nome of CAMPOS_NAO_NEGATIVOS) {
    const valor = Racional.de(campos[nome]);
    if (valor.menorQue(0)) throw new EntradaInvalida(`${nome} não pode ser negativo.`);
    entrada[nome] = valor;
  }
  const quantidade = campos.quantidade;
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new EntradaInvalida("A quantidade de peças deve ser um inteiro maior que zero.");
  }
  entrada.quantidade = quantidade;
  entrada.lucroNaMaoDeObra = campos.lucroNaMaoDeObra !== false;
  return entrada;
}

export function calcular(entrada) {
  const mil = Racional.de(1000n);
  const cem = Racional.de(100n);

  const filamento = entrada.pesoG.divide(mil).multiplica(entrada.precoKg);
  const energia = entrada.potenciaW.divide(mil).multiplica(entrada.horas).multiplica(entrada.tarifaKwh);
  const impressora = entrada.horas.multiplica(entrada.custoHoraImpressora);
  const custoLote = filamento.soma(energia).soma(impressora).soma(entrada.maoDeObra);
  // base do lucro: o custo todo, ou só os custos de produção (a mão de obra entra sem lucro)
  const baseDoLucro = entrada.lucroNaMaoDeObra === false ? custoLote.subtrai(entrada.maoDeObra) : custoLote;
  const lucroLote = baseDoLucro.multiplica(entrada.lucroPct.divide(cem));
  const precoLote = custoLote.soma(lucroLote);
  const qtd = Racional.de(BigInt(entrada.quantidade));

  return {
    filamento,
    energia,
    impressora,
    maoDeObra: entrada.maoDeObra,
    custoLote,
    baseDoLucro,
    lucroLote,
    precoLote,
    custoUnitario: custoLote.divide(qtd),
    precoUnitario: precoLote.divide(qtd),
    lucroUnitario: precoLote.divide(qtd).subtrai(custoLote.divide(qtd)),
  };
}

// Quantas peças vendidas pagam a impressora. Retorna null sem lucro positivo.
export function pecasParaPagarImpressora(valorImpressora, lucroPorPeca) {
  const valor = Racional.de(valorImpressora);
  if (valor.menorQue(0)) throw new EntradaInvalida("O valor da impressora não pode ser negativo.");
  const lucro = Racional.de(lucroPorPeca);
  if (lucro.compara(0) <= 0) return null;
  return valor.divide(lucro).teto();
}

// Texto digitado -> Racional, com mensagem em português se estiver errado.
export function lerNumero(texto, nome) {
  if (String(texto ?? "").trim() === "") throw new EntradaInvalida(`Preencha o campo: ${nome}.`);
  try {
    return Racional.deTexto(texto);
  } catch {
    throw new EntradaInvalida(`Valor inválido em ${nome}: '${texto}'.`);
  }
}

export function lerInteiro(texto, nome) {
  const limpo = String(texto ?? "").trim();
  if (!/^\d+$/.test(limpo)) throw new EntradaInvalida(`${nome} deve ser um número inteiro.`);
  return Number(limpo);
}

// Racional -> "R$ 1.234,56" (arredonda para centavos, meio para cima).
export function formatarReais(valor) {
  const cent = Racional.de(valor).centavosArredondados();
  const negativo = cent < 0n;
  const abs = negativo ? -cent : cent;
  const reais = (abs / 100n).toString();
  const centavos = (abs % 100n).toString().padStart(2, "0");
  const grupos = [];
  let r = reais;
  while (r.length > 3) {
    grupos.unshift(r.slice(-3));
    r = r.slice(0, -3);
  }
  grupos.unshift(r);
  return `${negativo ? "-" : ""}R$ ${grupos.join(".")},${centavos}`;
}
