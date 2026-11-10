import { it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { colorir3mf } from '../src/renderer/modelos/copos-exportar.js';
it('recolore pintura e filamentos simultaneamente, sem alterar faces ou trocar cores em cascata', () => {
  const xml = '<triangle v1="0" v2="1" v3="2" paint_color="8"/><base displaycolor="#000000FF"/><base displaycolor="#ffffff"/>';
  const cfg = JSON.stringify({ filament_colour: ['#000000', '#FFFFFF'], printer_model: 'Impressora da referência' });
  const origem = zipSync({ '3D/3dmodel.model': strToU8(xml), 'Metadata/project_settings.config': strToU8(cfg), 'foto.png': new Uint8Array([1,2,3]), '_rels/.rels': strToU8('<Relationships><Relationship Id="modelo" Target="/3D/3dmodel.model"/><Relationship Id="foto" Target="foto.png"/></Relationships>') });
  const z = unzipSync(colorir3mf(origem, ['#000000', '#ffffff'], ['#ffffff', '#ff0000']));
  expect(strFromU8(z['3D/3dmodel.model'])).toContain('displaycolor="#ffffffFF"');
  expect(strFromU8(z['3D/3dmodel.model'])).toContain('paint_color="8"');
  expect(JSON.parse(strFromU8(z['Metadata/project_settings.config'])).filament_colour).toEqual(['#ffffff', '#ff0000']);
  expect(z['foto.png']).toBeUndefined();
  expect(JSON.parse(strFromU8(z['Metadata/project_settings.config'])).printer_model).toBeUndefined();
  expect(strFromU8(z['_rels/.rels'])).toContain('Id="modelo"');
  expect(strFromU8(z['_rels/.rels'])).not.toContain('Id="foto"');
});
