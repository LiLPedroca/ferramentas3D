// Paquímetro inteligente: acha sozinho os furos e pinos da peça (com diâmetro e profundidade),
// mede a espessura das paredes para o bico escolhido e calcula a folga entre um pino e um furo.
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { abrirEncaixeCom } from "./encaixes-tela.js";
import { ENCAIXES, MATERIAIS_ENCAIXE } from "./modelos/encaixes.js";
import { acharFurosEPinos, formatarMedida, medirParedes } from "./modelos/medidas.js";
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const COR_DESTAQUE = 0x3ad6e8;
const LIMITE_AUTOMATICO = 400000; // triângulos: acima disso só analisa ao clicar

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

// ctx: { cena, peca, escala(), unidade(), paquimetro }
export function criarAnalise(ctx) {
  const { cena, peca } = ctx;
  const destaque = new THREE.Group();
  const pontosFinos = new THREE.Group();
  cena.add(destaque, pontosFinos);

  let itens = []; // [{ malha, nomeMalha, furo }]
  let paredes = null; // { minima, amostras: [{ malha, ponto, espessura }] }
  let escolhidos = new Set();

  const mm = (n, casas = 2) => formatarMedida(n, ctx.unidade(), casas);
  const paraMundo = (p) => peca.localToWorld(p.clone());

  function limparGrupo(g) {
    for (const o of [...g.children]) {
      g.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
  }

  // ---------- Destaque do furo/pino na peça ----------
  function destacar(item) {
    limparGrupo(destaque);
    if (!item) return;
    const { furo } = item;
    const eixo = furo.eixo.clone().transformDirection(peca.matrixWorld).normalize();
    const r = furo.raio * ctx.escala();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(u.dot(eixo)) > 0.9) u.set(0, 1, 0);
    u.sub(eixo.clone().multiplyScalar(u.dot(eixo))).normalize();
    const v = eixo.clone().cross(u);
    const material = new THREE.LineBasicMaterial({ color: COR_DESTAQUE, depthTest: false });
    const anel = (centro) =>
      Array.from({ length: 65 }, (_, i) => centro.clone().addScaledVector(u, r * Math.cos((i / 64) * Math.PI * 2)).addScaledVector(v, r * Math.sin((i / 64) * Math.PI * 2)));
    const [a, b] = [paraMundo(furo.inicio), paraMundo(furo.fim)];
    for (const pts of [anel(a), anel(b)]) destaque.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material.clone()));
    const laterais = [];
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const off = u.clone().multiplyScalar(r * Math.cos(ang)).addScaledVector(v, r * Math.sin(ang));
      laterais.push(a.clone().add(off), b.clone().add(off));
    }
    destaque.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(laterais), material));
    destaque.children.forEach((o) => (o.renderOrder = 11));
  }

  // ---------- Paredes finas ----------
  function desenharFinas() {
    limparGrupo(pontosFinos);
    if (!paredes || !$("an-mostrar-finas").checked) return;
    const bico = bicoEscolhido();
    const finos = paredes.amostras.filter((a) => a.espessura < bico * 2);
    if (!finos.length) return;
    const pos = new Float32Array(finos.length * 3);
    const cores = new Float32Array(finos.length * 3);
    const c = new THREE.Color();
    finos.forEach((a, i) => {
      const p = a.malha.localToWorld(a.ponto.clone());
      pos.set([p.x, p.y, p.z], i * 3);
      c.set(a.espessura < bico ? 0xe5534b : 0xe8a93a);
      cores.set([c.r, c.g, c.b], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(cores, 3));
    const pontos = new THREE.Points(g, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true, depthTest: false }));
    pontos.renderOrder = 11;
    pontosFinos.add(pontos);
  }

  function textoParedes() {
    if (!paredes) return "";
    if (paredes.minima === null) return "Não deu para medir as paredes desta peça (a malha pode estar aberta).";
    const bico = bicoEscolhido();
    const total = paredes.amostras.length;
    const naoImprime = paredes.amostras.filter((a) => a.espessura < bico).length;
    const finas = paredes.amostras.filter((a) => a.espessura < bico * 2).length;
    const pct = (n) => {
      const p = (n / total) * 100;
      return p < 0.1 ? "menos de 0,1%" : `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    };
    if (finas === 0) return `Parede mais fina: ${mm(paredes.minima)}. Tudo com pelo menos 2 linhas do bico de ${bico.toLocaleString("pt-BR")} mm.`;
    return (
      `Parede mais fina: ${mm(paredes.minima)}. ` +
      (naoImprime ? `${pct(naoImprime)} da superfície com menos de ${mm(bico, 1)} (vermelho: o bico não consegue fazer). ` : "") +
      `${pct(finas)} com menos de ${mm(bico * 2, 1)} (laranja: só 1 linha, fica frágil).`
    );
  }

  // ---------- Lista ----------
  function textoFolga() {
    const sel = itens.filter((_, i) => escolhidos.has(i));
    const furo = sel.find((i) => i.furo.tipo === "furo");
    const pino = sel.find((i) => i.furo.tipo === "pino");
    if (sel.length !== 2 || !furo || !pino) return sel.length ? "Marque um furo e um pino para ver a folga entre eles." : "";
    const e = ctx.escala();
    const folga = (furo.furo.raio - pino.furo.raio) * 2 * e;
    return `Folga: ${mm(folga)} → ${classificarFolga(folga, { bico: bicoEscolhido() })}.`;
  }

  function renderizar() {
    const lista = $("an-furos");
    const e = ctx.escala();
    lista.replaceChildren(
      ...itens.map((item, i) => {
        const { furo } = item;
        const li = el("li", "an-item");
        const marca = el("input");
        marca.type = "checkbox";
        marca.checked = escolhidos.has(i);
        marca.title = "Marcar para calcular a folga";
        marca.addEventListener("change", () => {
          if (marca.checked) escolhidos.add(i);
          else escolhidos.delete(i);
          $("an-folga").textContent = textoFolga();
        });
        const texto = el("div", "an-texto");
        texto.append(
          el("strong", "", `${furo.tipo === "furo" ? "Furo" : "Pino"} Ø ${mm(furo.raio * 2 * e)}`),
          el(
            "span",
            "cliente-sub",
            `${furo.tipo === "furo" ? "Profundidade" : "Comprimento"} ${mm(furo.profundidade * e, 1)} · eixo ${furo.eixoNome} · ${furo.lados} lados${itens.some((x) => x.nomeMalha !== item.nomeMalha) ? ` · ${item.nomeMalha}` : ""}`,
          ),
        );
        const acoes = el("div", "an-acoes");
        const medir = el("button", "botao-texto pequeno", "+ Medida");
        medir.type = "button";
        medir.title = "Põe na lista do paquímetro";
        medir.addEventListener("click", () => ctx.paquimetro.adicionarDiametro(furo));
        const encaixe = el("button", "botao-texto pequeno", furo.tipo === "furo" ? "Fazer pino que encaixa" : "Fazer furo para este pino");
        encaixe.type = "button";
        encaixe.addEventListener("click", () => abrirEncaixeCom(furo.raio * 2 * e));
        acoes.append(medir, encaixe);
        li.append(marca, texto, acoes);
        li.addEventListener("mouseenter", () => destacar(item));
        li.addEventListener("mouseleave", () => destacar(null));
        return li;
      }),
    );
    $("an-furos-vazio").hidden = itens.length > 0;
    $("an-furos-vazio").textContent = "Nenhum furo ou pino redondo encontrado.";
    $("an-contagem").textContent = itens.length ? `(${itens.length})` : "";
    $("an-folga").textContent = textoFolga();
    $("an-paredes").textContent = textoParedes();
    desenharFinas();
  }

  // ---------- Análise ----------
  function analisar() {
    $("an-estado").textContent = "Analisando a peça…";
    $("an-analisar").hidden = true;
    // deixa a tela mostrar o aviso antes do cálculo
    setTimeout(() => {
      itens = [];
      const amostras = [];
      let minima = Infinity;
      for (const malha of peca.children) {
        const geo = malha.geometry;
        const pos = geo.attributes.position.array;
        const nomeMalha = malha.userData.nome || "Peça";
        for (const furo of acharFurosEPinos(pos)) itens.push({ malha, nomeMalha, furo });
        const bvh = new MeshBVH(geo);
        const raio = new THREE.Ray();
        const lancar = (origem, direcao) => {
          raio.set(origem, direcao);
          const h = bvh.raycastFirst(raio, THREE.DoubleSide);
          return h ? { distancia: h.distance, normal: h.face.normal } : null;
        };
        const r = medirParedes(pos, lancar, { amostras: Math.max(400, Math.round(3000 / peca.children.length)) });
        for (const a of r.amostras) amostras.push({ malha, ponto: a.ponto, espessura: a.espessura });
        if (r.minima !== null) minima = Math.min(minima, r.minima);
      }
      // espessuras guardadas em mm da peça original: escala aplicada na hora de mostrar
      paredes = { minima: Number.isFinite(minima) ? minima : null, amostras, escalaBase: 1 };
      escolhidos = new Set();
      $("an-estado").textContent = "";
      atualizar();
    }, 30);
  }

  // Valores de parede acompanham a escala atual da peça.
  function atualizar() {
    if (paredes) {
      const e = ctx.escala();
      if (paredes.escalaBase !== e) {
        const f = e / paredes.escalaBase;
        for (const a of paredes.amostras) a.espessura *= f;
        if (paredes.minima !== null) paredes.minima *= f;
        paredes.escalaBase = e;
      }
    }
    renderizar();
  }

  function aoCarregar(triangulos) {
    itens = [];
    paredes = null;
    escolhidos = new Set();
    destacar(null);
    limparGrupo(pontosFinos);
    $("an-painel").hidden = false;
    renderizar();
    $("an-furos-vazio").textContent = "";
    if (triangulos <= LIMITE_AUTOMATICO) analisar();
    else {
      $("an-estado").textContent = `Peça grande (${triangulos.toLocaleString("pt-BR")} triângulos): a análise pode levar alguns segundos.`;
      $("an-analisar").hidden = false;
    }
  }

  $("an-analisar").addEventListener("click", analisar);
  $("an-mostrar-finas").addEventListener("change", desenharFinas);
  $("an-bico").value = String(bicoEscolhido());
  $("an-bico").addEventListener("change", () => {
    try {
      localStorage.setItem("visualizador-bico", $("an-bico").value);
    } catch {
      // tudo bem
    }
    renderizar();
  });

  return { aoCarregar, atualizar };
}
