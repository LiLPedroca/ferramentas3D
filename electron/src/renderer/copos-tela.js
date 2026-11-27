import { CATALOGO_COPOS, COPOS_EM_AJUSTE, COPOS_MULTIPARTES, COPO_NA_MESA, lerPacoteCopo, aplicarCores, coresIniciais } from './modelos/copos.js';
import { colorir3mf, colorir3mfMultipartes, gerarStlNativoCopo, stlComLogos } from './modelos/copos-exportar.js';
import { anguloDaNovaCopia, caixaDaLogo, limitarNoCopo, logoNaCurva, pecasNaMesa, medirTubo, passaDoTubo, raioEm } from './modelos/logo-copo.js';
import { abrirLogoNoCopo } from './logo-tela.js';
import { abrirNomeNoCopo, refazerNome, resumoDoNome } from './nome-copo-tela.js';
import { criarPrevia } from './modelos/previa3d.js';
import { abridorDe, criarPaleta, marcarPaleta, perguntarMaterial, registrarAbridor, salvarEmMeusModelos } from './modelos-ui.js';
import { materialAtual } from './modelos/projeto-fatiador.js';
import { registrarAoAbrir, irPara, mostrarAviso, confirmar, avisoNoMeio } from './shell.js';
import { salvarMontando, enviarModeloAoFatiador, densidadeDoModelo } from './modelos-acoes.js';
import { preencherDoModelo } from './calculadora-tela.js';

const $ = id => document.getElementById(id);
let pacote, cores = [], previa, id = 1, pedido = 0, atual = null, ocupado = false, pronto = false;
const acoes = ['cp-salvar', 'cp-custo', 'cp-stl', 'cp-3mf', 'cp-fatiador', 'cp-base', 'cp-logo-adicionar', 'cp-logo-meus', 'cp-logo-editar', 'cp-logo-clonar', 'cp-logo-remover', 'cp-logo-remover-esta', 'cp-nome-adicionar', 'cp-nome-editar', 'cp-nome-clonar', 'cp-nome-remover', 'cp-nome-remover-esta'];
function bloquear(sim) {
  ocupado = sim;
  acoes.forEach(id => { const b = $(id); if (b) b.disabled = sim || !pronto; });
  const multipartes = COPOS_MULTIPARTES.includes(id);
  $('cp-multipartes').disabled = sim || !pronto || !multipartes;
  $('cp-multipartes').hidden = !multipartes;
  document.querySelectorAll('#cp-cores button').forEach(input => { input.disabled = sim || !pronto; });
}
function pintar() { previa?.colorir(cores); }
function controles() {
  $('cp-cores').replaceChildren(...pacote.partes.map((p, i) => {
    const linha = document.createElement('div'); linha.className = 'copos-cor';
    const span = document.createElement('span'); span.textContent = p.nome;
    const paleta = document.createElement('div'); paleta.className = 'ch-paleta'; paleta.setAttribute('aria-label', `Cor ${p.nome.toLowerCase()}`);
    criarPaleta(paleta, cor => { cores[i] = cor; marcarPaleta(paleta, cor); pintar(); });
    marcarPaleta(paleta, cores[i]);
    linha.append(span, paleta); return linha;
  }));
}
// Nome do copo nos arquivos: o de Meus modelos, ou "Copo N".
const nomeDoCopo = () => atual?.nome ?? `Copo ${id}`;

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
    for (const peca of Object.values(pecas)) if (peca) peca.copias = peca.copias.map(c => ({ ...c, z: limitarNoCopo(c.z, peca.caixa.altura, tubo) }));
    mostrarPecas();
    $('cp-medidas').textContent = '145 mm · Ø interno 81,4 mm';
    $('cp-status').textContent = ''; controles(); pronto = true; bloquear(false);
  } catch (e) { if (ticket === pedido) { $('cp-status').textContent = e.message; pronto = false; bloquear(false); } }
}
function volumeDaMalha(m) {
  const v = m.vertices, t = m.triangulos;
  let s = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
    s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) + v[a + 1] * (v[b + 2] * v[c] - v[b] * v[c + 2]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
  }
  return Math.abs(s);
}
function volume() {
  let soma = 0;
  for (const peca of Object.values(pecas)) if (peca) for (const m of peca.malhas) soma += volumeDaMalha(m) * peca.copias.length;
  for (const p of pacote.partes) {
    const a = p.geometria.attributes.position.array;
    for (let i = 0; i < a.length; i += 9) soma += a[i] * (a[i+4]*a[i+8]-a[i+5]*a[i+7]) + a[i+1]*(a[i+5]*a[i+6]-a[i+3]*a[i+8]) + a[i+2]*(a[i+3]*a[i+7]-a[i+4]*a[i+6]);
  }
  return Math.abs(soma / 6);
}
async function nativo(material, nome) {
  const escolhidas = [...cores];
  const r = await window.modelos.lerCopo(id, true);
  if (!r.ok) throw Error(r.erro);
  return { bytes: colorir3mf(r.dados, pacote.partes.map(p => p.cor), escolhidas, { nome, material, logos: pecasParaMesa() }), aviso: avisoDaMesa() };
}
// Pergunta o material (PLA ou PETG) e só então monta o arquivo; null = cancelou.
async function comMaterial(fazer) {
  const escolha = await perguntarMaterial();
  return escolha ? fazer(escolha.material) : null;
}

