import { inflateSync, deflateSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';

// Troca só alguns arquivos de um ZIP e copia o resto como já está, sem
// descompactar nem compactar de novo. As malhas dos copos em multipartes
// passam de 180 MB: recompactar tudo travava a tela por mais de 30 s.
const crcTabela = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(dados) {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = crcTabela[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function lerEntradas(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw Error('Arquivo 3MF inválido.');
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  if (total === 0xffff || p === 0xffffffff) throw Error('Arquivo 3MF grande demais.');
  const entradas = [], decodificar = new TextDecoder();
  for (let i = 0; i < total; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw Error('Arquivo 3MF inválido.');
    const flags = v.getUint16(p + 8, true), metodo = v.getUint16(p + 10, true);
    const tamNome = v.getUint16(p + 28, true), tamExtra = v.getUint16(p + 30, true), tamComent = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nomeBytes = bytes.subarray(p + 46, p + 46 + tamNome);
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    entradas.push({
      nome: decodificar.decode(nomeBytes), nomeBytes, utf8: (flags & 0x800) !== 0, metodo,
      hora: v.getUint16(p + 12, true), data: v.getUint16(p + 14, true), crc: v.getUint32(p + 16, true),
      compactado: bytes.subarray(inicio, inicio + v.getUint32(p + 20, true)), tamanho: v.getUint32(p + 24, true),
    });
    p += 46 + tamNome + tamExtra + tamComent;
  }
  return entradas;
}

function conteudo(e) {
  if (e.metodo === 0) return e.compactado;
  if (e.metodo === 8) return inflateSync(e.compactado, { out: new Uint8Array(e.tamanho) });
  throw Error('Arquivo 3MF com compactação desconhecida.');
}

// trocar(nome, ler) devolve os novos bytes do arquivo, ou undefined para copiar
// como está; ler() descompacta só quando chamado.
export function trocarNoZip(bytes, trocar) {
  const partes = [], central = [];
  let offset = 0;
  for (const e of lerEntradas(bytes)) {
    let { metodo, crc, compactado, tamanho } = e;
    const novo = trocar(e.nome, () => conteudo(e));
    if (novo !== undefined) {
      const dados = typeof novo === 'string' ? strToU8(novo) : novo;
      metodo = 8; crc = crc32(dados); tamanho = dados.length; compactado = deflateSync(dados, { level: 6 });
    }
    const flags = e.utf8 ? 0x800 : 0, n = e.nomeBytes.length;
    const local = new Uint8Array(30 + n), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, flags, true); lv.setUint16(8, metodo, true);
    lv.setUint16(10, e.hora, true); lv.setUint16(12, e.data, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, compactado.length, true); lv.setUint32(22, tamanho, true); lv.setUint16(26, n, true);
    local.set(e.nomeBytes, 30);
    const cab = new Uint8Array(46 + n), cv = new DataView(cab.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, flags, true); cv.setUint16(10, metodo, true);
    cv.setUint16(12, e.hora, true); cv.setUint16(14, e.data, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, compactado.length, true); cv.setUint32(24, tamanho, true); cv.setUint16(28, n, true); cv.setUint32(42, offset, true);
    cab.set(e.nomeBytes, 46);
    partes.push(local, compactado); central.push(cab);
    offset += local.length + compactado.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22), fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true); fv.setUint16(8, central.length, true); fv.setUint16(10, central.length, true);
  fv.setUint32(12, tamCentral, true); fv.setUint32(16, offset, true);
  const saida = new Uint8Array(offset + tamCentral + 22);
  let p = 0;
  for (const parte of [...partes, ...central, fim]) { saida.set(parte, p); p += parte.length; }
  return saida;
}
