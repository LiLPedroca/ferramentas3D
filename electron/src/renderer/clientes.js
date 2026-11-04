// Tela de Clientes: lista, busca, cadastro, edição, exclusão e atalho para o WhatsApp.
import { formatarDocumento, formatarTelefone, iniciais, linkWhatsApp } from "../core/formatos.js";
import { normalizar } from "../core/inicio.js";
import { icone } from "./icones.js";
import { confirmar, mostrarAviso } from "./shell.js";

const $ = (id) => document.getElementById(id);

let clientes = [];
let editandoId = null;

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export function listaDeClientes() {
  return clientes;
}

// ---------- Lista ----------
function linhaCliente(c) {
  const linha = el("button", "linha-cliente");
  linha.type = "button";
  linha.setAttribute("aria-label", `Editar ${c.nome}`);

  const avatar = el("span", "avatar", iniciais(c.nome));
  const principal = el("span", "cliente-principal");
  principal.append(el("span", "cliente-nome", c.nome));
  if (c.cidade) principal.append(el("span", "cliente-sub", c.cidade));

  const contato = el("span", "cliente-contato");
  if (c.telefone) contato.append(el("span", "", formatarTelefone(c.telefone)));
  if (c.email) contato.append(el("span", "cliente-sub", c.email));

  const seta = el("span", "cliente-seta");
  seta.innerHTML = icone("seta", 16);

  linha.append(avatar, principal, contato, seta);
  linha.addEventListener("click", () => abrirEditor(c));
  return linha;
}

function renderizar() {
  const palavras = normalizar($("busca-clientes").value).split(/\s+/).filter(Boolean);
  const filtrados = clientes.filter((c) => {
    const texto = normalizar(`${c.nome} ${c.cidade} ${c.email} ${c.telefone} ${c.documento}`);
    return palavras.every((p) => texto.includes(p));
  });
  $("lista-clientes").replaceChildren(...filtrados.map(linhaCliente));
  $("lista-clientes").hidden = filtrados.length === 0;
  $("vazio-clientes").hidden = clientes.length > 0;
  $("sem-resultado-clientes").hidden = clientes.length === 0 || filtrados.length > 0;
  $("clientes-resumo").textContent =
    clientes.length === 1 ? "1 cliente cadastrado" : `${clientes.length} clientes cadastrados`;
}

export async function carregarClientes() {
  const resposta = await window.dados.clientes.listar();
  if (!resposta.ok) {
    $("erro-clientes").textContent = resposta.erro;
    return [];
  }
  $("erro-clientes").textContent = "";
  clientes = resposta.dados;
  renderizar();
  return clientes;
}

// ---------- Editor ----------
function atualizarWhatsApp() {
  const link = linkWhatsApp($("cl-telefone").value);
  $("cl-whatsapp").hidden = !link;
}

export function abrirEditor(c) {
  editandoId = c?.id ?? null;
  $("titulo-dialogo-cliente").textContent = c ? "Editar cliente" : "Novo cliente";
  $("cl-nome").value = c?.nome ?? "";
  $("cl-telefone").value = formatarTelefone(c?.telefone);
  $("cl-email").value = c?.email ?? "";
  $("cl-documento").value = formatarDocumento(c?.documento);
  $("cl-cidade").value = c?.cidade ?? "";
  $("cl-obs").value = c?.observacoes ?? "";
  $("erro-cliente").textContent = "";
  $("excluir-cliente").hidden = !c;
  atualizarWhatsApp();
  $("dialogo-cliente").showModal();
  $("cl-nome").focus();
}

async function salvar(ev) {
  ev.preventDefault();
  const botao = $("salvar-cliente");
  botao.disabled = true;
  try {
    const resposta = await window.dados.clientes.salvar(
      {
        nome: $("cl-nome").value,
        telefone: $("cl-telefone").value,
        email: $("cl-email").value,
        documento: $("cl-documento").value,
        cidade: $("cl-cidade").value,
        observacoes: $("cl-obs").value,
      },
      editandoId,
    );
    if (!resposta.ok) {
      $("erro-cliente").textContent = resposta.erro;
      return;
    }
    $("dialogo-cliente").close();
    mostrarAviso(editandoId ? "Cliente atualizado." : "Cliente cadastrado.");
    await carregarClientes();
  } finally {
    botao.disabled = false;
  }
}

async function excluir() {
  const cliente = clientes.find((c) => c.id === editandoId);
  if (!cliente) return;
  const ok = await confirmar({
    titulo: "Excluir cliente?",
    texto: `"${cliente.nome}" será excluído. Essa ação não pode ser desfeita.`,
    botao: "Excluir",
  });
  if (!ok) return;
  const resposta = await window.dados.clientes.excluir(editandoId);
  if (!resposta.ok) {
    $("erro-cliente").textContent = resposta.erro;
    return;
  }
  $("dialogo-cliente").close();
  mostrarAviso("Cliente excluído.");
  await carregarClientes();
}

export function iniciarClientes() {
  $("vazio-clientes-icone").innerHTML = icone("clientes", 40);
  $("novo-cliente").addEventListener("click", () => abrirEditor());
  $("vazio-novo-cliente").addEventListener("click", () => abrirEditor());
  $("busca-clientes").addEventListener("input", renderizar);

  $("form-cliente").addEventListener("submit", salvar);
  $("fechar-cliente").addEventListener("click", () => $("dialogo-cliente").close());
  $("cancelar-cliente").addEventListener("click", () => $("dialogo-cliente").close());
  $("excluir-cliente").addEventListener("click", excluir);
  $("cl-telefone").addEventListener("input", atualizarWhatsApp);
  $("cl-telefone").addEventListener("blur", () => {
    const formatado = formatarTelefone($("cl-telefone").value);
    if (formatado) $("cl-telefone").value = formatado;
  });
  $("cl-documento").addEventListener("blur", () => {
    $("cl-documento").value = formatarDocumento($("cl-documento").value) || $("cl-documento").value;
  });
  $("cl-whatsapp").addEventListener("click", () => {
    const link = linkWhatsApp($("cl-telefone").value);
    if (link) window.open(link);
  });
}
