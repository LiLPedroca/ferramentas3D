import { it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { colorir3mfMultipartes } from '../src/renderer/modelos/copos-exportar.js';

it('multipartes conserva três placas, peças, encaixes e texto, aplicando cores sem cascata', () => {
 const modelo='<model><metadata name="Application">BambuStudio-2.0.0.3</metadata><metadata name="Title">Copo 1</metadata><resources><object id="7"><components><component objectid="1"/></components></object><object id="1"><mesh><triangle v1="0" v2="1" v3="2" paint_color="8"/></mesh></object><object id="9"><mesh/></object><object id="11"><mesh/></object></resources><build><item objectid="7"/><item objectid="9" transform="1 0 0 0 1 0 0 0 1 130 -200 0"/><item objectid="11" transform="1 0 0 0 1 0 0 0 1 435 130 0"/></build></model>';
 const config='<config><object id="7"><part id="1"><metadata key="name" value="PERSONALIZE AQUI"/><metadata key="extruder" value="1"/></part></object>'+[7,11,9].map((id,i)=>`<plate><metadata key="plater_id" value="${i+1}"/><model_instance><metadata key="object_id" value="${id}"/></model_instance></plate>`).join('')+'</config>';
 const perfil={filament_colour:['#000000','#ffffff'],filament_density:['1.23','1.23'],brim_type:'no_brim'};
 const origem=zipSync({'3D/3dmodel.model':strToU8(modelo),'Metadata/model_settings.config':strToU8(config),'Metadata/project_settings.config':strToU8(JSON.stringify(perfil)),'Metadata/plate_1.png':new Uint8Array([1,2]),'Metadata/plate_2.json':strToU8('{"plate":2}')});
 const z=unzipSync(colorir3mfMultipartes(origem,['#ffffff','#000000'],{nome:'Copo 1 & multipartes'}));
 const xml=strFromU8(z['3D/3dmodel.model']);
 expect(xml).toContain('BambuStudio-2.0.0.3');expect(xml).toContain('Copo 1 &amp; multipartes');
 expect(xml).toContain('paint_color="8"');expect(xml.match(/<item /g)).toHaveLength(3);
 expect(xml).toContain('435 130 0');expect(strFromU8(z['Metadata/model_settings.config'])).toBe(config);
 expect(z['Metadata/plate_1.png']).toEqual(new Uint8Array([1,2]));
 expect(z['Metadata/plate_2.json']).toBeDefined();
 expect(JSON.parse(strFromU8(z['Metadata/project_settings.config']))).toEqual({...perfil,filament_colour:['#ffffff','#000000']});
});

it('recusa multipartes sem perfil ou sem as duas cores esperadas',()=>{
 const b=zipSync({'3D/3dmodel.model':strToU8('<model/>')});
 expect(()=>colorir3mfMultipartes(b,['#000000','#ffffff'])).toThrow(/perfil/i);
 expect(()=>colorir3mfMultipartes(b,['#000000'])).toThrow(/cores/i);
});

it('copia as malhas de 3D/Objects sem descompactar e mantém o ZIP legível', () => {
 const malha=strToU8('<model><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/></vertices></mesh></object></resources></model>'.repeat(2000));
 const origem=zipSync({'3D/3dmodel.model':strToU8('<model><metadata name="Title">X</metadata></model>'),'3D/Objects/tubo 2.model':malha,'Metadata/project_settings.config':strToU8('{"filament_colour":["#000000","#ffffff"]}')},{level:9});
 const saida=colorir3mfMultipartes(origem,['#ff0000','#00ff00'],{nome:'Copo 2 - multipartes'});
 const z=unzipSync(saida);
 expect(z['3D/Objects/tubo 2.model']).toEqual(malha);
 expect(strFromU8(z['3D/3dmodel.model'])).toContain('Copo 2 - multipartes');
 expect(JSON.parse(strFromU8(z['Metadata/project_settings.config'])).filament_colour).toEqual(['#ff0000','#00ff00']);
 const achar=(b,s)=>{const a=strToU8(s);for(let i=0;i<b.length-a.length;i++){let ok=true;for(let j=0;j<a.length&&ok;j++)ok=b[i+j]===a[j];if(ok)return i;}return -1;};
 const nome='3D/Objects/tubo 2.model', i0=achar(origem,nome), i1=achar(saida,nome);
 const dv0=new DataView(origem.buffer), dv1=new DataView(saida.buffer);
 const c0=dv0.getUint32(i0-12,true), c1=dv1.getUint32(i1-12,true);
 expect(c1).toBe(c0);
 expect(saida.subarray(i1+nome.length,i1+nome.length+c1)).toEqual(origem.subarray(i0+nome.length,i0+nome.length+c0));
});
