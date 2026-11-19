// Janela "Recibos": os pagamentos de uma venda, um por linha, com o recibo de cada um
// (gerar, abrir de novo com o mesmo número e enviar pelo WhatsApp). Usada no histórico de
// orçamentos e no Financeiro.
import modeloRecibo from "../core/recibo.cjs";
import modeloWhatsapp from "../core/whatsapp-orcamento.cjs";
import { estado, mostrarAviso } from "./shell.js";
import { el } from "./util-tela.js";

const { ROTULOS_TIPO, linhasDaVenda, numeroRecibo } = modeloRecibo;
const { numeroWhatsapp } = modeloWhatsapp;
const $ = (id) => document.getElementById(id);
const ROTULOS_FORMA = { debito: "Débito", credito: "Crédito", pix: "Pix", dinheiro: "Dinheiro" };

let vendaId = null;
let aoMudar = null; // avisa quem abriu (para atualizar a lista dela)

const reais = (c) => {
  const v = BigInt(c);
  return `R$ ${(v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(v % 100n).toString().padStart(2, "0")}`;
};
const dataCurta = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function dadosDaVenda() {
  const [rf, ro] = await Promise.all([window.dados.financeiro.listar(), window.dados.orcamentos.listar()]);
  const venda = rf.ok ? rf.dados.vendas.find((v) => v.id === vendaId) : null;
  const orcamento = venda?.orcamentoId && ro.ok ? (ro.dados.find((o) => o.id === venda.orcamentoId) ?? null) : null;
  return { venda, orcamento };
}

async function renderizar() {
  const { venda, orcamento } = await dadosDaVenda();
  if (!venda) {
    $("recibos-lista").replaceChildren(el("p", "ajuda", "Esta venda não existe mais."));
    return;
  }
  const numOrc = orcamento?.numero ?? venda.orcamentoNumero;
  $("recibos-titulo").textContent = numOrc ? `Recibos do orçamento #${String(numOrc).padStart(4, "0")}` : "Recibos da venda";
  const pago = venda.pagamentos.reduce((s, p) => s + BigInt(p.valorCentavos), 0n);
  const falta = BigInt(venda.valorCentavos) - pago;
  $("recibos-sub").textContent = `${orcamento?.cliente?.nome || venda.cliente || venda.descricao} · Total ${reais(venda.valorCentavos)} · ${falta > 0n ? `Faltam ${reais(falta)}` : "Quitado"}`;
  const temAssinatura = Boolean(estado.config?.empresa?.assinatura);
  $("recibos-assinar").disabled = !temAssinatura;
  if (!temAssinatura) $("recibos-assinar").checked = false;
  $("recibos-sem-assinatura").hidden = temAssinatura;
  const temTelefone = Boolean(numeroWhatsapp(orcamento?.cliente?.telefone));

  const linhas = linhasDaVenda(venda);
  if (!linhas.length) {
    $("recibos-lista").replaceChildren(el("p", "ajuda", "Nenhum pagamento registrado nesta venda."));
    return;
  }
  $("recibos-lista").replaceChildren(
    ...linhas.map((l) => {
      const linha = el("div", `recibo-linha${l.cancelado ? " cancelado" : ""}`);
      if (l.cancelado) {
        linha.append(
          el("span", "recibo-data", dataCurta(l.recibo.data)),
          el("span", "", `${ROTULOS_TIPO[l.tipo]} · pagamento apagado`),
          el("strong", "recibo-valor", reais(l.recibo.valorCentavos)),
          el("span", "recibo-acoes", `${numeroRecibo(l.recibo.numero)} · Cancelado`),
        );
        return linha;
      }
      const p = l.pagamento;
      const formas = (p.formas ?? []).map((f) => ROTULOS_FORMA[f]).join(" + ") || "Forma não informada";
      const acoes = el("span", "recibo-acoes");
      if (l.recibo) acoes.append(el("span", "recibo-numero", numeroRecibo(l.recibo.numero)));
      const gerar = el("button", "botao-pequeno", l.recibo ? "Abrir" : "Gerar recibo");
      gerar.type = "button";
      gerar.addEventListener("click", () => executar(gerar, () => window.dados.orcamentos.reciboGerar(venda.id, p.id, { assinar: $("recibos-assinar").checked }), (d) => `Recibo ${numeroRecibo(d.numero)} salvo e aberto.`));
      const wpp = el("button", "botao-pequeno botao-wpp-recibo", "WhatsApp");
      wpp.type = "button";
      wpp.disabled = !temTelefone;
      wpp.title = temTelefone ? "Enviar pelo WhatsApp" : "Cadastre o telefone do cliente";
      wpp.addEventListener("click", () =>
        executar(wpp, () => window.dados.orcamentos.reciboWhatsapp(venda.id, p.id, { assinar: $("recibos-assinar").checked }), (d) => (d.copiado ? "Conversa aberta. Aperte Ctrl+V na conversa para anexar o PDF." : "Conversa aberta. Arraste o PDF da pasta para a conversa.")),
      );
      acoes.append(gerar, wpp);
      linha.append(el("span", "recibo-data", dataCurta(p.data)), el("span", "", `${ROTULOS_TIPO[l.tipo]} · ${formas}`), el("strong", "recibo-valor", reais(p.valorCentavos)), acoes);
      return linha;
    }),
  );
}

async function executar(botao, acao, mensagem) {
  botao.disabled = true;
  try {
    const r = await acao();
    if (!r.ok) return mostrarAviso(r.erro);
    mostrarAviso(mensagem(r.dados));
    await renderizar();
    aoMudar?.();
  } finally {
    if (botao.isConnected) botao.disabled = false;
  }
}

// Abre a janela de recibos de uma venda. depois(): chamado quando um recibo é gerado.
export async function abrirRecibos(id, depois) {
  vendaId = id;
  aoMudar = depois ?? null;
  $("recibos-assinar").checked = Boolean(estado.config?.empresa?.assinatura);
  $("recibos-lista").replaceChildren();
  $("dialogo-recibos").showModal();
  await renderizar();
}

export function iniciarRecibos() {
  $("fechar-recibos").addEventListener("click", () => $("dialogo-recibos").close());
}
