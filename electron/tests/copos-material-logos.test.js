import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { colorir3mf, colorir3mfMultipartes } from '../src/renderer/modelos/copos-exportar.js';
import { perfilCopo } from '../src/renderer/modelos/copos-perfil.js';
import kobra from '../src/renderer/assets/fatiador/projeto-kobra-x.json' with { type: 'json' };

const pasta = new URL('../src/renderer/assets/copos/', import.meta.url);
const ler = nome => new Uint8Array(readFileSync(new URL(nome, pasta)));
// Logo de teste: um tetraedro vermelho.
const logo = { x: 180, y: 5, malhas: [{ nome: 'Cor 1', cor: '#FF0000', vertices: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 2], triangulos: [0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2] }] };

describe('material dos copos', () => {
  it('PETG é o padrão; PLA troca os ajustes de filamento pelos do PLA da Kobra X', () => {
    const petg = perfilCopo(['#000000', '#ffffff']);
    const pla = perfilCopo(['#000000', '#ffffff'], 'PLA');
    expect(petg.filament_type).toEqual(['PETG', 'PETG']);
    expect(pla.filament_type).toEqual(['PLA', 'PLA']);
    expect(pla.nozzle_temperature).toEqual([kobra.materiais.PLA.nozzle_temperature[0], kobra.materiais.PLA.nozzle_temperature[0]]);
    expect(pla.nozzle_temperature).not.toEqual(petg.nozzle_temperature);
    // com a logo vira 3 filamentos: os ajustes por filamento acompanham
    expect(perfilCopo(['#000000', '#ffffff', '#ff0000'], 'PLA').nozzle_temperature).toHaveLength(3);
  });

  it('Salvar 3MF grava o perfil do material escolhido', () => {
    const z = unzipSync(colorir3mf(ler('2.3mf'), ['#000000', '#ffffff'], ['#000000', '#ffffff'], { nome: 'X', material: 'PLA' }));
    expect(JSON.parse(strFromU8(z['Metadata/project_settings.config'])).filament_type).toEqual(['PLA', 'PLA']);
  }, 60000);
});

describe('logo no copo em multipartes', () => {
  it('vai na placa da base, com filamento próprio, no material escolhido', () => {
    const z = unzipSync(colorir3mfMultipartes(ler('2-multipartes.3mf'), ['#000000', '#ffffff'], { nome: 'Copo 2 - multipartes', material: 'PETG', logos: [logo] }));
    const modelo = strFromU8(z['3D/3dmodel.model']), config = strFromU8(z['Metadata/model_settings.config']);
    const id = modelo.match(/<object id="(\d+)" type="model" name="Logo 1">/)[1];
    expect(modelo).toContain(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 180 5 0" printable="1"/>`);
    const placas = [...config.matchAll(/<plate>[\s\S]*?<\/plate>/g)].map(m => m[0]);
    expect(placas).toHaveLength(3);
    expect(placas.filter(p => p.includes(`key="object_id" value="${id}"`))).toEqual([placas.find(p => /plater_id" value="1"/.test(p))]);
    expect(config).toMatch(new RegExp(`<object id="${id}"><metadata key="name" value="Logo 1"/><metadata key="extruder" value="3"/>`));
    const perfil = JSON.parse(strFromU8(z['Metadata/project_settings.config']));
    expect(perfil.filament_colour).toEqual(['#000000', '#FFFFFF', '#FF0000']);
    expect(perfil.filament_type).toEqual(['PETG', 'PETG', 'PETG']);
    expect(modelo).toContain('<metadata name="Title">Copo 2 - multipartes</metadata>');
  }, 60000);
});
