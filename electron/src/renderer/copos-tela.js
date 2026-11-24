import { CATALOGO_COPOS, COPOS_MULTIPARTES, COPO_NA_MESA, lerPacoteCopo, aplicarCores, coresIniciais } from './modelos/copos.js';
import { colorir3mf, colorir3mfMultipartes, gerarStlNativoCopo, stlComLogos } from './modelos/copos-exportar.js';
import { anguloDaNovaCopia, caixaDaLogo, limitarNoCopo, logoNaCurva, logosNaMesa, medirTubo, passaDoTubo, raioEm } from './modelos/logo-copo.js';
import { abrirLogoNoCopo } from './logo-tela.js';
import { criarPrevia } from './modelos/previa3d.js';
import { abridorDe, perguntarMaterial, registrarAbridor, salvarEmMeusModelos } from './modelos-ui.js';
import { materialAtual } from './modelos/projeto-fatiador.js';
import { registrarAoAbrir, irPara, mostrarAviso, confirmar } from './shell.js';
import { salvarArquivoModelo, salvarModeloComo, enviarModeloAoFatiador, densidadeDoModelo } from './modelos-acoes.js';
import { preencherDoModelo } from './calculadora-tela.js';

const $ = id => document.getElementById(id);
let pacote, cores = [], previa, id = 1, pedido = 0, atual = null, ocupado = false, pronto = false;
const acoes = ['cp-salvar', 'cp-custo', 'cp-stl', 'cp-3mf', 'cp-fatiador', 'cp-base', 'cp-logo-adicionar', 'cp-logo-meus', 'cp-logo-editar', 'cp-logo-clonar', 'cp-logo-remover', 'cp-logo-remover-esta'];
function bloquear(sim) {
  ocupado = sim;
  [...acoes, 'cp-restaurar'].forEach(id => { $(id).disabled = sim || !pronto; });
  const multipartes = COPOS_MULTIPARTES.includes(id);
  $('cp-multipartes').disabled = sim || !pronto || !multipartes;
  $('cp-multipartes').innerHTML = 'Exportar em multipartes' + (multipartes ? '' : ' <small>Em breve</small>');
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
    cores = coresIniciais(pacote.partes, salvas ?? []);
    previa ??= criarPrevia($('cp-3d'), { frente: true, gradeSuave: true });
    previa.mostrar(aplicarCores(pacote.partes, cores)); previa.enquadrar();
    anterior?.partes.forEach(p => p.geometria.dispose());
    tubo = medirTubo(pacote.partes);
    if (logo) { logo.copias = logo.copias.map(c => ({ ...c, z: limitarNoCopo(c.z, logo.caixa.altura, tubo) })); }
    mostrarLogo();
    $('cp-nome').value = atual?.nome ?? `Copo ${novo}`;
    $('cp-medidas').textContent = '145 mm · Ø interno 81,4 mm';
    $('cp-status').textContent = ''; controles(); pronto = true; bloquear(false);
  } catch (e) { if (ticket === pedido) { $('cp-status').textContent = e.message; pronto = false; bloquear(false); } }
}
function volume() {
  let soma = 0;
  if (logo) for (const m of logo.malhas) {
    const v = m.vertices, t = m.triangulos;
    let s = 0;
    for (let i = 0; i < t.length; i += 3) {
      const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
      s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) + v[a + 1] * (v[b + 2] * v[c] - v[b] * v[c + 2]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
    }
    soma += Math.abs(s) * logo.copias.length;
  }
  for (const p of pacote.partes) {
    const a = p.geometria.attributes.position.array;
    for (let i = 0; i < a.length; i += 9) soma += a[i] * (a[i+4]*a[i+8]-a[i+5]*a[i+7]) + a[i+1]*(a[i+5]*a[i+6]-a[i+3]*a[i+8]) + a[i+2]*(a[i+3]*a[i+7]-a[i+4]*a[i+6]);
  }
  return Math.abs(soma / 6);
}
async function nativo(material) {
  const escolhidas = [...cores];
  const nome = $('cp-nome').value || `Copo ${id}`;
  const r = await window.modelos.lerCopo(id, true);
  if (!r.ok) throw Error(r.erro);
  return { bytes: colorir3mf(r.dados, pacote.partes.map(p => p.cor), escolhidas, { nome, material, logos: logosParaMesa() }), aviso: avisoDaMesa() };
}
// Pergunta o material (PLA ou PETG) e só então monta o arquivo; null = cancelou.
async function comMaterial(fazer) {
  const escolha = await perguntarMaterial();
  if (escolha) await fazer(escolha.material);
}

