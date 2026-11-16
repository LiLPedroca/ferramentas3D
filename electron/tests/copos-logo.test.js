import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { colorir3mf, comLogos, stlComLogos } from '../src/renderer/modelos/copos-exportar.js';

const quadrado = (cor) => ({ nome: 'Cor', cor, vertices: [10, 10, 0, 50, 10, 0, 50, 40, 0, 10, 40, 0, 10, 10, 2, 50, 10, 2, 50, 40, 2, 10, 40, 2], triangulos: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7] });

it('as logos entram no 3MF do copo, deitadas ao lado; cor igual à do copo usa o mesmo filamento', () => {
  // copo de mentira com o mesmo formato do arquivo de verdade (malha única pintada, filamentos 1 e 2)
  const xml = '<model><metadata name="Title">Copo 1</metadata><resources><object id="1" type="model" name="Copo 1"><mesh><vertices/><triangles><triangle v1="0" v2="1" v3="2" paint_color="8"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>';
  const cfg = '<config><object id="1"><metadata key="name" value="Copo 1"/><metadata key="extruder" value="1"/><part id="1" subtype="normal_part"><metadata key="extruder" value="1"/></part></object></config>';
  const original = zipSync({ '3D/3dmodel.model': strToU8(xml), 'Metadata/model_settings.config': strToU8(cfg), 'Metadata/project_settings.config': strToU8(readFileSync(join(__dirname, '../src/renderer/assets/copos/perfil-petg.json'), 'utf8')) });
  const logo = { x: 182, y: 5, malhas: [quadrado('#ffffff'), quadrado('#c9a23a')] };
  const z = unzipSync(colorir3mf(original, ['#000000', '#ffffff'], ['#000000', '#ffffff'], { logos: [logo, { ...logo, y: 50 }] }));
  const modelo = strFromU8(z['3D/3dmodel.model']);
  expect([...modelo.matchAll(/<item\b/g)]).toHaveLength(3);
  expect(modelo).toContain('transform="1 0 0 0 1 0 0 0 1 182 5 0"');
  const config = strFromU8(z['Metadata/model_settings.config']);
  expect(config).toContain('value="Logo 2"');
  expect([...config.matchAll(/key="extruder" value="(\d)"/g)].map((m) => m[1])).toEqual(['1', '1', '2', '2', '3', '2', '2', '3']);
  const perfil = JSON.parse(strFromU8(z['Metadata/project_settings.config']));
  expect(perfil.filament_colour.map((c) => c.toUpperCase())).toEqual(['#000000', '#FFFFFF', '#C9A23A']);
});

it('cor quase igual à do copo (preto #1B1B1B da logo e #000000 do copo) usa o mesmo filamento', () => {
  const xml = '<model><resources><object id="1" type="model"><mesh/></object></resources><build><item objectid="1"/></build></model>';
  const z = unzipSync(comLogos(zipSync({ '3D/3dmodel.model': strToU8(xml), 'Metadata/project_settings.config': strToU8(JSON.stringify({ filament_colour: ['#000000', '#FFFFFF'] })) }), [{ x: 0, y: 0, malhas: [quadrado('#1b1b1b'), quadrado('#f4f4f4')] }]));
  expect([...strFromU8(z['Metadata/model_settings.config']).matchAll(/key="extruder" value="(\d)"/g)].map((m) => m[1])).toEqual(['1', '1', '2']);
  expect(JSON.parse(strFromU8(z['Metadata/project_settings.config'])).filament_colour).toHaveLength(2);
});

it('sem logo, o 3MF do copo fica igual', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  expect(comLogos(bytes, [])).toBe(bytes);
});

it('STL: as logos entram como triângulos a mais', () => {
  const stl = new Uint8Array(84 + 50);
  new DataView(stl.buffer).setUint32(80, 1, true);
  const r = stlComLogos(stl, [{ x: 182, y: 5, malhas: [quadrado('#ffffff')] }], [130, 130]);
  expect(new DataView(r.buffer).getUint32(80, true)).toBe(13);
  expect(r.length).toBe(84 + 13 * 50);
});
