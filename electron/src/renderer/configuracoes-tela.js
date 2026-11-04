// Tela de Configurações: seu nome, dados da empresa, padrões do orçamento e pasta de dados.
import { formatarDocumento, formatarTelefone } from "../core/formatos.js";
import { abrirSeletorFatiador } from "./fatiador-ui.js";
import { aoMudarConfig, estado, mostrarAviso, registrarAoAbrir, salvarConfig } from "./shell.js";

function mostrarFatiador(config) {
  const f = config.fatiador;
  $("c-fatiador-atual").textContent = f?.caminho ? `${f.nome} · ${f.caminho}` : "Nenhum fatiador escolhido ainda.";
}

const $ = (id) => document.getElementById(id);

function preencher() {
  const c = estado.config;
  const e = c.empresa ?? {};
  const o = c.orcamento ?? {};
  $("c-nome").value = c.nome ?? "";
  $("c-emp-nome").value = e.nome ?? "";
  $("c-emp-telefone").value = formatarTelefone(e.telefone);
  $("c-emp-email").value = e.email ?? "";
  $("c-emp-documento").value = formatarDocumento(e.documento);
  $("c-emp-cidade").value = e.cidade ?? "";
  $("c-emp-site").value = e.site ?? "";
  $("c-orc-validade").value = String(o.validadeDias ?? 7);
  $("c-orc-prazo").value = o.prazoProducao ?? "";
  $("c-orc-pagamento").value = o.formaPagamento ?? "";
  $("c-orc-obs").value = o.observacoes ?? "";
  $("erro-config").textContent = "";
}

async function salvar(ev) {
  ev.preventDefault();
  const resposta = await salvarConfig({
    nome: $("c-nome").value,
    nomePerguntado: true,
    empresa: {
      nome: $("c-emp-nome").value,
      telefone: $("c-emp-telefone").value,
      email: $("c-emp-email").value,
      documento: $("c-emp-documento").value,
      cidade: $("c-emp-cidade").value,
      site: $("c-emp-site").value,
    },
    orcamento: {
      validadeDias: $("c-orc-validade").value,
      prazoProducao: $("c-orc-prazo").value,
      formaPagamento: $("c-orc-pagamento").value,
      observacoes: $("c-orc-obs").value,
    },
  });
  if (!resposta.ok) {
    $("erro-config").textContent = resposta.erro;
    return;
  }
  preencher();
  mostrarAviso("Configurações salvas.");
}

async function abrirPasta() {
  const resposta = await window.dados.abrirPasta();
  if (!resposta.ok) mostrarAviso(resposta.erro);
}

export function iniciarConfiguracoes() {
  $("form-config").addEventListener("submit", salvar);
  $("abrir-pasta-dados").addEventListener("click", abrirPasta);
  $("c-escolher-fatiador").addEventListener("click", () => abrirSeletorFatiador());
  aoMudarConfig(mostrarFatiador);
  registrarAoAbrir("configuracoes", preencher);
}
