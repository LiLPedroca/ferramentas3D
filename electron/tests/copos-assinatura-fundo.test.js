import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';

// A assinatura do fundo (logo, site e Instagram) precisa começar na 1ª camada: fundo plano, só pintado.
// Um rebaixo de 0,2 mm deixa um buraco na 1ª camada e a cor da logo só começa na 2ª.
const pasta = new URL('../src/renderer/assets/copos/', import.meta.url);

function fundoDaMalha(texto) {
  const vs = [];
  for (const m of texto.matchAll(/<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g)) vs.push(+m[1], +m[2], +m[3]);
  let z0 = Infinity;
  for (let i = 2; i < vs.length; i += 3) z0 = Math.min(z0, vs[i]);
  const niveis = new Map(); // altura acima de z0 -> área (mm²) das faces planas viradas para baixo, perto do fundo
  const pintadasNoFundo = new Set();
  for (const m of texto.matchAll(/<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"([^>]*?)\/>/g)) {
    const [a, b, c] = [m[1], m[2], m[3]].map(k => +k * 3);
    const za = vs[a + 2];
    if (za > z0 + 0.5 || Math.abs(vs[b + 2] - za) > 1e-5 || Math.abs(vs[c + 2] - za) > 1e-5) continue;
    const nz = (vs[b] - vs[a]) * (vs[c + 1] - vs[a + 1]) - (vs[b + 1] - vs[a + 1]) * (vs[c] - vs[a]);
    if (nz >= 0) continue; // virada para cima
    const h = Math.round((za - z0) * 100) / 100;
    niveis.set(h, (niveis.get(h) ?? 0) - nz / 2);
    if (h === 0) pintadasNoFundo.add(/paint_color="([^"]+)"/.exec(m[4])?.[1] ?? '');
  }
  return { niveis, pintadasNoFundo };
}

const casos = [
  ['1.3mf', '3D/3dmodel.model'],
  ['2.3mf', '3D/3dmodel.model'],
  ['3.3mf', '3D/3dmodel.model'],
  ['4.3mf', '3D/3dmodel.model'],
  ['1-multipartes.3mf', '3D/Objects/base drapeado com trava_2.model'],
  ['2-multipartes.3mf', '3D/Objects/base 2.model'],
  ['3-multipartes.3mf', '3D/Objects/base 3.model'],
  ['4-multipartes.3mf', '3D/Objects/base copo 4_4.model'],
];

describe('assinatura no fundo dos copos', () => {
  it.each(casos)('%s: fundo plano, com as duas cores da assinatura na 1ª camada', (arquivo, membro) => {
    const zip = unzipSync(new Uint8Array(readFileSync(new URL(arquivo, pasta))), { filter: f => f.name === membro });
    const texto = strFromU8(zip[membro]);
    // a base é o primeiro objeto com malha do arquivo
    const primeiro = /<object\b[^>]*>[\s\S]*?<\/object>/.exec(texto)[0];
    const { niveis, pintadasNoFundo } = fundoDaMalha(primeiro);
    // o rebaixo antigo tinha 747 mm² de teto; sobram só lascas de área zero (Copo 1, borda do drapeado)
    expect(niveis.get(0.2) ?? 0, 'área de teto de rebaixo a 0,2 mm do fundo').toBeLessThan(0.01);
    expect(pintadasNoFundo.size, 'cores pintadas no fundo').toBeGreaterThanOrEqual(2);
  }, 120000);
});
