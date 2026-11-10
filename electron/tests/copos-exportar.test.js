import { it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { colorir3mf, gerarStlNativoCopo } from '../src/renderer/modelos/copos-exportar.js';
it('recolore pintura e filamentos simultaneamente, sem alterar faces ou trocar cores em cascata', () => {
  const xml = '<triangle v1="0" v2="1" v3="2" paint_color="8"/><base displaycolor="#000000FF"/><base displaycolor="#ffffff"/>';
  const cfg = JSON.stringify({ filament_colour: ['#000000', '#FFFFFF'], printer_model: 'Impressora da referência' });
  const origem = zipSync({ '3D/3dmodel.model': strToU8(xml), 'Metadata/project_settings.config': strToU8(cfg), 'foto.png': new Uint8Array([1,2,3]), '_rels/.rels': strToU8('<Relationships><Relationship Id="modelo" Target="/3D/3dmodel.model"/><Relationship Id="foto" Target="foto.png"/></Relationships>') });
  const z = unzipSync(colorir3mf(origem, ['#000000', '#ffffff'], ['#ffffff', '#ff0000']));
  expect(strFromU8(z['3D/3dmodel.model'])).toContain('displaycolor="#ffffffFF"');
  expect(strFromU8(z['3D/3dmodel.model'])).toContain('paint_color="8"');
  expect(JSON.parse(strFromU8(z['Metadata/project_settings.config'])).filament_colour).toEqual(['#ffffff', '#ff0000']);
  expect(z['foto.png']).toBeUndefined();
  expect(JSON.parse(strFromU8(z['Metadata/project_settings.config'])).printer_model).toBe('Anycubic Kobra X');
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

it('leva o nome escolhido ao objeto e perfil PETG completo para calcular gramas e imprimir', () => {
  const xml = '<model><metadata name="Title">Vaso-Chop-600ml.stl</metadata><resources><object id="1" name="Vaso-Chop-600ml.stl"><mesh/></object></resources><build><item objectid="1"/></build></model>';
  const cfg = '<config><object id="1"><metadata key="name" value="Vaso-Chop-600ml.stl"/><part id="1"><metadata key="name" value="Antigo"/><metadata key="extruder" value="1"/></part></object></config>';
  const z = unzipSync(colorir3mf(zipSync({ '3D/3dmodel.model': strToU8(xml), 'Metadata/model_settings.config': strToU8(cfg), 'Metadata/project_settings.config': strToU8(JSON.stringify({filament_colour:['#000000','#ffffff']})) }), ['#000000','#ffffff'], ['#123456','#abcdef'], {nome:'Copo 2 & teste'}));
  expect(strFromU8(z['3D/3dmodel.model'])).toContain('name="Copo 2 &amp; teste"');
  expect(strFromU8(z['3D/3dmodel.model'])).not.toContain('Vaso-Chop');
  expect(strFromU8(z['Metadata/model_settings.config'])).toContain('value="Copo 2 &amp; teste"');
  const p = JSON.parse(strFromU8(z['Metadata/project_settings.config']));
  expect(p.filament_colour).toEqual(['#123456','#abcdef']);
  expect(p.filament_density).toHaveLength(2);
  expect(p.filament_density.every(v => Number(v)>0)).toBe(true);
  expect(p.filament_diameter).toEqual(['1.75','1.75']);
  expect(p.filament_type).toEqual(['PETG','PETG']);
  expect(p.filament_max_volumetric_speed).toEqual(['8','8']);
  expect(p.wall_loops).toBe('2');
  expect(p.layer_height).toBe('0.28');
  expect(p.printer_model).toBe('Anycubic Kobra X');
  expect(p.nozzle_temperature.every(v => Number(v)>=220)).toBe(true);
});

it('STL usa a malha única nativa, sem subdividir faces pela pintura', () => {
  const xml = '<model><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="2" y="0" z="0"/><vertex x="0" y="2" z="0"/><vertex x="0" y="0" z="2"/></vertices><triangles><triangle v1="0" v2="2" v3="1" paint_color="48483"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>';
  const b = gerarStlNativoCopo(zipSync({'3D/3dmodel.model':strToU8(xml)}));
  expect(new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(80,true)).toBe(4);
  expect(b.byteLength).toBe(84+4*50);
  expect(() => gerarStlNativoCopo(zipSync({'3D/3dmodel.model':strToU8('<model><components/></model>')}))).toThrow(/única/);
});
