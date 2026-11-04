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
import { FERRAMENTAS } from "../core/ferramentas.js";
import { contarFerramentas, filtrarFerramentas, saudacao } from "../core/inicio.js";
import { icone } from "./icones.js";
import { abrirEditor, carregarProdutos, iniciarProdutos } from "./produtos.js";
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

// ---------- Navegação entre telas ----------
const TELAS = {
  inicio: { elemento: "tela-inicio", titulo: "" },
  calculadora: { elemento: "tela-calculadora", titulo: "Calculadora 3D" },
  visualizador: { elemento: "tela-visualizador", titulo: "Visualizar 3D" },
  produtos: { elemento: "tela-produtos", titulo: "Produtos" },
};

function irPara(tela) {
  if (!TELAS[tela]) tela = "inicio";
  for (const [nome, info] of Object.entries(TELAS)) {
    $(info.elemento).classList.toggle("oculta", nome !== tela);
  }
  $("trilha").hidden = tela === "inicio";
  $("titulo-tela").textContent = TELAS[tela].titulo;
  if (tela === "inicio") atualizarSaudacao();
  if (tela === "visualizador") iniciarVisualizador();
  if (tela === "produtos") carregarProdutos();
  $(TELAS[tela].elemento).scrollTop = 0;
}
window.irPara = irPara; // usado também pelo modo de captura de tela dos testes

$("ir-inicio").addEventListener("click", () => irPara("inicio"));
$("voltar").addEventListener("click", () => irPara("inicio"));
$("atalho-calculadora").addEventListener("click", () => irPara("calculadora"));

// Ctrl+K: volta ao início e foca a busca. Esc na busca limpa o texto.
document.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
    ev.preventDefault();
    irPara("inicio");
    $("busca").focus();
    $("busca").select();
  }
});

// ---------- Tela inicial ----------
let filtroAtual = "todas";
let temporizadorAviso = null;

function mostrarAviso(texto) {
  const aviso = $("aviso");
  aviso.textContent = texto;
  aviso.classList.add("visivel");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.remove("visivel"), 2600);
}

function atualizarSaudacao() {
  $("saudacao").textContent = saudacao(new Date().getHours());
}

function classeCategoria(categoria) {
  return `cat-${categoria.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`;
}

function criarElemento(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function cartaoPronto(f) {
  const cartao = criarElemento("button", `cartao-ferramenta ${classeCategoria(f.categoria)}`);
  cartao.type = "button";
  cartao.setAttribute("aria-label", `Abrir ${f.titulo}`);

  const topo = criarElemento("div", "ferramenta-topo");
  const icon = criarElemento("span", "ferramenta-icone");
  icon.innerHTML = icone(f.id, 24);
  topo.append(icon, criarElemento("span", "selo selo-pronta", "Disponível"));

  const rodape = criarElemento("div", "ferramenta-rodape");
  const abrir = criarElemento("span", "abrir", "Abrir ");
  abrir.insertAdjacentHTML("beforeend", icone("seta", 16));
  rodape.append(criarElemento("span", "categoria", f.categoria), abrir);

  cartao.append(topo, criarElemento("h3", "", f.titulo), criarElemento("p", "", f.descricao), rodape);
  cartao.addEventListener("click", () => irPara(f.tela));
  return cartao;
}

function cartaoEmBreve(f) {
  const cartao = criarElemento("button", `cartao-breve ${classeCategoria(f.categoria)}`);
  cartao.type = "button";
  cartao.setAttribute("aria-label", `${f.titulo}, em breve`);

  const icon = criarElemento("span", "ferramenta-icone");
  icon.innerHTML = icone(f.id, 20);

  const texto = criarElemento("span", "breve-texto");
  const titulo = criarElemento("span", "breve-titulo");
  titulo.append(criarElemento("span", "", f.titulo), criarElemento("span", "selo selo-breve", "Em breve"));
  texto.append(titulo, criarElemento("span", "breve-descricao", f.descricao));

  cartao.append(icon, texto);
  cartao.addEventListener("click", () =>
    mostrarAviso(`${f.titulo} está em desenvolvimento e chega por uma atualização.`),
  );
  return cartao;
}

function renderizarFerramentas() {
  const lista = filtrarFerramentas(FERRAMENTAS, { filtro: filtroAtual, busca: $("busca").value });
  const prontas = lista.filter((f) => f.disponivel);
  const emBreve = lista.filter((f) => !f.disponivel);

  $("grade-disponiveis").replaceChildren(...prontas.map(cartaoPronto));
  $("grade-em-breve").replaceChildren(...emBreve.map(cartaoEmBreve));
  $("secao-disponiveis").hidden = prontas.length === 0;
  $("secao-em-breve").hidden = emBreve.length === 0;
  $("vazio").hidden = lista.length > 0;
}

function iniciarHome() {
  const contagem = contarFerramentas(FERRAMENTAS);
  $("qtd-disponiveis").textContent = contagem.disponiveis;
  $("qtd-em-breve").textContent = contagem.emBreve;
  $("versao-resumo").textContent = __VERSAO__;
  $("cont-todas").textContent = contagem.total;
  $("cont-disponiveis").textContent = contagem.disponiveis;
  $("cont-em-breve").textContent = contagem.emBreve;

  document.querySelectorAll(".filtro").forEach((botao) => {
    botao.addEventListener("click", () => {
      filtroAtual = botao.dataset.filtro;
      document.querySelectorAll(".filtro").forEach((b) => {
        const ativo = b === botao;
        b.classList.toggle("ativo", ativo);
        b.setAttribute("aria-pressed", String(ativo));
      });
      renderizarFerramentas();
    });
  });

  $("busca").addEventListener("input", renderizarFerramentas);
  $("busca").addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      $("busca").value = "";
      renderizarFerramentas();
    }
  });

  atualizarSaudacao();
  renderizarFerramentas();
}

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

let ultimoCalculo = null; // { entrada, resultado } do último cálculo válido

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
    if (e instanceof EntradaInvalida || e instanceof Error) {
      erro.textContent = e.message;
    } else {
      throw e;
    }
  }
}

// Racional -> texto decimal com até 4 casas, ponto como separador ("12.5").
function decimalCurto(r) {
  return String(Number((Number(r.num) / Number(r.den)).toFixed(4)));
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
  const peso = Number((Number(pesoPeca.num) / Number(pesoPeca.den)).toFixed(2));

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
$("salvar-como-produto").addEventListener("click", salvarComoProduto);

preencherPadroes();
atualizarResultado();
iniciarHome();
iniciarProdutos({ avisar: mostrarAviso, irPara });
irPara("inicio");
