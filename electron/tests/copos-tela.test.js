// @vitest-environment happy-dom
import { it, expect, vi, beforeEach } from 'vitest';
const estado = vi.hoisted(() => ({ abrir: null, verBase: vi.fn() }));
beforeEach(() => { vi.resetModules(); estado.verBase.mockClear(); });
vi.mock('../src/renderer/shell.js', () => ({ registrarAoAbrir: (_id, fn) => { estado.abrir = fn; }, irPara: vi.fn(), mostrarAviso: vi.fn() }));
vi.mock('../src/renderer/modelos/previa3d.js', () => ({ criarPrevia: () => ({ mostrar: vi.fn(), enquadrar: vi.fn(), verBase: estado.verBase }) }));
vi.mock('../src/renderer/modelos-ui.js', () => ({ abridorDe: vi.fn(), registrarAbridor: vi.fn(), salvarEmMeusModelos: vi.fn() }));
vi.mock('../src/renderer/modelos-acoes.js', () => ({ salvarArquivoModelo: vi.fn(), salvarModeloComo: vi.fn(), enviarModeloAoFatiador: vi.fn(), densidadeDoModelo: vi.fn() }));
vi.mock('../src/renderer/calculadora-tela.js', () => ({ preencherDoModelo: vi.fn() }));

it('permite escolher outro copo depois de uma falha de leitura, sem habilitar exportação incompleta', async () => {
  const ids = ['catalogo', 'cores', '3d', 'status', 'nome', 'medidas', 'restaurar', 'grade', 'mais', 'menos', 'ajustar', 'base', 'custo', 'salvar', 'stl', '3mf', 'fatiador', 'exportar'];
  document.body.innerHTML = ids.map(id => `<button id="cp-${id}"></button>`).join('');
  const lerCopo = vi.fn().mockResolvedValue({ ok: false, erro: 'Arquivo indisponível.' });
  window.modelos = { lerCopo };
  const { iniciarCopos } = await import('../src/renderer/copos-tela.js');
  iniciarCopos(); estado.abrir(); await new Promise(r => setTimeout(r, 0));
  expect(document.getElementById('cp-stl').disabled).toBe(true);
  document.querySelector('#cp-catalogo [data-id="2"]').click(); await new Promise(r => setTimeout(r, 0));
  expect(lerCopo).toHaveBeenCalledTimes(2);
  expect(lerCopo).toHaveBeenLastCalledWith(2);
  expect(document.getElementById('cp-stl').disabled).toBe(true);
});

it('abre a vista da assinatura somente depois que o copo terminou de carregar', async () => {
  const ids = ['catalogo', 'cores', '3d', 'status', 'nome', 'medidas', 'restaurar', 'grade', 'mais', 'menos', 'ajustar', 'base', 'custo', 'salvar', 'stl', '3mf', 'fatiador', 'exportar'];
  document.body.innerHTML = ids.map(id => `<button id="cp-${id}" disabled></button>`).join('');
  const texto = JSON.stringify({ partes: [{ cor: '#000000', offset: 0, count: 9 }] });
  const n = Math.ceil(texto.length / 4) * 4, bytes = new Uint8Array(4 + n + 36);bytes.fill(32, 4, 4 + n);
  new DataView(bytes.buffer).setUint32(0, n, true);bytes.set(new TextEncoder().encode(texto), 4);
  new Float32Array(bytes.buffer, 4 + n).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  let resolver;window.modelos = { lerCopo: vi.fn(() => new Promise(r => { resolver = r; })) };
  const { iniciarCopos } = await import('../src/renderer/copos-tela.js');iniciarCopos();estado.abrir();
  document.getElementById('cp-base').click();expect(estado.verBase).not.toHaveBeenCalled();
  resolver({ ok: true, dados: bytes });await new Promise(r => setTimeout(r, 0));
  expect(document.getElementById('cp-base').disabled).toBe(false);
  document.getElementById('cp-base').click();expect(estado.verBase).toHaveBeenCalledTimes(1);
});
