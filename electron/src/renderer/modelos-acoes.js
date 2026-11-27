// Ações compartilhadas pelas telas de modelos. As regras de cor e pausas ficam em cada modelo.
import { preencherDoModelo } from "./calculadora-tela.js";
import { abrirNoFatiador } from "./fatiador-ui.js";
import modeloFilamento from "../core/filamento.cjs";
import modeloImpressao from "../core/impressao.cjs";
import { carregarFilamentos, estoquePorCor, listaDeRolos } from "./filamentos-tela.js";
import { densidadeDoMaterial, pesoDasMalhas, textoDoPeso, volumeDaGeometria } from "./modelos/estimativa.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { materialAtual } from "./modelos/projeto-fatiador.js";
import { marcar3mf, marcarArquivo, nomeComMarca } from "./modelos/marca.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { avisoArquivoSalvo, mostrarAviso } from "./shell.js";

const $ = (id) => document.getElementById(id);

export function materialDoModelo(padrao = materialAtual()) {
  const id = $("rolo-calc")?.value;
  return listaDeRolos().find((rolo) => rolo.id === id)?.material ?? padrao;
}

export const densidadeDoModelo = (padrao) => densidadeDoMaterial(materialDoModelo(padrao));

// Confere os campos atuais, inclusive quando outro campo disparou a geração.
export function conferirMedidas(medidas, limites, ler = (id) => Number(String($(id).value).replace(",", ".")), formatar = (n) => `${n.toLocaleString("pt-BR")} mm`) {
  for (const [id, chave] of Object.entries(medidas)) {
    const valor = ler(id);
    const [minimo, maximo] = limites[chave];
    if (!Number.isFinite(valor) || valor < minimo || valor > maximo) {
      const nome = $(id).closest("label")?.querySelector("span")?.textContent.trim() || "Medida";
      throw new Error(`${nome}: use de ${formatar(minimo, chave)} a ${formatar(maximo, chave)}.`);
    }
  }
}

export function mudarPrevia(prefixo, modo, previa2d, previa3d, partes) {
  $(`${prefixo}-ver-2d`).setAttribute("aria-pressed", String(modo === "2d"));
  $(`${prefixo}-ver-3d`).setAttribute("aria-pressed", String(modo === "3d"));
  previa2d.ativar(modo === "2d");
  $(`${prefixo}-3d`).hidden = modo !== "3d";
  if (modo === "3d") {
    previa3d ??= criarPrevia($(`${prefixo}-3d`));
    if (partes) previa3d.mostrar(partes);
  }
  return previa3d;
}

export function zoomPrevia(modo, previa2d, previa3d, fator) {
  (modo === "3d" ? previa3d : previa2d)?.zoom(fator);
}

export function ajustarPrevia(modo, previa2d, previa3d) {
  if (modo === "3d") previa3d?.enquadrar();
  else previa2d?.ajustar();
}

// ---------- Exportar: caixinha do nome, marca Criae3D e gravação direta na pasta Modelos 3D ----------
let responderNome = null;

function fecharNome(valor) {
  // pega a resposta antes de fechar: o evento "close" chama fecharNome(null) de novo
  const r = responderNome;
  responderNome = null;
  if ($("dialogo-nome-arquivo")?.open) $("dialogo-nome-arquivo").close();
  r?.(valor);
}

function confirmarNome() {
  const nome = $("na-nome").value.replace(/\s+/g, " ").trim();
  if (!nome) {
    $("erro-nome-arquivo").textContent = "Digite o nome do arquivo.";
    $("na-nome").focus();
    return;
  }
  fecharNome(nome);
}

// Pergunta o nome do arquivo (só o nome: a marca entra sozinha). Devolve o nome ou null (cancelou).
export function pedirNomeArquivo(padrao = "") {
  fecharNome(null);
  $("na-nome").value = String(padrao ?? "").replace(/\s+-\s+Criae3D$/i, "");
  $("erro-nome-arquivo").textContent = "";
  $("dialogo-nome-arquivo").showModal();
  $("na-nome").select();
  return new Promise((r) => {
    responderNome = r;
  });
}

export function iniciarNomeArquivo() {
  $("na-salvar").addEventListener("click", confirmarNome);
  $("na-cancelar").addEventListener("click", () => fecharNome(null));
  $("dialogo-nome-arquivo").addEventListener("close", () => fecharNome(null));
  $("na-nome").addEventListener("input", () => {
    $("erro-nome-arquivo").textContent = "";
  });
  $("na-nome").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      confirmarNome();
    }
  });
}

// Grava o arquivo já marcado na pasta Modelos 3D e mostra o aviso no meio da tela.
async function gravarModelo(bytes, nomeFinal, extensao, aviso = "") {
  const resposta = await window.modelos.gravar(marcarArquivo(bytes, nomeFinal, extensao), nomeFinal, extensao);
  if (!resposta.ok) {
    mostrarAviso(resposta.erro);
    return null;
  }
  avisoArquivoSalvo(resposta.dados.caminho);
  if (aviso?.trim()) setTimeout(() => mostrarAviso(aviso.trim(), { duracao: 6000 }), 3400);
  return resposta.dados.caminho;
}

// bytes já prontos: pergunta o nome e grava.
export async function salvarArquivoModelo(bytes, nome, extensao, aviso = "") {
  const escolhido = await pedirNomeArquivo(nome);
  if (!escolhido) return null;
  return gravarModelo(bytes, nomeComMarca(escolhido), extensao, aviso);
}

