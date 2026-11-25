// Gera a prévia (<id>.bin.gz) de um copo do catálogo a partir do <id>.3mf de malha única já em assets/copos.
// Uso: node scripts/preparar-copo.mjs 4
// Mesmo formato do preparar-copos.mjs (copos 1 a 3), sem as escalas específicas do Copo 3.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { ler3mf } from '../src/renderer/modelos/ler3mf.js';

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id < 1) throw Error('Informe o número do copo.');
const pasta = new URL('../src/renderer/assets/copos/', import.meta.url);
const r = ler3mf(new Uint8Array(readFileSync(new URL(`${id}.3mf`, pasta))), { placa: '1' });
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const p of r.pecas) for (let j = 0; j < p.posicoes.length; j++) { const k = j % 3; min[k] = Math.min(min[k], p.posicoes[j]); max[k] = Math.max(max[k], p.posicoes[j]); }
const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2;
// Ordem fixa: parte 1 = principal (preto), parte 2 = detalhes (branco).
const grupos = new Map(['#000000', '#FFFFFF'].map(c => [c, []]));
for (const p of r.pecas) for (let t = 0; t < p.posicoes.length / 9; t++) {
  const cor = (p.coresTriangulos?.[t] || p.cor || '').toUpperCase();
  if (!grupos.has(cor)) throw Error(`Copo ${id}: cor inesperada ${cor}.`);
  const a = grupos.get(cor);
  for (let k = 0; k < 9; k++) { const v = p.posicoes[t * 9 + k]; a.push(k % 3 === 0 ? v - cx : k % 3 === 1 ? v - cy : v - min[2]); }
}
const partes = [], blocos = [];
let offset = 0;
for (const [cor, arr] of grupos) {
  if (!arr.length) throw Error(`Copo ${id}: cor ${cor} sem geometria.`);
  const v = new Float32Array(arr);
  partes.push({ cor: cor.toLowerCase(), offset, count: v.length }); blocos.push(Buffer.from(v.buffer)); offset += v.byteLength;
}
const altura = Math.round((max[2] - min[2]) * 10) / 10;
const info = { id, altura, boca: 81.4, partes };
const json = Buffer.from(JSON.stringify(info)), tamanho = Math.ceil(json.length / 4) * 4;
const cabecalho = Buffer.alloc(4 + tamanho); cabecalho.writeUInt32LE(tamanho); cabecalho.fill(32, 4); json.copy(cabecalho, 4);
writeFileSync(new URL(`${id}.bin.gz`, pasta), gzipSync(Buffer.concat([cabecalho, ...blocos]), { level: 9 }));
console.log('Copo', id, 'altura', altura, 'na mesa', min.slice(0, 2).map(n => n.toFixed(1)), max.slice(0, 2).map(n => n.toFixed(1)), partes.map(p => `${p.cor}: ${p.count / 9} triângulos`));