// ---------- Logo e nome no tubo do copo ----------
// Cada peça: { malhas, caixa, miniatura, copias: [{ angulo, z }], ... }. A arte é a mesma em todas as cópias.
// logo: + salvo (estado do 2D para 3D); nome: + opcoes (texto, fonte, base, cores).
// Na prévia cada cópia tem um id: logo = 0, 1, 2...; nome = 1000, 1001...
const TIPOS = ['logo', 'nome'];
const BASE_ID = { logo: 0, nome: 1000 };
const ROTULO = { logo: 'logo', nome: 'nome' };
const pecas = { logo: null, nome: null };
let tubo = null, selecionada = null, arrasto = null; // selecionada: { tipo, i }
const idDa = (tipo, i) => BASE_ID[tipo] + i;
const daId = n => (n >= BASE_ID.nome ? { tipo: 'nome', i: n - BASE_ID.nome } : { tipo: 'logo', i: n });

const copoNaMesa = () => COPO_NA_MESA[id] ?? COPO_NA_MESA[1];
// Multipartes: a base fica na placa 1, e as peças vão ao lado dela (medido nos arquivos <id>-multipartes.3mf).
const BASE_NA_PLACA = {
  1: { min: [78.51, 87.19], max: [165.94, 174.51] },
  2: { min: [88.07, 88.11], max: [171.92, 171.97] },
  3: { min: [82.3, 82.3], max: [177.7, 177.7] },
  4: { min: [86.8, 86.8], max: [173.2, 173.2] },
};
const baseNaPlaca = () => BASE_NA_PLACA[id] ?? copoNaMesa();
// Todas as cópias (logos primeiro, depois nomes), cada uma com a sua caixa.
function copiasNaMesa() {
  const lista = [];
  for (const tipo of TIPOS) {
    const peca = pecas[tipo];
    if (peca) peca.copias.forEach((_c, k) => lista.push({ tipo, k, peca }));
  }
  return lista;
}
function pecasParaMesa(ocupado = copoNaMesa()) {
  const lista = copiasNaMesa();
  const { lugares } = pecasNaMesa(lista.map(c => c.peca.caixa), ocupado);
  return lista.map((c, n) => ({ x: lugares[n].x, y: lugares[n].y, malhas: c.peca.malhas, nome: `${c.tipo === 'logo' ? 'Logo' : 'Nome'} ${c.k + 1}` }));
}
const cabemNaMesa = (ocupado = copoNaMesa()) => pecasNaMesa(copiasNaMesa().map(c => c.peca.caixa), ocupado).cabem;
function avisoDaMesa(ocupado = copoNaMesa()) {
  if (!copiasNaMesa().length || cabemNaMesa(ocupado)) return '';
  return ' Nem todas as peças couberam ao lado do copo: arrume na mesa do fatiador.';
}
function centroNaMesa() {
  const c = copoNaMesa();
  return [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2];
}

