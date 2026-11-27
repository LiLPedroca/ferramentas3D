import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { CATALOGO_COPOS, COPOS_MULTIPARTES, COPO_NA_MESA, lerPacoteCopo } from '../src/renderer/modelos/copos.js';
import { colorir3mf, colorir3mfMultipartes, gerarStlNativoCopo } from '../src/renderer/modelos/copos-exportar.js';

const pasta = new URL('../src/renderer/assets/copos/', import.meta.url);
const ler = nome => new Uint8Array(readFileSync(new URL(nome, pasta)));

describe('catálogo de copos', () => {
  it('cada copo tem prévia, 3MF, miniatura, lugar na mesa e projeto em multipartes', () => {
    for (const { id } of CATALOGO_COPOS) {
      for (const arq of [`${id}.bin.gz`, `${id}.3mf`, `${id}.png`]) expect(existsSync(new URL(arq, pasta)), arq).toBe(true);
      expect(COPO_NA_MESA[id], `mesa do copo ${id}`).toBeDefined();
      if (COPOS_MULTIPARTES.includes(id)) expect(existsSync(new URL(`${id}-multipartes.3mf`, pasta))).toBe(true);
    }
    expect(CATALOGO_COPOS.map(c => c.id)).toContain(4);
    expect(COPOS_MULTIPARTES).toContain(4);
  });

  it('Copo 4: prévia em preto e branco com 145 mm e malha única que vira STL', () => {
    const pacote = lerPacoteCopo(gunzipSync(ler('4.bin.gz')));
    expect(pacote.altura).toBe(145);
    expect(pacote.partes.map(p => p.cor)).toEqual(['#000000', '#ffffff']);
    const bytes = ler('4.3mf');
    const stl = gerarStlNativoCopo(bytes);
    expect(new DataView(stl.buffer).getUint32(80, true)).toBeGreaterThan(30000);
    const saida = unzipSync(colorir3mf(bytes, ['#000000', '#ffffff'], ['#112233', '#ffffff'], { nome: 'Meu copo' }));
    const config = strFromU8(saida['Metadata/model_settings.config']);
    // A assinatura precisa das 2 camadas de fundo (branco só nas camadas 1 e 2) e da base sem brim.
    expect(config).toContain('<metadata key="bottom_shell_layers" value="2"/>');
    expect(config).toContain('<metadata key="brim_type" value="no_brim"/>');
    expect(JSON.parse(strFromU8(saida['Metadata/project_settings.config'])).filament_colour).toEqual(['#112233', '#ffffff']);
  });

  it('Copo 4 em multipartes: base, tubo e argola em 3 placas, com 2 filamentos', () => {
    const saida = unzipSync(colorir3mfMultipartes(ler('4-multipartes.3mf'), ['#112233', '#ffffff'], { nome: 'Copo 4 - multipartes' }));
    const config = strFromU8(saida['Metadata/model_settings.config']);
    expect([...config.matchAll(/<plate>/g)]).toHaveLength(3);
    for (const nome of ['base copo 4', 'tubo copo 4', 'argola copo 4']) expect(config).toContain(`value="${nome}"`);
    expect(new Set([...config.matchAll(/key="extruder" value="(\d+)"/g)].map(m => m[1]))).toEqual(new Set(['1', '2']));
    // base branca (filamento 2) com a assinatura pintada na cor principal (filamento 1 = "4")
    const modelo = strFromU8(saida['3D/3dmodel.model']);
    const base = /<object id="1"[\s\S]*?<\/object>/.exec(modelo)[0];
    expect(new Set(base.match(/paint_color="[^"]+"/g))).toEqual(new Set(['paint_color="4"']));
    expect(strFromU8(saida['3D/3dmodel.model'])).toContain('<metadata name="Title">Copo 4 - multipartes</metadata>');
  });
});
