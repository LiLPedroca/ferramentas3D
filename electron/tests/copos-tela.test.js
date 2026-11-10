// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest';
const estado = vi.hoisted(() => ({ abrir: null }));
vi.mock('../src/renderer/shell.js', () => ({ registrarAoAbrir: (_id, fn) => { estado.abrir = fn; }, irPara: vi.fn(), mostrarAviso: vi.fn() }));
vi.mock('../src/renderer/modelos/previa3d.js', () => ({ criarPrevia: () => ({ mostrar: vi.fn(), enquadrar: vi.fn() }) }));
vi.mock('../src/renderer/modelos-ui.js', () => ({ abridorDe: vi.fn(), registrarAbridor: vi.fn(), salvarEmMeusModelos: vi.fn() }));
vi.mock('../src/renderer/modelos-acoes.js', () => ({ salvarArquivoModelo: vi.fn(), salvarModeloComo: vi.fn(), enviarModeloAoFatiador: vi.fn(), densidadeDoModelo: vi.fn() }));
vi.mock('../src/renderer/calculadora-tela.js', () => ({ preencherDoModelo: vi.fn() }));

it('permite escolher outro copo depois de uma falha de leitura, sem habilitar exportação incompleta', async () => {
  const ids = ['catalogo', 'cores', '3d', 'status', 'nome', 'medidas', 'restaurar', 'grade', 'mais', 'menos', 'ajustar', 'custo', 'salvar', 'stl', '3mf', 'fatiador', 'exportar'];
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
