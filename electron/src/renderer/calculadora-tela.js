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
import { carregarFilamentos, descontarDoRolo, listaDeRolos, nomeDoRolo, precoKgDoRolo } from "./filamentos-tela.js";
import { adicionarItemDoCalculo } from "./orcamentos.js";
import { aoMudarConfig, confirmar, estado, irPara, mostrarAviso, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);

// Campos da tela e valores iniciais (os custos vêm de Configurações > Dados da calculadora).
const CAMPOS = ["peso", "quantidade", "preco-kg", "horas", "minutos", "potencia", "tarifa", "custo-hora", "mao-obra", "lucro"];
const reaisCampo = (t) => Number(t).toFixed(2).replace(".", ",");
const numeroCampo = (t) => String(t).replace(".", ",");

function padroes() {
  const k = estado.config.calculadora ?? {};
  return {
    peso: "0",
    quantidade: "1",
    horas: "0",
    minutos: "0",
    "preco-kg": reaisCampo(k.precoKg ?? "100"),
    potencia: numeroCampo(k.potenciaW ?? "200"),
    tarifa: reaisCampo(k.tarifaKwh ?? "0.9"),
    "custo-hora": reaisCampo(k.custoHora ?? "2"),
    "mao-obra": reaisCampo(k.maoDeObra ?? "15"),
    lucro: numeroCampo(k.lucroPct ?? "100"),
  };
}

let usuarioMexeu = false; // os padrões só entram sozinhos antes de o usuário digitar

let ultimoCalculo = null; // { entrada, resultado } do último cálculo válido
let nomeDoModelo = ""; // quando o peso veio de um modelo personalizado (chaveiro, palavras)

// Chamado pelos modelos personalizados: abre a calculadora com o peso estimado de uma peça.
// tempoMin (opcional): tempo de impressão já conhecido (ex.: guardado em Minhas Impressões).
export function preencherDoModelo({ nome, pesoG, detalhe, tempoMin }) {
  nomeDoModelo = nome;
  usuarioMexeu = true;
  $("calc-nome").value = nome;
  $("peso").value = (Math.round(pesoG * 10) / 10).toLocaleString("pt-BR");
  $("quantidade").value = "1";
  if (tempoMin) {
    $("horas").value = String(Math.floor(tempoMin / 60));
    $("minutos").value = String(tempoMin % 60);
  }
  $("origem-calculo").textContent = tempoMin
    ? `Peso e tempo de "${nome}"${detalhe ? ` (${detalhe})` : ""}.`
    : `Peso estimado de "${nome}"${detalhe ? `: ${detalhe}` : ""}. Preencha o tempo de impressão que o fatiador mostrar.`;
  $("origem-calculo").hidden = false;
  irPara("calculadora");
  atualizarResultado();
}

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
    lucroNaMaoDeObra: $("lucro-mao-obra").checked,
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

    // Quanto custou a impressora: vem das Configurações (Dados da calculadora).
    const valorImpressora = estado.config.calculadora?.valorImpressora ?? "";
    let pecas = "—";
    if (valorImpressora !== "") {
      const p = pecasParaPagarImpressora(Racional.deTexto(valorImpressora), resultado.lucroUnitario);
      pecas = p === null ? "Sem lucro por peça" : `${p} peças`;
    }
    $("bloco-pecas-pagar").hidden = valorImpressora === "";

    erro.textContent = "";
    $("preco-unitario").textContent = formatarReais(resultado.precoUnitario);
    $("preco-lote-texto").textContent =
      `por peça · lote de ${entrada.quantidade} peça(s): ${formatarReais(resultado.precoLote)}`;
    $("custo-unitario").textContent = formatarReais(resultado.custoUnitario);
    $("lucro-unitario").textContent = formatarReais(resultado.lucroUnitario);
    $("valor-unitario").textContent = formatarReais(resultado.valorUnitario);
    $("pecas-pagar").textContent = pecas;
    $("custo-lote").textContent = formatarReais(resultado.custoLote);
    const pct = comoNumero(entrada.lucroPct).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    $("lucro-texto").textContent = `Lucro (${pct}% sobre ${formatarReais(resultado.baseDoLucro)}${entrada.lucroNaMaoDeObra ? "" : ", sem a mão de obra"})`;
    $("lucro-lote").textContent = `+ ${formatarReais(resultado.lucroLote)}`;
    $("preco-lote").textContent = formatarReais(resultado.precoLote);
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

// Cópia do cálculo (valores e parâmetros de agora), guardada no produto, no orçamento e na venda.
function copiaDoCalculo() {
  const { entrada, resultado } = ultimoCalculo;
  const cent = (r) => r.centavosArredondados().toString();
  return {
    pesoG: decimalCurto(entrada.pesoG),
    quantidade: entrada.quantidade,
    precoKg: decimalCurto(entrada.precoKg),
    horas: decimalCurto(entrada.horas),
    potenciaW: decimalCurto(entrada.potenciaW),
    tarifaKwh: decimalCurto(entrada.tarifaKwh),
    custoHora: decimalCurto(entrada.custoHoraImpressora),
    maoDeObra: decimalCurto(entrada.maoDeObra),
    lucroPct: decimalCurto(entrada.lucroPct),
    lucroNaMaoDeObra: entrada.lucroNaMaoDeObra,
    custosCentavos: {
      filamento: cent(resultado.filamento),
      energia: cent(resultado.energia),
      impressora: cent(resultado.impressora),
      maoDeObra: cent(resultado.maoDeObra),
      total: cent(resultado.custoLote),
    },
    data: new Date().toISOString(),
  };
}

