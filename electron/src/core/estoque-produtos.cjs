// Estoque de produtos prontos: quantidade, reservas, saídas e histórico.
//
// Regras (combinadas com o Pedro em 18/11/2026):
// - Produto com "Peças em estoque" vazio não tem controle de estoque.
// - O orçamento virou venda (pergunta do pagamento): as peças ficam RESERVADAS
//   (continuam no estoque, mas não estão disponíveis).
// - Produção da venda "Entregue": as peças SAEM do estoque.
// - Orçamento cancelado: a reserva ou a saída VOLTA.
// - Venda excluída: a reserva é liberada (o que já foi entregue continua fora).
// - Só contam as vendas criadas depois que o controle do produto foi ligado.
//
// O que já foi aplicado fica guardado no produto (vinculos: vendaId -> { r, s }). A conciliação
// compara com o que as vendas pedem agora e lança só a diferença, com uma linha no histórico.
// CommonJS: usado no processo principal (que grava) e na tela (contas de disponível/aviso).
"use strict";

const { ErroValidacao } = require("./validacao.cjs");

const LIMITES = { quantidade: 99_999, historico: 300, texto: 200, saldo: 9_999_999 };
const TIPOS = ["inicio", "ajuste", "reserva", "liberada", "saida", "voltou", "desligado"];
const ID_VINCULO = /^[A-Za-z0-9-]{8,64}$/;

const inteiro = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const dataOk = (d) => typeof d === "string" && !Number.isNaN(Date.parse(d));

// ---------- Validação dos campos de estoque de um produto ----------
function validarEstoque(p) {
  if (p.estoque === undefined) {
    if (p.vinculos !== undefined || p.estoqueDesde !== undefined) throw new ErroValidacao("Estoque do produto inválido.");
  } else {
    if (!inteiro(p.estoque, -LIMITES.saldo, LIMITES.saldo)) throw new ErroValidacao("Estoque do produto inválido.");
    if (!dataOk(p.estoqueDesde)) throw new ErroValidacao("Estoque do produto inválido.");
    if (p.vinculos !== undefined) {
      if (!p.vinculos || typeof p.vinculos !== "object" || Array.isArray(p.vinculos)) throw new ErroValidacao("Estoque do produto inválido.");
      for (const [id, v] of Object.entries(p.vinculos)) {
        if (!ID_VINCULO.test(id) || !v || !inteiro(v.r, 0, LIMITES.saldo) || !inteiro(v.s, 0, LIMITES.saldo)) {
          throw new ErroValidacao("Estoque do produto inválido.");
        }
      }
    }
  }
  if (p.estoqueMinimo !== undefined && !inteiro(p.estoqueMinimo, 0, LIMITES.quantidade)) throw new ErroValidacao("Aviso de estoque inválido.");
  if (p.historico !== undefined) {
    if (!Array.isArray(p.historico) || p.historico.length > LIMITES.historico) throw new ErroValidacao("Histórico do estoque inválido.");
    for (const h of p.historico) {
      if (
        !h ||
        !dataOk(h.data) ||
        !TIPOS.includes(h.tipo) ||
        !inteiro(h.quantidade, 0, LIMITES.saldo) ||
        !(h.saldo === null || inteiro(h.saldo, -LIMITES.saldo, LIMITES.saldo)) ||
        typeof h.texto !== "string" ||
        h.texto.length > LIMITES.texto
      ) {
        throw new ErroValidacao("Histórico do estoque inválido.");
      }
    }
  }
}

// "12" -> 12; "" -> null. Lança ErroValidacao.
function quantidadeDeTexto(valor, nome) {
  const t = String(valor ?? "").trim();
  if (!t) return null;
  if (!/^\d{1,5}$/.test(t) || Number(t) > LIMITES.quantidade) throw new ErroValidacao(`${nome}: use um número inteiro, como 10.`);
  return Number(t);
}

function comHistorico(historico, ...linhas) {
  return [...(historico ?? []), ...linhas].slice(-LIMITES.historico);
}

