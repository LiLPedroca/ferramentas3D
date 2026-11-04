// Número racional exato (numerador/denominador em BigInt).
// Usado para todo o cálculo de dinheiro: sem erro de ponto flutuante.
// Arredondamento para centavos só na exibição (paraReais).

function mdc(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

export class Racional {
  constructor(num, den = 1n) {
    if (den === 0n) throw new RangeError("denominador zero");
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = mdc(num, den) || 1n;
    this.num = num / g;
    this.den = den / g;
  }

  static de(valor) {
    if (valor instanceof Racional) return valor;
    if (typeof valor === "bigint") return new Racional(valor);
    if (typeof valor === "number" && Number.isInteger(valor)) return new Racional(BigInt(valor));
    throw new TypeError("use Racional, BigInt ou inteiro");
  }

  // Aceita "12,5", "12.5", "  3 ". Lança erro se não for número finito.
  static deTexto(texto) {
    const limpo = String(texto).trim().replace(",", ".");
    const m = /^(-?)(\d*)(?:\.(\d+))?$/.exec(limpo);
    if (!limpo || !m || (m[2] === "" && (m[3] === undefined || m[3] === ""))) {
      throw new Error(`Valor inválido: '${texto}'.`);
    }
    const inteiro = m[2] || "0";
    const frac = m[3] || "";
    const den = 10n ** BigInt(frac.length);
    const num = BigInt(inteiro + frac) * (m[1] ? -1n : 1n);
    return new Racional(num, den);
  }

  soma(outro) {
    const o = Racional.de(outro);
    return new Racional(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  subtrai(outro) {
    const o = Racional.de(outro);
    return new Racional(this.num * o.den - o.num * this.den, this.den * o.den);
  }

  multiplica(outro) {
    const o = Racional.de(outro);
    return new Racional(this.num * o.num, this.den * o.den);
  }

  divide(outro) {
    const o = Racional.de(outro);
    return new Racional(this.num * o.den, this.den * o.num);
  }

  compara(outro) {
    const o = Racional.de(outro);
    const diff = this.num * o.den - o.num * this.den;
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  }

  menorQue(outro) {
    return this.compara(outro) < 0;
  }

  // Teto (arredonda para cima até o inteiro).
  teto() {
    const q = this.num / this.den;
    return this.num % this.den > 0n ? q + 1n : q;
  }

  // Centavos inteiros, arredondando meio para cima (longe de zero, como no Decimal do Python).
  centavosArredondados() {
    const cent = new Racional(this.num * 100n, this.den);
    const abs = cent.num < 0n ? -cent.num : cent.num;
    const arred = (2n * abs + cent.den) / (2n * cent.den);
    return cent.num < 0n ? -arred : arred;
  }
}
