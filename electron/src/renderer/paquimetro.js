// Paquímetro do Visualizador 3D.
// "Paquímetro": passe o mouse numa borda redonda (boca de copo, furo, pino) e ele mostra só o que importa:
// Ø de dentro e Ø de fora. O clique deixa a medida fixa na peça.
// "Distância": dois cliques, medida à mão (os pontos grudam em cantos e arestas).
// As medidas ficam guardadas nas coordenadas da peça: acompanham quando ela é girada, movida ou escalada.
import * as THREE from "three";
import { abrirEncaixeCom } from "./encaixes-tela.js";
import { ENCAIXES, MATERIAIS_ENCAIXE } from "./modelos/encaixes.js";
import { previsaoImpressa, resumoCalibracao, textoDiferenca, textoDoResumo, tipoDaCalibracao } from "./modelos/calibracao.js";
import { arestasMarcantes, formatarMedida, identificarRedondo, medirDiametro, medirDistancia, medirProfundidade } from "./modelos/medidas.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const COR = 0xffc857;
const COR_PREVIA = 0x3ad6e8;
const NOMES = { redondo: "Redondo", distancia: "Distância", profundidade: "Profundidade", aresta: "Aresta", parede: "Parede" };
const PIXELS_VERTICE = 10;
const PIXELS_ARESTA = 7;
const PIXELS_BORDA = 9; // até onde o mouse conta como "em cima da borda" de um furo

// Arestas reais de cada malha (snap da Distância), calculadas uma vez por malha.
const arestasDaMalha = new WeakMap();
function arestasDe(geometria) {
  if (!arestasDaMalha.has(geometria)) arestasDaMalha.set(geometria, arestasMarcantes(geometria.attributes.position.array));
  return arestasDaMalha.get(geometria);
}
function bicoEscolhido() {
  try {
    return Number(localStorage.getItem("visualizador-bico")) || 0.4;
  } catch {
    return 0.4;
  }
}

// Classifica a folga (furo − pino) pelos encaixes da ferramenta Encaixes e tolerâncias.
export function classificarFolga(folga, { material = "PLA", bico = 0.4 } = {}) {
  if (folga < 0) return "não entra (o pino é maior que o furo)";
  const fator = Math.max(1, bico / 0.4);
  const extra = MATERIAIS_ENCAIXE[material] ?? 0;
  if (folga < (ENCAIXES.justo.folga + extra) * fator * 0.5) return "muito justo: talvez não entre sem lixar";
  let melhor = null;
  for (const [id, e] of Object.entries(ENCAIXES)) {
    const alvo = (e.folga + extra) * fator;
    if (!melhor || Math.abs(folga - alvo) < melhor.dist) melhor = { id, dist: Math.abs(folga - alvo), nome: e.nome };
  }
  return `encaixe ${melhor.nome.split(" (")[0].toLowerCase()} ${melhor.nome.slice(melhor.nome.indexOf("("))}`;
}

// ---------- Guardar e restaurar (coordenadas da peça, em listas simples) ----------
const lista3 = (v) => [v.x, v.y, v.z];
const vetor = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function paraGuardar(m) {
  let base;
  if (m.tipo === "redondo") {
    base = { tipo: "redondo", centro: lista3(m.centro), eixo: lista3(m.eixo), externo: m.externo, interno: m.interno, profundidade: m.profundidade, passante: m.passante, altura: m.altura };
  } else {
    base = { tipo: m.tipo, a: { p: lista3(m.a.p), n: m.a.n ? lista3(m.a.n) : null }, b: { p: lista3(m.b.p), n: m.b.n ? lista3(m.b.n) : null } };
  }
  return m.real ? { ...base, real: m.real } : base;
}

function deGuardado(g) {
  let m;
  if (g.tipo === "diametro") {
    // medidas da versão anterior (só o diâmetro de um furo ou pino)
    const lado = { raio: g.furo.raio, rms: g.furo.rms, lados: g.furo.lados };
    m = { tipo: "redondo", centro: vetor(g.furo.centro), eixo: vetor(g.furo.eixo), externo: g.furo.tipo === "pino" ? lado : null, interno: g.furo.tipo === "pino" ? null : lado };
  } else if (g.tipo === "redondo") {
    m = { ...g, centro: vetor(g.centro), eixo: vetor(g.eixo) };
  } else {
    m = { tipo: g.tipo, a: { p: vetor(g.a.p), n: g.a.n ? vetor(g.a.n) : null }, b: { p: vetor(g.b.p), n: g.b.n ? vetor(g.b.n) : null } };
  }
  if (g.real) m.real = g.real;
  return m;
}

