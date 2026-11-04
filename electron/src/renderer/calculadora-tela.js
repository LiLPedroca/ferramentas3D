// Tela da Calculadora 3D: liga os campos às regras de cálculo e mostra o resultado.
import {
  calcular,
  criarEntrada,
  EntradaInvalida,
  formatarReais,
  lerInteiro,
  lerNumero,
  pecasParaPagarImpressora,
} from "../core/calculadora.js";
import { Racional } from "../core/racional.js";
import { abrirEditor } from "./produtos.js";
import { irPara, mostrarAviso } from "./shell.js";

const $ = (id) => document.getElementById(id);

// Valores iniciais de exemplo.
const PADROES = {
  peso: "0",
  quantidade: "1",
  "preco-kg": "100",
  horas: "0",
  minutos: "0",
  potencia: "200",
  tarifa: "0,90",
  "custo-hora": "1",
  "mao-obra": "15",
  lucro: "100",
  "valor-impressora": "",
};

let ultimoCalculo = null; // { entrada, resultado } do último cálculo válido

const comoNumero = (r) => Number(r.num) / Number(r.den);

function percentual(parte, total) {
  if (total.compara(0) <= 0) return 0;
  return Math.min(100, (comoNumero(parte) / comoNumero(total)) * 100);
}

function lerTempoHoras() {
  const h = lerInteiro($("horas").value.trim() === "" ? "0" : $("horas").value, "Horas");
  const m = lerInteiro($("minutos").value.trim() === "" ? "0" : $("minutos").value, "Minutos");
  if (m > 59) throw new EntradaInvalida("Minutos devem ficar entre 0 e 59.");
  return new Racional(BigInt(h) * 60n + BigInt(m), 60n);
}

function lerEntrada() {
  const quantidade = lerInteiro($("quantidade").value, "Quantidade de peças");
  return criarEntrada({
    pesoG: lerNumero($("peso").value, "Peso total do lote (g)"),
    precoKg: lerNumero($("preco-kg").value, "Preço do filamento (R$/kg)"),
    potenciaW: lerNumero($("potencia").value, "Consumo da impressora (W)"),
    horas: lerTempoHoras(),
    tarifaKwh: lerNumero($("tarifa").value, "Tarifa de energia (R$/kWh)"),
    custoHoraImpressora: lerNumero($("custo-hora").value, "Uso da impressora por hora (R$/h)"),
    maoDeObra: lerNumero($("mao-obra").value, "Mão de obra do lote (R$)"),
    lucroPct: lerNumero($("lucro").value, "Lucro sobre o custo (%)"),
    quantidade,
  });
}

function mostrarComposicao(resultado) {
  const itens = [
    ["Filamento", resultado.filamento],
    ["Energia", resultado.energia],
    ["Impressora", resultado.impressora],
    ["Mão de obra", resultado.maoDeObra],
  ];
  $("composicao").replaceChildren(
    ...itens.map(([nome, valor]) => {
      const li = document.createElement("li");
      const rotulo = document.createElement("span");
      rotulo.textContent = nome;
      const trilho = document.createElement("div");
      trilho.className = "trilho";
      const barra = document.createElement("div");
      barra.className = "barra";
      barra.style.width = `${percentual(valor, resultado.custoLote).toFixed(1)}%`;
      trilho.append(barra);
      const numero = document.createElement("span");
      numero.className = "valor";
      numero.textContent = formatarReais(valor);
      li.append(rotulo, trilho, numero);
      return li;
    }),
  );
}

function formatarPeso(racional) {
  return comoNumero(racional).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function atualizarResultado() {
  const erro = $("erro");
  ultimoCalculo = null;
  try {
    const entrada = lerEntrada();
    const resultado = calcular(entrada);
    ultimoCalculo = { entrada, resultado };

    const textoValorImpressora = $("valor-impressora").value.trim();
    let pecas = "—";
    if (textoValorImpressora !== "") {
      const valorImpressora = lerNumero(textoValorImpressora, "Valor da impressora (R$)");
      const p = pecasParaPagarImpressora(valorImpressora, resultado.lucroUnitario);
      pecas = p === null ? "Sem lucro por peça" : `${p} peças`;
    }

    erro.textContent = "";
    $("preco-unitario").textContent = formatarReais(resultado.precoUnitario);
    $("preco-lote-texto").textContent =
      `por peça · lote de ${entrada.quantidade} peça(s): ${formatarReais(resultado.precoLote)}`;
    $("custo-unitario").textContent = formatarReais(resultado.custoUnitario);
    $("lucro-unitario").textContent = formatarReais(resultado.lucroUnitario);
    $("pecas-pagar").textContent = pecas;
    $("custo-lote").textContent = formatarReais(resultado.custoLote);
    mostrarComposicao(resultado);

    const pesoPorPeca = entrada.pesoG.divide(Racional.de(BigInt(entrada.quantidade)));
    $("ajuda-peso").textContent = `${formatarPeso(pesoPorPeca)} g por peça`;
  } catch (e) {
    erro.textContent = e instanceof Error ? e.message : String(e);
  }
}

// Racional -> texto decimal com até 4 casas, ponto como separador ("12.5").
function decimalCurto(r) {
  return String(Number(comoNumero(r).toFixed(4)));
}

// Abre o cadastro de produto já preenchido com o resultado da calculadora.
function salvarComoProduto() {
  if (!ultimoCalculo) {
    mostrarAviso("Corrija os campos da calculadora antes de salvar.");
    return;
  }
  const { entrada, resultado } = ultimoCalculo;
  const precoCent = resultado.precoUnitario.centavosArredondados();
  const pesoPeca = entrada.pesoG.divide(Racional.de(BigInt(entrada.quantidade)));
  const peso = Number(comoNumero(pesoPeca).toFixed(2));

  irPara("produtos");
  abrirEditor(undefined, {
    preco: formatarReais(new Racional(precoCent, 100n)).replace("R$ ", ""),
    pesoG: peso > 0 ? String(peso).replace(".", ",") : "",
    custo: {
      custoUnitarioCentavos: resultado.custoUnitario.centavosArredondados().toString(),
      lucroPct: decimalCurto(entrada.lucroPct),
      data: new Date().toISOString(),
    },
  });
}

// Campo de lucro e barra deslizante sincronizados.
function sincronizarLucro(origem) {
  const campo = $("lucro");
  const barra = $("lucro-barra");
  if (origem === "barra") {
    campo.value = barra.value;
  } else {
    const n = Number(campo.value.replace(",", "."));
    barra.value = Number.isFinite(n) ? String(Math.max(0, Math.min(100, Math.round(n)))) : "0";
  }
}

export function iniciarCalculadora() {
  for (const id of Object.keys(PADROES)) {
    if (id !== "lucro") $(id).addEventListener("input", atualizarResultado);
  }
  $("lucro").addEventListener("input", () => {
    sincronizarLucro("campo");
    atualizarResultado();
  });
  $("lucro-barra").addEventListener("input", () => {
    sincronizarLucro("barra");
    atualizarResultado();
  });
  $("salvar-como-produto").addEventListener("click", salvarComoProduto);

  for (const [id, valor] of Object.entries(PADROES)) $(id).value = valor;
  sincronizarLucro("campo");
  atualizarResultado();
}
