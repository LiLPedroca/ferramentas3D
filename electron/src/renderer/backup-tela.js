// Tela de Backup e armazenamento.
import { ROTULO_TAMANHO } from "./util-tela.js";
import { confirmar, mostrarAviso, registrarAoAbrir } from "./shell.js";

const $ = (id) => document.getElementById(id);

const NOMES = { produtos: "Produtos", clientes: "Clientes", orcamentos: "Orçamentos", favoritos: "Favoritos de STL", projetos: "Modelos salvos", filamentos: "Rolos de filamento", configuracoes: "Configurações" };

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

const dataHora = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function descreverResumo(r) {
  const partes = [
    `${r.produtos} produto(s)`,
    `${r.clientes} cliente(s)`,
    `${r.orcamentos} orçamento(s)`,
    `${r.favoritos ?? 0} favorito(s) de STL`,
    `${r.projetos ?? 0} modelo(s) salvo(s)`,
    `${r.filamentos ?? 0} rolo(s) de filamento`,
  ];
  return partes.join(", ");
}

async function carregar() {
  const resposta = await window.backup.resumo();
  if (!resposta.ok) {
    $("erro-backup").textContent = resposta.erro;
    return;
  }
  $("erro-backup").textContent = "";
  const r = resposta.dados;

  $("bk-contagem").replaceChildren(
    ...["produtos", "clientes", "orcamentos", "favoritos", "projetos", "filamentos"].map((nome) => {
      const bloco = el("div", "bk-numero");
      bloco.append(el("strong", "", String(r.contagem[nome] ?? 0)), el("span", "", NOMES[nome]));
      return bloco;
    }),
  );
  const total = r.arquivos.reduce((s, a) => s + a.tamanho, 0) + r.automaticos.reduce((s, a) => s + a.tamanho, 0);
  $("bk-espaco").textContent = `${ROTULO_TAMANHO(total)} usados, incluindo ${r.automaticos.length} cópia(s) automática(s).`;
  $("bk-pasta").textContent = r.pasta;

  const lista = r.automaticos.map((a) => {
    const linha = el("div", "bk-auto");
    const tipo = a.nome.startsWith("antes-de-restaurar") ? "Antes de restaurar" : "Cópia diária";
    const texto = el("span", "bk-auto-texto");
    texto.append(el("strong", "", tipo), el("span", "cliente-sub", `${dataHora(a.data)} · ${ROTULO_TAMANHO(a.tamanho)}`));
    const botao = el("button", "botao-secundario pequeno", "Restaurar");
    botao.type = "button";
    botao.addEventListener("click", () => escolherAutomatico(a.nome));
    linha.append(texto, botao);
    return linha;
  });
  if (lista.length === 0) lista.push(el("p", "ajuda", "Nenhuma cópia automática ainda. A primeira é feita na próxima abertura do programa, se houver dados."));
  $("bk-automaticos").replaceChildren(...lista);
  $("bk-previa").hidden = true;
}

async function exportar() {
  const resposta = await window.backup.exportar();
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  if (resposta.dados) mostrarAviso("Backup salvo.");
}

function mostrarPrevia(dados) {
  const { resumo, descartados, nome } = dados;
  $("bk-previa-titulo").textContent = nome;
  const quando = resumo.criadoEm ? `Feito em ${dataHora(resumo.criadoEm)}. ` : "";
  const ignorados = descartados ? ` ${descartados} item(ns) com problema serão ignorados.` : "";
  $("bk-previa-texto").textContent = `${quando}Contém ${descreverResumo(resumo)}.${ignorados}`;
  $("bk-previa").hidden = false;
  $("bk-previa").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function escolher() {
  const resposta = await window.backup.escolher();
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  if (resposta.dados) mostrarPrevia(resposta.dados);
}

async function escolherAutomatico(nome) {
  const resposta = await window.backup.escolherAutomatico(nome);
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  mostrarPrevia(resposta.dados);
}

async function restaurar() {
  const ok = await confirmar({
    titulo: "Restaurar este backup?",
    texto: "Os produtos, clientes, orçamentos e configurações atuais serão substituídos pelos do backup. Antes, o programa guarda uma cópia do estado atual nas cópias automáticas.",
    botao: "Restaurar",
  });
  if (!ok) return;
  const resposta = await window.backup.restaurar();
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return;
  }
  mostrarAviso("Dados restaurados. O estado anterior ficou guardado nas cópias automáticas.");
  await carregar();
}

export function iniciarBackup() {
  $("bk-exportar").addEventListener("click", exportar);
  $("bk-escolher").addEventListener("click", escolher);
  $("bk-restaurar").addEventListener("click", restaurar);
  $("bk-cancelar").addEventListener("click", () => {
    $("bk-previa").hidden = true;
  });
  $("bk-abrir-pasta").addEventListener("click", async () => {
    const resposta = await window.dados.abrirPasta();
    if (!resposta.ok) mostrarAviso(resposta.erro);
  });
  registrarAoAbrir("backup", carregar);
}