// Campos de estoque para montarProduto.
// v: { estoque (texto; vazio = sem controle), estoqueVisto (o que a tela mostrava ao abrir), estoqueMinimo }
function montarEstoque(v, anterior, agora) {
  const r = {};
  const novo = quantidadeDeTexto(v.estoque, "Peças em estoque");
  const minimo = quantidadeDeTexto(v.estoqueMinimo, "Avisar quando sobrar");
  let historico = anterior?.historico;
  const controlava = anterior?.estoque !== undefined;

  if (novo === null) {
    if (controlava) historico = comHistorico(historico, { data: agora, tipo: "desligado", quantidade: 0, saldo: null, texto: "Controle de estoque desligado" });
  } else if (!controlava) {
    r.estoque = novo;
    r.estoqueDesde = agora;
    historico = comHistorico(historico, { data: agora, tipo: "inicio", quantidade: novo, saldo: novo, texto: `Começou com ${pecas(novo)}` });
  } else {
    r.estoque = anterior.estoque;
    r.estoqueDesde = anterior.estoqueDesde;
    if (anterior.vinculos) r.vinculos = anterior.vinculos;
    // Só muda se a pessoa mexeu no campo: uma venda entregue no meio da edição não é desfeita.
    const visto = quantidadeDeTexto(v.estoqueVisto, "Peças em estoque");
    if (novo !== visto && novo !== anterior.estoque) {
      historico = comHistorico(historico, {
        data: agora,
        tipo: "ajuste",
        quantidade: Math.abs(novo - anterior.estoque),
        saldo: novo,
        texto: `Ajustado à mão: de ${anterior.estoque} para ${novo}`,
      });
      r.estoque = novo;
    }
  }
  if (minimo !== null && minimo > 0) r.estoqueMinimo = minimo;
  if (historico?.length) r.historico = historico;
  return r;
}

const pecas = (n) => (n === 1 ? "1 peça" : `${n} peças`);

// ---------- Contas ----------
const controlaEstoque = (p) => p?.estoque !== undefined;
const reservadas = (p) => Object.values(p?.vinculos ?? {}).reduce((s, v) => s + v.r, 0);
const disponiveis = (p) => (controlaEstoque(p) ? p.estoque - reservadas(p) : null);
// Aviso "Acabando": só conta as disponíveis.
const acabando = (p) => controlaEstoque(p) && p.estoqueMinimo !== undefined && disponiveis(p) <= p.estoqueMinimo;

// Peças de cada produto num orçamento: Map produtoId -> quantidade.
function pecasDoOrcamento(o) {
  const mapa = new Map();
  for (const i of o?.itens ?? []) if (i.produtoId) mapa.set(i.produtoId, (mapa.get(i.produtoId) ?? 0) + i.quantidade);
  return mapa;
}

// Para a pergunta do pagamento: produtos que vão ficar sem peças se a venda for feita agora.
// Devolve [{ nome, faltam }]. Ignora o que esta venda já reservou.
function faltasParaVenda(o, produtos, vendaId) {
  const faltas = [];
  for (const [id, q] of pecasDoOrcamento(o)) {
    const p = produtos.find((x) => x.id === id);
    if (!controlaEstoque(p)) continue;
    const jaReservado = vendaId ? (p.vinculos?.[vendaId]?.r ?? 0) : 0;
    const livres = disponiveis(p) + jaReservado;
    if (q > livres) faltas.push({ nome: p.nome, faltam: q - Math.max(livres, 0) });
  }
  return faltas;
}

// ---------- Conciliação com as vendas ----------
const numeroTexto = (o, v) => {
  const n = o?.numero ?? v?.orcamentoNumero;
  return n ? `Orçamento ${o?.teste || v?.teste ? "teste " : ""}#${String(n).padStart(4, "0")}` : "Venda";
};