// Pergunta o nome antes e depois monta: montar(nomeFinal) → { bytes, aviso } | null.
export async function salvarMontando(nome, extensao, montar) {
  const escolhido = await pedirNomeArquivo(nome);
  if (!escolhido) return null;
  const final = nomeComMarca(escolhido);
  const arquivo = await montar(final);
  if (!arquivo) return null;
  return gravarModelo(arquivo.bytes, final, extensao, arquivo.aviso);
}

// Abre bytes de 3MF prontos no fatiador, com o nome escolhido e a marca.
export async function enviarArquivoAoFatiador(bytes, nome, aviso = "") {
  const escolhido = await pedirNomeArquivo(nome);
  if (!escolhido) return false;
  const final = nomeComMarca(escolhido);
  await abrirNoFatiador(marcar3mf(bytes, final), final, "3mf");
  if (aviso?.trim()) mostrarAviso(aviso.trim(), { duracao: 6000 });
  return true;
}

// Filamento de cada parte no 3MF = posição do rolo daquela cor na impressora (Estoque > Na impressora).
// Assim o fatiador mostra a cor certa e o AMS/ACE puxa o rolo certo. Cor sem rolo na impressora vai para
// uma posição livre. Parte com slot já escolhido (sem AMS: tudo no 1) não muda. Sem posições: nada muda.
export function slotsDaImpressora(partes, rolos = listaDeRolos()) {
  const naImpressora = new Map();
  for (const r of rolos ?? []) if (r.posicao && !naImpressora.has(r.cor)) naImpressora.set(r.cor, r.posicao);
  if (!naImpressora.size) return partes;
  const usadas = new Set(naImpressora.values());
  const livre = () => {
    let n = 1;
    while (usadas.has(n)) n++;
    usadas.add(n);
    return n;
  };
  const porCor = new Map();
  return partes.map((p) => {
    if (Number.isInteger(p.slot)) return p;
    const cor = modeloFilamento.corProntaDoHex(p.cor);
    if (!porCor.has(cor)) porCor.set(cor, naImpressora.get(cor) ?? livre());
    return { ...p, slot: porCor.get(cor) };
  });
}

// Lê o estoque (posições da impressora) e devolve as partes com o filamento certo.
export async function comSlotsDaImpressora(partes) {
  try {
    await carregarFilamentos();
  } catch {
    return partes; // sem estoque: fica como estava
  }
  return slotsDaImpressora(partes);
}

// montar3mf(nomeFinal) → { bytes, aviso } | null (null = cancelou, ex.: na pergunta do AMS).
export async function salvarModeloComo(extensao, partes, nome, montar3mf) {
  if (!partes) return;
  await salvarMontando(nome, extensao, async (final) =>
    extensao === "3mf"
      ? await (montar3mf ? montar3mf(final) : { bytes: gerar3mf(await comSlotsDaImpressora(partes), { titulo: final }) })
      : { bytes: gerarStl(partes) },
  );
}

export async function enviarModeloAoFatiador(partes, nome, montar3mf) {
  if (!partes) return;
  const escolhido = await pedirNomeArquivo(nome);
  if (!escolhido) return;
  const final = nomeComMarca(escolhido);
  const arquivo = await (montar3mf ? montar3mf(final) : { bytes: gerar3mf(await comSlotsDaImpressora(partes), { titulo: final }) });
  if (!arquivo) return;
  await abrirNoFatiador(marcar3mf(arquivo.bytes, final), final, "3mf");
  const falta = await faltaDeFilamento(partes);
  const aviso = [arquivo.aviso?.trim(), falta].filter(Boolean).join(" ");
  if (aviso) mostrarAviso(aviso, { duracao: falta ? 8000 : 2600 });
}

// Confere o estoque (se houver rolos cadastrados): cada cor da peça tem filamento suficiente?
// Devolve o aviso ("" se está tudo certo ou se o estoque está vazio).
export async function faltaDeFilamento(partes, densidade = densidadeDoModelo()) {
  const estoque = await estoquePorCor();
  if (!estoque) return "";
  const precisa = new Map();
  for (const p of partes) {
    const cor = modeloFilamento.corProntaDoHex(p.cor);
    if (!cor || !p.geometria) continue;
    precisa.set(cor, (precisa.get(cor) ?? 0) + (volumeDaGeometria(p.geometria) / 1000) * densidade);
  }
  const nome = (id) => modeloImpressao.CORES.find((c) => c.id === id)?.nome ?? id;
  const g = (n) => `${Math.ceil(n).toLocaleString("pt-BR")} g`;
  const faltas = [...precisa]
    .filter(([cor, gramas]) => (estoque.get(cor) ?? 0) < gramas)
    .map(([cor, gramas]) => (estoque.has(cor) ? `${nome(cor)} tem ${g(estoque.get(cor))} e a peça precisa de ≈ ${g(gramas)}` : `não há rolo ${nome(cor)} no estoque`));
  return faltas.length ? `Atenção ao filamento: ${faltas.join("; ")}.` : "";
}

export function calcularCustoModelo(modelo, nome, densidade = densidadeDoModelo()) {
  if (!modelo) return;
  const peso = pesoDasMalhas(modelo.malhas, densidade);
  preencherDoModelo({ nome, pesoG: peso.total, detalhe: textoDoPeso(peso).replace(/^≈ /, "") });
}

export function arquivoDeTexto(dataUrl, nome) {
  const [cabecalho, base64] = dataUrl.split(",");
  const tipo = cabecalho.match(/data:([^;]+)/)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return nome === undefined ? new Blob([bytes], { type: tipo }) : new File([bytes], nome, { type: tipo });
}

export async function imagemComoTexto(canvas) {
  if (!canvas.convertToBlob) return canvas.toDataURL("image/png");
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(leitor.result);
    leitor.onerror = () => falha(new Error("Não foi possível guardar a imagem."));
    leitor.readAsDataURL(blob);
  });
}
