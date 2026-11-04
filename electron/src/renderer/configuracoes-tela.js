// Tela de Configurações: nome e acesso à pasta de dados.
import { estado, mostrarAviso, registrarAoAbrir, salvarConfig } from "./shell.js";

const $ = (id) => document.getElementById(id);

function preencher() {
  $("c-nome").value = estado.config.nome ?? "";
  $("erro-config").textContent = "";
}

async function salvar(ev) {
  ev.preventDefault();
  const resposta = await salvarConfig({ nome: $("c-nome").value, nomePerguntado: true });
  if (!resposta.ok) {
    $("erro-config").textContent = resposta.erro;
    return;
  }
  $("erro-config").textContent = "";
  mostrarAviso("Configurações salvas.");
}

async function abrirPasta() {
  const resposta = await window.dados.abrirPasta();
  if (!resposta.ok) mostrarAviso(resposta.erro);
}

export function iniciarConfiguracoes() {
  $("form-config").addEventListener("submit", salvar);
  $("abrir-pasta-dados").addEventListener("click", abrirPasta);
  registrarAoAbrir("configuracoes", preencher);
}
