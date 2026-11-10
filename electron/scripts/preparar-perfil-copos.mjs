// Mescla os três presets oficiais independentes, sem dados de uma conta/projeto.
// Uso: node scripts/preparar-perfil-copos.mjs maquina.json processo.json petg.json
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);if(args.length!==3)throw Error('Informe presets de máquina, processo e PETG.');
const metadados=new Set(['type','from','setting_id','is_custom_defined','instantiation','version','inherits','name','compatible_printers','compatible_prints']);
const [maquina,processo,filamento]=args.map(p=>JSON.parse(readFileSync(p,'utf8')));
const perfil={};
for(const [i,p]of [maquina,processo,filamento].entries())for(const [k,v]of Object.entries(p)){
 if(metadados.has(k))continue;
 perfil[k]=i===2&&Array.isArray(v)&&v.length===1?[v[0],v[0]]:v;
}
Object.assign(perfil,{
 printer_settings_id:maquina.printer_settings_id,print_settings_id:'Copos PETG 0.28 - Criae3D',
 default_print_profile:'Copos PETG 0.28 - Criae3D',default_filament_profile:[filamento.name],
 layer_height:'0.28',initial_layer_print_height:'0.24',wall_loops:'2',sparse_infill_density:'15%',resolution:'0.04',
 filament_colour:['#000000','#ffffff'],filament_diameter:['1.75','1.75'],
 filament_density:['1.23','1.23'],filament_type:['PETG','PETG'],filament_max_volumetric_speed:['8','8'],
 filament_settings_id:[filamento.name,filamento.name],filament_map:['1','2'],
 flush_multiplier:'0.7',flush_volumes_matrix:['0','280','280','0'],flush_volumes_vector:['140','140','140','140'],flush_volumes_chan_multipliers:['1','1'],
});
writeFileSync(new URL('../src/renderer/assets/copos/perfil-petg.json',import.meta.url),JSON.stringify(perfil,null,2)+'\n');
console.log('Perfil PETG de dois filamentos preparado, com fluxo de 8 mm³/s e duas paredes.');
