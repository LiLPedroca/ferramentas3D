// Leitura e remoção de metadados de imagens JPEG, PNG e WebP, direto nos bytes.
// A remoção copia só os blocos necessários para a imagem: os pixels não são recodificados.

const LATIN1 = new TextDecoder("latin1");
const ascii = (bytes, inicio, fim) => LATIN1.decode(bytes.subarray(inicio, fim));
const comeca = (bytes, texto, inicio = 0) => ascii(bytes, inicio, inicio + texto.length) === texto;

export function detectarFormato(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 12 && comeca(bytes, "RIFF") && comeca(bytes, "WEBP", 8)) return "webp";
  return null;
}

class ArquivoDanificado extends Error {
  constructor(formato) {
    super(`O arquivo ${formato.toUpperCase()} parece danificado.`);
    this.name = "ArquivoDanificado";
  }
}

// ---------- EXIF (estrutura TIFF) ----------
const TAGS_TEXTO = {
  0x010f: "fabricante",
  0x0110: "modelo",
  0x0131: "programa",
  0x0132: "data",
  0x013b: "autor",
  0x8298: "direitos",
};

// Lê alguns campos do EXIF. Nunca lança: devolve o que conseguir ler.
export function lerExif(tiff) {
  const resultado = { campos: {}, temGps: false };
  try {
    const visao = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const little = tiff[0] === 0x49 && tiff[1] === 0x49;
    if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return resultado;
    const u16 = (o) => visao.getUint16(o, little);
    const u32 = (o) => visao.getUint32(o, little);
    const ifd = u32(4);
    const quantidade = u16(ifd);
    for (let i = 0; i < quantidade && i < 500; i++) {
      const e = ifd + 2 + i * 12;
      const tag = u16(e);
      const tipo = u16(e + 2);
      const contagem = u32(e + 4);
      if (tag === 0x8825) {
        const gps = u32(e + 8);
        resultado.temGps = gps > 0 && gps + 2 <= tiff.length && u16(gps) > 0;
      } else if (TAGS_TEXTO[tag] && tipo === 2 && contagem > 0 && contagem < 4096) {
        const inicio = contagem <= 4 ? e + 8 : u32(e + 8);
        if (inicio + contagem <= tiff.length) {
          const valor = ascii(tiff, inicio, inicio + contagem).replace(/\0+$/, "").trim();
          if (valor) resultado.campos[TAGS_TEXTO[tag]] = valor;
        }
      }
    }
  } catch {
    // EXIF incompleto: fica com o que foi lido.
  }
  return resultado;
}

function itensDoExif(tiff) {
  const { campos, temGps } = lerExif(tiff);
  const itens = [];
  if (temGps) itens.push({ tipo: "gps", rotulo: "Localização (GPS)", detalhe: "A foto guarda onde foi tirada." });
  const camera = [campos.fabricante, campos.modelo].filter(Boolean).join(" ");
  if (camera) itens.push({ tipo: "camera", rotulo: "Câmera", detalhe: camera });
  if (campos.data) itens.push({ tipo: "data", rotulo: "Data e hora", detalhe: campos.data });
  if (campos.programa) itens.push({ tipo: "programa", rotulo: "Programa", detalhe: campos.programa });
  if (campos.autor) itens.push({ tipo: "autor", rotulo: "Autor", detalhe: campos.autor });
  if (campos.direitos) itens.push({ tipo: "autor", rotulo: "Direitos autorais", detalhe: campos.direitos });
  if (itens.length === 0) itens.push({ tipo: "outro", rotulo: "Dados EXIF", detalhe: "Informações técnicas da imagem." });
  return itens;
}

const XMP = "http://ns.adobe.com/xap/1.0/\0";

// ---------- JPEG ----------
function percorrerJpeg(bytes, aoSegmento) {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new ArquivoDanificado("jpeg");
    const marcador = bytes[i + 1];
    if (marcador === 0xff) {
      i += 1;
      continue;
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      aoSegmento({ marcador, inicio: i, fim: i + 2, dados: bytes.subarray(i + 2, i + 2) });
      i += 2;
      continue;
    }
    if (marcador === 0xd9) {
      aoSegmento({ marcador, inicio: i, fim: i + 2, dados: bytes.subarray(i + 2, i + 2) });
      return;
    }
    if (i + 4 > bytes.length) throw new ArquivoDanificado("jpeg");
    const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];
    const fim = i + 2 + tamanho;
    if (tamanho < 2 || fim > bytes.length) throw new ArquivoDanificado("jpeg");
    if (marcador === 0xda) {
      // Início dos dados da imagem: o resto do arquivo vai inteiro.
      aoSegmento({ marcador, inicio: i, fim: bytes.length, dados: bytes.subarray(i + 4, fim), resto: true });
      return;
    }
    aoSegmento({ marcador, inicio: i, fim, dados: bytes.subarray(i + 4, fim) });
    i = fim;
  }
}

