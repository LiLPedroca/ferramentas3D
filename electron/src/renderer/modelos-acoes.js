// Ações compartilhadas pelas telas de modelos. As regras de cor e pausas ficam em cada modelo.
import { preencherDoModelo } from "./calculadora-tela.js";
import { abrirNoFatiador } from "./fatiador-ui.js";
import { pesoDasMalhas, textoDoPeso } from "./modelos/estimativa.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { criarPrevia } from "./modelos/previa3d.js";
import { mostrarAviso } from "./shell.js";

const $ = (id) => document.getElementById(id);

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

export async function salvarArquivoModelo(bytes, nome, extensao, aviso = "") {
  const resposta = await window.modelos.salvar(bytes, nome, extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.${aviso}`);
}

export async function salvarModeloComo(extensao, partes, nome, montar3mf) {
  if (!partes) return;
  const arquivo = extensao === "3mf"
    ? await (montar3mf ? montar3mf() : { bytes: gerar3mf(partes, { titulo: nome }) })
    : { bytes: gerarStl(partes) };
  if (arquivo) await salvarArquivoModelo(arquivo.bytes, nome, extensao, arquivo.aviso);
}

export async function enviarModeloAoFatiador(partes, nome, montar3mf) {
  if (!partes) return;
  const arquivo = await (montar3mf ? montar3mf() : { bytes: gerar3mf(partes, { titulo: nome }) });
  if (!arquivo) return;
  await abrirNoFatiador(arquivo.bytes, nome, "3mf");
  if (arquivo.aviso) mostrarAviso(arquivo.aviso.trim());
}

export function calcularCustoModelo(modelo, nome, densidade) {
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
