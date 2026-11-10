import { CATALOGO_COPOS, lerPacoteCopo, aplicarCores } from './modelos/copos.js';
import { colorir3mf, gerarStlCopo } from './modelos/copos-exportar.js';
import { criarPrevia } from './modelos/previa3d.js';
import { abridorDe, registrarAbridor, salvarEmMeusModelos } from './modelos-ui.js';
import { registrarAoAbrir, irPara, mostrarAviso } from './shell.js';
import { salvarArquivoModelo, salvarModeloComo, enviarModeloAoFatiador, densidadeDoModelo } from './modelos-acoes.js';
import { preencherDoModelo } from './calculadora-tela.js';

const $ = id => document.getElementById(id);
let pacote, cores = [], previa, id = 1, pedido = 0, atual = null, ocupado = false, pronto = false;
const acoes = ['cp-salvar', 'cp-custo', 'cp-stl', 'cp-3mf', 'cp-fatiador'];
function bloquear(sim) {
  ocupado = sim;
  [...acoes, 'cp-restaurar'].forEach(id => { $(id).disabled = sim || !pronto; });
  document.querySelectorAll('#cp-cores input').forEach(input => { input.disabled = sim || !pronto; });
}
function pintar() { previa?.colorir(cores); }
function controles() {
  $('cp-cores').replaceChildren(...pacote.partes.map((p, i) => {
    const label = document.createElement('label');
    const span = document.createElement('span'); span.textContent = p.nome;
    const input = document.createElement('input'); input.type = 'color'; input.value = cores[i]; input.setAttribute('aria-label', `Cor ${p.nome.toLowerCase()}`);
    input.addEventListener('input', () => { cores[i] = input.value; pintar(); });
    label.append(span, input); return label;
  }));
}
async function carregar(novo, salvas) {
  const ticket = ++pedido; id = novo; pronto = false; bloquear(true); $('cp-status').textContent = 'Carregando copo…';
  document.querySelectorAll('#cp-catalogo button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.id) === novo)));
  try {
    const r = await window.modelos.lerCopo(novo);
    if (ticket !== pedido) return;
    if (!r.ok) throw Error(r.erro);
    const anterior = pacote;
    pacote = lerPacoteCopo(r.dados);
    cores = aplicarCores(pacote.partes, salvas ?? []).map(p => p.cor);
    previa ??= criarPrevia($('cp-3d'), { frente: true, gradeSuave: true });
    previa.mostrar(aplicarCores(pacote.partes, cores)); previa.enquadrar();
    anterior?.partes.forEach(p => p.geometria.dispose());
    $('cp-nome').value = atual?.nome ?? `Copo ${novo}`;
    $('cp-medidas').textContent = '145 mm · Ø interno 81,4 mm';
    $('cp-status').textContent = ''; controles(); pronto = true; bloquear(false);
  } catch (e) { if (ticket === pedido) { $('cp-status').textContent = e.message; pronto = false; bloquear(false); } }
}
function volume() {
  let soma = 0;
  for (const p of pacote.partes) {
    const a = p.geometria.attributes.position.array;
    for (let i = 0; i < a.length; i += 9) soma += a[i] * (a[i+4]*a[i+8]-a[i+5]*a[i+7]) + a[i+1]*(a[i+5]*a[i+6]-a[i+3]*a[i+8]) + a[i+2]*(a[i+3]*a[i+7]-a[i+4]*a[i+6]);
  }
  return Math.abs(soma / 6);
}
async function nativo() {
  const escolhidas = [...cores];
  const r = await window.modelos.lerCopo(id, true);
  if (!r.ok) throw Error(r.erro);
  return { bytes: colorir3mf(r.dados, pacote.partes.map(p => p.cor), escolhidas) };
}
async function executar(fn) {
  if (ocupado || !pronto) return;
  bloquear(true); $('cp-exportar').open = false; $('cp-status').textContent = 'Preparando…';
  try { await new Promise(r => setTimeout(r, 50)); await fn(); } catch (e) { mostrarAviso(e.message); } finally { bloquear(false); $('cp-status').textContent = ''; }
}
export function iniciarCopos() {
  const legado = abridorDe('caneca');
  for (const modelo of CATALOGO_COPOS) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = modelo.id; b.setAttribute('aria-pressed', 'false');
    const img = document.createElement('img'); img.src = `assets/copos/${modelo.id}.png`; img.alt = '';
    const label = document.createElement('span'); label.textContent = modelo.nome; b.append(img, label);
    b.addEventListener('click', () => { if (!ocupado) { atual = null; carregar(modelo.id); } }); $('cp-catalogo').append(b);
  }
  $('cp-restaurar').addEventListener('click', () => { if (!pacote || ocupado) return; cores = pacote.partes.map(p => p.cor); controles(); pintar(); });
  $('cp-grade').addEventListener('change', () => previa?.mostrarGrade($('cp-grade').checked));
  $('cp-mais').addEventListener('click', () => previa?.zoom(0.85));
  $('cp-menos').addEventListener('click', () => previa?.zoom(1.18));
  $('cp-ajustar').addEventListener('click', () => previa?.enquadrar());
  $('cp-custo').addEventListener('click', () => executar(() => preencherDoModelo({ nome: $('cp-nome').value || `Copo ${id}`, pesoG: volume() / 1000 * densidadeDoModelo('PETG'), detalhe: 'Estimativa maciça; confira o peso no fatiador.' })));
  $('cp-salvar').addEventListener('click', () => executar(async () => {
    const canvas = $('cp-3d').querySelector('canvas'); const thumb = document.createElement('canvas'); thumb.width = 320; thumb.height = 240; thumb.getContext('2d').drawImage(canvas, 0, 0, 320, 240);
    atual = await salvarEmMeusModelos({ tipo: 'caneca', atual, nomePadrao: $('cp-nome').value || `Copo ${id}`, montar: () => ({ opcoes: { catalogo: id, cores: [...cores] }, miniatura: thumb.toDataURL('image/png') }) }) ?? atual;
  }));
  $('cp-stl').addEventListener('click', () => executar(() => salvarArquivoModelo(gerarStlCopo(pacote.partes), $('cp-nome').value || `Copo ${id}`, 'stl')));
  $('cp-3mf').addEventListener('click', () => executar(() => salvarModeloComo('3mf', aplicarCores(pacote.partes, cores), $('cp-nome').value || `Copo ${id}`, nativo)));
  $('cp-fatiador').addEventListener('click', () => executar(() => enviarModeloAoFatiador(aplicarCores(pacote.partes, cores), $('cp-nome').value || `Copo ${id}`, nativo)));
  registrarAoAbrir('caneca', () => { if (!pronto && !ocupado) carregar(id); });
  registrarAbridor('caneca', async p => {
    if (!p.opcoes.catalogo) { irPara('caneca-legado'); return legado(p); }
    atual = { id: p.id, nome: p.nome }; await carregar(p.opcoes.catalogo, p.opcoes.cores);
  });
}