// ---------- Logo personalizada (2D para 3D no tubo do copo) ----------
// logo: { salvo, malhas, caixa, miniatura, copias: [{ angulo, z }] }. A arte é a mesma em todas as cópias.
let logo = null, tubo = null, selecionada = null, arrasto = null;

const copoNaMesa = () => COPO_NA_MESA[id] ?? COPO_NA_MESA[1];
// Multipartes: a base fica na placa 1, e as logos vão ao lado dela (medido nos arquivos <id>-multipartes.3mf).
const BASE_NA_PLACA = {
  1: { min: [78.51, 87.19], max: [165.94, 174.51] },
  2: { min: [88.07, 88.11], max: [171.92, 171.97] },
  3: { min: [82.3, 82.3], max: [177.7, 177.7] },
  4: { min: [82.25, 82.25], max: [177.75, 177.75] },
};
const baseNaPlaca = () => BASE_NA_PLACA[id] ?? copoNaMesa();
function logosParaMesa(ocupado = copoNaMesa()) {
  if (!logo) return [];
  const { lugares } = logosNaMesa(logo.copias.length, logo.caixa, ocupado);
  return lugares.map(l => ({ x: l.x, y: l.y, malhas: logo.malhas }));
}
function avisoDaMesa(ocupado = copoNaMesa()) {
  if (!logo || logosNaMesa(logo.copias.length, logo.caixa, ocupado).cabem) return '';
  return ' Nem todas as logos couberam ao lado do copo: arrume na mesa do fatiador.';
}
function centroNaMesa() {
  const c = copoNaMesa();
  return [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2];
}

// Desenha as cópias dobradas no tubo (cada cópia com o seu id na prévia).
function mostrarLogo() {
  const com = Boolean(logo);
  $('cp-logo-secao').classList.toggle('com-logo', com);
  $('cp-logo-vazio').hidden = com;
  $('cp-logo-com').hidden = !com;
  if (!previa) return;
  if (!com || !tubo) { previa.extras([]); return; }
  const lista = [];
  logo.copias.forEach((c, i) => {
    for (const m of logo.malhas) lista.push({ id: i, cor: m.cor, posicoes: logoNaCurva(m, logo.caixa, c, tubo) });
  });
  previa.extras(lista);
  previa.realcarExtra(selecionada);
  $('cp-logo-miniatura').src = logo.miniatura;
  const mm = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const n = logo.copias.length;
  $('cp-logo-info').textContent = `${mm(logo.caixa.largura)} × ${mm(logo.caixa.altura)} mm · ${n} ${n === 1 ? 'logo' : 'logos'}`;
  $('cp-logo-remover-esta').hidden = selecionada === null || n < 2;
  const avisos = [];
  if (logo.copias.some(c => passaDoTubo(c.z, logo.caixa.altura, tubo))) avisos.push('A logo está passando do tubo.');
  if (!logosNaMesa(n, logo.caixa, copoNaMesa()).cabem) avisos.push('Nem todas as logos cabem na mesa ao lado do copo.');
  $('cp-logo-aviso').textContent = avisos.join(' ');
}

async function editarLogo() {
  if (ocupado || !pronto) return;
  const r = await abrirLogoNoCopo(logo?.salvo ?? null);
  if (!r) return;
  usarLogo(r, logo?.copias);
}

// Logos salvas do 2D para 3D (Meus modelos): a escolhida abre na janela para ajustar. O copo fica com uma
// cópia; o modelo salvo não muda.
async function listarLogosSalvas() {
  const caixa = $('cp-logo-salvos');
  if (!caixa.hidden) { caixa.hidden = true; return; }
  const r = await window.dados.projetos.listar();
  const salvas = r.ok ? r.dados.filter(p => p.tipo === 'logo' && p.imagem) : [];
  if (!salvas.length) { mostrarAviso('Você ainda não tem logos salvas no 2D para 3D.'); return; }
  caixa.replaceChildren(...salvas.map(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    const img = document.createElement('img');
    img.src = p.miniatura || p.imagem;
    img.alt = '';
    const nome = document.createElement('span');
    nome.textContent = p.nome;
    b.append(img, nome);
    b.addEventListener('click', async () => {
      if (ocupado || !pronto) return;
      caixa.hidden = true;
      const res = await abrirLogoNoCopo({ opcoes: p.opcoes, imagem: p.imagem, correcoes: p.correcoes });
      if (res) usarLogo(res);
    });
    return b;
  }));
  caixa.hidden = false;
}

