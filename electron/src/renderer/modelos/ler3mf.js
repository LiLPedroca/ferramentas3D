// Leitor de 3MF para o Visualizador: geometria (com componentes, transformações e a extensão
// "production" do Bambu/Orca, em que cada objeto fica num arquivo .model separado) e cores.
// Cores, em ordem de prioridade: pintura por triângulo (paint_color, só triângulos inteiros),
// cor do triângulo (basematerials/colorgroup), cor do objeto, filamento do objeto/parte
// (Metadata/model_settings.config + filament_colour do project_settings.config).
// Devolve coordenadas como no fatiador (Z para cima, em mm).
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";

const UNIDADES = { micron: 0.001, millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8 };
const IDENTIDADE = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function atributos(texto) {
  const a = {};
  for (const m of texto.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) a[m[1]] = m[2];
  return a;
}

// "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32" (vetor-linha: p' = p · M)
function lerMatriz(texto) {
  if (!texto) return IDENTIDADE;
  const n = texto.trim().split(/\s+/).map(Number);
  return n.length === 12 && n.every(Number.isFinite) ? n : IDENTIDADE;
}

// Aplica primeiro "a" e depois "b".
function compor(a, b) {
  const r = new Array(12);
  for (let i = 0; i < 4; i++) {
    const [x, y, z, w] = i < 3 ? [a[i * 3], a[i * 3 + 1], a[i * 3 + 2], 0] : [a[9], a[10], a[11], 1];
    for (let j = 0; j < 3; j++) r[i * 3 + j] = x * b[j] + y * b[3 + j] + z * b[6 + j] + w * b[9 + j];
  }
  return r;
}

function corHex(texto) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(texto ?? "").trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

// Pintura do Bambu/Orca (TriangleSelector): só o caso de triângulo inteiro numa cor.
// "4" → filamento 1, "8" → 2, "0C" → 3, "1C" → 4, … Triângulos subdivididos ficam com a cor do objeto.
export function filamentoDaPintura(codigo) {
  if (!codigo) return 0;
  const c = codigo.toUpperCase();
  if (c === "4") return 1;
  if (c === "8") return 2;
  const m = /^([0-9A-F])C$/.exec(c);
  return m ? 3 + parseInt(m[1], 16) : 0;
}

