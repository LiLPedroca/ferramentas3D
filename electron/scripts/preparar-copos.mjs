// Gera os pacotes do catálogo a partir dos três 3MF indicados na linha de comando.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {ler3mf} from '../src/renderer/modelos/ler3mf.js';
const sources=process.argv.slice(2);if(sources.length!==3)throw Error('Informe três arquivos 3MF.');
const out=new URL('../src/renderer/assets/copos/',import.meta.url);mkdirSync(out,{recursive:true});
for(let id=1;id<=3;id++){
 const r=ler3mf(new Uint8Array(readFileSync(sources[id-1])),{placa:'1'});const ps=r.pecas;
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const p of ps)for(let j=0;j<p.posicoes.length;j++){const k=j%3;min[k]=Math.min(min[k],p.posicoes[j]);max[k]=Math.max(max[k],p.posicoes[j]);}
 const cx=id===3?127.968188:(min[0]+max[0])/2, cy=id===3?128.033012:(min[1]+max[1])/2;
 const sx=id===3?81.4/88.75773164416101:1,sz=id===3?145/(max[2]-min[2]):1;
 const groups=new Map();
 for(const p of ps){for(let t=0;t<p.posicoes.length/9;t++){const c=p.coresTriangulos?.[t]||p.cor||'#333333';if(!groups.has(c))groups.set(c,[]);const a=groups.get(c);for(let k=0;k<9;k++){let v=p.posicoes[t*9+k];v=k%3===0?(v-cx)*sx:k%3===1?(v-cy)*sx:(v-min[2])*sz;a.push(v);}}}
 const desc=[],chunks=[];let offset=0;
 for(const [cor,arr] of groups){const v=new Float32Array(arr);desc.push({cor,offset,count:v.length});chunks.push(Buffer.from(v.buffer));offset+=v.byteLength;}
 const info={id,altura:145,boca:81.4,partes:desc};const j=Buffer.from(JSON.stringify(info));const padded=Math.ceil(j.length/4)*4;const header=Buffer.alloc(4+padded);header.writeUInt32LE(padded);header.fill(32,4);j.copy(header,4);
 writeFileSync(new URL(`${id}.bin.gz`,out),gzipSync(Buffer.concat([header,...chunks]),{level:9}));
 console.log('Copo',id,'cores',desc.map(x=>x.cor),'escala',sx,sz,'bytes',offset);
}