function classificarJpeg(marcador, dados) {
  if (marcador === 0xe1 && comeca(dados, "Exif\0\0")) return { tipo: "exif", itens: itensDoExif(dados.subarray(6)) };
  if (marcador === 0xe1 && comeca(dados, XMP)) {
    return { tipo: "xmp", itens: [{ tipo: "xmp", rotulo: "XMP", detalhe: "Dados de edição e descrição." }], texto: ascii(dados, XMP.length, dados.length) };
  }
  if (marcador === 0xed) return { tipo: "iptc", itens: [{ tipo: "iptc", rotulo: "IPTC", detalhe: "Legenda, autor ou palavras-chave." }] };
  if (marcador === 0xeb && (comeca(dados, "JP") || ascii(dados, 0, Math.min(dados.length, 64)).includes("jumb"))) {
    return { tipo: "c2pa", itens: [{ tipo: "c2pa", rotulo: "Credenciais de conteúdo (C2PA)", detalhe: "Registro de origem e edição da imagem." }] };
  }
  if (marcador === 0xfe) {
    const texto = ascii(dados, 0, Math.min(dados.length, 120)).replace(/[^\x20-\x7e]/g, "").trim();
    return { tipo: "comentario", itens: [{ tipo: "comentario", rotulo: "Comentário", detalhe: texto || "(sem texto)" }] };
  }
  if (marcador === 0xe2 && comeca(dados, "ICC_PROFILE\0")) return { tipo: "icc", itens: [] };
  if (marcador === 0xe0 && (comeca(dados, "JFIF\0") || comeca(dados, "JFXX\0"))) return { tipo: "jfif", itens: [] };
  if (marcador === 0xee && comeca(dados, "Adobe")) return { tipo: "adobe", itens: [] };
  if (marcador >= 0xe0 && marcador <= 0xef) {
    return { tipo: "outro", itens: [{ tipo: "outro", rotulo: `Bloco APP${marcador - 0xe0}`, detalhe: "Dados extras do programa que criou a imagem." }] };
  }
  return { tipo: "imagem", itens: [] };
}

// ---------- PNG ----------
const PNG_MANTER = new Set([
  "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "pHYs", "hIST",
  "acTL", "fcTL", "fdAT", "cICP", "mDCv", "cLLI",
]);

function percorrerPng(bytes, aoBloco) {
  let o = 8;
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (o + 12 <= bytes.length) {
    const tamanho = visao.getUint32(o);
    const tipo = ascii(bytes, o + 4, o + 8);
    const fim = o + 12 + tamanho;
    if (fim > bytes.length) throw new ArquivoDanificado("png");
    aoBloco({ tipo, inicio: o, fim, dados: bytes.subarray(o + 8, o + 8 + tamanho) });
    if (tipo === "IEND") return;
    o = fim;
  }
  throw new ArquivoDanificado("png");
}

function textoPng(tipo, dados) {
  const zero = dados.indexOf(0);
  const chave = ascii(dados, 0, zero < 0 ? Math.min(dados.length, 79) : zero);
  let valor = "";
  if (tipo === "tEXt" && zero >= 0) valor = new TextDecoder("latin1").decode(dados.subarray(zero + 1));
  if (tipo === "iTXt" && zero >= 0 && dados[zero + 1] === 0) {
    // não comprimido: pula flag, método, idioma e palavra-chave traduzida
    let p = zero + 3;
    p = dados.indexOf(0, p) + 1;
    p = dados.indexOf(0, p) + 1;
    if (p > 0) valor = new TextDecoder().decode(dados.subarray(p));
  }
  return { chave, valor };
}

function classificarPng(tipo, dados) {
  if (tipo === "tEXt" || tipo === "iTXt" || tipo === "zTXt") {
    const { chave, valor } = textoPng(tipo, dados);
    const resumo = valor ? `${chave}: ${valor.slice(0, 80)}${valor.length > 80 ? "…" : ""}` : chave;
    return { itens: [{ tipo: "texto", rotulo: "Texto embutido", detalhe: resumo }], texto: `${chave}\n${valor}` };
  }
  if (tipo === "eXIf") return { itens: itensDoExif(dados) };
  if (tipo === "tIME") return { itens: [{ tipo: "data", rotulo: "Data de modificação", detalhe: "Registrada no arquivo." }] };
  if (tipo === "caBX") {
    return { itens: [{ tipo: "c2pa", rotulo: "Credenciais de conteúdo (C2PA)", detalhe: "Registro de origem e edição da imagem." }] };
  }
  if (tipo === "iCCP" || PNG_MANTER.has(tipo)) return { itens: [] };
  return { itens: [{ tipo: "outro", rotulo: `Bloco ${tipo}`, detalhe: "Dados extras." }] };
}

