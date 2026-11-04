// Meu fatiador: escolher o programa e abrir modelos nele.
import { estado, mostrarAviso, salvarConfig } from "./shell.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);

let escolhido = null; // { nome, caminho }
let aoEscolher = null;

function opcaoFatiador(f) {
  const rotulo = el("label", "fatiador-opcao");
  const radio = el("input");
  radio.type = "radio";
  radio.name = "fatiador";
  radio.checked = escolhido?.caminho?.toLowerCase() === f.caminho.toLowerCase();
  radio.addEventListener("change", () => {
    escolhido = f;
  });
  const texto = el("span", "fatiador-texto");
  texto.append(el("strong", "", f.nome), el("span", "cliente-sub", f.caminho));
  rotulo.append(radio, texto);
  return rotulo;
}

function mostrarLista(lista) {
  const itens = lista.map(opcaoFatiador);
  if (itens.length === 0) {
    itens.push(el("p", "ajuda", "Nenhum fatiador encontrado nas pastas padrão. Use \"Procurar no computador\"."));
  }
  $("fatiador-lista").replaceChildren(...itens);
}

// Abre a janela de escolha. depois: função chamada quando o usuário salvar.
export async function abrirSeletorFatiador(depois) {
  aoEscolher = depois ?? null;
  escolhido = estado.config.fatiador?.caminho ? { ...estado.config.fatiador } : null;
  $("erro-fatiador").textContent = "";
  $("fatiador-lista").replaceChildren(el("p", "ajuda", "Procurando fatiadores instalados…"));
  $("dialogo-fatiador").showModal();
  const resposta = await window.fatiador.detectar();
  const lista = resposta.ok ? resposta.dados : [];
  if (escolhido && !lista.some((f) => f.caminho.toLowerCase() === escolhido.caminho.toLowerCase())) lista.unshift(escolhido);
  if (!escolhido && lista.length) escolhido = lista[0];
  mostrarLista(lista);
}

async function procurar() {
  const resposta = await window.fatiador.procurar();
  if (!resposta.ok || !resposta.dados) return;
  escolhido = resposta.dados;
  const atuais = [...$("fatiador-lista").querySelectorAll(".fatiador-opcao")].length;
  if (atuais === 0) $("fatiador-lista").replaceChildren();
  $("fatiador-lista").prepend(opcaoFatiador(escolhido));
  $("fatiador-lista").querySelector("input").checked = true;
}

async function salvar() {
  if (!escolhido) {
    $("erro-fatiador").textContent = "Escolha um fatiador da lista ou procure no computador.";
    return;
  }
  const resposta = await salvarConfig({ fatiador: escolhido });
  if (!resposta.ok) {
    $("erro-fatiador").textContent = resposta.erro;
    return;
  }
  $("dialogo-fatiador").close();
  mostrarAviso(`Fatiador escolhido: ${resposta.dados.fatiador.nome}.`);
  const depois = aoEscolher;
  aoEscolher = null;
  depois?.();
}

// Abre o fatiador (com um modelo, se houver). Sem fatiador escolhido, pede para escolher e tenta de novo.
export async function abrirNoFatiador(bytes, nome, extensao) {
  const resposta = await window.fatiador.abrir(bytes, nome, extensao);
  if (resposta.ok) {
    mostrarAviso(`Abrindo ${resposta.dados}…`);
    return;
  }
  if (resposta.erro === "SEM_FATIADOR") {
    abrirSeletorFatiador(() => abrirNoFatiador(bytes, nome, extensao));
    return;
  }
  mostrarAviso(resposta.erro);
}

export function iniciarFatiador() {
  $("meu-fatiador").addEventListener("click", () => abrirNoFatiador());
  $("fatiador-procurar").addEventListener("click", procurar);
  $("fatiador-salvar").addEventListener("click", salvar);
  $("fatiador-cancelar").addEventListener("click", () => $("dialogo-fatiador").close());
}
