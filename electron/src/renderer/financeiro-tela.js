// Gestão financeira: painel (indicadores, gráfico, vendas, registros, checklist), vendas abertas
// em abas internas, pagamentos e a revisão de orçamentos antigos.
import fin from "../core/financeiro.cjs";
import modeloOrcamento from "../core/orcamento.cjs";
import { FORMAS, abrirSecaoConfig, chavesMarcadas, marcarChaves, montarChaves } from "./configuracoes-tela.js";
import { abrirSeletorFatiador } from "./fatiador-ui.js";
import { icone } from "./icones.js";
import { confirmar, estado, irPara, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { el } from "./util-tela.js";

const { ROTULOS_FORMA, ROTULOS_PRODUCAO, ROTULOS_SITUACAO, diaLocal, lucroVenda, orcamentosSemVenda, periodoDe, recebido, restante, resumoFinanceiro, situacaoVenda } = fin;
const { calcularTotais, valorSinal, centavosParaTexto } = modeloOrcamento;

const $ = (id) => document.getElementById(id);

let vendas = [];
let despesas = [];
let orcamentos = [];
let abertas = []; // ids das vendas abertas em abas
let abaAtual = "geral";

// ---------- Formatação ----------
function reais(c) {
  const v = BigInt(c);
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? "-" : ""}R$ ${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(a % 100n).toString().padStart(2, "0")}`;
}
const dataBr = (dia) => (dia ? dia.split("-").reverse().join("/") : "");
const formasTexto = (lista) => lista.map((f) => ROTULOS_FORMA[f]).join(", ");
// Vendas e orçamentos de teste: numeração própria e fora dos números do painel.
const numeroOrc = (n, teste = false) => `${teste ? "teste " : ""}#${String(n).padStart(4, "0")}`;
const naoTeste = (v) => v.teste !== true;

// ---------- Dados ----------
async function carregar() {
  const [rf, ro] = await Promise.all([window.dados.financeiro.listar(), window.dados.orcamentos.listar()]);
  if (!rf.ok) {
    $("erro-financeiro").textContent = rf.erro;
    return false;
  }
  $("erro-financeiro").textContent = "";
  ({ vendas, despesas } = rf.dados);
  orcamentos = ro.ok ? ro.dados : [];
  abertas = abertas.filter((id) => vendas.some((v) => v.id === id));
  if (abaAtual !== "geral" && !abertas.includes(abaAtual)) abaAtual = "geral";
  return true;
}

export async function contarRevisoes() {
  const [rf, ro] = await Promise.all([window.dados.financeiro.listar(), window.dados.orcamentos.listar()]);
  if (!rf.ok || !ro.ok) return 0;
  return orcamentosSemVenda(ro.dados, rf.dados.vendas).length;
}

// ---------- Painel ----------
function cartao(titulo, valor, extra, destino, classe = "") {
  const c = el("button", `fin-cartao ${classe}`.trim());
  c.type = "button";
  c.append(el("span", "fin-cartao-titulo", titulo), el("strong", "", valor));
  if (extra) c.append(el("span", "ajuda", extra));
  c.append(el("span", "fin-cartao-link", "Ver detalhes →"));
  c.addEventListener("click", () => $(destino)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  return c;
}

function renderizarPainel() {
  const hoje = diaLocal();
  const periodo = periodoDe($("fin-periodo").value, hoje);
  const r = resumoFinanceiro(vendas, despesas, periodo);

  $("fin-cartoes").replaceChildren(
    cartao("Vendas", reais(r.vendas), "", "fin-bloco-vendas"),
    cartao("Recebido", reais(r.recebido), "", "fin-bloco-registros"),
    cartao("Despesas", reais(r.despesas), "", "fin-bloco-registros"),
    cartao("A receber", reais(r.aReceber), "", "fin-bloco-pendentes"),
    cartao("Lucro das vendas", r.lucro === null ? "—" : reais(r.lucro), r.lucro === null ? "Custos não informados" : "", "fin-bloco-vendas", r.lucro !== null && r.lucro < 0n ? "negativo" : ""),
  );
  $("fin-nota").textContent =
    `Recebido e despesas respeitam o período. A receber considera todo o histórico até ${dataBr(hoje)}. ` +
    `Lucro usa os custos preservados nas vendas; ${r.vendasSemCusto} venda(s) sem custos ficaram de fora.`;
  $("fin-caixa").textContent = `Recebido: ${reais(r.recebido)} · Despesas: ${reais(r.despesas)} · Saldo de caixa: ${reais(r.caixa)}`;

  desenharGrafico(r.porDia, periodo);
  renderizarPendentes(hoje);
  renderizarVendas(periodo);
  renderizarRegistros(periodo);
  renderizarChecklist();
}

// Gráfico de barras: recebido e despesas por dia (ou por mês em períodos longos).
function desenharGrafico(porDia, periodo) {
  const alvo = $("fin-grafico");
  if (!porDia.length) {
    alvo.replaceChildren(el("p", "vazio", "Sem recebimentos ou despesas neste período."));
    return;
  }
  const longo = !periodo.inicio || periodo.inicio < fin.somarDias(periodo.fim, -95);
  const grupos = new Map();
  for (const d of porDia) {
    const chave = longo ? d.dia.slice(0, 7) : d.dia;
    const g = grupos.get(chave) ?? { recebido: 0n, despesas: 0n };
    g.recebido += d.recebido;
    g.despesas += d.despesas;
    grupos.set(chave, g);
  }
  const dados = [...grupos.entries()];
  const maximo = dados.reduce((m, [, g]) => (g.recebido > m ? g.recebido : g.despesas > m ? g.despesas : m), 1n);
  const L = 640;
  const A = 180;
  const passo = L / dados.length;
  const larg = Math.max(2, Math.min(22, passo / 2 - 2));
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${L} ${A + 22}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Recebimentos e despesas no período");
  const barra = (x, valor, classe, titulo) => {
    const h = Math.max(valor > 0n ? 2 : 0, (Number(valor) / Number(maximo)) * A);
    const r = document.createElementNS(ns, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(A - h));
    r.setAttribute("width", String(larg));
    r.setAttribute("height", String(h));
    r.setAttribute("rx", "2");
    r.setAttribute("class", classe);
    const t = document.createElementNS(ns, "title");
    t.textContent = titulo;
    r.append(t);
    svg.append(r);
  };
  dados.forEach(([chave, g], i) => {
    const centro = i * passo + passo / 2;
    const rotulo = longo ? chave.split("-").reverse().join("/") : dataBr(chave).slice(0, 5);
    barra(centro - larg - 1, g.recebido, "barra-recebido", `${rotulo}: recebido ${reais(g.recebido)}`);
    barra(centro + 1, g.despesas, "barra-despesa", `${rotulo}: despesas ${reais(g.despesas)}`);
    if (dados.length <= 16 || i % Math.ceil(dados.length / 12) === 0) {
      const tx = document.createElementNS(ns, "text");
      tx.setAttribute("x", String(centro));
      tx.setAttribute("y", String(A + 16));
      tx.setAttribute("text-anchor", "middle");
      tx.textContent = rotulo;
      svg.append(tx);
    }
  });
  const legenda = el("div", "fin-legenda");
  legenda.append(el("span", "leg-recebido", "Recebido"), el("span", "leg-despesa", "Despesas"));
  alvo.replaceChildren(svg, legenda);
}

function chipSituacao(v) {
  const s = situacaoVenda(v);
  return el("span", `chip-venda ${s}`, ROTULOS_SITUACAO[s]);
}

function nomeVenda(v) {
  return v.orcamentoNumero ? `${v.cliente || "Sem cliente"} · Orçamento ${numeroOrc(v.orcamentoNumero, v.teste)}` : `${v.descricao}${v.cliente ? ` · ${v.cliente}` : ""}`;
}

function renderizarPendentes(hoje) {
  const lista = vendas.filter((v) => naoTeste(v) && v.data <= hoje && restante(v) > 0n);
  $("fin-pendentes").replaceChildren(
    ...(lista.length
      ? lista.slice(0, 12).map((v) => {
          const b = el("button", "fin-linha");
          b.type = "button";
          b.append(el("span", "", nomeVenda(v)), el("strong", "", reais(restante(v))));
          b.addEventListener("click", () => abrirVenda(v.id));
          return b;
        })
      : [el("p", "ajuda", `Nenhum saldo pendente até ${dataBr(hoje)}.`)]),
  );
}

function renderizarVendas(periodo) {
  const lista = vendas.filter((v) => (!periodo.inicio || v.data >= periodo.inicio) && v.data <= periodo.fim);
  $("fin-vendas-resumo").textContent = `${lista.length} registro(s). Abra uma venda para consultar o orçamento, pagamentos e produção.`;
  $("fin-vendas").replaceChildren(
    ...lista.map((v) => {
      const tr = el("tr");
      const abrir = el("button", "botao-pequeno", "Abrir");
      abrir.type = "button";
      abrir.addEventListener("click", () => abrirVenda(v.id));
      const acoes = el("td");
      acoes.append(abrir);
      const sit = el("td");
      sit.append(chipSituacao(v));
      if (v.teste) sit.append(el("span", "chip-venda chip-teste", "Teste"));
      tr.append(el("td", "", nomeVenda(v)), el("td", "", dataBr(v.data)), el("td", "n", reais(v.valorCentavos)), el("td", "n", reais(recebido(v))), el("td", "n", reais(restante(v))), sit, acoes);
      return tr;
    }),
  );
  $("fin-tabela-vendas").hidden = lista.length === 0;
  $("fin-vendas-vazio").hidden = lista.length > 0;
}

function renderizarRegistros(periodo) {
  const noPeriodo = (d) => (!periodo.inicio || d >= periodo.inicio) && d <= periodo.fim;
  const itens = [];
  for (const v of vendas.filter(naoTeste)) for (const p of v.pagamentos) if (noPeriodo(p.data)) itens.push({ dia: p.data, tipo: "recebimento", texto: `Recebimento · ${nomeVenda(v)}`, detalhe: formasTexto(p.formas), valor: BigInt(p.valorCentavos), venda: v });
  for (const d of despesas) if (noPeriodo(d.data)) itens.push({ dia: d.data, tipo: "despesa", texto: `Despesa · ${d.descricao}`, detalhe: "", valor: -BigInt(d.valorCentavos), despesa: d });
  itens.sort((a, b) => b.dia.localeCompare(a.dia));
  $("fin-registros").replaceChildren(
    ...(itens.length
      ? itens.slice(0, 30).map((i) => {
          const linha = el("div", `fin-registro ${i.tipo}`);
          const texto = el("span");
          texto.append(el("strong", "", i.texto), el("span", "cliente-sub", [dataBr(i.dia), i.detalhe].filter(Boolean).join(" · ")));
          linha.append(texto, el("strong", "valor", reais(i.valor)));
          if (i.despesa) {
            const x = el("button", "botao-pequeno perigo", "Excluir");
            x.type = "button";
            x.addEventListener("click", () => excluirDespesa(i.despesa));
            linha.append(x);
          } else {
            const ab = el("button", "botao-pequeno", "Abrir");
            ab.type = "button";
            ab.addEventListener("click", () => abrirVenda(i.venda.id));
            linha.append(ab);
          }
          return linha;
        })
      : [el("p", "ajuda", "Nenhum recebimento ou despesa neste período.")]),
  );
}

async function excluirDespesa(d) {
  if (!(await confirmar({ titulo: "Excluir despesa?", texto: `"${d.descricao}" (${reais(d.valorCentavos)}) sai do financeiro.`, botao: "Excluir" }))) return;
  const r = await window.dados.financeiro.excluirDespesa(d.id);
  if (!r.ok) return mostrarAviso(r.erro);
  mostrarAviso("Despesa excluída.");
  await atualizarTudo();
}

// ---------- Atalhos e checklist ----------
function montarAtalhos() {
  const atalhos = [
    ["calculadora", "Calculadora 3D", "calculadora"],
    ["orcamentos", "Orçamentos", "orcamentos"],
    ["clientes", "Clientes", "clientes"],
    ["produtos", "Meus produtos", "produtos"],
    ["filamentos", "Estoque de filamentos", "filamentos"],
  ];
  $("fin-atalhos").replaceChildren(
    ...atalhos.map(([tela, texto, ic]) => {
      const b = el("button", "fin-atalho");
      b.type = "button";
      b.innerHTML = icone(ic, 20);
      b.append(document.createTextNode(texto));
      b.addEventListener("click", () => irPara(tela));
      return b;
    }),
  );
}

async function renderizarChecklist() {
  const [rc, rp] = await Promise.all([window.dados.clientes.listar(), window.dados.produtos.listar()]);
  const c = estado.config;
  const etapas = [
    ["Dados da empresa preenchidos", Boolean(c.empresa?.nome), () => abrirConfig("cfg-orcamento")],
    ["Padrões da calculadora configurados", Boolean(c.calculadora?.salvoEm), () => abrirConfig("cfg-calculadora")],
    ["Primeiro cliente cadastrado", rc.ok && rc.dados.some((x) => !x.teste), () => irPara("clientes")],
    ["Primeiro produto no catálogo", rp.ok && rp.dados.some((x) => !x.teste), () => irPara("produtos")],
    ["Primeiro orçamento criado", orcamentos.some((o) => !o.teste), () => irPara("orcamentos")],
    ["Fatiador selecionado", Boolean(c.fatiador?.caminho), () => abrirSeletorFatiador()],
  ];
  const feitas = etapas.filter(([, ok]) => ok).length;
  $("fin-checklist-bloco").hidden = feitas === etapas.length;
  $("fin-checklist-progresso").textContent = `${feitas} de ${etapas.length} concluídos`;
  $("fin-checklist-barra").style.width = `${(feitas / etapas.length) * 100}%`;
  $("fin-checklist").replaceChildren(
    ...etapas.map(([texto, ok, abrir]) => {
      const li = el("li", ok ? "feita" : "");
      const b = el("button", "fin-etapa");
      b.type = "button";
      b.append(el("span", "fin-etapa-marca", ok ? "✓" : ""), el("span", "", texto));
      b.addEventListener("click", abrir);
      li.append(b);
      return li;
    }),
  );
}

function abrirConfig(secao) {
  irPara("configuracoes");
  abrirSecaoConfig(secao);
}

// ---------- Abas das vendas ----------
function renderizarAbas() {
  const abas = [["geral", "Visão geral"], ...abertas.map((id) => [id, nomeVenda(vendas.find((v) => v.id === id))])];
  $("fin-abas").replaceChildren(
    ...abas.map(([id, texto]) => {
      const aba = el("div", `fin-aba${id === abaAtual ? " ativa" : ""}`);
      const b = el("button", "", texto);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(id === abaAtual));
      b.addEventListener("click", () => mostrarAba(id));
      aba.append(b);
      if (id !== "geral") {
        const x = el("button", "fin-aba-fechar", "×");
        x.type = "button";
        x.setAttribute("aria-label", "Fechar aba da venda");
        x.addEventListener("click", () => fecharAba(id));
        aba.append(x);
      }
      return aba;
    }),
  );
  $("fin-abas").hidden = abertas.length === 0;
}

function mostrarAba(id) {
  abaAtual = id;
  renderizarAbas();
  $("fin-geral").hidden = id !== "geral";
  $("fin-venda").hidden = id === "geral";
  if (id !== "geral") renderizarVenda(vendas.find((v) => v.id === id));
}

export function abrirVenda(id) {
  if (!abertas.includes(id)) abertas.push(id);
  mostrarAba(id);
  irPara("financeiro");
}

function fecharAba(id) {
  abertas = abertas.filter((x) => x !== id);
  mostrarAba(abaAtual === id ? "geral" : abaAtual);
}

function infoLinha(rotulo, valor, classe = "") {
  const d = el("div", `fin-info ${classe}`.trim());
  d.append(el("span", "", rotulo), el("strong", "", valor));
  return d;
}

function renderizarVenda(v) {
  const alvo = $("fin-venda");
  if (!v) {
    alvo.replaceChildren(el("p", "ajuda", "Esta venda não existe mais."));
    return;
  }
  const quitada = situacaoVenda(v) === "quitado";
  const topo = el("div", "fin-topo");
  const tit = el("div");
  tit.append(el("h1", "titulo-pagina", v.cliente || v.descricao), el("p", "ajuda", [v.orcamentoNumero ? `Orçamento ${numeroOrc(v.orcamentoNumero, v.teste)}` : v.descricao, `Venda de ${dataBr(v.data)}`].join(" · ")));
  const acoes = el("div", "fin-topo-acoes");
  const prod = el("select", "seletor");
  prod.setAttribute("aria-label", "Produção");
  for (const [k, t] of Object.entries(ROTULOS_PRODUCAO)) prod.append(new Option(t, k));
  prod.value = v.producao;
  prod.addEventListener("change", async () => {
    const r = await window.dados.financeiro.producao(v.id, prod.value);
    if (!r.ok) return mostrarAviso(r.erro);
    mostrarAviso(`Produção: ${ROTULOS_PRODUCAO[prod.value]}.`);
    await atualizarTudo();
  });
  const pagar = el("button", "botao-primario", "Registrar pagamento");
  pagar.type = "button";
  pagar.disabled = quitada;
  pagar.title = quitada ? "Venda quitada" : "";
  pagar.addEventListener("click", () => abrirRegistro({ tipo: "recebimento", vendaId: v.id }));
  acoes.append(prod, pagar);
  if (!v.pagamentos.length) {
    const excluir = el("button", "botao-texto perigo", "Excluir venda");
    excluir.type = "button";
    excluir.addEventListener("click", async () => {
      if (!(await confirmar({ titulo: "Excluir venda?", texto: "A venda sai do financeiro. O orçamento, se houver, continua guardado.", botao: "Excluir" }))) return;
      const r = await window.dados.financeiro.excluirVenda(v.id);
      if (!r.ok) return mostrarAviso(r.erro);
      fecharAba(v.id);
      await atualizarTudo();
    });
    acoes.append(excluir);
  }
  topo.append(tit, acoes);

  const lucro = lucroVenda(v);
  const resumo = el("div", "fin-cartoes fin-cartoes-venda");
  resumo.append(
    infoLinha("Valor final", reais(v.valorCentavos)),
    infoLinha("Recebido", reais(recebido(v))),
    infoLinha("Restante a pagar", reais(restante(v))),
    infoLinha("Custo de produção", v.custoCentavos === null ? "Custos não informados" : reais(v.custoCentavos)),
    infoLinha("Lucro da venda", lucro === null ? "—" : reais(lucro), lucro !== null && lucro < 0n ? "negativo" : ""),
  );
  const situacao = el("p", "fin-situacao");
  situacao.append(chipSituacao(v), el("span", "ajuda", ` Produção: ${ROTULOS_PRODUCAO[v.producao]}. Finalizar a peça não quita a venda.`));

  const itens = el("section", "painel fin-bloco");
  itens.append(el("h2", "", "Produtos"));
  if (v.itens.length) {
    const tab = el("table", "tabela-fin");
    tab.innerHTML = "<thead><tr><th>Produto</th><th class='n'>Qtd</th><th class='n'>Preço unit.</th><th class='n'>Custo unit.</th><th></th></tr></thead>";
    const corpo = el("tbody");
    for (const i of v.itens) {
      const tr = el("tr");
      const ver = el("td");
      if (i.calculo) {
        const b = el("button", "botao-pequeno", "Ver cálculo utilizado");
        b.type = "button";
        b.addEventListener("click", () => mostrarCalculo(i));
        ver.append(b);
      }
      tr.append(el("td", "", i.descricao), el("td", "n", String(i.quantidade)), el("td", "n", reais(i.precoUnitarioCentavos)), el("td", "n", i.custoUnitarioCentavos ? reais(i.custoUnitarioCentavos) : "Não informado"), ver);
      corpo.append(tr);
    }
    tab.append(corpo);
    const rol = el("div", "tabela-rolagem");
    rol.append(tab);
    itens.append(rol);
  } else itens.append(el("p", "ajuda", "Venda lançada à mão, sem produtos detalhados."));

  const pags = el("section", "painel fin-bloco");
  pags.append(el("h2", "", "Pagamentos"));
  if (v.pagamentos.length) {
    for (const p of v.pagamentos) {
      const l = el("div", "fin-registro recebimento");
      const t = el("span");
      t.append(el("strong", "", dataBr(p.data)), el("span", "cliente-sub", formasTexto(p.formas) || "Forma não informada"));
      l.append(t, el("strong", "valor", reais(p.valorCentavos)));
      pags.append(l);
    }
  } else pags.append(el("p", "ajuda", "Nenhum pagamento registrado."));

  alvo.replaceChildren(topo, resumo, situacao, itens, pags);
}

function mostrarCalculo(i) {
  const c = i.calculo;
  const num = (t) => Number(t).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  const h = Number(c.horas);
  const tempo = `${Math.floor(h)} h ${Math.round((h - Math.floor(h)) * 60)} min`;
  const linhas = [
    ["Peso do lote", `${num(c.pesoG)} g`],
    ["Quantidade", `${c.quantidade} peça(s)`],
    ["Preço do filamento", `${reais(Math.round(Number(c.precoKg) * 100))}/kg`],
    ["Tempo de impressão", tempo],
    ["Consumo da impressora", `${num(c.potenciaW)} W`],
    ["Tarifa de energia", `R$ ${num(c.tarifaKwh)}/kWh`],
    ["Uso da impressora", `${reais(Math.round(Number(c.custoHora) * 100))}/h`],
    ["Mão de obra do lote", reais(Math.round(Number(c.maoDeObra) * 100))],
    ["Lucro aplicado", `${num(c.lucroPct)}%`],
    ["Custo do lote", reais(c.custosCentavos.total)],
    ["Calculado em", new Date(c.data).toLocaleDateString("pt-BR")],
  ];
  $("titulo-calculo").textContent = `Cálculo utilizado · ${i.descricao}`;
  $("calculo-lista").replaceChildren(
    ...linhas.map(([r, v]) => {
      const d = el("div");
      d.append(el("dt", "", r), el("dd", "", v));
      return d;
    }),
  );
  $("dialogo-calculo").showModal();
}

// ---------- Novo registro (venda, recebimento, despesa) ----------
function abrirRegistro({ tipo = "venda", vendaId = "" } = {}) {
  $("reg-tipo").value = tipo;
  const abertasParaReceber = vendas.filter((v) => situacaoVenda(v) !== "quitado");
  $("reg-venda").replaceChildren(...abertasParaReceber.map((v) => new Option(`${nomeVenda(v)} · falta ${reais(restante(v))}`, v.id)));
  if (vendaId) $("reg-venda").value = vendaId;
  for (const id of ["reg-descricao", "reg-cliente", "reg-valor"]) $(id).value = "";
  $("reg-data").value = diaLocal();
  marcarChaves($("reg-formas"), []);
  $("erro-registro").textContent = "";
  ajustarRegistro();
  $("dialogo-registro").showModal();
}

function ajustarRegistro() {
  const tipo = $("reg-tipo").value;
  $("reg-venda-campo").hidden = tipo !== "recebimento";
  $("reg-formas-campo").hidden = tipo !== "recebimento";
  $("reg-descricao-campo").hidden = tipo === "recebimento";
  $("reg-cliente-campo").hidden = tipo !== "venda";
  if (tipo === "recebimento" && !$("reg-venda").options.length) $("erro-registro").textContent = "Não há vendas com saldo a receber.";
  else $("erro-registro").textContent = "";
}

async function salvarRegistro(ev) {
  ev.preventDefault();
  const tipo = $("reg-tipo").value;
  const valor = $("reg-valor").value;
  const data = $("reg-data").value;
  let r;
  if (tipo === "venda") r = await window.dados.financeiro.salvarVenda({ descricao: $("reg-descricao").value, cliente: $("reg-cliente").value, valor, data });
  else if (tipo === "despesa") r = await window.dados.financeiro.salvarDespesa({ descricao: $("reg-descricao").value, valor, data });
  else {
    if (!$("reg-venda").value) return;
    r = await window.dados.financeiro.pagamento($("reg-venda").value, { valor, data, formas: chavesMarcadas($("reg-formas")) });
  }
  if (!r.ok) {
    $("erro-registro").textContent = r.erro;
    return;
  }
  $("dialogo-registro").close();
  mostrarAviso(tipo === "venda" ? "Venda registrada." : tipo === "despesa" ? "Despesa registrada." : "Pagamento registrado.");
  await atualizarTudo();
}

// ---------- Janela de pagamento (finalizar orçamento e revisão) ----------
let pedidoPagamento = null; // { orcamento, revisao, resolver }

// Abre a pergunta do pagamento para um orçamento. Resolve quando a janela fecha.
export async function abrirPagamentoOrcamento(o, { revisao = false } = {}) {
  const rf = await window.dados.financeiro.listar();
  const todas = rf.ok ? rf.dados.vendas : [];
  const existente = todas.find((v) => v.orcamentoId === o.id);
  const total = calcularTotais(o).total;
  const sinal = valorSinal(o, total);
  const ja = existente ? recebido(existente) : 0n;
  $("pagamento-resumo").textContent =
    `Orçamento ${numeroOrc(o.numero, o.teste)}${o.cliente ? ` · ${o.cliente.nome}` : ""} · total ${reais(total)}` +
    (existente ? ` · já recebido ${reais(ja)}` : "") +
    (sinal > 0n ? ` · sinal pedido ${reais(sinal)} (só conta quando for recebido)` : "");
  const mesmasValor = todas.filter((v) => !v.orcamentoId && BigInt(v.valorCentavos) === total);
  $("pag-op-vincular").hidden = !revisao || !mesmasValor.length;
  $("pag-op-cancelar").hidden = !revisao;
  $("pagamento-venda").replaceChildren(...mesmasValor.map((v) => new Option(`${v.descricao}${v.cliente ? ` · ${v.cliente}` : ""} · ${dataBr(v.data)}`, v.id)));
  for (const r of document.querySelectorAll('input[name="pag-modo"]')) r.checked = false;
  $("pagamento-valor").value = sinal > 0n && sinal < total ? centavosParaTexto(sinal.toString()) : ja > 0n && ja < total ? centavosParaTexto(ja.toString()) : "";
  $("pagamento-data").value = diaLocal();
  marcarChaves($("pagamento-formas"), o.formasPagamento?.length === 1 ? o.formasPagamento : []);
  $("erro-pagamento").textContent = "";
  $("pagamento-depois").textContent = revisao ? "Fechar" : "Responder depois";
  ajustarPagamento();
  $("dialogo-pagamento").showModal();
  return new Promise((resolver) => {
    pedidoPagamento = { orcamento: o, revisao, resolver };
  });
}

function modoPagamento() {
  return document.querySelector('input[name="pag-modo"]:checked')?.value ?? "";
}

function ajustarPagamento() {
  const modo = modoPagamento();
  $("pagamento-detalhes").hidden = !["parcial", "integral"].includes(modo);
  $("pagamento-valor-campo").hidden = modo !== "parcial";
  $("pagamento-venda-campo").hidden = modo !== "vincular";
}

function fecharPagamento(resultado) {
  const p = pedidoPagamento;
  pedidoPagamento = null;
  if ($("dialogo-pagamento").open) $("dialogo-pagamento").close();
  p?.resolver(resultado);
}

async function confirmarPagamento(ev) {
  ev.preventDefault();
  const p = pedidoPagamento;
  if (!p) return;
  const modo = modoPagamento();
  if (!modo) {
    $("erro-pagamento").textContent = "Escolha uma das opções.";
    return;
  }
  let r;
  if (modo === "cancelar") r = await window.dados.orcamentos.situacao(p.orcamento.id, "recusado");
  else if (modo === "vincular") r = await window.dados.financeiro.vincular(p.orcamento.id, $("pagamento-venda").value);
  else r = await window.dados.financeiro.sincronizar(p.orcamento.id, { modo, valor: $("pagamento-valor").value, formas: chavesMarcadas($("pagamento-formas")), data: $("pagamento-data").value });
  if (!r.ok) {
    $("erro-pagamento").textContent = r.erro;
    return;
  }
  mostrarAviso(modo === "cancelar" ? "Orçamento marcado como cancelado." : "Financeiro atualizado.");
  fecharPagamento(true);
}

// ---------- Revisão de orçamentos antigos ----------
export async function abrirRevisao() {
  await carregar();
  renderizarRevisao();
  if (!$("dialogo-revisao").open) $("dialogo-revisao").showModal();
  return new Promise((resolver) => {
    $("dialogo-revisao").addEventListener("close", () => resolver(), { once: true });
  });
}

function renderizarRevisao() {
  const lista = orcamentosSemVenda(orcamentos, vendas);
  $("revisao-lista").replaceChildren(
    ...(lista.length
      ? lista.map((o) => {
          const l = el("div", "fin-registro");
          const t = el("span");
          t.append(el("strong", "", `Orçamento ${numeroOrc(o.numero)} · ${o.cliente?.nome ?? "Sem cliente"}`), el("span", "cliente-sub", `${new Date(o.criadoEm).toLocaleDateString("pt-BR")} · ${reais(calcularTotais(o).total)}`));
          const b = el("button", "botao-secundario", "Revisar");
          b.type = "button";
          b.addEventListener("click", async () => {
            await abrirPagamentoOrcamento(o, { revisao: true });
            await carregar();
            renderizarRevisao();
            renderizarPainel();
            atualizarAviso();
          });
          l.append(t, b);
          return l;
        })
      : [el("p", "ajuda", "Nenhum orçamento aguardando revisão.")]),
  );
}

function atualizarAviso() {
  const n = orcamentosSemVenda(orcamentos, vendas).length;
  $("fin-aviso-revisao").hidden = n === 0;
  $("fin-revisao-texto").textContent = `${n} orçamento(s) aguardam revisão de pagamento.`;
}

async function atualizarTudo() {
  if (!(await carregar())) return;
  renderizarPainel();
  atualizarAviso();
  renderizarAbas();
  if (abaAtual !== "geral") renderizarVenda(vendas.find((v) => v.id === abaAtual));
}

// ---------- Início ----------
export function iniciarFinanceiro() {
  montarChaves($("reg-formas"), FORMAS, "reg-forma");
  montarChaves($("pagamento-formas"), FORMAS, "pag-forma");
  montarAtalhos();
  $("fin-periodo").addEventListener("change", renderizarPainel);
  $("fin-novo-registro").addEventListener("click", () => abrirRegistro());
  $("reg-tipo").addEventListener("change", ajustarRegistro);
  $("form-registro").addEventListener("submit", salvarRegistro);
  $("fechar-registro").addEventListener("click", () => $("dialogo-registro").close());
  $("cancelar-registro").addEventListener("click", () => $("dialogo-registro").close());
  $("fin-revisar").addEventListener("click", () => abrirRevisao().then(atualizarTudo));
  $("fechar-revisao").addEventListener("click", () => $("dialogo-revisao").close());
  $("fechar-calculo").addEventListener("click", () => $("dialogo-calculo").close());
  $("form-pagamento").addEventListener("submit", confirmarPagamento);
  for (const r of document.querySelectorAll('input[name="pag-modo"]')) r.addEventListener("change", ajustarPagamento);
  $("pagamento-depois").addEventListener("click", () => fecharPagamento(false));
  $("dialogo-pagamento").addEventListener("cancel", (ev) => {
    ev.preventDefault();
    fecharPagamento(false);
  });
  registrarAoAbrir("financeiro", () => {
    mostrarAba(abaAtual);
    atualizarTudo();
  });
}
