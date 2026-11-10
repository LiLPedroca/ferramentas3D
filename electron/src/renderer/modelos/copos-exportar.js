import { unzipSync, zipSync, strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { Group, Mesh } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { prepararEstrutura3mf } from './copos-estrutura3mf.js';

// Conserva a superfície completa e a subdivisão original da pintura.
export function gerarStlCopo(partes) {
  const grupo = new Group();
  const materiais = [];
  for (const p of partes) { const mesh = new Mesh(p.geometria); materiais.push(mesh.material); grupo.add(mesh); }
  try { return new Uint8Array(new STLExporter().parse(grupo, { binary: true }).buffer); }
  finally { materiais.forEach(m => m.dispose()); }
}

// Troca as cores sem reconstruir ou separar a malha pintada do arquivo original.
export function colorir3mf(bytes, originais, cores) {
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
    if (nome === 'Metadata/project_settings.config') texto = JSON.stringify({ filament_colour: JSON.parse(texto).filament_colour });
    if (nome.endsWith('.model')) texto = texto
      .replace(/(<metadata\b[^>]*name="Application"[^>]*>)[\s\S]*?(<\/metadata>)/g, '$1Programa Ferramentas 3D$2')
      .replace(/<metadata\b[^>]*name="(?:BambuStudio|slic3rpe):3mfVersion"[^>]*>[\s\S]*?<\/metadata>/g, '');
    // A placa antiga depende dos perfis/miniaturas já excluídos. Conserva somente
    // configurações de objetos/partes; o fatiador cria a placa no perfil escolhido.
    if (nome === 'Metadata/model_settings.config') texto = texto.replace(/<plate\b[^>]*>[\s\S]*?<\/plate>/g, '');
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