function filamentoEscolhido() {
  try {
    return localStorage.getItem("visualizador-filamento") || "";
  } catch {
    return "";
  }
}

// ctx: { cena, camera, renderizador, peca, palco, escala(), aoEscalar(fator), aoMudar(),
//        config(), salvarConfig(alteracao), avisar(texto), dica(texto), dicaPadrao() }
export function criarPaquimetro(ctx) {
  const { cena, camera, renderizador, peca, palco } = ctx;
  const desenhos = new THREE.Group();
  const previa = new THREE.Group();
  cena.add(desenhos, previa);
  const marcador = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: COR, depthTest: false }));
  marcador.renderOrder = 10;
  marcador.visible = false;
  cena.add(marcador);
  const rotuloPrevia = el("div", "vz-rotulo vz-rotulo-previa");
  rotuloPrevia.hidden = true;
  palco.append(rotuloPrevia);
  const raio = new THREE.Raycaster();

  let medidas = [];
  let pendente = null; // primeiro ponto já clicado (Distância)
  let achado = null; // o que o mouse está mostrando agora (Paquímetro)
  let espera = null;
  let ultimaChave = "";
  let contador = 0;
  let unidade = "mm";
  let arquivo = null; // { chave, nome } do arquivo aberto (para guardar as medidas)
  const temporizadores = new Map(); // um por arquivo: trocar de arquivo não perde o que falta gravar

  const filamento = () => $("vz-filamento").value.trim() || "Geral";
  const resumo = () => resumoCalibracao(ctx.config()?.calibracoes, filamento());
  const mm = (n, casas = 2) => formatarMedida(n, unidade, casas);
  const numero = (n, casas = 2) => mm(n, casas).replace(/ mm$/, "");

  // Guarda as medidas deste arquivo nas configurações (um pouco depois da última mudança).
  function agendarSalvar() {
    if (!arquivo) return;
    const { chave, nome } = arquivo;
    clearTimeout(temporizadores.get(chave));
    const guardadas = medidas.map(paraGuardar);
    temporizadores.set(chave, setTimeout(async () => {
      temporizadores.delete(chave);
      const outras = (ctx.config()?.medidasSalvas ?? []).filter((x) => x.chave !== chave);
      const lista = guardadas.length ? [...outras, { chave, nome, data: new Date().toISOString(), medidas: guardadas.slice(-60) }] : outras;
      const r = await ctx.salvarConfig({ medidasSalvas: lista.slice(-100) });
      if (!r.ok) ctx.avisar(`Não foi possível guardar as medidas: ${r.erro}`);
    }, 800));
  }

  // Abre um arquivo: traz de volta as medidas guardadas dele, se houver.
  function definirArquivo(novo) {
    arquivo = novo;
    esconderPrevia();
    medidas = [];
    pendente = null;
    contador = 0;
    const salvo = (ctx.config()?.medidasSalvas ?? []).find((x) => x.chave === novo.chave);
    if (salvo) {
      for (const g of salvo.medidas) {
        contador++;
        const m = deGuardado(g);
        medidas.push({ ...m, id: contador, nome: `${nomeDe(m)} ${contador}` });
      }
      ctx.avisar(`${salvo.medidas.length} medida(s) deste arquivo foram trazidas de volta.`);
    }
    atualizar();
  }

  function nomeDe(m) {
    if (m.tipo !== "redondo") return NOMES[m.tipo];
    if (m.interno && m.externo) return "Boca";
    return m.interno ? "Furo" : "Pino";
  }

  async function guardarReal(m, real, principal) {
    const nova = { filamento: filamento(), tipo: tipoDaCalibracao(m), modelo: principal, real, data: new Date().toISOString() };
    const lista = [...(ctx.config()?.calibracoes ?? []), nova].slice(-300);
    const r = await ctx.salvarConfig({ calibracoes: lista });
    if (!r.ok) {
      ctx.avisar(r.erro);
      return;
    }
    m.real = real;
    m.realModelo = principal;
    agendarSalvar();
    atualizar();
    ctx.avisar(`Anotado para ${nova.filamento}.`);
  }

  async function apagarCalibracao() {
    const f = filamento();
    const lista = (ctx.config()?.calibracoes ?? []).filter((c) => c.filamento !== f);
    const r = await ctx.salvarConfig({ calibracoes: lista });
    if (!r.ok) ctx.avisar(r.erro);
    else {
      renderizarLista();
      ctx.avisar(`Calibração de ${f} apagada.`);
    }
  }

  const tamanhoMarcador = () => {
    const caixa = new THREE.Box3().setFromObject(peca);
    return caixa.isEmpty() ? 1 : Math.max(0.25, caixa.getSize(new THREE.Vector3()).length() / 220);
  };
  const paraMundo = (p) => peca.localToWorld(p.clone());
  const normalMundo = (n) => n.clone().transformDirection(peca.matrixWorld).normalize();

  function naTela(pMundo) {
    const r = renderizador.domElement.getBoundingClientRect();
    const v = pMundo.clone().project(camera);
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, atras: v.z > 1 };
  }

  // O que o raio do mouse acerta na peça: { mouse, p, n, pos, t, geometria, mundo } em coordenadas da peça.
  function acertar(ev) {
    const r = renderizador.domElement.getBoundingClientRect();
    const mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    raio.setFromCamera(new THREE.Vector2((mouse.x / r.width) * 2 - 1, -(mouse.y / r.height) * 2 + 1), camera);
    peca.updateMatrixWorld(true);
    const h = raio.intersectObjects(peca.children, false)[0];
    if (!h?.face) return null;
    const geometria = h.object.geometry;
    return {
      mouse,
      p: peca.worldToLocal(h.point.clone()),
      n: h.face.normal.clone().normalize(),
      pos: geometria.attributes.position.array,
      t: h.faceIndex,
      geometria,
      distancia: h.distance,
    };
  }

  // Aresta real do triângulo mais perto do mouse (em pixels), ou null.
  function arestaPerto(h, limite) {
    const { pos, t, geometria, mouse, p } = h;
    const reais = arestasDe(geometria);
    const vs = [0, 1, 2].map((k) => new THREE.Vector3(pos[t * 9 + k * 3], pos[t * 9 + k * 3 + 1], pos[t * 9 + k * 3 + 2]));
    const ks = vs.map(reais.chave);
    let melhor = null;
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      if (!reais.arestas.has(ks[i] < ks[j] ? `${ks[i]}|${ks[j]}` : `${ks[j]}|${ks[i]}`)) continue;
      const [a, b] = [vs[i], vs[j]];
      const ab = b.clone().sub(a);
      const t2 = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
      const q = a.clone().addScaledVector(ab, t2);
      const s = naTela(paraMundo(q));
      const d = Math.hypot(s.x - mouse.x, s.y - mouse.y);
      if (d < limite && (!melhor || d < melhor.d)) melhor = { d, a, b, q, reais };
    }
    return melhor;
  }

  // Ponto clicado na peça para a Distância, já com o snap. Devolve { p, n, pos, tipoSnap }.
  function pontoNaPeca(ev, { centroDeFuros }) {
    const h = acertar(ev);
    if (!h) return null;
    const { pos, p, n, t, mouse } = h;
    if (centroDeFuros) {
      const furo = medirDiametro(pos, p, n);
      if (furo) return { p: furo.centro, n, pos, tipoSnap: `centro do ${furo.tipo}` };
    }
    if ($("vz-snap").checked) {
      const reais = arestasDe(h.geometria);
      const vs = [0, 1, 2].map((k) => new THREE.Vector3(pos[t * 9 + k * 3], pos[t * 9 + k * 3 + 1], pos[t * 9 + k * 3 + 2]));
      for (const v of vs) {
        if (!reais.vertices.has(reais.chave(v))) continue;
        const s = naTela(paraMundo(v));
        if (Math.hypot(s.x - mouse.x, s.y - mouse.y) < PIXELS_VERTICE) return { p: v, n, pos, tipoSnap: "vértice" };
      }
      const aresta = arestaPerto(h, PIXELS_ARESTA);
      if (aresta) return { p: aresta.q, n, pos, tipoSnap: "aresta" };
    }
    return { p, n, pos, tipoSnap: "" };
  }

  // ---------- O que está debaixo do mouse ----------
  // Tamanho de um pixel, em mm da peça, na distância do ponto.
  function mmPorPixel(h) {
    const altura = renderizador.domElement.getBoundingClientRect().height || 1;
    const mundo = (2 * h.distancia * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / altura;
    return mundo / (ctx.escala() || 1);
  }

  function identificar(h) {
    // só o que se vê: Ø de dentro e de fora (fundo, parede e altura ficam de fora, a pedido do Pedro)
    const redondo = identificarRedondo(h.pos, h.p, h.n, { perto: PIXELS_BORDA * mmPorPixel(h) });
    if (!redondo) return null;
    const { centro, eixo, externo, interno } = redondo;
    return { tipo: "redondo", centro, eixo, externo, interno };
  }

  // ---------- Valores ----------
  function valor(m) {
    const v = valorDoModelo(m);
    const previsto = previsaoImpressa(tipoDaCalibracao(m), v.principal, resumo());
    if (previsto !== null && Math.abs(previsto - v.principal) >= 0.005) {
      v.previsao = `Com ${filamento()}, deve sair ≈ ${m.tipo === "redondo" ? "Ø " : ""}${mm(previsto)}`;
    }
    return v;
  }

  function valorDoModelo(m) {
    const e = ctx.escala();
    if (m.tipo === "redondo") {
      const [fora, dentro] = [m.externo && m.externo.raio * 2 * e, m.interno && m.interno.raio * 2 * e];
      if (fora && dentro) {
        return {
          principal: dentro,
          texto: `Ø ${numero(dentro)} dentro · ${numero(fora)} fora`,
          linhas: [`Ø dentro ${mm(dentro)}`, `Ø fora ${mm(fora)}`],
        };
      }
      const d = dentro || fora;
      const nome = dentro ? "Ø dentro" : "Ø fora";
      return { principal: d, texto: `${nome} ${mm(d)}`, linhas: [`${nome} ${mm(d)}`] };
    }
    const [a, b] = [paraMundo(m.a.p), paraMundo(m.b.p)];
    if (m.tipo === "profundidade") {
      const d = medirProfundidade(a, normalMundo(m.a.n), b);
      return { principal: d, texto: mm(d), linhas: [`Profundidade ${mm(d)}`] };
    }
    if (m.tipo === "aresta") {
      const d = a.distanceTo(b);
      return { principal: d, texto: mm(d), linhas: [`Aresta ${mm(d)}`] };
    }
    if (m.tipo === "parede") {
      const d = a.distanceTo(b);
      const bico = bicoEscolhido();
      const aviso = d < bico ? `fina demais para o bico ${numero(bico, 1)}` : d < bico * 2 ? `frágil com bico ${numero(bico, 1)}` : "";
      return { principal: d, texto: mm(d), linhas: [`Espessura ${mm(d)}`, aviso].filter(Boolean), alerta: Boolean(aviso) };
    }
    const r = medirDistancia(a, m.a.n && normalMundo(m.a.n), b, m.b.n && normalMundo(m.b.n));
    if (r.perpendicular !== null) return { principal: r.perpendicular, texto: mm(r.perpendicular), linhas: [`Entre faces paralelas · reta ${mm(r.reta)}`] };
    const delta = `ΔX ${mm(Math.abs(r.delta.x))} · ΔY ${mm(Math.abs(r.delta.z))} · ΔZ ${mm(Math.abs(r.delta.y))}`;
    return { principal: r.reta, texto: mm(r.reta), linhas: [delta] };
  }

  // ---------- Desenho ----------
  function limparGrupo(g) {
    for (const o of [...g.children]) {
      g.remove(o);
      o.traverse((x) => {
        x.geometry?.dispose();
        x.material?.dispose();
      });
    }
  }

  function bolinha(pMundo, tam, cor = COR) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(tam, 12, 10), new THREE.MeshBasicMaterial({ color: cor, depthTest: false }));
    b.position.copy(pMundo);
    b.renderOrder = 10;
    return b;
  }

  function linha(pontos, cor = COR) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pontos), new THREE.LineBasicMaterial({ color: cor, depthTest: false }));
    l.renderOrder = 10;
    return l;
  }

  // Desenho de uma medida (anéis para redondos, linha com pontas para as outras). Devolve onde pôr o rótulo.
  function desenhoDe(m, cor, tam) {
    const g = new THREE.Group();
    if (m.tipo === "redondo") {
      const centro = paraMundo(m.centro);
      const eixo = normalMundo(m.eixo);
      const u = new THREE.Vector3(1, 0, 0);
      if (Math.abs(u.dot(eixo)) > 0.9) u.set(0, 1, 0);
      u.sub(eixo.clone().multiplyScalar(u.dot(eixo))).normalize();
      const v = eixo.clone().cross(u);
      let ancora = centro;
      for (const lado of [m.externo, m.interno]) {
        if (!lado) continue;
        const r = lado.raio * ctx.escala();
        g.add(linha(Array.from({ length: 65 }, (_, i) => centro.clone().addScaledVector(u, r * Math.cos((i / 64) * Math.PI * 2)).addScaledVector(v, r * Math.sin((i / 64) * Math.PI * 2))), cor));
      }
      const r = (m.interno ?? m.externo).raio * ctx.escala();
      g.add(linha([centro.clone().addScaledVector(u, -r), centro.clone().addScaledVector(u, r)], cor), bolinha(centro, tam * 0.6, cor));
      ancora = centro.clone().addScaledVector(u, (m.externo ?? m.interno).raio * ctx.escala());
      return { g, ancora };
    }
    const [a, b] = [paraMundo(m.a.p), paraMundo(m.b.p)];
    g.add(bolinha(a, tam, cor), bolinha(b, tam, cor), linha([a, b], cor));
    return { g, ancora: a.clone().lerp(b, 0.5) };
  }

  function desenhar() {
    limparGrupo(desenhos);
    for (const r of palco.querySelectorAll(".vz-rotulo:not(.vz-rotulo-previa)")) r.remove();
    const tam = tamanhoMarcador();
    for (const m of medidas) {
      const { g, ancora } = desenhoDe(m, COR, tam);
      desenhos.add(g);
      const rotulo = el("div", "vz-rotulo", valor(m).texto);
      rotulo.dataset.id = m.id;
      m.ancora = ancora;
      m.rotulo = rotulo;
      palco.append(rotulo);
    }
    if (pendente) desenhos.add(bolinha(paraMundo(pendente.p), tam));
    quadro();
  }

  function mostrarPrevia(m, mouse) {
    limparGrupo(previa);
    achado = m;
    if (!m) {
      rotuloPrevia.hidden = true;
      renderizador.domElement.title = "";
      return;
    }
    previa.add(desenhoDe(m, COR_PREVIA, tamanhoMarcador() * 0.8).g);
    const v = valorDoModelo(m);
    rotuloPrevia.replaceChildren(...v.linhas.map((l, i) => el(i ? "span" : "strong", "", l)));
    rotuloPrevia.classList.toggle("alerta", Boolean(v.alerta));
    rotuloPrevia.style.transform = `translate(${mouse.x + 16}px, ${mouse.y + 14}px)`;
    rotuloPrevia.hidden = false;
  }

  function esconderPrevia() {
    clearTimeout(espera);
    ultimaChave = "";
    marcador.visible = false;
    mostrarPrevia(null);
  }

  // Chamado a cada quadro: posiciona os rótulos sobre a tela.
  function quadro() {
    for (const m of medidas) {
      if (!m.rotulo) continue;
      const s = naTela(m.ancora);
      m.rotulo.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -130%)`;
      m.rotulo.hidden = s.atras;
    }
  }

  // ---------- Lista ----------
  function formEmLinha(botao, { valorInicial = "", placeholder = "", rotulo, textoOk, aoEnviar }) {
    const linhaForm = el("form", "vz-linha");
    const caixa = el("div", "entrada");
    const entrada = el("input");
    entrada.inputMode = "decimal";
    entrada.placeholder = placeholder;
    entrada.value = valorInicial;
    entrada.setAttribute("aria-label", rotulo);
    caixa.append(entrada, el("em", "", unidade === "pol" ? "pol" : "mm"));
    const ok = el("button", "botao-secundario pequeno", textoOk);
    ok.type = "submit";
    linhaForm.append(caixa, ok);
    linhaForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      let n = Number(entrada.value.replace(",", "."));
      if (unidade === "pol") n *= 25.4;
      if (!(n > 0)) {
        entrada.focus();
        return;
      }
      aoEnviar(n);
    });
    botao.replaceWith(linhaForm);
    entrada.focus();
    entrada.select();
  }

  function textoFolga() {
    const furo = medidas.find((m) => m.tipo === "redondo" && m.interno && !m.externo);
    const pino = medidas.find((m) => m.tipo === "redondo" && m.externo && !m.interno);
    if (!furo || !pino) return "";
    const folga = (furo.interno.raio - pino.externo.raio) * 2 * ctx.escala();
    return `${furo.nome} × ${pino.nome}: folga ${mm(folga)} → ${classificarFolga(folga, { bico: bicoEscolhido() })}.`;
  }

  function renderizarLista() {
    const lista = $("vz-medidas");
    lista.replaceChildren(
      ...medidas.map((m) => {
        const v = valor(m);
        const li = el("li", "vz-medida");
        const topo = el("div", "vz-medida-topo");
        topo.append(el("strong", "", `${m.nome}: ${v.texto}`));
        const apagar = el("button", "item-remover", "×");
        apagar.type = "button";
        apagar.setAttribute("aria-label", `Apagar ${m.nome}`);
        apagar.addEventListener("click", () => {
          medidas = medidas.filter((x) => x !== m);
          agendarSalvar();
          atualizar();
        });
        topo.append(apagar);
        li.append(topo);
        const detalhe = (m.tipo === "redondo" && m.interno && m.externo ? v.linhas.slice(2) : v.linhas.slice(1)).join(" · ");
        if (detalhe) li.append(el("span", "cliente-sub", detalhe));
        if (v.previsao) li.append(el("span", "vz-previsao", v.previsao));
        if (m.real) li.append(el("span", "vz-real", `Na peça impressa: ${mm(m.real)} · ${textoDiferenca(m.realModelo ?? v.principal, m.real)}`));

        const botoes = el("div", "an-acoes");
        const ajustar = el("button", "botao-texto pequeno", "Ajustar escala");
        ajustar.type = "button";
        ajustar.title = "Digite quanto esta medida deve ter: a peça inteira é escalada para isso";
        ajustar.addEventListener("click", () =>
          formEmLinha(ajustar, {
            valorInicial: (unidade === "pol" ? v.principal / 25.4 : v.principal).toFixed(unidade === "pol" ? 3 : 2).replace(".", ","),
            rotulo: "Medida desejada",
            textoOk: "Aplicar",
            aoEnviar: (desejado) => v.principal > 0 && ctx.aoEscalar(ctx.escala() * (desejado / v.principal)),
          }),
        );
        const conferir = el("button", "botao-texto pequeno", m.real ? "Corrigir a impressa" : "Medi na impressa");
        conferir.type = "button";
        conferir.title = "Digite o que o seu paquímetro mostrou na peça impressa";
        conferir.addEventListener("click", () =>
          formEmLinha(conferir, { placeholder: "medida real", rotulo: "Medida na peça impressa", textoOk: "Anotar", aoEnviar: (real) => guardarReal(m, real, v.principal) }),
        );
        botoes.append(ajustar, conferir);
        if (m.tipo === "redondo") {
          const encaixe = el("button", "botao-texto pequeno", m.interno ? "Fazer pino" : "Fazer furo");
          encaixe.type = "button";
          encaixe.title = m.interno ? "Fazer um pino que encaixa (Encaixes e tolerâncias)" : "Fazer um furo para este pino (Encaixes e tolerâncias)";
          encaixe.addEventListener("click", () => abrirEncaixeCom(v.principal));
          botoes.append(encaixe);
        }
        li.append(botoes);
        return li;
      }),
    );
    $("vz-folga").textContent = textoFolga();
    $("vz-medidas-contagem").textContent = medidas.length ? String(medidas.length) : "";
    $("vz-medidas-vazio").hidden = medidas.length > 0;
    $("vz-limpar-medidas").hidden = medidas.length === 0;
    $("vz-ficha").hidden = medidas.length === 0;
    const texto = textoDoResumo(resumo());
    $("vz-calibracao").textContent = texto ? `Com ${filamento()}: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}` : "Ainda sem medidas da peça impressa para este filamento.";
    $("vz-apagar-calibracao").hidden = !texto;
  }

  function atualizar() {
    desenhar();
    renderizarLista();
  }

  // ---------- Mouse ----------
  function clicar(ev, modo) {
    if (modo === "paquimetro") {
      // clique fixa o que o mouse está mostrando (calcula na hora se ainda não deu tempo)
      if (!achado) {
        clearTimeout(espera);
        const h = acertar(ev);
        if (h) achado = identificar(h);
      }
      if (!achado) {
        ctx.avisar("Não achei nada redondo aí. Passe o mouse na borda de um furo, copo ou pino.");
        return;
      }
      adicionar(achado);
      esconderPrevia();
      return;
    }
    const ponto = pontoNaPeca(ev, { centroDeFuros: $("vz-centro-furos").checked });
    if (!ponto) return;
    if (!pendente) {
      pendente = ponto;
      ctx.dica("Agora clique no segundo ponto");
      desenhar();
      return;
    }
    adicionar({ tipo: "distancia", a: pendente, b: ponto });
    pendente = null;
  }

  function adicionar(m) {
    contador++;
    const { pos, ...limpa } = m;
    medidas.push({ ...limpa, id: contador, nome: `${nomeDe(m)} ${contador}` });
    ctx.dicaPadrao();
    agendarSalvar();
    atualizar();
  }

  // Para a ficha de medidas: texto de cada medida e onde o rótulo está na tela.
  function paraFicha() {
    quadro();
    const r = renderizador.domElement.getBoundingClientRect();
    return medidas.map((m) => {
      const v = valor(m);
      const s = naTela(m.ancora);
      return { nome: m.nome, texto: v.texto, detalhe: [...v.linhas.slice(1), v.previsao].filter(Boolean).join(" · "), real: m.real ? mm(m.real) : "", x: s.x / r.width, y: s.y / r.height, visivel: !s.atras };
    });
  }

  function mover(ev, modo) {
    if (!modo || !ev) {
      esconderPrevia();
      return;
    }
    if (modo === "paquimetro") {
      marcador.visible = false;
      const h = acertar(ev);
      if (!h) {
        esconderPrevia();
        return;
      }
      // mesmo triângulo e quase o mesmo ponto: só acompanha o rótulo
      const passo = PIXELS_BORDA * mmPorPixel(h) * 0.5;
      const chave = `${h.geometria.uuid}|${h.t}|${Math.round(h.p.x / passo)}|${Math.round(h.p.y / passo)}|${Math.round(h.p.z / passo)}`;
      if (chave === ultimaChave) {
        if (achado) rotuloPrevia.style.transform = `translate(${h.mouse.x + 16}px, ${h.mouse.y + 14}px)`;
        return;
      }
      ultimaChave = chave;
      clearTimeout(espera);
      // espera o mouse parar um pouquinho (peças grandes levam alguns milissegundos para medir)
      espera = setTimeout(() => mostrarPrevia(identificar(h), h.mouse), 40);
      return;
    }
    // Distância: marcador mostra onde o ponto vai grudar
    const ponto = pontoNaPeca(ev, { centroDeFuros: false });
    marcador.visible = Boolean(ponto);
    if (!ponto) return;
    marcador.position.copy(paraMundo(ponto.p));
    marcador.scale.setScalar(tamanhoMarcador() * (ponto.tipoSnap ? 1.15 : 0.75));
    renderizador.domElement.title = ponto.tipoSnap ? `Grudar no ${ponto.tipoSnap}` : "";
  }

  function cancelar() {
    pendente = null;
    esconderPrevia();
    desenhar();
  }

  function limpar() {
    medidas = [];
    pendente = null;
    contador = 0;
    esconderPrevia();
    agendarSalvar();
    atualizar();
  }

  $("vz-limpar-medidas").addEventListener("click", limpar);
  $("vz-unidade").addEventListener("change", () => {
    unidade = $("vz-unidade").value;
    atualizar();
    ctx.aoMudar();
  });
  $("vz-filamento").value = filamentoEscolhido();
  $("vz-filamento").addEventListener("change", () => {
    try {
      localStorage.setItem("visualizador-filamento", $("vz-filamento").value.trim());
    } catch {
      // tudo bem
    }
    atualizar();
  });
  $("vz-filamento").addEventListener("focus", async () => {
    const r = await window.dados.filamentos.listar();
    if (!r.ok) return;
    const nomes = [...new Set(r.dados.map((f) => `${f.material} ${f.cor}${f.marca ? ` ${f.marca}` : ""}`))];
    $("vz-filamentos-lista").replaceChildren(...nomes.map((n) => new Option(n)));
  });
  $("vz-apagar-calibracao").addEventListener("click", apagarCalibracao);

  return { clicar, mover, atualizar, quadro, cancelar, limpar, definirArquivo, paraFicha, unidade: () => unidade };
}
