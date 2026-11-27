// Marca Criae3D nos arquivos exportados: entra no nome do arquivo ("Maria - Criae3D.3mf") e dentro dele
// (3MF: título, designer e direitos; STL: cabeçalho). Na tela o usuário só digita o nome.
import { trocarNoZip } from "./zip-troca.js";

export const MARCA = "Criae3D";

const escaparXml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function nomeComMarca(nome) {
  const limpo = String(nome ?? "").replace(/\s+/g, " ").trim() || "Modelo";
  return new RegExp(`\\s-\\s${MARCA}$`, "i").test(limpo) ? limpo : `${limpo} - ${MARCA}`;
}

// Troca (ou põe) Title, Designer e Copyright no modelo principal do 3MF. As malhas não são tocadas.
export function marcar3mf(bytes, titulo) {
  let achou = false;
  const saida = trocarNoZip(bytes, (caminho, ler) => {
    if (caminho !== "3D/3dmodel.model") return undefined;
    achou = true;
    const texto = new TextDecoder().decode(ler());
    const sem = texto.replace(/<metadata\b[^>]*\bname="(?:Title|Designer|Copyright|Description)"[^>]*>[\s\S]*?<\/metadata>\s*/g, "").replace(/<metadata\b[^>]*\bname="(?:Title|Designer|Copyright|Description)"[^>]*\/>\s*/g, "");
    const meta =
      `<metadata name="Title">${escaparXml(titulo)}</metadata>` +
      `<metadata name="Designer">${MARCA}</metadata>` +
      `<metadata name="Copyright">${MARCA}</metadata>` +
      `<metadata name="Description">${MARCA}</metadata>`;
    const abre = /<model\b[^>]*>/.exec(sem);
    if (!abre) throw new Error("Arquivo 3MF inválido.");
    const fim = abre.index + abre[0].length;
    return sem.slice(0, fim) + meta + sem.slice(fim);
  });
  if (!achou) throw new Error("Arquivo 3MF inválido.");
  return saida;
}

// STL binário: os 80 bytes do cabeçalho levam a marca (não pode começar com "solid").
export function marcarStl(bytes, titulo) {
  if (bytes.length < 84) return bytes;
  const saida = new Uint8Array(bytes);
  const texto = `${MARCA} - ${String(titulo).normalize("NFD").replace(/[̀-ͯ]/g, "")}`.replace(/[^\x20-\x7e]/g, "").slice(0, 80);
  saida.fill(0x20, 0, 80);
  for (let i = 0; i < texto.length; i++) saida[i] = texto.charCodeAt(i);
  return saida;
}

export const marcarArquivo = (bytes, titulo, extensao) => (extensao === "3mf" ? marcar3mf(bytes, titulo) : marcarStl(bytes, titulo));