// ---------- WebP ----------
function percorrerWebp(bytes, aoBloco) {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 12;
  while (o + 8 <= bytes.length) {
    const tipo = ascii(bytes, o, o + 4);
    const tamanho = visao.getUint32(o + 4, true);
    const fim = o + 8 + tamanho + (tamanho % 2);
    if (o + 8 + tamanho > bytes.length) throw new ArquivoDanificado("webp");
    aoBloco({ tipo, inicio: o, fim: Math.min(fim, bytes.length), dados: bytes.subarray(o + 8, o + 8 + tamanho) });
    o = fim;
  }
}

function classificarWebp(tipo, dados) {
  if (tipo === "EXIF") return { itens: itensDoExif(dados) };
  if (tipo === "XMP ") {
    return { itens: [{ tipo: "xmp", rotulo: "XMP", detalhe: "Dados de edição e descrição." }], texto: new TextDecoder().decode(dados) };
  }
  return { itens: [] };
}

// ---------- API ----------
// Lista o que a imagem carrega. textos: XMP e textos PNG (usados também pelo Detector de IA).
export function analisarImagem(bytes) {
  const formato = detectarFormato(bytes);
  const resultado = { formato, itens: [], textos: [], temIcc: false };
  if (!formato) return resultado;
  const juntar = (c) => {
    resultado.itens.push(...c.itens);
    if (c.texto) resultado.textos.push(c.texto);
  };
  if (formato === "jpeg") {
    percorrerJpeg(bytes, (s) => {
      if (s.resto) return;
      const c = classificarJpeg(s.marcador, s.dados);
      if (c.tipo === "icc") resultado.temIcc = true;
      juntar(c);
    });
  } else if (formato === "png") {
    percorrerPng(bytes, (b) => {
      if (b.tipo === "iCCP") resultado.temIcc = true;
      juntar(classificarPng(b.tipo, b.dados));
    });
  } else {
    percorrerWebp(bytes, (b) => {
      if (b.tipo === "ICCP") resultado.temIcc = true;
      juntar(classificarWebp(b.tipo, b.dados));
    });
  }
  return resultado;
}

function juntarPartes(partes) {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    saida.set(p, o);
    o += p.length;
  }
  return saida;
}

// Cópia sem metadados. manterCor: mantém o perfil de cor (ICC), que não identifica ninguém.
export function limparImagem(bytes, { manterCor = true } = {}) {
  const formato = detectarFormato(bytes);
  if (!formato) throw new Error("Formato não suportado. Use JPEG, PNG ou WebP.");
  const partes = [];

  if (formato === "jpeg") {
    partes.push(bytes.subarray(0, 2));
    percorrerJpeg(bytes, (s) => {
      if (s.resto || s.marcador === 0xd9 || s.marcador < 0xe0 || (s.marcador > 0xef && s.marcador !== 0xfe)) {
        if (s.marcador !== 0xd8) partes.push(bytes.subarray(s.inicio, s.fim));
        return;
      }
      const { tipo } = classificarJpeg(s.marcador, s.dados);
      if (tipo === "jfif" || tipo === "adobe" || (tipo === "icc" && manterCor)) partes.push(bytes.subarray(s.inicio, s.fim));
    });
    return juntarPartes(partes);
  }

  if (formato === "png") {
    partes.push(bytes.subarray(0, 8));
    percorrerPng(bytes, (b) => {
      if (PNG_MANTER.has(b.tipo) || (b.tipo === "iCCP" && manterCor)) partes.push(bytes.subarray(b.inicio, b.fim));
    });
    return juntarPartes(partes);
  }

  // WebP: remove EXIF e XMP (e ICCP se pedido) e corrige os sinalizadores do VP8X.
  const blocos = [];
  percorrerWebp(bytes, (b) => {
    if (b.tipo === "EXIF" || b.tipo === "XMP " || (b.tipo === "ICCP" && !manterCor)) return;
    const copia = bytes.slice(b.inicio, b.fim);
    if (b.tipo === "VP8X" && copia.length > 8) {
      copia[8] &= ~(0x08 | 0x04); // sem EXIF, sem XMP
      if (!manterCor) copia[8] &= ~0x20;
    }
    blocos.push(copia);
  });
  const corpo = juntarPartes(blocos);
  const cabecalho = new Uint8Array(12);
  cabecalho.set(bytes.subarray(0, 12));
  new DataView(cabecalho.buffer).setUint32(4, corpo.length + 4, true);
  return juntarPartes([cabecalho, corpo]);
}
