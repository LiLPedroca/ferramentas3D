// Conserva a pintura nativa; adapta somente o conjunto montado da primeira placa.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
const sources = process.argv.slice(2);
if (sources.length !== 3) throw Error('Informe os três arquivos 3MF.');
for (let id = 1; id <= 3; id++) {
  const dir = new URL('../src/renderer/assets/copos/', import.meta.url);
  const data = gunzipSync(readFileSync(new URL(`${id}.bin.gz`, dir)));
  const info = JSON.parse(data.subarray(4, 4 + data.readUInt32LE()));
  const z = unzipSync(readFileSync(sources[id - 1]));
  const cfg = strFromU8(z['Metadata/model_settings.config']);
  const plate = [...cfg.matchAll(/<plate>[\s\S]*?<\/plate>/g)].map(m => m[0]).find(p => /key="plater_id" value="1"/.test(p));
  const ids = plate ? [...plate.matchAll(/key="object_id" value="(\d+)"/g)].map(m => m[1]) : null;
  let model = strFromU8(z['3D/3dmodel.model']);
  const sx = id === 3 ? 81.4 / 88.75773164416101 : 1;
  const sz = id === 3 ? 145 / 150.239166 : 1;
  model = model.replace(/<build\b([^>]*)>([\s\S]*?)<\/build>/, (_, attrs, body) => {
    const items = [...body.matchAll(/<item\b[^>]*\/>/g)].map(m => m[0]).filter(s => !ids || ids.includes(s.match(/objectid="(\d+)"/)[1]));
    return `<build${attrs}>${items.map(item => item.replace(/transform="([^"]+)"/, (_, text) => {
      const a = text.split(/\s+/).map(Number);
      for (let i = 0; i < 9; i++) a[i] *= i % 3 === 2 ? sz : sx;
      // Mantém a peça no centro da mesa de impressão.
      if (id === 3) { a[9] = 128 + (a[9] - 127.968188) * sx; a[10] = 128 + (a[10] - 128.033012) * sx; a[11] *= sz; }
      return `transform="${a.join(' ')}"`;
    })).join('\n')}</build>`;
  });
  z['3D/3dmodel.model'] = strToU8(model);
  z['Metadata/model_settings.config'] = strToU8(cfg.replace(/<plate>[\s\S]*?<\/plate>/g, p => p === plate ? p : '').replace(/<assemble>[\s\S]*?<\/assemble>/g, ''));
  writeFileSync(new URL(`${id}.3mf`, dir), zipSync(z, { level: 6 }));
  console.log('Copo nativo', id, info.partes.map(p => p.cor));
}