function lerModelo(texto, caminho) {
  const unidade = UNIDADES[atributos(/<model\b([^>]*)>/.exec(texto)?.[1] ?? "").unit] ?? 1;
  const materiais = new Map(); // id -> [cor]
  for (const m of texto.matchAll(/<(?:\w+:)?basematerials\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?basematerials>/g)) {
    const id = atributos(m[1]).id;
    materiais.set(id, [...m[2].matchAll(/<(?:\w+:)?base\b([^>]*)\/?>/g)].map((b) => corHex(atributos(b[1]).displaycolor)));
  }
  for (const m of texto.matchAll(/<(?:\w+:)?colorgroup\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?colorgroup>/g)) {
    const id = atributos(m[1]).id;
    materiais.set(id, [...m[2].matchAll(/<(?:\w+:)?color\b([^>]*)\/?>/g)].map((c) => corHex(atributos(c[1]).color)));
  }

  const objetos = new Map();
  for (const m of texto.matchAll(/<(?:\w+:)?object\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?object>/g)) {
    const a = atributos(m[1]);
    const corpo = m[2];
    const objeto = { id: a.id, caminho, nome: a.name ?? "", pid: a.pid, pindex: a.pindex, unidade, materiais };
    const malha = /<(?:\w+:)?mesh\b[\s\S]*?<\/(?:\w+:)?mesh>/.exec(corpo);
    if (malha) {
      const vertices = [];
      for (const v of malha[0].matchAll(/<(?:\w+:)?vertex\b([^>]*)\/?>/g)) {
        const p = atributos(v[1]);
        vertices.push(+p.x * unidade, +p.y * unidade, +p.z * unidade);
      }
      const triangulos = [];
      for (const t of malha[0].matchAll(/<(?:\w+:)?triangle\b([^>]*)\/?>/g)) triangulos.push(atributos(t[1]));
      objeto.malha = { vertices, triangulos };
    } else {
      objeto.componentes = [...corpo.matchAll(/<(?:\w+:)?component\b([^>]*)\/?>/g)].map((c) => {
        const ca = atributos(c[1]);
        return { objectid: ca.objectid, caminho: ca["p:path"]?.replace(/^\//, "") ?? caminho, matriz: lerMatriz(ca.transform) };
      });
    }
    objetos.set(a.id, objeto);
  }
  const itens = [...texto.matchAll(/<(?:\w+:)?item\b([^>]*)\/?>/g)].map((i) => {
    const a = atributos(i[1]);
    return { objectid: a.objectid, caminho: a["p:path"]?.replace(/^\//, "") ?? caminho, matriz: lerMatriz(a.transform) };
  });
  return { objetos, itens };
}

// Metadata/model_settings.config: filamento de cada objeto e parte, e as placas.
function lerConfiguracao(texto) {
  const filamento = new Map();
  const placas = [];
  if (!texto) return { filamento, placas };
  for (const o of texto.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const id = atributos(o[1]).id;
    const extrusor = /<metadata key="extruder" value="(\d+)"/.exec(o[2].replace(/<part\b[\s\S]*?<\/part>/g, ""));
    if (extrusor) filamento.set(`o${id}`, Number(extrusor[1]));
    for (const p of o[2].matchAll(/<part\b([^>]*)>([\s\S]*?)<\/part>/g)) {
      const e = /<metadata key="extruder" value="(\d+)"/.exec(p[2]);
      if (e) filamento.set(`p${atributos(p[1]).id}`, Number(e[1]));
    }
  }
  for (const p of texto.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const id = /<metadata key="plater_id" value="(\d+)"/.exec(p[1])?.[1];
    const nome = /<metadata key="plater_name" value="([^"]*)"/.exec(p[1])?.[1] ?? "";
    const objetos = [...p[1].matchAll(/<metadata key="object_id" value="(\d+)"/g)].map((x) => x[1]);
    if (id) placas.push({ id, nome, objetos });
  }
  return { filamento, placas };
}

function coresDosFilamentos(texto) {
  const m = /"filament_colour"\s*:\s*\[([^\]]*)\]/.exec(texto ?? "");
  return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((c) => corHex(c[1])) : [];
}

// bytes: Uint8Array do arquivo. placa: id da placa a mostrar (projetos com várias placas).
export function ler3mf(bytes, { placa = null } = {}) {
  let arquivos;
  try {
    arquivos = unzipSync(bytes, { filter: (f) => /\.(model|config|rels)$/i.test(f.name) });
  } catch {
    throw new Error("Este 3MF parece danificado (não abriu como arquivo compactado).");
  }
  const texto = (nome) => (arquivos[nome] ? strFromU8(arquivos[nome]) : null);
  const rels = texto("_rels/.rels") ?? "";
  const raiz = /Target="\/?([^"]+\.model)"/i.exec(rels)?.[1] ?? Object.keys(arquivos).find((n) => /^3D\/[^/]+\.model$/i.test(n));
  if (!raiz || !arquivos[raiz]) throw new Error("Este 3MF não tem o modelo 3D (3D/3dmodel.model).");

  const modelos = new Map();
  const modelo = (caminho) => {
    if (!modelos.has(caminho)) {
      const t = texto(caminho);
      modelos.set(caminho, t ? lerModelo(t, caminho) : { objetos: new Map(), itens: [] });
    }
    return modelos.get(caminho);
  };
  const config = lerConfiguracao(texto("Metadata/model_settings.config"));
  const filamentos = coresDosFilamentos(texto("Metadata/project_settings.config"));
  const corDoFilamento = (n) => (n >= 1 ? filamentos[n - 1] ?? null : null);

  const placaEscolhida = config.placas.length > 1 ? config.placas.find((p) => p.id === String(placa)) ?? config.placas[0] : null;
  const pecas = [];
  let semCor = 0;

  // Desce pelos componentes acumulando a transformação. objetoRaiz: id do objeto do item (para o filamento).
  function visitar(caminho, objectid, matriz, objetoRaiz, profundidade) {
    if (profundidade > 16) return;
    const objeto = modelo(caminho).objetos.get(objectid);
    if (!objeto) return;
    if (objeto.componentes) {
      for (const c of objeto.componentes) visitar(c.caminho, c.objectid, compor(c.matriz, matriz), objetoRaiz, profundidade + 1);
      return;
    }
    const { vertices, triangulos } = objeto.malha;
    const filamento = config.filamento.get(`p${objectid}`) ?? config.filamento.get(`o${objetoRaiz}`) ?? 0;
    const corBase =
      (objeto.pid && objeto.materiais.get(objeto.pid)?.[Number(objeto.pindex ?? 0)]) || corDoFilamento(filamento) || null;
    const posicoes = new Float32Array(triangulos.length * 9);
    const cores = [];
    let variaCor = false;
    let o = 0;
    for (const t of triangulos) {
      for (const k of ["v1", "v2", "v3"]) {
        const i = Number(t[k]) * 3;
        const [x, y, z] = [vertices[i], vertices[i + 1], vertices[i + 2]];
        posicoes[o++] = x * matriz[0] + y * matriz[3] + z * matriz[6] + matriz[9];
        posicoes[o++] = x * matriz[1] + y * matriz[4] + z * matriz[7] + matriz[10];
        posicoes[o++] = x * matriz[2] + y * matriz[5] + z * matriz[8] + matriz[11];
      }
      const pintada = corDoFilamento(filamentoDaPintura(t.paint_color ?? t["slic3rpe:mmu_segmentation"]));
      const doTriangulo = t.pid || t.p1 ? objeto.materiais.get(t.pid ?? objeto.pid)?.[Number(t.p1 ?? 0)] : null;
      const cor = pintada || doTriangulo || corBase;
      if (cor !== corBase) variaCor = true;
      cores.push(cor);
    }
    if (!corBase && !variaCor) semCor++;
    pecas.push({
      nome: objeto.nome || modelo(caminho).objetos.get(objetoRaiz)?.nome || `Peça ${pecas.length + 1}`,
      cor: corBase,
      posicoes,
      coresTriangulos: variaCor ? cores : null,
    });
  }

  const raizModelo = modelo(raiz);
  for (const item of raizModelo.itens) {
    if (placaEscolhida && !placaEscolhida.objetos.includes(item.objectid)) continue;
    visitar(item.caminho, item.objectid, item.matriz, item.objectid, 0);
  }
  if (!pecas.length) throw new Error("Não encontrei nenhuma peça neste 3MF.");
  return {
    pecas,
    temCores: pecas.some((p) => p.cor || p.coresTriangulos),
    semCor,
    placas: config.placas.length > 1 ? config.placas.map((p) => ({ id: p.id, nome: p.nome || `Placa ${p.id}` })) : [],
    placa: placaEscolhida?.id ?? null,
  };
}
