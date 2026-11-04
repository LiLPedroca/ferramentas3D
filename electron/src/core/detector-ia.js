// Detector de IA por indícios locais: procura no arquivo marcas deixadas por geradores de imagem.
// Não analisa os pixels. Sem indícios não quer dizer que a imagem é real.
import { analisarImagem, detectarFormato } from "./metadados.js";

// Nomes de geradores e ferramentas de IA que costumam aparecer em metadados.
const GERADORES = [
  ["midjourney", "Midjourney"],
  ["dall-e", "DALL·E"],
  ["dall·e", "DALL·E"],
  ["dalle", "DALL·E"],
  ["openai", "OpenAI"],
  ["chatgpt", "ChatGPT"],
  ["stable diffusion", "Stable Diffusion"],
  ["stablediffusion", "Stable Diffusion"],
  ["adobe firefly", "Adobe Firefly"],
  ["firefly", "Adobe Firefly"],
  ["novelai", "NovelAI"],
  ["leonardo.ai", "Leonardo.Ai"],
  ["ideogram", "Ideogram"],
  ["comfyui", "ComfyUI"],
  ["automatic1111", "Automatic1111"],
  ["invokeai", "InvokeAI"],
  ["bing image creator", "Bing Image Creator"],
  ["microsoft designer", "Microsoft Designer"],
  ["imagen", "Google Imagen"],
  ["gemini", "Google Gemini"],
  ["meta ai", "Meta AI"],
  ["flux.1", "FLUX"],
  ["black forest labs", "FLUX"],
];

// Termos do padrão IPTC "DigitalSourceType" (o mais confiável quando presente).
const FONTE_IA = [
  ["compositewithtrainedalgorithmicmedia", "Imagem combinada com conteúdo gerado por IA"],
  ["trainedalgorithmicmedia", "Imagem gerada por IA"],
  ["algorithmicmedia", "Imagem criada por algoritmo"],
];

const LATIN1 = new TextDecoder("latin1");

// Trechos do arquivo onde ficam os metadados (início e fim), para não varrer a imagem inteira.
function textoDosMetadados(bytes) {
  const inicio = LATIN1.decode(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024)));
  const fim = bytes.length > 5 * 1024 * 1024 ? LATIN1.decode(bytes.subarray(bytes.length - 1024 * 1024)) : "";
  return `${inicio}\n${fim}`.toLowerCase();
}

function procurarGeradores(texto) {
  const achados = new Set();
  for (const [termo, nome] of GERADORES) {
    // "imagen" e "gemini" só contam perto de "google", para evitar falsos positivos
    if ((termo === "imagen" || termo === "gemini") && !texto.includes("google")) continue;
    if (termo === "firefly" && !texto.includes("adobe")) continue;
    if (texto.includes(termo)) achados.add(nome);
  }
  return [...achados];
}

export function detectarIA(bytes) {
  const formato = detectarFormato(bytes);
  if (!formato) throw new Error("Formato não suportado. Use JPEG, PNG ou WebP.");

  const analise = analisarImagem(bytes);
  const texto = textoDosMetadados(bytes);
  const evidencias = [];

  for (const [termo, rotulo] of FONTE_IA) {
    if (texto.includes(termo)) {
      evidencias.push({ forca: "forte", rotulo, detalhe: `Marcação de origem "${termo}" (padrão IPTC) encontrada nos metadados.` });
      break; // a mais específica basta
    }
  }

  // Parâmetros típicos do Stable Diffusion (Automatic1111) e do ComfyUI em PNG
  const textosPng = analise.textos.join("\n").toLowerCase();
  if (/steps:\s*\d+/.test(textosPng) && /(sampler|cfg scale|seed):/.test(textosPng)) {
    evidencias.push({ forca: "forte", rotulo: "Parâmetros de geração", detalhe: "O arquivo traz passos, sampler e seed usados para gerar a imagem." });
  } else if (textosPng.includes('"class_type"') || /^(prompt|workflow)\n/m.test(textosPng)) {
    evidencias.push({ forca: "forte", rotulo: "Fluxo do ComfyUI", detalhe: "O arquivo traz o prompt ou o fluxo usado no ComfyUI." });
  }

  const geradores = procurarGeradores(texto);
  if (geradores.length) {
    evidencias.push({ forca: "forte", rotulo: "Gerador citado", detalhe: `Os metadados citam: ${geradores.join(", ")}.` });
  }

  const temC2pa = analise.itens.some((i) => i.tipo === "c2pa") || texto.includes("c2pa");
  if (temC2pa) {
    evidencias.push({
      forca: "media",
      rotulo: "Credenciais de conteúdo (C2PA)",
      detalhe: "O arquivo tem um registro de origem. Abra em contentcredentials.org/verify para ver a assinatura completa.",
    });
  }

  const fortes = evidencias.filter((e) => e.forca === "forte").length;
  const nivel = fortes > 0 ? "forte" : temC2pa ? "credenciais" : "nenhum";
  return { formato, nivel, evidencias, metadados: analise.itens.length };
}

export const RESUMOS = {
  forte: { titulo: "Indícios de IA encontrados", texto: "Os metadados indicam que a imagem foi gerada ou editada com IA." },
  credenciais: {
    titulo: "Registro de origem encontrado",
    texto: "A imagem tem credenciais de conteúdo, mas sem marca de IA que este programa consiga ler.",
  },
  nenhum: {
    titulo: "Nenhum indício encontrado",
    texto: "Isso não prova que a imagem é real: prints, edições e redes sociais costumam apagar essas marcas.",
  },
};
