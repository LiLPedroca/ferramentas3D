import { unzipSync, zipSync, strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { Group, Mesh } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { prepararEstrutura3mf } from './copos-estrutura3mf.js';
import { perfilCopo } from './copos-perfil.js';

const escaparXml = texto => String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// O projeto multiparte nativo conserva placas, encaixes e texto editável.
export function colorir3mfMultipartes(bytes, cores, { nome } = {}) {
  if (cores.length !== 2 || cores.some(cor => !/^#[\da-f]{6}$/i.test(cor))) throw Error('Escolha as duas cores do copo.');
  const arquivos = unzipSync(bytes);
  const chave = 'Metadata/project_settings.config';
  if (!arquivos[chave]) throw Error('O projeto multiparte está sem perfil.');
  const perfil = JSON.parse(strFromU8(arquivos[chave]));
  const mapa = new Map([['#000000', cores[0]], ['#ffffff', cores[1]]]);
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    if (caminho === chave || !/\.(model|config)$/i.test(caminho)) continue;
    let texto = strFromU8(conteudo).replace(/#[\da-f]{6}(?:[\da-f]{2})?\b/gi, cor => (mapa.get(cor.slice(0, 7).toLowerCase()) ?? cor.slice(0, 7)) + cor.slice(7));
    if (nome && caminho === '3D/3dmodel.model') texto = texto.replace(/(<metadata\b[^>]*name="Title"[^>]*>)[\s\S]*?(<\/metadata>)/g, (_m, abre, fecha) => abre + escaparXml(nome) + fecha);
    arquivos[caminho] = strToU8(texto);
  }
  perfil.filament_colour = [...cores];
  arquivos[chave] = strToU8(JSON.stringify(perfil));
  return zipSync(arquivos, { level: 6 });
}

// Conserva a superfície completa e a subdivisão original da pintura.
export function gerarStlCopo(partes) {
  const grupo = new Group();
  const materiais = [];
  for (const p of partes) { const mesh = new Mesh(p.geometria); materiais.push(mesh.material); grupo.add(mesh); }
  try { return new Uint8Array(new STLExporter().parse(grupo, { binary: true }).buffer); }
  finally { materiais.forEach(m => m.dispose()); }
}

// STL não guarda pintura. Usa os índices da malha estrutural unida em vez de
// transformar as subdivisões virtuais da pintura em arestas abertas no STL.
export function gerarStlNativoCopo(bytes) {
  const zip = unzipSync(bytes), texto = zip['3D/3dmodel.model'] && strFromU8(zip['3D/3dmodel.model']);
  if (!texto || /<components\b/.test(texto) || [...texto.matchAll(/<object\b/g)].length !== 1) throw Error('O copo precisa de uma malha única para exportar STL.');
  const vs = /<vertices>([\s\S]*?)<\/vertices>/.exec(texto)?.[1];
  const ts = /<triangles>([\s\S]*?)<\/triangles>/.exec(texto)?.[1];
  if (!vs || !ts) throw Error('Malha única do copo incompleta.');
  const vertices = new Float64Array((vs.match(/<vertex\b/g) ?? []).length * 3);
  let i = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const m of vs.matchAll(/<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g)) {
    const x = Number(m[1]), y = Number(m[2]); vertices.set([x, y, Number(m[3])], i); i += 3;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const numero = (ts.match(/<triangle\b/g) ?? []).length;
  const bytesStl = new Uint8Array(84 + numero * 50), view = new DataView(bytesStl.buffer);
  bytesStl.set(new TextEncoder().encode('Programa Ferramentas 3D')); view.setUint32(80, numero, true);
  let offset = 84;
  for (const m of ts.matchAll(/<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g)) {
    const ids = [Number(m[1]) * 3, Number(m[2]) * 3, Number(m[3]) * 3];
    const [a, b, c] = ids.map(k => [vertices[k] - (minX + maxX) / 2, vertices[k + 1] - (minY + maxY) / 2, vertices[k + 2]]);
    const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]);
    const normal = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
    const n = Math.hypot(...normal) || 1;
    for (const v of [...normal.map(x => x/n), ...a, ...b, ...c]) { view.setFloat32(offset, v, true); offset += 4; }
    offset += 2;
  }
  if (offset !== bytesStl.length) throw Error('Malha única do copo inválida.');
  return bytesStl;
}

// Troca as cores sem reconstruir ou separar a malha pintada do arquivo original.
export function colorir3mf(bytes, originais, cores, { nome: nomeModelo } = {}) {
  const mapa = new Map(originais.map((cor, i) => [cor.toLowerCase(), cores[i]]));
  const zip = unzipSync(bytes);
  const modelosUsados = prepararEstrutura3mf(zip);
  const arquivos = {};
  for (const [nome, conteudo] of Object.entries(zip)) {
    if (nome.endsWith('.model') && !modelosUsados.has(nome)) continue;
    if (nome.endsWith('.model.rels') && !modelosUsados.has(nome.replace('/_rels/', '/').replace(/\.rels$/, ''))) continue;
    // Não importa perfis, G-code, pausas ou miniaturas antigas da referência.
    if (!(/\.(model|rels)$/i.test(nome) || nome === '[Content_Types].xml' || ['Metadata/model_settings.config', 'Metadata/project_settings.config'].includes(nome))) continue;
    if (!/\.(model|config)$/i.test(nome)) { arquivos[nome] = conteudo; continue; }
    let texto = strFromU8(conteudo);
    if (nome === 'Metadata/project_settings.config') texto = JSON.stringify(perfilCopo(JSON.parse(texto).filament_colour));
    if (nome.endsWith('.model')) texto = texto
      .replace(/(<metadata\b[^>]*name="Application"[^>]*>)[\s\S]*?(<\/metadata>)/g, '$1Programa Ferramentas 3D$2')
      .replace(/<metadata\b[^>]*name="(?:BambuStudio|slic3rpe):3mfVersion"[^>]*>[\s\S]*?<\/metadata>/g, '');
    if (nomeModelo && nome.endsWith('.model')) {
      const titulo = escaparXml(nomeModelo);
      texto = texto.replace(/<object\b[^>]*>/g, tag => /\bname="/.test(tag) ? tag.replace(/\bname="[^"]*"/, () => `name="${titulo}"`) : tag.slice(0, -1) + ` name="${titulo}">`)
        .replace(/(<metadata\b[^>]*name="Title"[^>]*>)[\s\S]*?(<\/metadata>)/g, (_m, abre, fecha) => abre + titulo + fecha);
    }
    // A placa antiga depende dos perfis/miniaturas já excluídos. Conserva somente
    // configurações de objetos/partes; o fatiador cria a placa no perfil escolhido.
    if (nome === 'Metadata/model_settings.config') texto = texto.replace(/<plate\b[^>]*>[\s\S]*?<\/plate>/g, '');
    if (nomeModelo && nome === 'Metadata/model_settings.config') texto = texto.replace(/(<metadata\b[^>]*key="(?:name|source_file)"[^>]*value=")[^"]*(")/g, (_m, inicio, fim) => inicio + escaparXml(nomeModelo) + fim);
    arquivos[nome] = strToU8(texto.replace(/#[\da-f]{6}(?:[\da-f]{2})?\b/gi, cor => {
      const nova = mapa.get(cor.slice(0, 7).toLowerCase());
      return nova ? nova + cor.slice(7) : cor;
    }));
  }
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    if (!nome.endsWith('.rels') && nome !== '[Content_Types].xml') continue;
    const base = nome.replace(/_rels\/[^/]*$/, '');
    const existe = alvo => {
      if (!alvo) return false;
      const caminho = decodeURIComponent(new URL(alvo, `https://modelo.local/${base}`).pathname).replace(/^\//, '');
      return Object.hasOwn(arquivos, caminho);
    };
    const texto = strFromU8(conteudo).replace(/<Relationship\b[^>]*\/>/g, rel => existe(rel.match(/Target="([^"]+)"/)?.[1]) ? rel : '')
      .replace(/<Override\b[^>]*\/>/g, tipo => existe(tipo.match(/PartName="([^"]+)"/)?.[1]) ? tipo : '');
    arquivos[nome] = strToU8(texto);
  }
  return zipSync(arquivos, { level: 6 });
}
