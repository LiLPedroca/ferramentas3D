import { unzipSync, zipSync, strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { Group, Mesh } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { prepararEstrutura3mf } from './copos-estrutura3mf.js';
import { perfilCopo } from './copos-perfil.js';
import { trocarNoZip } from './zip-troca.js';

const escaparXml = texto => String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// O projeto multiparte nativo conserva placas, encaixes e texto editável.
// logos: como em colorir3mf, já no lugar da mesa da placa 1 (a da base); vão nessa placa.
export function colorir3mfMultipartes(bytes, cores, { nome, material, logos } = {}) {
  if (cores.length !== 2 || cores.some(cor => !/^#[\da-f]{6}$/i.test(cor))) throw Error('Escolha as duas cores do copo.');
  const chave = 'Metadata/project_settings.config', chaveModelo = '3D/3dmodel.model', chaveConfig = 'Metadata/model_settings.config';
  const mapa = new Map([['#000000', cores[0]], ['#ffffff', cores[1]]]);
  const extras = logos?.length ? { modelo: null, config: null } : null;
  let temPerfil = false, filamentos = [...cores];
  // As malhas (3D/Objects) não guardam cor: são copiadas sem descompactar. Com logos, o modelo principal e a
  // configuração (pequenos) são lidos antes, para saber os filamentos novos antes de gravar o perfil.
  const textos = extras ? unzipSync(bytes, { filter: f => f.name === chaveModelo || f.name === chaveConfig }) : null;
  if (extras) {
    const r = montarLogos(strFromU8(textos[chaveModelo]), strFromU8(textos[chaveConfig]), filamentos, logos);
    filamentos = r.cores;
    const instancias = r.ids.map((id, k) => `<model_instance><metadata key="object_id" value="${id}"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="${9000 + k}"/></model_instance>`).join('');
    let naPlaca = false;
    extras.config = r.config.replace(/<plate>[\s\S]*?<\/plate>/, placa => {
      if (naPlaca || !/key="plater_id" value="1"/.test(placa)) return placa;
      naPlaca = true;
      return placa.replace(/<\/plate>$/, `${instancias}</plate>`);
    });
    if (!naPlaca) throw Error('O projeto multiparte está sem a placa da base.');
    extras.modelo = r.modelo;
  }
  const saida = trocarNoZip(bytes, (caminho, ler) => {
    if (caminho === chave) {
      temPerfil = true;
      if (material || extras) return JSON.stringify(perfilCopo(filamentos, material));
      const perfil = JSON.parse(strFromU8(ler()));
      perfil.filament_colour = [...cores];
      return JSON.stringify(perfil);
    }
    if (caminho.startsWith('3D/Objects/') || !/\.(model|config)$/i.test(caminho)) return undefined;
    let texto = extras && caminho === chaveModelo ? extras.modelo : extras && caminho === chaveConfig ? extras.config : strFromU8(ler());
    texto = texto.replace(/#[\da-f]{6}(?:[\da-f]{2})?\b/gi, cor => (mapa.get(cor.slice(0, 7).toLowerCase()) ?? cor.slice(0, 7)) + cor.slice(7));
    if (nome && caminho === chaveModelo) texto = texto.replace(/(<metadata\b[^>]*name="Title"[^>]*>)[\s\S]*?(<\/metadata>)/g, (_m, abre, fecha) => abre + escaparXml(nome) + fecha);
    return texto;
  });
  if (!temPerfil) throw Error('O projeto multiparte está sem perfil.');
  return saida;
}

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
export function colorir3mf(bytes, originais, cores, { nome: nomeModelo, logos, material } = {}) {
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
    if (nome === 'Metadata/project_settings.config') texto = JSON.stringify(perfilCopo(JSON.parse(texto).filament_colour, material));
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
  juntarLogos(arquivos, logos, material);
  return zipSync(arquivos, { level: 6 });
}

// Logos do 2D para 3D junto do copo, retas e deitadas na mesa ao lado dele. logos: [{ x, y, malhas:
// [{ nome, cor, vertices, triangulos }] }], com x, y = onde fica o canto de baixo à esquerda da logo na
// mesa. Cada cor da logo usa um filamento; cor igual a uma do copo usa o mesmo filamento.
export function comLogos(bytes, logos) {
  if (!logos?.length) return bytes;
  const zip = unzipSync(bytes);
  juntarLogos(zip, logos);
  return zipSync(zip, { level: 6 });
}

// Mesmo que comLogos, direto nos arquivos já abertos do 3MF (sem compactar de novo).
function juntarLogos(zip, logos, material) {
  if (!logos?.length) return;
  const chaveModelo = '3D/3dmodel.model', chaveConfig = 'Metadata/model_settings.config', chavePerfil = 'Metadata/project_settings.config';
  const config = zip[chaveConfig] ? strFromU8(zip[chaveConfig]) : '<?xml version="1.0" encoding="UTF-8"?><config></config>';
  const perfil = zip[chavePerfil] ? JSON.parse(strFromU8(zip[chavePerfil])) : { filament_colour: ['#000000'] };
  const r = montarLogos(strFromU8(zip[chaveModelo]), config, perfil.filament_colour, logos);
  zip[chaveModelo] = strToU8(r.modelo);
  zip[chaveConfig] = strToU8(r.config);
  zip[chavePerfil] = strToU8(JSON.stringify(perfilCopo(r.cores, material)));
}

// Põe as logos no modelo (objetos e itens da mesa) e na configuração. Devolve o texto novo, as cores dos
// filamentos (as da logo entram no fim, se não forem quase iguais às do copo) e os ids dos objetos das logos.
function montarLogos(modelo, config, coresDoCopo, logos) {
  const cores = [...coresDoCopo].map(c => c.slice(0, 7).toUpperCase());
  // cor quase igual (ex.: o preto da logo #1B1B1B e o preto do copo #000000) usa o mesmo filamento
  const rgb = c => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16));
  const perto = (a, b) => Math.hypot(...rgb(a).map((v, k) => v - rgb(b)[k])) < 48;
  const slotDa = cor => {
    const c = cor.slice(0, 7).toUpperCase();
    let i = cores.findIndex(x => perto(x, c));
    if (i < 0) i = cores.push(c) - 1;
    return i + 1;
  };
  let proximo = Math.max(0, ...[...modelo.matchAll(/<(?:\w+:)?object\b[^>]*\bid="(\d+)"/g)].map(m => Number(m[1]))) + 1;
  const num = n => String(Math.round(n * 1e4) / 1e4);
  const objetos = [], itens = [], configs = [], conjuntos = [];
  logos.forEach((logo, k) => {
    let minX = Infinity, minY = Infinity;
    for (const m of logo.malhas) for (let i = 0; i < m.vertices.length; i += 3) { minX = Math.min(minX, m.vertices[i]); minY = Math.min(minY, m.vertices[i + 1]); }
    const ids = logo.malhas.map(m => {
      const id = proximo++;
      const vs = [];
      for (let i = 0; i < m.vertices.length; i += 3) vs.push(`<vertex x="${num(m.vertices[i] - minX)}" y="${num(m.vertices[i + 1] - minY)}" z="${num(m.vertices[i + 2])}"/>`);
      const ts = [];
      for (let i = 0; i < m.triangulos.length; i += 3) ts.push(`<triangle v1="${m.triangulos[i]}" v2="${m.triangulos[i + 1]}" v3="${m.triangulos[i + 2]}"/>`);
      objetos.push(`<object id="${id}" type="model"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`);
      return id;
    });
    const conjunto = proximo++;
    conjuntos.push(conjunto);
    const nome = escaparXml(logo.nome ?? `Logo ${k + 1}`);
    objetos.push(`<object id="${conjunto}" type="model" name="${nome}"><components>${ids.map(id => `<component objectid="${id}"/>`).join('')}</components></object>`);
    itens.push(`<item objectid="${conjunto}" transform="1 0 0 0 1 0 0 0 1 ${num(logo.x)} ${num(logo.y)} 0" printable="1"/>`);
    const partes = logo.malhas.map((m, i) => `<part id="${ids[i]}" subtype="normal_part"><metadata key="name" value="${escaparXml(m.nome ?? `Cor ${i + 1}`)}"/><metadata key="extruder" value="${slotDa(m.cor)}"/></part>`).join('');
    configs.push(`<object id="${conjunto}"><metadata key="name" value="${nome}"/><metadata key="extruder" value="${slotDa(logo.malhas[0].cor)}"/>${partes}</object>`);
  });
  modelo = modelo.replace(/(<\/(?:\w+:)?resources>)/, `${objetos.join('')}$1`).replace(/(<\/(?:\w+:)?build>)/, `${itens.join('')}$1`);
  config = config.replace(/(<\/config>)/, `${configs.join('')}$1`);
  return { modelo, config, cores, ids: conjuntos };
}

// STL do copo com as logos ao lado (mesmo lugar do 3MF). copoNaMesa: centro do copo na mesa do 3MF; o STL
// do copo sai centrado em x, y.
export function stlComLogos(stl, logos, centroDoCopo) {
  if (!logos?.length) return stl;
  const extras = [];
  for (const logo of logos) {
    let minX = Infinity, minY = Infinity;
    for (const m of logo.malhas) for (let i = 0; i < m.vertices.length; i += 3) { minX = Math.min(minX, m.vertices[i]); minY = Math.min(minY, m.vertices[i + 1]); }
    const dx = logo.x - minX - centroDoCopo[0], dy = logo.y - minY - centroDoCopo[1];
    for (const m of logo.malhas) for (let i = 0; i < m.triangulos.length; i++) {
      const k = m.triangulos[i] * 3;
      extras.push(m.vertices[k] + dx, m.vertices[k + 1] + dy, m.vertices[k + 2]);
    }
  }
  const antes = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
  const novos = extras.length / 9;
  const saida = new Uint8Array(stl.length + novos * 50);
  saida.set(stl);
  const view = new DataView(saida.buffer);
  view.setUint32(80, antes + novos, true);
  let o = stl.length;
  for (let t = 0; t < extras.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = extras.slice(t, t + 9);
    const u = [bx - ax, by - ay, bz - az], w = [cx - ax, cy - ay, cz - az];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n) || 1;
    for (const v of [n[0] / l, n[1] / l, n[2] / l, ax, ay, az, bx, by, bz, cx, cy, cz]) { view.setFloat32(o, v, true); o += 4; }
    o += 2;
  }
  return saida;
}
