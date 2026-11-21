// Configurações > Conta e nuvem: entrar, criar conta, esqueci a senha, Google, sincronizar e sair.
// Também avisa quando dados chegam da nuvem (de outro PC).
import { carregarConfig, confirmar, irPara, mostrarAviso, telaAberta } from "./shell.js";

const $ = (id) => document.getElementById(id);
let ocupado = false;

function horario(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return hoje ? `hoje às ${hora}` : `${d.toLocaleDateString("pt-BR")} às ${hora}`;
}

function mostrar(r) {
  const dentro = Boolean(r?.conta);
  $("conta-fora").hidden = dentro;
  $("conta-dentro").hidden = !dentro;
  $("conta-google-linha").hidden = dentro || !r?.google;
  if (!dentro) return;
  $("conta-quem").textContent = r.conta.email || "sua conta";
  $("conta-situacao").textContent = r.sincronizando
    ? "Sincronizando…"
    : r.ultima
      ? `Última sincronização: ${horario(r.ultima)}.`
      : "Ainda não sincronizou.";
  $("conta-erro-sinc").textContent = r.erro ?? "";
  $("conta-sincronizar").disabled = Boolean(r.sincronizando);
}

async function atualizar() {
  const r = await window.conta.estado();
  if (r.ok) mostrar(r.dados);
}

// Roda uma ação da conta com os botões travados e o erro na tela.
async function acao(funcao, erroEm = "conta-erro") {
  if (ocupado) return null;
  ocupado = true;
  $(erroEm).textContent = "";
  const botoes = document.querySelectorAll("#cfg-conta button");
  botoes.forEach((b) => (b.disabled = true));
  try {
    const r = await funcao();
    if (!r.ok) $(erroEm).textContent = r.erro;
    return r.ok ? r : null;
  } finally {
    botoes.forEach((b) => (b.disabled = false));
    ocupado = false;
  }
}

const credenciais = () => [$("conta-email").value, $("conta-senha").value];

async function entrar(ev) {
  ev?.preventDefault();
  const r = await acao(() => window.conta.entrar(...credenciais()));
  if (r) depoisDeEntrar(r.dados);
}

async function criar() {
  const r = await acao(() => window.conta.criar(...credenciais()));
  if (r) depoisDeEntrar(r.dados);
}

async function esqueci() {
  const r = await acao(() => window.conta.esqueci($("conta-email").value));
  if (r) mostrarAviso("Se este e-mail tiver conta, chega um link para criar uma senha nova.", { duracao: 6000 });
}

async function google() {
  mostrarAviso("Termine o login no navegador que abriu.", { duracao: 6000 });
  const r = await acao(() => window.conta.google());
  if (r) depoisDeEntrar(r.dados);
}

function depoisDeEntrar(dados) {
  $("conta-senha").value = "";
  mostrar(dados);
  mostrarAviso("Pronto! Seus dados estão sendo sincronizados.");
}

async function sair() {
  const ok = await confirmar({
    titulo: "Sair da conta?",
    texto: "Seus dados continuam neste PC. Eles só deixam de sincronizar com a nuvem.",
    botao: "Sair da conta",
  });
  if (!ok) return;
  const r = await acao(() => window.conta.sair(), "conta-erro-sinc");
  if (r) mostrar(r.dados);
}

async function sincronizarAgora() {
  const r = await acao(() => window.conta.sincronizar(), "conta-erro-sinc");
  if (r) mostrar(r.dados);
}

// Dados que chegaram de outro PC.
function aoMudar({ nomes }) {
  atualizar();
  if (!nomes?.length) return;
  if (nomes.includes("configuracoes")) carregarConfig();
  const tela = telaAberta();
  if (tela === "configuracoes" || tela === "inicio") return;
  mostrarAviso("Chegaram dados de outro PC.", {
    duracao: 8000,
    acao: { rotulo: "Atualizar tela", aoClicar: () => irPara(tela, { voltando: true }) },
  });
}

export function iniciarConta() {
  $("conta-form").addEventListener("submit", entrar);
  $("conta-criar").addEventListener("click", criar);
  $("conta-esqueci").addEventListener("click", esqueci);
  $("conta-google").addEventListener("click", google);
  $("conta-sair").addEventListener("click", sair);
  $("conta-sincronizar").addEventListener("click", sincronizarAgora);
  window.conta.aoMudar(aoMudar);
  atualizar();
}

export { atualizar as atualizarConta };
