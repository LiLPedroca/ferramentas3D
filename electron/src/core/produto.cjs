// Modelo de produto: normalização e validação.
// Em CommonJS porque roda nos dois lados: no processo principal (que grava o arquivo)
// e na tela (empacotado pelo esbuild). O processo principal sempre valida de novo.
"use strict";

const LIMITES = {
  nome: 120,
  categoria: 60,
  observacoes: 300,
  foto: 400_000, // tamanho do data URI (a tela reduz a imagem antes)
  produtos: 5_000,
  centavos: 99_999_999_99n, // R$ 99.999.999,99
  medida: 99_999,
};

const { ErroValidacao } = require("./validacao.cjs");
const { validarCalculo } = require("./calculo-salvo.cjs");

class ProdutoInvalido extends ErroValidacao {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ProdutoInvalido";
  }
}

const CONTROLE = /[\x00-\x1f\x7f]/;

function texto(valor, nome, maximo, { obrigatorio = false } = {}) {
  const limpo = String(valor ?? "").trim().replace(/\s+/g, " ");
  if (obrigatorio && !limpo) throw new ProdutoInvalido(`Preencha o campo: ${nome}.`);
  if (limpo.length > maximo) throw new ProdutoInvalido(`${nome}: use no máximo ${maximo} caracteres.`);
  if (CONTROLE.test(limpo)) throw new ProdutoInvalido(`${nome}: há caracteres inválidos.`);
  return limpo;
}

// "1.234,56", "1234,5", "1234.56", "R$ 12" -> "123456" (centavos, em texto).
// Vazio devolve "" quando o campo não é obrigatório.
function centavosDeTexto(valor, nome = "Preço", { obrigatorio = false } = {}) {
  let t = String(valor ?? "").replace(/R\$/i, "").replace(/\s/g, "");
  if (!t) {
    if (obrigatorio) throw new ProdutoInvalido(`Preencha o campo: ${nome}.`);
    return "";
  }
  let inteiro;
  let frac = "";
  let m;
  if ((m = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(t))) {
    inteiro = m[1].replace(/\./g, "");
    frac = m[2] ?? "";
  } else if ((m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(t))) {
    inteiro = m[1];
    frac = m[2] ?? "";
  } else {
    throw new ProdutoInvalido(`${nome}: use um valor como 25,90.`);
  }
  const centavos = BigInt(inteiro) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  if (centavos > LIMITES.centavos) throw new ProdutoInvalido(`${nome}: valor muito alto.`);
  return centavos.toString();
}

// Medida opcional (g ou mm): até 2 casas decimais. Guarda com ponto: "12.5".
function medidaDeTexto(valor, nome) {
  const t = String(valor ?? "").trim().replace(",", ".");
  if (!t) return "";
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t) || Number(t) > LIMITES.medida) {
    throw new ProdutoInvalido(`${nome}: use um número positivo, como 12,5.`);
  }
  return String(Number(t));
}

const FOTO = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

function validarCusto(custo) {
  if (custo === undefined) return undefined;
  if (
    !custo ||
    typeof custo !== "object" ||
    !/^\d{1,13}$/.test(String(custo.custoUnitarioCentavos)) ||
    !/^\d{1,7}(\.\d{1,4})?$/.test(String(custo.lucroPct)) ||
    typeof custo.data !== "string" ||
    Number.isNaN(Date.parse(custo.data))
  ) {
    throw new ProdutoInvalido("Custo vindo da calculadora inválido.");
  }
  const r = {
    custoUnitarioCentavos: String(custo.custoUnitarioCentavos),
    lucroPct: String(custo.lucroPct),
    data: custo.data,
  };
  if (custo.calculo) r.calculo = validarCalculo(custo.calculo);
  return r;
}

// Confere um produto já gravado (ou prestes a ser gravado). Lança ProdutoInvalido.
function validarProduto(p) {
  if (!p || typeof p !== "object") throw new ProdutoInvalido("Produto inválido.");
  if (typeof p.id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(p.id)) throw new ProdutoInvalido("Identificador inválido.");
  texto(p.nome, "Nome", LIMITES.nome, { obrigatorio: true });
  texto(p.categoria, "Categoria", LIMITES.categoria);
  texto(p.observacoes, "Observações", LIMITES.observacoes);
  if (!/^\d{1,13}$/.test(String(p.precoCentavos)) || BigInt(p.precoCentavos) > LIMITES.centavos) {
    throw new ProdutoInvalido("Preço inválido.");
  }
  for (const [chave, nome] of [["pesoG", "Peso"], ["alturaMm", "Altura"], ["larguraMm", "Largura"], ["comprimentoMm", "Comprimento"]]) {
    if (typeof p[chave] !== "string") throw new ProdutoInvalido(`${nome} inválido.`);
    medidaDeTexto(p[chave], nome);
  }
  if (p.foto !== undefined && (typeof p.foto !== "string" || p.foto.length > LIMITES.foto || !FOTO.test(p.foto))) {
    throw new ProdutoInvalido("Foto inválida ou muito grande. Escolha outra imagem.");
  }
  validarCusto(p.custo);
  for (const data of [p.criadoEm, p.atualizadoEm]) {
    if (typeof data !== "string" || Number.isNaN(Date.parse(data))) throw new ProdutoInvalido("Data inválida.");
  }
  return p;
}

// Monta um produto a partir dos campos do formulário.
// valores: { nome, categoria, preco, pesoG, alturaMm, larguraMm, comprimentoMm, observacoes, foto, removerFoto, custo }
function montarProduto(valores, { id, anterior, agora = new Date().toISOString() }) {
  const v = valores ?? {};
  const produto = {
    id,
    nome: texto(v.nome, "Nome", LIMITES.nome, { obrigatorio: true }),
    categoria: texto(v.categoria, "Categoria", LIMITES.categoria),
    precoCentavos: centavosDeTexto(v.preco, "Preço de venda", { obrigatorio: true }),
    pesoG: medidaDeTexto(v.pesoG, "Peso"),
    alturaMm: medidaDeTexto(v.alturaMm, "Altura"),
    larguraMm: medidaDeTexto(v.larguraMm, "Largura"),
    comprimentoMm: medidaDeTexto(v.comprimentoMm, "Comprimento"),
    observacoes: texto(v.observacoes, "Observações", LIMITES.observacoes),
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };

  // Foto: nova substitui; "removerFoto" apaga; sem nada, mantém a anterior.
  if (typeof v.foto === "string" && v.foto) produto.foto = v.foto;
  else if (!v.removerFoto && anterior?.foto) produto.foto = anterior.foto;

  const custo = v.custo !== undefined ? v.custo : anterior?.custo;
  if (custo) produto.custo = validarCusto(custo);

  return validarProduto(produto);
}

module.exports = { LIMITES, ProdutoInvalido, centavosDeTexto, medidaDeTexto, montarProduto, validarProduto };