const mm = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
// Desenha as cópias dobradas no tubo e atualiza os dois blocos do painel.
function mostrarPecas() {
  for (const tipo of TIPOS) {
    const peca = pecas[tipo], com = Boolean(peca);
    $(`cp-${tipo}-secao`)?.classList.toggle('com-logo', com);
    $(`cp-${tipo}-vazio`).hidden = com;
    $(`cp-${tipo}-com`).hidden = !com;
    if (!com) continue;
    if (peca.miniatura) $(`cp-${tipo}-miniatura`).src = peca.miniatura;
    const n = peca.copias.length;
    const medidas = `${mm(peca.caixa.largura)} × ${mm(peca.caixa.altura)} mm · ${n} ${n === 1 ? ROTULO[tipo] : `${ROTULO[tipo]}s`}`;
    $(`cp-${tipo}-info`).textContent = tipo === 'nome' ? `${peca.opcoes.texto} · ${resumoDoNome(peca.opcoes)}${n > 1 ? ` · ${n} nomes` : ''}` : medidas;
    $(`cp-${tipo}-remover-esta`).hidden = selecionada?.tipo !== tipo || n < 2;
    const avisos = [];
    if (tubo && peca.copias.some(c => passaDoTubo(c.z, peca.caixa.altura, tubo))) avisos.push(`${tipo === 'logo' ? 'A logo' : 'O nome'} está passando do tubo.`);
    if (!cabemNaMesa()) avisos.push('Nem todas as peças cabem na mesa ao lado do copo.');
    $(`cp-${tipo}-aviso`).textContent = avisos.join(' ');
  }
  if (!previa) return;
  if (!tubo || !copiasNaMesa().length) { previa.extras([]); return; }
  const lista = [];
  for (const tipo of TIPOS) {
    const peca = pecas[tipo];
    if (!peca) continue;
    peca.copias.forEach((c, i) => {
      for (const m of peca.malhas) {
        const normais = [];
        const posicoes = logoNaCurva(m, peca.caixa, c, tubo, { normais });
        lista.push({ id: idDa(tipo, i), cor: m.cor, posicoes, normais: new Float32Array(normais) });
      }
    });
  }
  previa.extras(lista);
  previa.realcarExtra(selecionada ? idDa(selecionada.tipo, selecionada.i) : null);
}

// Peça nova (ou editada): mantém as cópias que já existiam.
function usarPeca(tipo, r, copias) {
  const caixa = caixaDaLogo(r.malhas);
  const meio = tubo ? (tubo.z0 + tubo.z1) / 2 : 100;
  pecas[tipo] = { ...r, caixa, copias: (copias ?? [{ angulo: 0, z: meio }]).map(c => ({ ...c, z: tubo ? limitarNoCopo(c.z, caixa.altura, tubo) : c.z })) };
  selecionada = null;
  mostrarPecas();
}

async function editarLogo() {
  if (ocupado || !pronto) return;
  const r = await abrirLogoNoCopo(pecas.logo?.salvo ?? null);
  if (r) usarPeca('logo', r, pecas.logo?.copias);
}

async function editarNome() {
  if (ocupado || !pronto) return;
  const r = await abrirNomeNoCopo(pecas.nome?.opcoes ?? null);
  if (r) usarPeca('nome', r, pecas.nome?.copias);
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
      if (res) usarPeca('logo', res);
    });
    return b;
  }));
  caixa.hidden = false;
}

function clonar(tipo) {
  const peca = pecas[tipo];
  if (!peca || !tubo) return;
  const raio = raioEm(tubo, peca.copias[0].z);
  // as cópias das duas peças dividem a volta do copo: o novo lugar evita logos e nomes
  const ocupados = TIPOS.flatMap(t => pecas[t]?.copias.map(c => c.angulo) ?? []);
  const angulo = anguloDaNovaCopia(ocupados, (peca.caixa.largura + 6) / raio);
  if (angulo === null) { mostrarAviso('Não cabe mais uma cópia em volta do copo.'); return; }
  peca.copias.push({ angulo, z: peca.copias[0].z });
  selecionada = { tipo, i: peca.copias.length - 1 };
  mostrarPecas();
}

async function remover(tipo) {
  const peca = pecas[tipo];
  if (!peca) return;
  const titulo = tipo === 'logo' ? 'Remover a logo?' : 'Remover o nome?';
  const texto = tipo === 'logo' ? (peca.copias.length > 1 ? 'A logo e as cópias saem do copo.' : 'A logo sai do copo.') : (peca.copias.length > 1 ? 'O nome e as cópias saem do copo.' : 'O nome sai do copo.');
  if (!(await confirmar({ titulo, texto, botao: 'Remover' }))) return;
  pecas[tipo] = null;
  if (selecionada?.tipo === tipo) selecionada = null;
  mostrarPecas();
}

function removerEsta(tipo) {
  const peca = pecas[tipo];
  if (!peca || selecionada?.tipo !== tipo || peca.copias.length < 2) return;
  peca.copias.splice(selecionada.i, 1);
  selecionada = null;
  mostrarPecas();
}

