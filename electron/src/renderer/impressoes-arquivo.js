// Leitura dos arquivos de Minhas Impressões na tela: geometria para a prévia 3D e, no 3MF,
// a miniatura, o peso e o tempo gravados pelo fatiador (quando existem).
import * as THREE from "three";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ler3mf } from "./modelos/ler3mf.js";

const COR_PADRAO = "#9aa7bd";

// Partes com Z para cima (como no fatiador), prontas para a prévia 3D: [{ cor, geometria }]
export function partesDoArquivo(bytes, extensao) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (extensao === "3mf") {
    return ler3mf(bytes).pecas.map((p) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(p.posicoes, 3));
      g.computeVertexNormals();
      return { cor: p.cor || COR_PADRAO, geometria: g };
    });
  }
  let geometrias = [];
  if (extensao === "stl") geometrias = [new STLLoader().parse(buffer)];
  else if (extensao === "ply") geometrias = [new PLYLoader().parse(buffer)];
  else {
    new OBJLoader().parse(new TextDecoder().decode(buffer)).traverse((o) => {
      if (o.isMesh) geometrias.push(o.geometry);
    });
  }
  if (!geometrias.length) throw new Error("Não encontrei nenhuma peça neste arquivo.");
  return geometrias.map((g) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", (g.index ? g.toNonIndexed() : g).attributes.position);
    geo.computeVertexNormals();
    return { cor: COR_PADRAO, geometria: geo };
  });
}

function dataUrlPng(bytes) {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binario)}`;
}

// 3MF do fatiador (Bambu, Orca, Anycubic): miniatura da placa e, se foi fatiado, peso e tempo.
// Devolve só o que encontrar: { miniatura?, pesoG?, tempoMin? }
export function dadosDo3mf(bytes) {
  let zip;
  try {
    zip = unzipSync(bytes, { filter: (f) => /^Metadata\/(slice_info\.config|plate_\d+\.png|thumbnail\.png)$/i.test(f.name) || /^Metadata\/.*thumbnail.*\.png$/i.test(f.name) });
  } catch {
    return {};
  }
  const r = {};
  const nomes = Object.keys(zip);
  const png = nomes.find((n) => /plate_1\.png$/i.test(n)) ?? nomes.find((n) => /thumbnail\.png$/i.test(n)) ?? nomes.find((n) => /\.png$/i.test(n));
  if (png && zip[png].length < 280_000) r.miniatura = dataUrlPng(zip[png]);
  const info = nomes.find((n) => /slice_info\.config$/i.test(n));
  if (info) {
    const texto = strFromU8(zip[info]);
    let segundos = 0;
    let gramas = 0;
    for (const m of texto.matchAll(/key="prediction"\s+value="(\d+(?:\.\d+)?)"/g)) segundos += Number(m[1]);
    for (const m of texto.matchAll(/key="weight"\s+value="(\d+(?:\.\d+)?)"/g)) gramas += Number(m[1]);
    if (segundos > 0) r.tempoMin = String(Math.round(segundos / 60));
    if (gramas > 0) r.pesoG = String(Math.round(gramas * 100) / 100);
  }
  return r;
}

// Filamento gasto por cor num 3MF fatiado (slice_info.config: <filament ... type color used_g/>).
// Devolve [{ hex, tipo, gramas }] somando as placas, ou [] se o arquivo não foi fatiado.
export function filamentosDo3mf(bytes) {
  let zip;
  try {
    zip = unzipSync(bytes, { filter: (f) => /^Metadata\/slice_info\.config$/i.test(f.name) });
  } catch {
    return [];
  }
  const nome = Object.keys(zip)[0];
  if (!nome) return [];
  const texto = strFromU8(zip[nome]);
  const porFilamento = new Map();
  for (const m of texto.matchAll(/<filament\b([^>]*)\/?>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const g = Number(a.used_g);
    if (!(g > 0) || !/^#?[0-9a-f]{6}/i.test(a.color ?? "")) continue;
    const chave = `${a.id ?? ""}|${a.color.toLowerCase()}`;
    const atual = porFilamento.get(chave) ?? { hex: a.color.startsWith("#") ? a.color : `#${a.color}`, tipo: a.type ?? "", gramas: 0 };
    atual.gramas += g;
    porFilamento.set(chave, atual);
  }
  return [...porFilamento.values()].map((f) => ({ ...f, gramas: Math.round(f.gramas * 100) / 100 }));
}
