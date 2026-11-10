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

it('ordena componentes antes do conjunto e não exporta objetos sem instância', () => {
  const xml = '<model><resources><object id="1"><mesh/></object><object id="2"><mesh/></object><object id="10"><components><component objectid="1"/><component objectid="5"/></components></object><object id="5"><mesh/></object></resources><build><item objectid="10"/></build></model>';
  const cfg = '<config><object id="10"><part id="1"/><part id="5"/></object><object id="2"><part id="2"/></object></config>';
  const z = unzipSync(colorir3mf(zipSync({ '3D/3dmodel.model': strToU8(xml), 'Metadata/model_settings.config': strToU8(cfg) }), [], []));
  const ids = [...strFromU8(z['3D/3dmodel.model']).matchAll(/<object id="(\d+)"/g)].map(m => m[1]);
  expect(ids).toEqual(['1', '5', '10']);
  expect(strFromU8(z['Metadata/model_settings.config'])).not.toContain('<object id="2"');
});

it('recusa referência ausente em vez de criar arquivo que derruba o fatiador', () => {
  const xml = '<model><resources><object id="10"><components><component objectid="5"/></components></object></resources><build><item objectid="10"/></build></model>';
  expect(() => colorir3mf(zipSync({ '3D/3dmodel.model': strToU8(xml) }), [], [])).toThrow(/ausente/);
});

it('exporta como modelo próprio com pintura e partes, sem placa ou perfil do projeto de origem', () => {
  const xml = '<model><metadata name="Application">BambuStudio-2.0.0.3</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Designer">Autor original</metadata><resources><object id="1"><mesh><triangle paint_color="0C"/></mesh></object></resources><build><item objectid="1"/></build></model>';
  const cfg = '<config><object id="1"><part id="1"><metadata key="extruder" value="3"/></part></object><plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate></config>';
  const z = unzipSync(colorir3mf(zipSync({ '3D/3dmodel.model': strToU8(xml), 'Metadata/model_settings.config': strToU8(cfg) }), [], []));
  const modelo = strFromU8(z['3D/3dmodel.model']), config = strFromU8(z['Metadata/model_settings.config']);
  expect(modelo).toContain('<metadata name="Application">Programa Ferramentas 3D</metadata>');
  expect(modelo).not.toContain('3mfVersion');
  expect(modelo).toContain('paint_color="0C"');
  expect(modelo).toContain('Autor original');
  expect(config).toContain('key="extruder" value="3"');
  expect(config).not.toContain('<plate>');
});