// Devolve { produtos (lista nova, mesma ordem), mudou, acabaram: [nomes que entraram em "Acabando"] }.
function conciliar(produtos, vendas, orcamentos, agora = new Date().toISOString()) {
  const porOrcamento = new Map(orcamentos.map((o) => [o.id, o]));
  const vendasPorId = new Map(vendas.map((v) => [v.id, v]));
  let mudou = false;
  const acabaram = [];

  const novos = produtos.map((p) => {
    if (!controlaEstoque(p)) return p;
    const desde = Date.parse(p.estoqueDesde);
    // O que cada venda pede para este produto agora.
    const alvo = new Map();
    for (const v of vendas) {
      if (!v.orcamentoId || Date.parse(v.criadoEm) < desde) continue;
      const o = porOrcamento.get(v.orcamentoId);
      if (!o) continue; // orçamento excluído: fica como estava
      const q = pecasDoOrcamento(o).get(p.id) ?? 0;
      if (o.situacao === "recusado" || q === 0) alvo.set(v.id, { r: 0, s: 0, o, v });
      else if (v.producao === "entregue") alvo.set(v.id, { r: 0, s: q, o, v });
      else alvo.set(v.id, { r: q, s: 0, o, v });
    }
    // Venda excluída: libera a reserva; o que foi entregue continua fora.
    for (const [id, atual] of Object.entries(p.vinculos ?? {})) {
      if (!vendasPorId.has(id)) alvo.set(id, { r: 0, s: atual.s, o: null, v: null, excluida: true });
    }

    let estoque = p.estoque;
    const vinculos = { ...(p.vinculos ?? {}) };
    const linhas = [];
    for (const [id, a] of alvo) {
      const atual = vinculos[id] ?? { r: 0, s: 0 };
      if (a.r === atual.r && a.s === atual.s) continue;
      const dr = a.r - atual.r;
      const ds = a.s - atual.s;
      const quem = `${numeroTexto(a.o, a.v ?? vendasPorId.get(id))}${a.o?.cliente?.nome ? ` · ${a.o.cliente.nome}` : ""}`;
      if (ds !== 0) {
        estoque -= ds;
        const cancelado = a.o?.situacao === "recusado";
        linhas.push(
          ds > 0
            ? { data: agora, tipo: "saida", quantidade: ds, saldo: estoque, texto: `Saiu ${pecas(ds)} · entregue · ${quem}` }
            : { data: agora, tipo: "voltou", quantidade: -ds, saldo: estoque, texto: `Voltou ${pecas(-ds)} · ${cancelado ? "cancelado" : "não entregue"} · ${quem}` },
        );
      }
      if (dr > 0) {
        linhas.push({ data: agora, tipo: "reserva", quantidade: dr, saldo: estoque, texto: `Reservou ${pecas(dr)} · ${quem}` });
      } else if (dr < 0) {
        // Reserva que virou saída já está na linha "Saiu".
        const liberada = -dr - Math.max(ds, 0);
        if (liberada > 0) {
          const motivo = a.excluida ? "venda excluída" : a.o?.situacao === "recusado" ? "cancelado" : "orçamento mudou";
          linhas.push({ data: agora, tipo: "liberada", quantidade: liberada, saldo: estoque, texto: `Reserva liberada: ${pecas(liberada)} · ${motivo} · ${quem}` });
        }
      }
      if (a.r === 0 && a.s === 0) delete vinculos[id];
      else vinculos[id] = { r: a.r, s: a.s };
    }
    if (!linhas.length && Object.keys(vinculos).length === Object.keys(p.vinculos ?? {}).length) return p;
    mudou = true;
    const novo = { ...p, estoque, historico: comHistorico(p.historico, ...linhas) };
    if (Object.keys(vinculos).length) novo.vinculos = vinculos;
    else delete novo.vinculos;
    if (!acabando(p) && acabando(novo)) acabaram.push(novo.nome);
    return novo;
  });
  return { produtos: novos, mudou, acabaram };
}

module.exports = {
  LIMITES,
  TIPOS,
  acabando,
  conciliar,
  controlaEstoque,
  disponiveis,
  faltasParaVenda,
  montarEstoque,
  pecasDoOrcamento,
  reservadas,
  validarEstoque,
};
