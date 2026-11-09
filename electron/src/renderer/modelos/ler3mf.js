// Leitor de 3MF para o Visualizador: geometria (com componentes, transformações e a extensão
// "production" do Bambu/Orca, em que cada objeto fica num arquivo .model separado) e cores.
// Cores, em ordem de prioridade: pintura por triângulo (paint_color, inclusive triângulos subdivididos),
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

// Pintura do Bambu/Orca (TriangleSelector do OrcaSlicer/PrusaSlicer).
// O texto em hexadecimal é lido de trás para frente, cada dígito com o bit menos significativo
// primeiro. Cada triângulo começa com 4 bits: os 2 de baixo dizem em quantos lados ele foi dividido
// (0 = folha). Folha: os 2 de cima são o filamento (0 = cor do objeto, 1, 2); se forem "11",
// o próximo nibble + 3 é o filamento (nibble 15 → mais um nibble + 18). Dividido: os 2 de cima
// são o lado especial e os filhos vêm em seguida, do último para o primeiro.
function bitsDaPintura(codigo) {
  const bits = [];
  for (let i = codigo.length - 1; i >= 0; i--) {
    const d = parseInt(codigo[i], 16);
    if (Number.isNaN(d)) return null;
    for (let b = 0; b < 4; b++) bits.push((d >> b) & 1);
  }
  return bits;
}

const meio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

// Filhos de um triângulo dividido, na mesma ordem do TriangleSelector::perform_split.
function dividir(v, lados, especial) {
  const [a, b, c] = [v[especial % 3], v[(especial + 1) % 3], v[(especial + 2) % 3]];
  if (lados === 1) {
    const m = meio(c, b);
    return [[a, b, m], [m, c, a]];
  }
  if (lados === 2) {
    const mab = meio(b, a);
    const mac = meio(a, c);
    return [[a, mab, mac], [mab, b, mac], [b, c, mac]];
  }
  const mab = meio(b, a);
  const mbc = meio(c, b);
  const mca = meio(a, c);
  return [[a, mab, mca], [mab, b, mbc], [mbc, c, mca], [mab, mbc, mca]];
}

// Divide o triângulo (3 vértices [x,y,z]) como a pintura manda. Devolve [{ v, filamento }]
// (filamento 0 = cor do objeto) ou null se o código não der para ler.
export function lerPintura(codigo, vertices) {
  if (!codigo) return null;
  const bits = bitsDaPintura(codigo);
  if (!bits) return null;
  let i = 0;
  const nibble = () => {
    if (i + 4 > bits.length) throw new Error("fim");
    const n = bits[i] | (bits[i + 1] << 1) | (bits[i + 2] << 2) | (bits[i + 3] << 3);
    i += 4;
    return n;
  };
  const saida = [];
  const ler = (v, profundidade) => {
    if (profundidade > 24) throw new Error("fundo demais");
    const codigoNo = nibble();
    const lados = codigoNo & 0b11;
    if (!lados) {
      let filamento = codigoNo >> 2;
      if (filamento === 3) {
        const n = nibble();
        filamento = n === 0b1111 ? nibble() + 18 : n + 3;
      }
      saida.push({ v, filamento });
      return;
    }
    const filhos = dividir(v, lados, lados === 3 ? 0 : codigoNo >> 2);
    for (let k = filhos.length - 1; k >= 0; k--) ler(filhos[k], profundidade + 1);
  };
  try {
    ler(vertices, 0);
  } catch {
    return null;
  }
  return saida;
}

// Só o caso de triângulo inteiro numa cor: "4" → filamento 1, "8" → 2, "0C" → 3, "1C" → 4, …
export function filamentoDaPintura(codigo) {
  const r = lerPintura(codigo, [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  return r?.length === 1 ? r[0].filamento : 0;
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
    // a pintura subdividida cria mais triângulos: a lista cresce conforme precisa
    let posicoes = new Float32Array(triangulos.length * 9);
    const cores = [];
    let variaCor = false;
    let o = 0;
    const ponto = (i) => {
      const [x, y, z] = [vertices[i], vertices[i + 1], vertices[i + 2]];
      return [
        x * matriz[0] + y * matriz[3] + z * matriz[6] + matriz[9],
        x * matriz[1] + y * matriz[4] + z * matriz[7] + matriz[10],
        x * matriz[2] + y * matriz[5] + z * matriz[8] + matriz[11],
      ];
    };
    const guardar = (v, cor) => {
      if (o + 9 > posicoes.length) {
        const maior = new Float32Array(posicoes.length * 2 + 9);
        maior.set(posicoes);
        posicoes = maior;
      }
      for (const p of v) {
        posicoes[o++] = p[0];
        posicoes[o++] = p[1];
        posicoes[o++] = p[2];
      }
      if (cor !== corBase) variaCor = true;
      cores.push(cor);
    };
    for (const t of triangulos) {
      const v = [ponto(Number(t.v1) * 3), ponto(Number(t.v2) * 3), ponto(Number(t.v3) * 3)];
      const doTriangulo = t.pid || t.p1 ? objeto.materiais.get(t.pid ?? objeto.pid)?.[Number(t.p1 ?? 0)] : null;
      const semPintura = doTriangulo || corBase;
      const pedacos = lerPintura(t.paint_color ?? t["slic3rpe:mmu_segmentation"], v);
      if (!pedacos) {
        guardar(v, semPintura);
        continue;
      }
      for (const p of pedacos) guardar(p.v, corDoFilamento(p.filamento) || semPintura);
    }
    if (o < posicoes.length) posicoes = posicoes.slice(0, o);
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