// Arrastar uma cópia: gira em volta do copo e sobe/desce, sempre dentro do copo.
function ligarArrasto() {
  const area = $('cp-3d');
  const anguloDe = p => Math.atan2(p[0] - tubo.centro[0], -(p[1] - tubo.centro[1]));
  area.addEventListener('pointerdown', ev => {
    if (!tubo || ev.button !== 0 || !previa || !copiasNaMesa().length) return;
    const alvo = previa.extraNoPonto(ev.clientX, ev.clientY);
    if (alvo === null) {
      if (selecionada) { selecionada = null; previa.realcarExtra(null); for (const t of TIPOS) $(`cp-${t}-remover-esta`).hidden = true; }
      return;
    }
    selecionada = daId(alvo);
    const peca = pecas[selecionada.tipo];
    previa.realcarExtra(alvo);
    for (const t of TIPOS) $(`cp-${t}-remover-esta`).hidden = t !== selecionada.tipo || peca.copias.length < 2;
    $('cp-personalizar').open = true;
    const p = previa.pontoNaPeca(ev.clientX, ev.clientY);
    const c = peca.copias[selecionada.i];
    arrasto = { id: alvo, peca, c, inicio: { ...c }, pega: p ? anguloDe(p) : c.angulo, pegaZ: p ? p[2] : c.z, mexeu: false };
    previa.travarGiro(true);
    area.classList.add('arrastando');
    area.setPointerCapture?.(ev.pointerId);
  });
  area.addEventListener('pointermove', ev => {
    if (!arrasto) return;
    const p = previa.pontoNaPeca(ev.clientX, ev.clientY);
    if (!p) return;
    const { c, inicio, peca } = arrasto;
    c.angulo = inicio.angulo + (anguloDe(p) - arrasto.pega);
    c.z = limitarNoCopo(inicio.z + (p[2] - arrasto.pegaZ), peca.caixa.altura, tubo);
    arrasto.mexeu = true;
    previa.moverExtra(arrasto.id, c.angulo - inicio.angulo, c.z - inicio.z, tubo.centro);
  });
  const soltar = () => {
    if (!arrasto) return;
    const mexeu = arrasto.mexeu;
    arrasto = null;
    previa.travarGiro(false);
    area.classList.remove('arrastando');
    if (mexeu) mostrarPecas();
  };
  area.addEventListener('pointerup', soltar);
  area.addEventListener('pointercancel', soltar);
}

async function executar(fn) {
  if (ocupado || !pronto) return;
  bloquear(true); $('cp-exportar').open = false; $('cp-status').textContent = 'Preparando…';
  try { await new Promise(r => setTimeout(r, 50)); await fn(); } catch (e) { mostrarAviso(e.message); } finally { bloquear(false); $('cp-status').textContent = ''; }
}

const avisarEmAjuste = n => avisoNoMeio({ titulo: `Copo ${n} em ajustes`, texto: 'Ele será liberado assim que possível.', tipo: 'espera' });

// O que vai para Meus modelos (e volta ao reabrir).
function opcoesParaGuardar() {
  return {
    catalogo: id,
    cores: [...cores],
    ...(pecas.logo ? { logo: { opcoes: pecas.logo.salvo.opcoes, copias: pecas.logo.copias } } : {}),
    ...(pecas.nome ? { nome: { opcoes: pecas.nome.opcoes, copias: pecas.nome.copias } } : {}),
  };
}

