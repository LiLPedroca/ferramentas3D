// Detector de IA por indícios locais: procura no arquivo marcas deixadas por geradores de imagem.
// Não analisa os pixels. Sem indícios não quer dizer que a imagem é real.
// Cada indício diz onde foi achado (bloco do arquivo) e mostra o trecho encontrado.
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

// Ações do C2PA, em português.
const ACOES_C2PA = {
  created: "criada",
  opened: "aberta",
  edited: "editada",
  placed: "elementos inseridos",
  removed: "partes removidas",
  cropped: "recortada",
  resized: "redimensionada",
  color_adjustments: "cores ajustadas",
  filtered: "filtros aplicados",
  drawing: "desenho",
  converted: "convertida",
  transcoded: "recodificada",
  repackaged: "reempacotada",
  published: "publicada",
};

const LATIN1 = new TextDecoder("latin1");
const UTF8 = new TextDecoder();

// Trechos do arquivo onde ficam os metadados (início e fim), para não varrer a imagem inteira.
function textoDoArquivo(bytes) {
  const inicio = LATIN1.decode(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024)));
  const fim = bytes.length > 5 * 1024 * 1024 ? LATIN1.decode(bytes.subarray(bytes.length - 1024 * 1024)) : "";
  return `${inicio}\n${fim}`;
}

