// Tela: liga os campos às regras de cálculo e mostra o resultado.
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
import { iniciarVisualizador } from "./viewer3d.js";

const $ = (id) => document.getElementById(id);

// Valores iniciais de exemplo (os mesmos da versão anterior).
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

// ---------- Tema ----------
function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;
  $("icone-tema").textContent = tema === "escuro" ? "☀" : "☾";
  try {
    localStorage.setItem("tema", tema);
  } catch {
    // Sem armazenamento disponível: o tema só vale nesta abertura.
  }
}

function temaSalvo() {
  try {
    return localStorage.getItem("tema");
  } catch {
    return null;
  }
}

$("alternar-tema").addEventListener("click", () => {
  aplicarTema(document.documentElement.dataset.theme === "escuro" ? "claro" : "escuro");
});

// ---------- Abas ----------
const abas = document.querySelectorAll(".aba");
abas.forEach((aba) => {
  aba.addEventListener("click", () => {
    abas.forEach((a) => {
      const ativa = a === aba;
      a.classList.toggle("ativa", ativa);
      a.setAttribute("aria-selected", String(ativa));
    });
    $("tela-calculadora").classList.toggle("oculta", aba.dataset.aba !== "calculadora");
    $("tela-visualizador").classList.toggle("oculta", aba.dataset.aba !== "visualizador");
    if (aba.dataset.aba === "visualizador") iniciarVisualizador();
  });
});

// ---------- Cálculo ----------
function percentual(parte, total) {
  if (total.compara(0) <= 0) return 0;
  return Math.min(100, (Number(parte.num) / Number(parte.den)) / (Number(total.num) / Number(total.den)) * 100);
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
  const lista = $("composicao");
  lista.replaceChildren(
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

function atualizarResultado() {
  const erro = $("erro");
  try {
    const entrada = lerEntrada();
    const resultado = calcular(entrada);

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
    if (e instanceof EntradaInvalida || e instanceof Error) {
      erro.textContent = e.message;
    } else {
      throw e;
    }
  }
}

function formatarPeso(racional) {
  return (Number(racional.num) / Number(racional.den)).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

// ---------- Lucro: campo e barra sincronizados ----------
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

// ---------- Ligações ----------
for (const id of Object.keys(PADROES)) {
  if (id === "lucro") continue;
  $(id).addEventListener("input", atualizarResultado);
}
$("lucro").addEventListener("input", () => {
  sincronizarLucro("campo");
  atualizarResultado();
});
$("lucro-barra").addEventListener("input", () => {
  sincronizarLucro("barra");
  atualizarResultado();
});

function preencherPadroes() {
  for (const [id, valor] of Object.entries(PADROES)) {
    $(id).value = valor;
  }
  sincronizarLucro("campo");
}

$("versao").textContent = `Versão ${__VERSAO__}`;
aplicarTema(temaSalvo() ?? (matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro"));
preencherPadroes();
atualizarResultado();