function nomeDoCalculo() {
  return $("calc-nome").value.trim() || nomeDoModelo || "";
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
    nome: nomeDoCalculo() || undefined,
    preco: formatarReais(new Racional(precoCent, 100n)).replace("R$ ", ""),
    pesoG: peso > 0 ? String(peso).replace(".", ",") : "",
    custo: {
      custoUnitarioCentavos: resultado.custoUnitario.centavosArredondados().toString(),
      lucroPct: decimalCurto(entrada.lucroPct),
      data: new Date().toISOString(),
      calculo: copiaDoCalculo(),
    },
  });
}

// Leva o cálculo para o orçamento em andamento, como um item com a quantidade do lote.
function adicionarAoOrcamento() {
  if (!ultimoCalculo) {
    mostrarAviso("Corrija os campos da calculadora antes de adicionar.");
    return;
  }
  const { entrada, resultado } = ultimoCalculo;
  adicionarItemDoCalculo({
    descricao: nomeDoCalculo() || "Peça impressa",
    quantidade: entrada.quantidade,
    precoUnitarioCentavos: resultado.precoUnitario.centavosArredondados().toString(),
    custoUnitarioCentavos: resultado.custoUnitario.centavosArredondados().toString(),
    calculo: copiaDoCalculo(),
  });
}

function novoCalculo() {
  for (const [id, valor] of Object.entries(padroes())) $(id).value = valor;
  $("calc-nome").value = "";
  $("rolo-calc").value = "";
  $("descontar-rolo").hidden = true;
  $("origem-calculo").hidden = true;
  nomeDoModelo = "";
  usuarioMexeu = false;
  sincronizarLucro("campo");
  atualizarResultado();
}

// ---------- Rolo do estoque ----------
// Lista os rolos cadastrados; escolher um preenche o preço por kg (preço do rolo ÷ peso do rolo) e
// libera "Descontar do rolo". Sem rolo escolhido vale o preço de Configurações.
async function atualizarRolos() {
  const rolos = await carregarFilamentos();
  const atual = $("rolo-calc").value;
  $("campo-rolo").hidden = rolos.length === 0;
  $("rolo-calc").replaceChildren(
    new Option("Usar o preço de Configurações", ""),
    ...rolos.map((f) => new Option(`${nomeDoRolo(f)} · ${precoKgDoRolo(f).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/kg · restam ${Math.round(f.restanteG)} g`, f.id)),
  );
  if (rolos.some((f) => f.id === atual)) $("rolo-calc").value = atual;
  mostrarBotaoDescontar();
}

function roloEscolhido() {
  return listaDeRolos().find((f) => f.id === $("rolo-calc").value) ?? null;
}

function mostrarBotaoDescontar() {
  const f = roloEscolhido();
  $("descontar-rolo").hidden = !f;
  if (f) $("descontar-rolo").textContent = `Descontar ${$("peso").value || 0} g do rolo ${nomeDoRolo(f)}`;
}

function escolherRolo() {
  const f = roloEscolhido();
  if (f) $("preco-kg").value = precoKgDoRolo(f).toFixed(2).replace(".", ",");
  else $("preco-kg").value = Number(estado.config.calculadora?.precoKg ?? 100).toFixed(2).replace(".", ",");
  atualizarResultado();
  mostrarBotaoDescontar();
}

async function descontarDoLote() {
  const f = roloEscolhido();
  if (!f || !ultimoCalculo) return;
  const g = comoNumero(ultimoCalculo.entrada.pesoG);
  if (!(g > 0)) {
    mostrarAviso("Informe o peso do lote antes de descontar.");
    return;
  }
  const texto = `${g.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g saem do rolo ${nomeDoRolo(f)} (restam ${Math.round(f.restanteG)} g).`;
  if (!(await confirmar({ titulo: "Descontar do estoque?", texto, botao: "Descontar" }))) return;
  await descontarDoRolo(f.id, g);
  await atualizarRolos();
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

const CHAVE_MAO_DE_OBRA = "calculadora-lucro-mao-de-obra";

export function iniciarCalculadora() {
  // última escolha da caixinha (padrão: desligada, a mão de obra entra sem lucro)
  try {
    $("lucro-mao-obra").checked = localStorage.getItem(CHAVE_MAO_DE_OBRA) === "1";
  } catch {
    $("lucro-mao-obra").checked = false;
  }
  $("lucro-mao-obra").addEventListener("change", () => {
    try {
      localStorage.setItem(CHAVE_MAO_DE_OBRA, $("lucro-mao-obra").checked ? "1" : "0");
    } catch {
      // sem armazenamento: vale só nesta abertura
    }
    atualizarResultado();
  });
  for (const id of CAMPOS) {
    if (id !== "lucro") $(id).addEventListener("input", atualizarResultado);
    $(id).addEventListener("input", () => {
      usuarioMexeu = true;
    });
  }
  $("calc-nome").addEventListener("input", () => {
    usuarioMexeu = true;
  });
  $("lucro").addEventListener("input", () => {
    sincronizarLucro("campo");
    atualizarResultado();
  });
  $("lucro-barra").addEventListener("input", () => {
    sincronizarLucro("barra");
    atualizarResultado();
  });
  $("salvar-como-produto").addEventListener("click", salvarComoProduto);
  $("adicionar-ao-orcamento").addEventListener("click", adicionarAoOrcamento);
  $("novo-calculo").addEventListener("click", novoCalculo);
  // Configurações carregadas (ou alteradas): aplica os padrões se nada foi digitado ainda.
  aoMudarConfig(() => {
    if (!usuarioMexeu) novoCalculo();
    else atualizarResultado();
  });
  $("rolo-calc").addEventListener("change", escolherRolo);
  $("peso").addEventListener("input", mostrarBotaoDescontar);
  $("descontar-rolo").addEventListener("click", descontarDoLote);
  registrarAoAbrir("calculadora", atualizarRolos);
  atualizarRolos();

  novoCalculo();
}