function usarLogo(r, copias) {
  const caixa = caixaDaLogo(r.malhas);
  const meio = tubo ? (tubo.z0 + tubo.z1) / 2 : 100;
  logo = { ...r, caixa, copias: (copias ?? [{ angulo: 0, z: meio }]).map(c => ({ ...c, z: tubo ? limitarNoCopo(c.z, caixa.altura, tubo) : c.z })) };
  selecionada = null;
  mostrarLogo();
}

function clonarLogo() {
  if (!logo || !tubo) return;
  const raio = raioEm(tubo, logo.copias[0].z);
  const angulo = anguloDaNovaCopia(logo.copias.map(c => c.angulo), (logo.caixa.largura + 6) / raio);
  if (angulo === null) { mostrarAviso('Não cabe mais uma cópia em volta do copo.'); return; }
  logo.copias.push({ angulo, z: logo.copias[0].z });
  selecionada = logo.copias.length - 1;
  mostrarLogo();
}

async function removerLogo() {
  if (!logo) return;
  const ok = await confirmar({ titulo: 'Remover a logo?', texto: logo.copias.length > 1 ? 'A logo e as cópias saem do copo.' : 'A logo sai do copo.', botao: 'Remover' });
  if (!ok) return;
  logo = null;
  selecionada = null;
  mostrarLogo();
}

function removerEsta() {
  if (!logo || selecionada === null || logo.copias.length < 2) return;
  logo.copias.splice(selecionada, 1);
  selecionada = null;
  mostrarLogo();
}

