// Exportação de modelos: STL binário e 3MF com uma peça por cor (para impressão multicolorida).
import { BufferGeometry } from "three";
import { zipSync, strToU8 } from "three/examples/jsm/libs/fflate.module.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// partes: [{ nome, cor: "#rrggbb", geometria: THREE.BufferGeometry }]
export function gerarStl(partes) {
  const triangulos = partes.reduce((s, p) => s + malhaIndexada(p.geometria).index.count / 3, 0);
  const buffer = new ArrayBuffer(84 + 50 * triangulos);
  const visao = new DataView(buffer);
  const cabecalho = "Programa Ferramentas 3D";
  for (let i = 0; i < cabecalho.length; i++) visao.setUint8(i, cabecalho.charCodeAt(i));
  visao.setUint32(80, triangulos, true);
  let o = 84;
  for (const { geometria } of partes) {
    // mesma malha corrigida do 3MF, em triângulos soltos
    const g = malhaIndexada(geometria).toNonIndexed();
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
  // malhas do Manifold já saem fechadas e indexadas: usa como estão
  if (geometria.userData?.fechada && geometria.index) {
    const pronta = new BufferGeometry();
    pronta.setAttribute("position", geometria.attributes.position);
    pronta.setIndex(geometria.index);
    return pronta;
  }
  const solta = geometria.index ? geometria.toNonIndexed() : geometria;
  const soPosicao = new BufferGeometry();
  soPosicao.setAttribute("position", solta.attributes.position.clone());
  const unida = mergeVertices(soPosicao, 1e-4);
  const indices = corrigirJuncoesT(unida.attributes.position, Array.from(unida.index.array));
  unida.setIndex(indices);
  return unida;
}

// Junção em T: um vértice cai no meio da aresta de outro triângulo (acontece quando um furo encosta
// na borda do contorno). Divide esse triângulo em leque pelos vértices da aresta, fechando a malha.
export function corrigirJuncoesT(pos, indices, tolerancia = 1e-4) {
  const ponto = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  for (let rodada = 0; rodada < 8; rodada++) {
    const contagem = new Map();
    const chave = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    for (let t = 0; t < indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const c = chave(indices[t + k], indices[t + ((k + 1) % 3)]);
        contagem.set(c, (contagem.get(c) ?? 0) + 1);
      }
    }
    const abertas = [...contagem.entries()].filter(([, n]) => n === 1).map(([c]) => c.split("-").map(Number));
    if (abertas.length === 0) return indices;
    const candidatos = [...new Set(abertas.flat())];

    // para cada aresta aberta, os vértices que caem dentro dela (ordenados ao longo da aresta)
    const divisoes = new Map();
    for (const [a, b] of abertas) {
      const pa = ponto(a);
      const pb = ponto(b);
      const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const comp2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
      if (comp2 < tolerancia ** 2) continue;
      const dentro = [];
      for (const v of candidatos) {
        if (v === a || v === b) continue;
        const pv = ponto(v);
        const w = [pv[0] - pa[0], pv[1] - pa[1], pv[2] - pa[2]];
        const t = (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / comp2;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        const dist2 = (w[0] - t * d[0]) ** 2 + (w[1] - t * d[1]) ** 2 + (w[2] - t * d[2]) ** 2;
        if (dist2 <= tolerancia ** 2) dentro.push([t, v]);
      }
      if (dentro.length) divisoes.set(chave(a, b), { a, b, meio: dentro.sort((x, y) => x[0] - y[0]).map(([, v]) => v) });
    }
    if (divisoes.size === 0) return indices;

    const novos = [];
    for (let t = 0; t < indices.length; t += 3) {
      const tri = [indices[t], indices[t + 1], indices[t + 2]];
      let dividido = false;
      for (let k = 0; k < 3 && !dividido; k++) {
        const u = tri[k];
        const v = tri[(k + 1) % 3];
        const oposto = tri[(k + 2) % 3];
        const div = divisoes.get(chave(u, v));
        if (!div) continue;
        // mantém o sentido do triângulo: percorre de u para v
        const meio = div.a === u ? div.meio : [...div.meio].reverse();
        const caminho = [u, ...meio, v];
        for (let i = 0; i < caminho.length - 1; i++) novos.push(caminho[i], caminho[i + 1], oposto);
        dividido = true;
      }
      if (!dividido) novos.push(...tri);
    }
    indices = novos;
  }
  return indices;
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
// pausas (opcional): alturas em mm onde a impressão para para trocar o filamento à mão (sem AMS).
export function gerar3mf(partes, { titulo = "Modelo", pausas = [] } = {}) {
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
    `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
    `<Default Extension="config" ContentType="application/xml"/></Types>`;
  const relacoes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

  const arquivos = {
    "[Content_Types].xml": strToU8(tipos),
    "_rels/.rels": strToU8(relacoes),
    "3D/3dmodel.model": strToU8(modelo),
    "Metadata/model_settings.config": strToU8(configuracaoDasPartes(partes, titulo, idConjunto)),
  };
  if (pausas.length) arquivos["Metadata/custom_gcode_per_layer.xml"] = strToU8(pausasXml(pausas));
  return zipSync(arquivos);
}

// ---------- Vários objetos em placas (ex.: um chaveiro por nome) ----------
// Arruma caixas [{ largura, altura }] (mm) em prateleiras numa mesa, com folga entre elas e na borda.
// Devolve [{ placa, x, y }] (canto inferior esquerdo de cada caixa na sua placa, começando em 0).
export function arrumarNaMesa(caixas, { mesa = [260, 260], folga = 6, margem = 8 } = {}) {
  const livreX = mesa[0] - 2 * margem;
  const livreY = mesa[1] - 2 * margem;
  for (const c of caixas) {
    if (c.largura > livreX || c.altura > livreY) throw new Error(`Uma peça (${Math.round(c.largura)} × ${Math.round(c.altura)} mm) não cabe na mesa. Diminua a largura.`);
  }
  const posicoes = [];
  let placa = 0;
  let x = margem;
  let y = margem;
  let alturaLinha = 0;
  for (const c of caixas) {
    if (x + c.largura > mesa[0] - margem + 1e-9) {
      x = margem;
      y += alturaLinha + folga;
      alturaLinha = 0;
    }
    if (y + c.altura > mesa[1] - margem + 1e-9) {
      placa += 1;
      x = margem;
      y = margem;
      alturaLinha = 0;
    }
    posicoes.push({ placa, x, y });
    x += c.largura + folga;
    alturaLinha = Math.max(alturaLinha, c.altura);
  }
  return posicoes;
}

// Origem de cada placa no espaço do Orca / Bambu / Anycubic Slicer Next: as placas ficam em grade,
// com 1/5 da mesa de espaço entre elas, e a coluna conta para a direita e a linha para baixo (Y negativo).
export function origemDaPlaca(indice, total, mesa = [260, 260]) {
  const raiz = Math.sqrt(total);
  const colunas = raiz > Math.round(raiz) ? Math.round(raiz) + 1 : Math.round(raiz);
  const col = indice % colunas;
  const lin = Math.floor(indice / colunas);
  return [col * mesa[0] * 1.2, lin ? -lin * mesa[1] * 1.2 : 0];
}

// objetos: [{ nome, partes: [{ nome, cor, geometria, slot }], placa, posicao: [x, y] }]
// Placas sem nome: o Anycubic Slicer Next fecha sozinho ao abrir um 3MF com plater_name preenchido.
// As geometrias já começam em (0, 0, 0) (posicionarNaOrigem). pausas: alturas (mm) iguais em todas as placas.
export function gerar3mfVarios(objetos, { titulo = "Modelos", pausas = [], mesa = [260, 260] } = {}) {
  const totalPlacas = Math.max(...objetos.map((o) => o.placa)) + 1;
  // materiais: um por cor/slot de parte, na ordem em que aparecem
  const materiais = [];
  const indiceMaterial = (p) => {
    const chave = `${p.nome}|${p.cor}`;
    let i = materiais.findIndex((m) => m.chave === chave);
    if (i < 0) i = materiais.push({ chave, nome: p.nome, cor: p.cor }) - 1;
    return i;
  };
  let proximoId = 2;
  const recursos = [];
  const itens = [];
  const config = [];
  const placas = Array.from({ length: totalPlacas }, () => []);
  const slots = [];
  for (const o of objetos) {
    const slotsDoObjeto = slotsDasPartes(o.partes);
    const ids = o.partes.map((p) => {
      const id = proximoId++;
      recursos.push(`<object id="${id}" type="model" name="${escaparXml(p.nome)}" pid="1" pindex="${indiceMaterial(p)}">${malhaXml(p.geometria)}</object>`);
      return id;
    });
    const idConjunto = proximoId++;
    recursos.push(`<object id="${idConjunto}" type="model" name="${escaparXml(o.nome)}"><components>${ids.map((id) => `<component objectid="${id}"/>`).join("")}</components></object>`);
    const [ox, oy] = origemDaPlaca(o.placa, totalPlacas, mesa);
    itens.push(`<item objectid="${idConjunto}" transform="1 0 0 0 1 0 0 0 1 ${num(ox + o.posicao[0])} ${num(oy + o.posicao[1])} 0" printable="1"/>`);
    const linhas = o.partes
      .map((p, i) => `<part id="${ids[i]}" subtype="normal_part"><metadata key="name" value="${escaparXml(p.nome)}"/><metadata key="extruder" value="${slotsDoObjeto[i]}"/></part>`)
      .join("");
    config.push(`<object id="${idConjunto}"><metadata key="name" value="${escaparXml(o.nome)}"/><metadata key="extruder" value="${slotsDoObjeto[0]}"/>${linhas}</object>`);
    placas[o.placa].push(idConjunto);
    slots.push(...slotsDoObjeto);
  }
  const modelo =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${escaparXml(titulo)}</metadata>` +
    `<metadata name="Application">Programa Ferramentas 3D</metadata>` +
    `<resources><basematerials id="1">${materiais.map((m) => `<base name="${escaparXml(m.nome)}" displaycolor="${escaparXml(m.cor.toUpperCase())}FF"/>`).join("")}</basematerials>${recursos.join("")}</resources>` +
    `<build>${itens.join("")}</build></model>`;
  const placasXml = placas
    .map(
      (ids, i) =>
        `<plate><metadata key="plater_id" value="${i + 1}"/><metadata key="plater_name" value=""/><metadata key="locked" value="false"/>` +
        ids.map((id) => `<model_instance><metadata key="object_id" value="${id}"/><metadata key="instance_id" value="0"/></model_instance>`).join("") +
        `</plate>`,
    )
    .join("");
  const arquivos = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
        `<Default Extension="config" ContentType="application/xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    ),
    "3D/3dmodel.model": strToU8(modelo),
    "Metadata/model_settings.config": strToU8(`<?xml version="1.0" encoding="UTF-8"?><config>${config.join("")}${placasXml}</config>`),
  };
  if (pausas.length) arquivos["Metadata/custom_gcode_per_layer.xml"] = strToU8(pausasXml(pausas, totalPlacas));
  return zipSync(arquivos);
}

// Metadata/custom_gcode_per_layer.xml (formato do Orca/Bambu, lido pelo Anycubic Slicer Next):
// type 1 = pausa; o fatiador coloca ali o "machine_pause_gcode" do perfil da impressora (na
// Kobra X é o M600, troca de filamento). A pausa vale para a primeira camada com altura acima
// de top_z, qualquer que seja a altura de camada escolhida no fatiador.
// placas: quantas placas recebem as mesmas pausas (vários chaveiros em várias placas).
export function pausasXml(pausas, placas = 1) {
  const camadas = pausas
    .map((z) => `<layer top_z="${num(z)}" type="1" extruder="1" color="" extra="" gcode="M600"/>`)
    .join("");
  const blocos = Array.from({ length: placas }, (_, i) => `<plate><plate_info id="${i + 1}"/>${camadas}<mode value="SingleExtruder"/></plate>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_layer>${blocos}</custom_gcodes_per_layer>\n`;
}

// Filamento (slot) de cada parte: 1, 2, 3… na ordem, ou o "slot" escolhido na tela.
export function slotsDasPartes(partes) {
  const slots = partes.map((p, i) => (Number.isInteger(p.slot) && p.slot >= 1 && p.slot <= 16 ? p.slot : Math.min(i + 1, 16)));
  return slots;
}

// Metadata/model_settings.config: o Orca, o Anycubic Slicer Next e o Bambu Studio leem daqui o
// filamento de cada parte (sem isso, todas abrem no filamento 1). Não leva perfil de impressora.
function configuracaoDasPartes(partes, titulo, idConjunto) {
  const slots = slotsDasPartes(partes);
  const linhas = partes
    .map(
      (p, i) =>
        `<part id="${i + 2}" subtype="normal_part"><metadata key="name" value="${escaparXml(p.nome)}"/>` +
        `<metadata key="extruder" value="${slots[i]}"/></part>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?><config><object id="${idConjunto}">` +
    `<metadata key="name" value="${escaparXml(titulo)}"/><metadata key="extruder" value="${slots[0]}"/>${linhas}</object></config>`
  );
}