export function iniciarCopos() {
  const legado = abridorDe('caneca');
  for (const modelo of CATALOGO_COPOS) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = modelo.id; b.setAttribute('aria-pressed', 'false');
    const img = document.createElement('img'); img.src = `assets/copos/${modelo.id}.png`; img.alt = '';
    const label = document.createElement('span'); label.textContent = modelo.nome; b.append(img, label);
    if (COPOS_EM_AJUSTE.includes(modelo.id)) {
      b.classList.add('em-ajuste');
      b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => avisarEmAjuste(modelo.id));
    } else b.addEventListener('click', () => { if (!ocupado) { atual = null; carregar(modelo.id); } });
    $('cp-catalogo').append(b);
  }
  $('cp-mais').addEventListener('click', () => previa?.zoom(0.85));
  $('cp-menos').addEventListener('click', () => previa?.zoom(1.18));
  $('cp-ajustar').addEventListener('click', () => previa?.enquadrar());
  $('cp-base').addEventListener('click', () => previa?.verBase());
  $('cp-custo').addEventListener('click', () => executar(() => preencherDoModelo({ nome: nomeDoCopo(), pesoG: volume() / 1000 * densidadeDoModelo(materialAtual()), detalhe: 'Estimativa maciça; confira o peso no fatiador.' })));
  $('cp-salvar').addEventListener('click', () => executar(async () => {
    const canvas = $('cp-3d').querySelector('canvas'); const thumb = document.createElement('canvas'); thumb.width = 320; thumb.height = 240; if (canvas) thumb.getContext('2d').drawImage(canvas, 0, 0, 320, 240);
    atual = await salvarEmMeusModelos({ tipo: 'caneca', atual, nomePadrao: nomeDoCopo(), montar: () => ({
      opcoes: opcoesParaGuardar(),
      miniatura: thumb.toDataURL('image/png'),
      ...(pecas.logo ? { imagem: pecas.logo.salvo.imagem, correcoes: pecas.logo.salvo.correcoes } : {}),
    }) }) ?? atual;
  }));
  $('cp-stl').addEventListener('click', () => executar(() => salvarMontando(nomeDoCopo(), 'stl', async () => {
    const r = await window.modelos.lerCopo(id, true);
    if (!r.ok) throw Error(r.erro);
    return { bytes: stlComLogos(gerarStlNativoCopo(r.dados), pecasParaMesa(), centroNaMesa()), aviso: avisoDaMesa() };
  })));
  $('cp-3mf').addEventListener('click', () => executar(() => salvarMontando(nomeDoCopo(), '3mf', nome => comMaterial(material => nativo(material, nome)))));
  $('cp-multipartes').addEventListener('click', () => executar(() => {
    if (!COPOS_MULTIPARTES.includes(id)) return null;
    return salvarMontando(`${nomeDoCopo()} - multipartes`, '3mf', nome => comMaterial(async material => {
      const r = await window.modelos.lerCopoMultipartes(id);
      if (!r.ok) throw Error(r.erro);
      return { bytes: colorir3mfMultipartes(r.dados, [...cores], { nome, material, logos: pecasParaMesa(baseNaPlaca()) }), aviso: avisoDaMesa(baseNaPlaca()) };
    }));
  }));
  $('cp-fatiador').addEventListener('click', () => executar(() => enviarModeloAoFatiador(aplicarCores(pacote.partes, cores), nomeDoCopo(), nome => comMaterial(material => nativo(material, nome)))));

  $('cp-logo-adicionar').addEventListener('click', editarLogo);
  $('cp-logo-editar').addEventListener('click', editarLogo);
  $('cp-logo-meus').addEventListener('click', listarLogosSalvas);
  $('cp-nome-adicionar').addEventListener('click', editarNome);
  $('cp-nome-editar').addEventListener('click', editarNome);
  for (const tipo of TIPOS) {
    $(`cp-${tipo}-clonar`).addEventListener('click', () => clonar(tipo));
    $(`cp-${tipo}-remover`).addEventListener('click', () => remover(tipo));
    $(`cp-${tipo}-remover-esta`).addEventListener('click', () => removerEsta(tipo));
  }
  ligarArrasto();
  registrarAoAbrir('caneca', () => { if (!pronto && !ocupado) carregar(id); });
  window.__coposTeste = { logo: () => pecas.logo, nome: () => pecas.nome, tubo: () => tubo, abrirSalvo: p => abridorDe('caneca')(p), usarNome: r => usarPeca('nome', r), redesenhar: () => mostrarPecas(), previa: () => previa };
  registrarAbridor('caneca', async p => {
    if (!p.opcoes.catalogo) { irPara('caneca-legado'); return legado(p); }
    if (COPOS_EM_AJUSTE.includes(p.opcoes.catalogo)) { avisarEmAjuste(p.opcoes.catalogo); return; }
    atual = { id: p.id, nome: p.nome };
    pecas.logo = null;
    pecas.nome = null;
    await carregar(p.opcoes.catalogo, p.opcoes.cores);
    if (p.opcoes.logo && p.imagem) {
      $('cp-status').textContent = 'Refazendo a logo…';
      const r = await abrirLogoNoCopo({ opcoes: p.opcoes.logo.opcoes, imagem: p.imagem, correcoes: p.correcoes }, { invisivel: true });
      $('cp-status').textContent = '';
      if (r) usarPeca('logo', r, p.opcoes.logo.copias);
      else mostrarAviso('Não foi possível refazer a logo deste copo.');
    }
    if (p.opcoes.nome?.opcoes) {
      try {
        const r = await refazerNome(p.opcoes.nome.opcoes);
        usarPeca('nome', r, p.opcoes.nome.copias);
      } catch {
        mostrarAviso('Não foi possível refazer o nome deste copo.');
      }
    }
  });
}
