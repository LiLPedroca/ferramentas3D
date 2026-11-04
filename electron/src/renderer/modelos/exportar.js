// Exportação de modelos: STL binário e 3MF com uma peça por cor (para impressão multicolorida).
import { BufferGeometry } from "three";
import { zipSync, strToU8 } from "three/examples/jsm/libs/fflate.module.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// partes: [{ nome, cor: "#rrggbb", geometria: THREE.BufferGeometry }]
export function gerarStl(partes) {
  const triangulos = partes.reduce((s, p) => s + (p.geometria.index ? p.geometria.index.count : p.geometria.attributes.position.count) / 3, 0);
  const buffer = new ArrayBuffer(84 + 50 * triangulos);
  const visao = new DataView(buffer);
  const cabecalho = "Programa Ferramentas 3D";
  for (let i = 0; i < cabecalho.length; i++) visao.setUint8(i, cabecalho.charCodeAt(i));
  visao.setUint32(80, triangulos, true);
  let o = 84;
  for (const { geometria } of partes) {
    const g = geometria.index ? geometria.toNonIndexed() : geometria;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      const a = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const b = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)];
      const c = [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const comp = Math.hypot(...n) || 1;
      for (const valor of [...n.map((x) => x / comp), ...a, ...b, ...c]) {
        visao.setFloat32(o, valor, true);
        o += 4;
      }
      visao.setUint16(o, 0, true);
      o += 2;
    }
  }
  return new Uint8Array(buffer);
}

const escaparXml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => (Math.round(n * 10000) / 10000).toString();

// Une vértices só pela posição (normais e UVs mudam de face para face e impediriam a união),
// para a malha sair fechada: cada aresta compartilhada por dois triângulos.
export function malhaIndexada(geometria) {
  const solta = geometria.index ? geometria.toNonIndexed() : geometria;
  const soPosicao = new BufferGeometry();
  soPosicao.setAttribute("position", solta.attributes.position.clone());
  return mergeVertices(soPosicao, 1e-4);
}

function malhaXml(geometria) {
  const g = malhaIndexada(geometria);
  const pos = g.attributes.position;
  const indices = g.index.array;
  const vertices = [];
  for (let i = 0; i < pos.count; i++) vertices.push(`<vertex x="${num(pos.getX(i))}" y="${num(pos.getY(i))}" z="${num(pos.getZ(i))}"/>`);
  const triangulos = [];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    if (a !== b && b !== c && a !== c) triangulos.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
  }
  return `<mesh><vertices>${vertices.join("")}</vertices><triangles>${triangulos.join("")}</triangles></mesh>`;
}

// Um objeto 3MF com uma parte por cor: os fatiadores abrem como peça única com partes separadas.
export function gerar3mf(partes, { titulo = "Modelo" } = {}) {
  const materiais = partes
    .map((p) => `<base name="${escaparXml(p.nome)}" displaycolor="${escaparXml(p.cor.toUpperCase())}FF"/>`)
    .join("");
  const objetos = partes
    .map((p, i) => `<object id="${i + 2}" type="model" name="${escaparXml(p.nome)}" pid="1" pindex="${i}">${malhaXml(p.geometria)}</object>`)
    .join("");
  const idConjunto = partes.length + 2;
  const componentes = partes.map((_, i) => `<component objectid="${i + 2}"/>`).join("");
  const modelo =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${escaparXml(titulo)}</metadata>` +
    `<metadata name="Application">Programa Ferramentas 3D</metadata>` +
    `<resources><basematerials id="1">${materiais}</basematerials>${objetos}` +
    `<object id="${idConjunto}" type="model" name="${escaparXml(titulo)}"><components>${componentes}</components></object>` +
    `</resources><build><item objectid="${idConjunto}"/></build></model>`;

  const tipos =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const relacoes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

  return zipSync({
    "[Content_Types].xml": strToU8(tipos),
    "_rels/.rels": strToU8(relacoes),
    "3D/3dmodel.model": strToU8(modelo),
  });
}