// Pedaço legível em volta do que foi achado (sem caracteres de controle).
export function recortarTrecho(texto, indice, tamanho, antes = 50, depois = 70) {
  const ini = Math.max(0, indice - antes);
  const fim = Math.min(texto.length, indice + tamanho + depois);
  const limpo = texto
    .slice(ini, fim)
    .replace(/[^\x20-\x7e\xa0-\xff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${ini > 0 ? "…" : ""}${limpo}${fim < texto.length ? "…" : ""}`;
}

// Procura o termo bloco por bloco; devolve onde achou e o trecho.
// O C2PA é binário (CBOR): o trecho cru seria ilegível, e o cartão do C2PA já mostra o que foi lido dele.
function localizar(fontes, termo) {
  for (const f of fontes) {
    const i = f.minusculo.indexOf(termo);
    if (i >= 0) return f.onde === "C2PA" ? { onde: f.onde } : { onde: f.onde, trecho: recortarTrecho(f.texto, i, termo.length) };
  }
  return null;
}

// ---------- C2PA ----------
// Lê um texto CBOR na posição p da string latin1 (cabeçalho 0x60..0x79).
function textoCbor(s, bytes, p) {
  const h = s.charCodeAt(p);
  let tam;
  let ini;
  if (h >= 0x60 && h <= 0x77) [tam, ini] = [h - 0x60, p + 1];
  else if (h === 0x78) [tam, ini] = [s.charCodeAt(p + 1), p + 2];
  else if (h === 0x79) [tam, ini] = [(s.charCodeAt(p + 1) << 8) | s.charCodeAt(p + 2), p + 3];
  else return "";
  if (ini + tam > bytes.length) return "";
  return UTF8.decode(bytes.subarray(ini, ini + tam)).trim();
}

const chaveCbor = (nome) => String.fromCharCode(0x60 + nome.length) + nome;

// Nomes de organização (OID 2.5.4.10) nos certificados de assinatura.
function organizacoes(s, bytes) {
  const nomes = new Set();
  const marca = "\x06\x03\x55\x04\x0a";
  let i = s.indexOf(marca);
  while (i >= 0 && nomes.size < 6) {
    const tipo = s.charCodeAt(i + 5);
    const tam = s.charCodeAt(i + 6);
    if ([0x0c, 0x13, 0x14, 0x16].includes(tipo) && tam > 0 && tam < 0x80) {
      const valor = (tipo === 0x0c ? UTF8.decode(bytes.subarray(i + 7, i + 7 + tam)) : s.slice(i + 7, i + 7 + tam)).trim();
      if (valor) nomes.add(valor);
    }
    i = s.indexOf(marca, i + 5);
  }
  return [...nomes];
}

// Extrai do C2PA: programa que gerou, ações registradas e quem aparece nos certificados.
export function lerC2pa(partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  if (!total) return null;
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    bytes.set(p, o);
    o += p.length;
  }
  const s = LATIN1.decode(bytes);

  const geradores = new Set();
  let i = s.indexOf(chaveCbor("claim_generator"));
  while (i >= 0) {
    const v = textoCbor(s, bytes, i + 16);
    if (v) geradores.add(v);
    i = s.indexOf(chaveCbor("claim_generator"), i + 16);
  }
  i = s.indexOf(chaveCbor("claim_generator_info"));
  while (i >= 0) {
    const nome = s.indexOf(chaveCbor("name"), i);
    if (nome >= 0 && nome - i < 400) {
      const v = textoCbor(s, bytes, nome + 5);
      if (v) geradores.add(v);
    }
    i = s.indexOf(chaveCbor("claim_generator_info"), i + 21);
  }

  const acoes = new Set();
  for (const m of s.matchAll(/c2pa\.([a-z_]+)/g)) {
    if (ACOES_C2PA[m[1]]) acoes.add(ACOES_C2PA[m[1]]);
  }

  return { geradores: [...geradores], acoes: [...acoes], organizacoes: organizacoes(s, bytes) };
}

function detalheC2pa(info) {
  const partes = [];
  if (info?.geradores.length) partes.push(`Programa que registrou: ${info.geradores.join(", ")}.`);
  if (info?.acoes.length) partes.push(`Ações registradas: ${info.acoes.join(", ")}.`);
  if (info?.organizacoes.length) partes.push(`Certificado de: ${info.organizacoes.join(", ")}.`);
  partes.push("Para conferir a assinatura, abra a imagem em contentcredentials.org/verify.");
  return partes.join(" ");
}

// ---------- Detector ----------
export function detectarIA(bytes) {
  const formato = detectarFormato(bytes);
  if (!formato) throw new Error("Formato não suportado. Use JPEG, PNG, WebP ou HEIC.");

  const analise = analisarImagem(bytes);
  const bruto = textoDoArquivo(bytes);
  const minusculo = bruto.toLowerCase();
  // Primeiro os blocos conhecidos; o arquivo inteiro fica por último, como rede de segurança.
  const fontes = [
    ...analise.fontes.map((f) => ({ ...f, minusculo: f.texto.toLowerCase() })),
    { onde: "Arquivo (fora dos blocos de metadados)", texto: bruto, minusculo },
  ];
  const evidencias = [];

  for (const [termo, rotulo] of FONTE_IA) {
    const achado = localizar(fontes, termo);
    if (achado) {
      evidencias.push({ forca: "forte", rotulo, detalhe: "Marcação de origem do padrão IPTC (DigitalSourceType).", ...achado });
      break; // a mais específica basta
    }
  }

  // Parâmetros típicos do Stable Diffusion (Automatic1111) e do ComfyUI em PNG
  const textosPng = fontes.filter((f) => f.onde.startsWith("Texto PNG"));
  const sd = textosPng.find((f) => /steps:\s*\d+/.test(f.minusculo) && /(sampler|cfg scale|seed):/.test(f.minusculo));
  const comfy = textosPng.find((f) => f.minusculo.includes('"class_type"') || /"(prompt|workflow)"$/.test(f.onde));
  if (sd) {
    evidencias.push({
      forca: "forte",
      rotulo: "Parâmetros de geração",
      detalhe: "O arquivo traz o prompt, os passos, o sampler e a seed usados para gerar a imagem.",
      onde: sd.onde,
      trecho: recortarTrecho(sd.texto, 0, 0, 0, 220),
    });
  } else if (comfy) {
    evidencias.push({
      forca: "forte",
      rotulo: "Fluxo do ComfyUI",
      detalhe: "O arquivo traz o prompt ou o fluxo usado no ComfyUI.",
      onde: comfy.onde,
      trecho: recortarTrecho(comfy.texto, 0, 0, 0, 160),
    });
  }

  const vistos = new Set();
  for (const [termo, nome] of GERADORES) {
    if (vistos.has(nome)) continue;
    // "imagen" e "gemini" só contam perto de "google", e "firefly" perto de "adobe", para evitar falsos positivos
    if ((termo === "imagen" || termo === "gemini") && !minusculo.includes("google")) continue;
    if (termo === "firefly" && !minusculo.includes("adobe")) continue;
    const achado = localizar(fontes, termo);
    if (achado) {
      vistos.add(nome);
      evidencias.push({ forca: "forte", rotulo: `Gerador citado: ${nome}`, detalhe: `Os metadados citam ${nome}.`, ...achado });
    }
  }

  const c2pa = lerC2pa(analise.c2pa);
  const temC2pa = Boolean(c2pa) || minusculo.includes("c2pa");
  if (temC2pa) {
    evidencias.push({
      forca: "media",
      rotulo: "Credenciais de conteúdo (C2PA)",
      detalhe: detalheC2pa(c2pa),
      onde: c2pa ? "C2PA" : localizar(fontes, "c2pa")?.onde,
    });
  }

  const fortes = evidencias.filter((e) => e.forca === "forte").length;
  const nivel = fortes > 0 ? "forte" : temC2pa ? "credenciais" : "nenhum";
  return { formato, nivel, evidencias, metadados: analise.itens.length, itens: analise.itens, c2pa };
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
