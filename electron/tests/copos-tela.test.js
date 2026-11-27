// @vitest-environment happy-dom
import { it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
const estado = vi.hoisted(() => ({ abrir: null, verBase: vi.fn(), avisoNoMeio: vi.fn() }));
beforeEach(() => { vi.resetModules(); estado.verBase.mockClear(); });
vi.mock('../src/renderer/shell.js', () => ({ registrarAoAbrir: (_id, fn) => { estado.abrir = fn; }, irPara: vi.fn(), mostrarAviso: vi.fn(), confirmar: vi.fn(), avisoNoMeio: estado.avisoNoMeio }));
vi.mock('../src/renderer/modelos/previa3d.js', () => ({ criarPrevia: () => ({ mostrar: vi.fn(), colorir: vi.fn(), enquadrar: vi.fn(), verBase: estado.verBase, extras: vi.fn(), realcarExtra: vi.fn() }) }));
vi.mock('../src/renderer/logo-tela.js', () => ({ abrirLogoNoCopo: vi.fn() }));
vi.mock('../src/renderer/modelos/logo-copo.js', () => ({ medirTubo: () => ({ centro: [0, 0], z0: 30, z1: 120, raios: [40] }), limitarNoCopo: (z) => z, passaDoTubo: () => false, anguloDaNovaCopia: vi.fn(), caixaDaLogo: vi.fn(), logoMaiorQueOTubo: vi.fn(), logoNaCurva: vi.fn(), logosNaMesa: vi.fn(() => ({ lugares: [], cabem: true })), pecasNaMesa: vi.fn(() => ({ lugares: [], cabem: true })), raioEm: vi.fn() }));
vi.mock('../src/renderer/nome-copo-tela.js', () => ({ abrirNomeNoCopo: vi.fn(), refazerNome: vi.fn(), resumoDoNome: vi.fn(() => '') }));
vi.mock('../src/renderer/modelos-ui.js', () => ({ abridorDe: vi.fn(), registrarAbridor: vi.fn(), salvarEmMeusModelos: vi.fn(), perguntarMaterial: vi.fn(async () => ({ material: 'PLA' })) }));
vi.mock('../src/renderer/modelos-acoes.js', () => ({ salvarMontando: vi.fn(async (nome, ext, montar) => { const a = await montar(nome); return a; }), enviarModeloAoFatiador: vi.fn(), densidadeDoModelo: vi.fn() }));
vi.mock('../src/renderer/modelos/copos-exportar.js', () => ({ colorir3mf: vi.fn(), gerarStlNativoCopo: vi.fn(), colorir3mfMultipartes: vi.fn(() => new Uint8Array([7])), stlComLogos: vi.fn() }));
vi.mock('../src/renderer/calculadora-tela.js', () => ({ preencherDoModelo: vi.fn() }));

it('permite escolher outro copo depois de uma falha de leitura, sem habilitar exportação incompleta', async () => {
  const ids = ['catalogo', 'cores', '3d', 'status', 'medidas', 'mais', 'menos', 'ajustar', 'base', 'custo', 'salvar', 'stl', '3mf', 'fatiador', 'exportar', 'logo-secao', 'logo-vazio', 'logo-com', 'logo-adicionar', 'logo-meus', 'logo-salvos', 'logo-editar', 'logo-clonar', 'logo-remover', 'logo-remover-esta', 'logo-miniatura', 'logo-info', 'logo-aviso', 'multipartes', 'nome-secao', 'nome-vazio', 'nome-com', 'nome-adicionar', 'nome-editar', 'nome-clonar', 'nome-remover', 'nome-remover-esta', 'nome-miniatura', 'nome-info', 'nome-aviso', 'personalizar'];
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
  const ids = ['catalogo', 'cores', '3d', 'status', 'medidas', 'mais', 'menos', 'ajustar', 'base', 'custo', 'salvar', 'stl', '3mf', 'fatiador', 'exportar', 'logo-secao', 'logo-vazio', 'logo-com', 'logo-adicionar', 'logo-meus', 'logo-salvos', 'logo-editar', 'logo-clonar', 'logo-remover', 'logo-remover-esta', 'logo-miniatura', 'logo-info', 'logo-aviso', 'nome-secao', 'nome-vazio', 'nome-com', 'nome-adicionar', 'nome-editar', 'nome-clonar', 'nome-remover', 'nome-remover-esta', 'nome-miniatura', 'nome-info', 'nome-aviso', 'personalizar'];
  document.body.innerHTML = ids.map(id => `<button id="cp-${id}" disabled></button>`).join('');
  const rodape = readFileSync('src/renderer/index.html', 'utf8').match(/<footer class="copos-rodape">[\s\S]*?<\/footer>/)[0];
  const html = new DOMParser().parseFromString(rodape, 'text/html');
  const multipartes = html.querySelector('#cp-exportar #cp-multipartes');
  expect(multipartes).not.toBeNull();
  expect(multipartes.textContent).toContain('Exportar em multipartes');
  document.body.append(multipartes.cloneNode(true));
  const texto = JSON.stringify({ partes: [{ cor: '#000000', offset: 0, count: 9 }] });
  const n = Math.ceil(texto.length / 4) * 4, bytes = new Uint8Array(4 + n + 36);bytes.fill(32, 4, 4 + n);
  new DataView(bytes.buffer).setUint32(0, n, true);bytes.set(new TextEncoder().encode(texto), 4);
  new Float32Array(bytes.buffer, 4 + n).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  let resolver;window.modelos = { lerCopo: vi.fn(() => new Promise(r => { resolver = r; })) };
  const { iniciarCopos } = await import('../src/renderer/copos-tela.js');iniciarCopos();estado.abrir();
  document.getElementById('cp-base').click();expect(estado.verBase).not.toHaveBeenCalled();
  resolver({ ok: true, dados: bytes });await new Promise(r => setTimeout(r, 0));
  expect(document.getElementById('cp-base').disabled).toBe(false);
  expect(document.getElementById('cp-multipartes').disabled).toBe(false);
  document.getElementById('cp-base').click();expect(estado.verBase).toHaveBeenCalledTimes(1);
});

it('exporta multipartes dos três copos, com as cores atuais', async()=>{
 const ids=['catalogo','cores','3d','status','medidas','mais','menos','ajustar','base','custo','salvar','stl','3mf','fatiador','exportar','multipartes','logo-secao','logo-vazio','logo-com','logo-adicionar','logo-meus','logo-salvos','logo-editar','logo-clonar','logo-remover','logo-remover-esta','logo-miniatura','logo-info','logo-aviso', 'nome-secao', 'nome-vazio', 'nome-com', 'nome-adicionar', 'nome-editar', 'nome-clonar', 'nome-remover', 'nome-remover-esta', 'nome-miniatura', 'nome-info', 'nome-aviso', 'personalizar'];
 document.body.innerHTML=ids.map(id=>`<button id="cp-${id}"></button>`).join('');
 const texto=JSON.stringify({partes:[{cor:'#000000',offset:0,count:9},{cor:'#ffffff',offset:36,count:9}]});
 const n=Math.ceil(texto.length/4)*4,bytes=new Uint8Array(4+n+72);bytes.fill(32,4,4+n);new DataView(bytes.buffer).setUint32(0,n,true);bytes.set(new TextEncoder().encode(texto),4);
 const lerCopoMultipartes=vi.fn().mockResolvedValue({ok:true,dados:new Uint8Array([77])});window.modelos={lerCopo:vi.fn().mockResolvedValue({ok:true,dados:bytes}),lerCopoMultipartes};
 const {iniciarCopos}=await import('../src/renderer/copos-tela.js');iniciarCopos();estado.abrir();await vi.waitFor(()=>expect(document.getElementById('cp-salvar').disabled).toBe(false));
 const cor=document.querySelector('#cp-cores input');cor.value='#123456';cor.dispatchEvent(new Event('input'));
 document.getElementById('cp-multipartes').click();expect(document.getElementById('cp-multipartes').disabled).toBe(true);
 await vi.waitFor(()=>expect(lerCopoMultipartes).toHaveBeenCalledWith(1));
 const {colorir3mfMultipartes}=await import('../src/renderer/modelos/copos-exportar.js');await vi.waitFor(()=>expect(colorir3mfMultipartes).toHaveBeenCalledWith(new Uint8Array([77]),['#123456','#ffffff'],{nome:'Copo 1 - multipartes',material:'PLA',logos:[]}));
 const {salvarMontando}=await import('../src/renderer/modelos-acoes.js');expect(salvarMontando).toHaveBeenCalledWith('Copo 1 - multipartes','3mf',expect.any(Function));
 await vi.waitFor(()=>expect(document.getElementById('cp-multipartes').disabled).toBe(false));
 document.querySelector('#cp-catalogo [data-id="2"]').click();await vi.waitFor(()=>expect(document.getElementById('cp-salvar').disabled).toBe(false));
 expect(document.getElementById('cp-multipartes').disabled).toBe(false);expect(document.getElementById('cp-multipartes').textContent).not.toContain('Em breve');
 document.getElementById('cp-multipartes').click();await vi.waitFor(()=>expect(lerCopoMultipartes).toHaveBeenCalledWith(2));
 await vi.waitFor(()=>expect(salvarMontando).toHaveBeenCalledWith('Copo 2 - multipartes','3mf',expect.any(Function)));
 await vi.waitFor(()=>expect(document.getElementById('cp-multipartes').disabled).toBe(false));
 document.querySelector('#cp-catalogo [data-id="3"]').click();await vi.waitFor(()=>expect(document.getElementById('cp-salvar').disabled).toBe(false));
 expect(document.getElementById('cp-multipartes').disabled).toBe(false);expect(document.getElementById('cp-multipartes').textContent).not.toContain('Em breve');
 document.getElementById('cp-multipartes').click();await vi.waitFor(()=>expect(lerCopoMultipartes).toHaveBeenCalledWith(3));
});

it('Copo 4 em ajustes: fica apagado e só avisa no meio da tela', async () => {
  const ids = ['catalogo', 'cores', '3d', 'status', 'medidas', 'mais', 'menos', 'ajustar', 'base', 'custo', 'salvar', 'stl', '3mf', 'fatiador', 'exportar', 'multipartes', 'logo-secao', 'logo-vazio', 'logo-com', 'logo-adicionar', 'logo-meus', 'logo-salvos', 'logo-editar', 'logo-clonar', 'logo-remover', 'logo-remover-esta', 'logo-miniatura', 'logo-info', 'logo-aviso', 'nome-secao', 'nome-vazio', 'nome-com', 'nome-adicionar', 'nome-editar', 'nome-clonar', 'nome-remover', 'nome-remover-esta', 'nome-miniatura', 'nome-info', 'nome-aviso', 'personalizar'];
  document.body.innerHTML = ids.map(id => `<button id="cp-${id}"></button>`).join('');
  const lerCopo = vi.fn().mockResolvedValue({ ok: false, erro: 'x' });
  window.modelos = { lerCopo };
  const { iniciarCopos } = await import('../src/renderer/copos-tela.js');
  iniciarCopos();
  const b = document.querySelector('#cp-catalogo [data-id="4"]');
  expect(b.classList.contains('em-ajuste')).toBe(true);
  expect(b.getAttribute('aria-disabled')).toBe('true');
  b.click();
  await new Promise(r => setTimeout(r, 0));
  expect(lerCopo).not.toHaveBeenCalled();
  expect(estado.avisoNoMeio).toHaveBeenCalledWith({ titulo: 'Copo 4 em ajustes', texto: 'Ele será liberado assim que possível.', tipo: 'espera' });
});
