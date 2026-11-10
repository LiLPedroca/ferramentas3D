import { strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';

const OBJETO = /<(?:\w+:)?object\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?object>/g;
const RECURSOS = /(<(?:\w+:)?resources\b[^>]*>)([\s\S]*?)(<\/(?:\w+:)?resources>)/;
const atributos = texto => Object.fromEntries([...texto.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const destino = (arquivo, caminho) => caminho ? decodeURIComponent(new URL(caminho, `https://modelo.local/${arquivo}`).pathname).replace(/^\//, '') : arquivo;

// Referências de componentes devem apontar a recursos já definidos. Os arquivos
// importados também podem conter objetos de outras placas sem nenhuma instância.
export function prepararEstrutura3mf(zip) {
  const principal = '3D/3dmodel.model';
  const modelos = new Map();
  function ler(arquivo) {
    if (modelos.has(arquivo)) return modelos.get(arquivo);
    if (!zip[arquivo]) throw new Error(`Arquivo de peça ausente no 3MF: ${arquivo}`);
    const texto = strFromU8(zip[arquivo]);
    const objetos = new Map([...texto.matchAll(OBJETO)].map(m => [atributos(m[1]).id, { texto: m[0], corpo: m[2] }]));
    const modelo = { texto, objetos };modelos.set(arquivo, modelo);return modelo;
  }
  const raiz = ler(principal);
  const build = /<(?:\w+:)?build\b[^>]*>([\s\S]*?)<\/(?:\w+:)?build>/.exec(raiz.texto);
  if (!build || !RECURSOS.test(raiz.texto)) return new Set(Object.keys(zip).filter(n => n.endsWith('.model')));
  const ordem = [], visitando = new Set(), visitados = new Set(), construidos = new Set();
  function visitar(arquivo, id) {
    const chave = `${arquivo}#${id}`;
    if (visitados.has(chave)) return;
    if (visitando.has(chave)) throw new Error('Referência circular entre peças do 3MF.');
    const objeto = ler(arquivo).objetos.get(id);
    if (!objeto) throw new Error(`Peça ausente no 3MF: ${id}`);
    visitando.add(chave);
    for (const m of objeto.corpo.matchAll(/<(?:\w+:)?component\b([^>]*)\/>/g)) {
      const a = atributos(m[1]);visitar(destino(arquivo, a['p:path']), a.objectid);
    }
    visitando.delete(chave);visitados.add(chave);ordem.push({ arquivo, id });
  }
  for (const m of build[1].matchAll(/<(?:\w+:)?item\b([^>]*)\/>/g)) {
    const a = atributos(m[1]);construidos.add(a.objectid);visitar(destino(principal, a['p:path']), a.objectid);
  }
  for (const [arquivo, modelo] of modelos) {
    const objetos = ordem.filter(o => o.arquivo === arquivo).map(o => modelo.objetos.get(o.id).texto).join('\n');
    zip[arquivo] = strToU8(modelo.texto.replace(RECURSOS, (_m, abre, corpo, fecha) => abre + corpo.replace(OBJETO, '') + objetos + fecha));
  }
  const cfg = 'Metadata/model_settings.config';
  if (zip[cfg]) zip[cfg] = strToU8(strFromU8(zip[cfg]).replace(OBJETO, (texto, a) => construidos.has(atributos(a).id) ? texto : ''));
  return new Set(modelos.keys());
}