// Arrastar uma cópia: gira em volta do copo e sobe/desce, sempre dentro do tubo.
function ligarArrasto() {
  const area = $('cp-3d');
  const anguloDe = p => Math.atan2(p[0] - tubo.centro[0], -(p[1] - tubo.centro[1]));
  area.addEventListener('pointerdown', ev => {
    if (!logo || !tubo || ev.button !== 0 || !previa) return;
    const alvo = previa.extraNoPonto(ev.clientX, ev.clientY);
    if (alvo === null) {
      if (selecionada !== null) { selecionada = null; previa.realcarExtra(null); $('cp-logo-remover-esta').hidden = true; }
      return;
    }
    selecionada = alvo;
    previa.realcarExtra(alvo);
    $('cp-logo-remover-esta').hidden = logo.copias.length < 2;
    $('cp-logo-secao').open = true;
    const p = previa.pontoNaPeca(ev.clientX, ev.clientY);
    const c = logo.copias[alvo];
    arrasto = { id: alvo, inicio: { ...c }, pega: p ? anguloDe(p) : c.angulo, pegaZ: p ? p[2] : c.z, mexeu: false };
    previa.travarGiro(true);
    area.classList.add('arrastando');
    area.setPointerCapture?.(ev.pointerId);
  });
  area.addEventListener('pointermove', ev => {
    if (!arrasto) return;
    const p = previa.pontoNaPeca(ev.clientX, ev.clientY);
    if (!p) return;
    const c = logo.copias[arrasto.id];
    c.angulo = arrasto.inicio.angulo + (anguloDe(p) - arrasto.pega);
    c.z = limitarNoCopo(arrasto.inicio.z + (p[2] - arrasto.pegaZ), logo.caixa.altura, tubo);
    arrasto.mexeu = true;
    previa.moverExtra(arrasto.id, c.angulo - arrasto.inicio.angulo, c.z - arrasto.inicio.z, tubo.centro);
  });
  const soltar = () => {
    if (!arrasto) return;
    const mexeu = arrasto.mexeu;
    arrasto = null;
    previa.travarGiro(false);
    area.classList.remove('arrastando');
    if (mexeu) mostrarLogo();
  };
  area.addEventListener('pointerup', soltar);
  area.addEventListener('pointercancel', soltar);
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
  $('cp-restaurar').addEventListener('click', () => { if (!pacote || ocupado) return; cores = coresIniciais(pacote.partes); controles(); pintar(); });
  $('cp-grade').addEventListener('change', () => previa?.mostrarGrade($('cp-grade').checked));
  $('cp-mais').addEventListener('click', () => previa?.zoom(0.85));
  $('cp-menos').addEventListener('click', () => previa?.zoom(1.18));
  $('cp-ajustar').addEventListener('click', () => previa?.enquadrar());
  $('cp-base').addEventListener('click', () => previa?.verBase());
  $('cp-custo').addEventListener('click', () => executar(() => preencherDoModelo({ nome: $('cp-nome').value || `Copo ${id}`, pesoG: volume() / 1000 * densidadeDoModelo(materialAtual()), detalhe: 'Estimativa maciça; confira o peso no fatiador.' })));
  $('cp-salvar').addEventListener('click', () => executar(async () => {
    const canvas = $('cp-3d').querySelector('canvas'); const thumb = document.createElement('canvas'); thumb.width = 320; thumb.height = 240; thumb.getContext('2d').drawImage(canvas, 0, 0, 320, 240);
    atual = await salvarEmMeusModelos({ tipo: 'caneca', atual, nomePadrao: $('cp-nome').value || `Copo ${id}`, montar: () => ({
      opcoes: { catalogo: id, cores: [...cores], ...(logo ? { logo: { opcoes: logo.salvo.opcoes, copias: logo.copias } } : {}) },
      miniatura: thumb.toDataURL('image/png'),
      ...(logo ? { imagem: logo.salvo.imagem, correcoes: logo.salvo.correcoes } : {}),
    }) }) ?? atual;
  }));
  $('cp-stl').addEventListener('click', () => executar(async () => {
    const r = await window.modelos.lerCopo(id, true);
    if (!r.ok) throw Error(r.erro);
    await salvarArquivoModelo(stlComLogos(gerarStlNativoCopo(r.dados), logosParaMesa(), centroNaMesa()), $('cp-nome').value || `Copo ${id}`, 'stl');
  }));
  $('cp-logo-adicionar').addEventListener('click', editarLogo);
  $('cp-logo-editar').addEventListener('click', editarLogo);
  $('cp-logo-meus').addEventListener('click', listarLogosSalvas);
  $('cp-logo-clonar').addEventListener('click', clonarLogo);
  $('cp-logo-remover').addEventListener('click', removerLogo);
  $('cp-logo-remover-esta').addEventListener('click', removerEsta);
  ligarArrasto();
  $('cp-3mf').addEventListener('click', () => executar(() => comMaterial(material => salvarModeloComo('3mf', aplicarCores(pacote.partes, cores), $('cp-nome').value || `Copo ${id}`, () => nativo(material)))));
  $('cp-multipartes').addEventListener('click', () => executar(() => comMaterial(async material => {
    if (!COPOS_MULTIPARTES.includes(id)) return;
    const escolhidas = [...cores], nome = ($('cp-nome').value || `Copo ${id}`) + ' - multipartes';
    const r = await window.modelos.lerCopoMultipartes(id);
    if (!r.ok) throw Error(r.erro);
    const logos = logosParaMesa(baseNaPlaca());
    await salvarArquivoModelo(colorir3mfMultipartes(r.dados, escolhidas, { nome, material, logos }), nome, '3mf', avisoDaMesa(baseNaPlaca()));
  })));
  $('cp-fatiador').addEventListener('click', () => executar(() => comMaterial(material => enviarModeloAoFatiador(aplicarCores(pacote.partes, cores), $('cp-nome').value || `Copo ${id}`, () => nativo(material)))));
  registrarAoAbrir('caneca', () => { if (!pronto && !ocupado) carregar(id); });
  window.__coposTeste = { logo: () => logo, tubo: () => tubo, abrirSalvo: p => abridorDe('caneca')(p) };
  registrarAbridor('caneca', async p => {
    if (!p.opcoes.catalogo) { irPara('caneca-legado'); return legado(p); }
    atual = { id: p.id, nome: p.nome };
    logo = null;
    await carregar(p.opcoes.catalogo, p.opcoes.cores);
    if (p.opcoes.logo && p.imagem) {
      $('cp-status').textContent = 'Refazendo a logo…';
      const r = await abrirLogoNoCopo({ opcoes: p.opcoes.logo.opcoes, imagem: p.imagem, correcoes: p.correcoes }, { invisivel: true });
      $('cp-status').textContent = '';
      if (r) usarLogo(r, p.opcoes.logo.copias);
      else mostrarAviso('Não foi possível refazer a logo deste copo.');
    }
  });
}
