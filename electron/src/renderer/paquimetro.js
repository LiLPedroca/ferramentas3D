// Paquímetro do Visualizador 3D: distância (bicos externos), diâmetro (furos e pinos) e
// profundidade/ressalto. Os pontos grudam em vértices e arestas e, se pedido, no centro dos furos.
// As medidas ficam guardadas nas coordenadas da peça: acompanham quando ela é girada, movida ou escalada.
import * as THREE from "three";
import { arestasMarcantes, formatarMedida, medirDiametro, medirDistancia, medirProfundidade } from "./modelos/medidas.js";

// Arestas reais de cada malha, calculadas uma vez por malha (na primeira medida).
const arestasDaMalha = new WeakMap();
function arestasDe(geometria) {
  if (!arestasDaMalha.has(geometria)) arestasDaMalha.set(geometria, arestasMarcantes(geometria.attributes.position.array));
  return arestasDaMalha.get(geometria);
}
import { el } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const COR = 0xffc857;
const NOMES = { distancia: "Distância", diametro: "Diâmetro", profundidade: "Profundidade" };
const PIXELS_VERTICE = 10;
const PIXELS_ARESTA = 7;

// ctx: { cena, camera, renderizador, peca, palco, escala(), aoEscalar(fator), aoMudar() }
export function criarPaquimetro(ctx) {
  const { cena, camera, renderizador, peca, palco } = ctx;
  const desenhos = new THREE.Group();
  cena.add(desenhos);
  const marcador = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: COR, depthTest: false }));
  marcador.renderOrder = 10;
  marcador.visible = false;
  cena.add(marcador);
  const raio = new THREE.Raycaster();

  let medidas = [];
  let pendente = null; // primeiro ponto já clicado
  let contador = 0;
  let unidade = "mm";

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

  // Ponto clicado na peça, já com o snap. Devolve { p, n, pos } em coordenadas da peça.
  function pontoNaPeca(ev, { centroDeFuros }) {
    const r = renderizador.domElement.getBoundingClientRect();
    const mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    raio.setFromCamera(new THREE.Vector2((mouse.x / r.width) * 2 - 1, -(mouse.y / r.height) * 2 + 1), camera);
    peca.updateMatrixWorld(true);
    const achado = raio.intersectObjects(peca.children, false)[0];
    if (!achado?.face) return null;
    const pos = achado.object.geometry.attributes.position.array;
    const p = peca.worldToLocal(achado.point.clone());
    const n = achado.face.normal.clone().normalize();
    let tipoSnap = "";

    if (centroDeFuros) {
      const furo = medirDiametro(pos, p, n);
      if (furo) return { p: furo.centro, n, pos, tipoSnap: `centro do ${furo.tipo}` };
    }
    if ($("vz-snap").checked) {
      const t = achado.faceIndex;
      const reais = arestasDe(achado.object.geometry);
      const vs = [0, 1, 2].map((k) => new THREE.Vector3(pos[t * 9 + k * 3], pos[t * 9 + k * 3 + 1], pos[t * 9 + k * 3 + 2]));
      const ks = vs.map(reais.chave);
      const arestaReal = (i, j) => reais.arestas.has(ks[i] < ks[j] ? `${ks[i]}|${ks[j]}` : `${ks[j]}|${ks[i]}`);
      let melhor = { dist: PIXELS_VERTICE, ponto: null };
      for (const [i, v] of vs.entries()) {
        if (!reais.vertices.has(ks[i])) continue;
        const s = naTela(paraMundo(v));
        const d = Math.hypot(s.x - mouse.x, s.y - mouse.y);
        if (d < melhor.dist) melhor = { dist: d, ponto: v, tipo: "vértice" };
      }
      if (!melhor.ponto) {
        melhor.dist = PIXELS_ARESTA;
        for (const [i, j] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ]) {
          if (!arestaReal(i, j)) continue;
          const [a, b] = [vs[i], vs[j]];
          const ab = b.clone().sub(a);
          const t2 = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
          const q = a.clone().addScaledVector(ab, t2);
          const s = naTela(paraMundo(q));
          const d = Math.hypot(s.x - mouse.x, s.y - mouse.y);
          if (d < melhor.dist) melhor = { dist: d, ponto: q, tipo: "aresta" };
        }
      }
      if (melhor.ponto) {
        p.copy(melhor.ponto);
        tipoSnap = melhor.tipo;
      }
    }
    return { p, n, pos, tipoSnap };
  }

  // ---------- Valores ----------
  function valor(m) {
    const escala = ctx.escala();
    if (m.tipo === "diametro") {
      const d = m.furo.raio * 2 * escala;
      const mais = m.furo.rms * 2 * escala;
      return {
        principal: d,
        texto: `Ø ${formatarMedida(d, unidade)}`,
        detalhe: `${m.furo.tipo === "furo" ? "Furo" : "Pino"} · ${m.furo.lados} lados · ±${formatarMedida(Math.max(mais, 0.005), unidade, 3)}${m.furo.lados < 24 ? " · poucos lados: a medida real depende de como o fatiador arredonda" : ""}`,
      };
    }
    const [a, b] = [paraMundo(m.a.p), paraMundo(m.b.p)];
    const [na, nb] = [normalMundo(m.a.n), normalMundo(m.b.n)];
    if (m.tipo === "profundidade") {
      const d = medirProfundidade(a, na, b);
      return { principal: d, texto: formatarMedida(d, unidade), detalhe: "Ao longo da normal da primeira face (haste de profundidade)" };
    }
    const r = medirDistancia(a, na, b, nb);
    const delta = `ΔX ${formatarMedida(Math.abs(r.delta.x), unidade)} · ΔY ${formatarMedida(Math.abs(r.delta.z), unidade)} · ΔZ ${formatarMedida(Math.abs(r.delta.y), unidade)}`;
    if (r.perpendicular !== null) {
      return { principal: r.perpendicular, texto: formatarMedida(r.perpendicular, unidade), detalhe: `Entre faces paralelas (como os bicos) · em linha reta ${formatarMedida(r.reta, unidade)}` };
    }
    return { principal: r.reta, texto: formatarMedida(r.reta, unidade), detalhe: delta };
  }

  // ---------- Desenho ----------
  function limparDesenhos() {
    for (const o of [...desenhos.children]) {
      desenhos.remove(o);
      o.traverse((x) => {
        x.geometry?.dispose();
        x.material?.dispose();
      });
    }
    for (const r of palco.querySelectorAll(".vz-rotulo")) r.remove();
  }

  function bolinha(pMundo, tam) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(tam, 12, 10), new THREE.MeshBasicMaterial({ color: COR, depthTest: false }));
    b.position.copy(pMundo);
    b.renderOrder = 10;
    return b;
  }

  function linha(pontos) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pontos), new THREE.LineBasicMaterial({ color: COR, depthTest: false }));
    l.renderOrder = 10;
    return l;
  }

  function desenhar() {
    limparDesenhos();
    const tam = tamanhoMarcador();
    for (const m of medidas) {
      const g = new THREE.Group();
      let ancora;
      if (m.tipo === "diametro") {
        const centro = paraMundo(m.furo.centro);
        const eixo = normalMundo(m.furo.eixo);
        const r = m.furo.raio * ctx.escala();
        const u = new THREE.Vector3(1, 0, 0);
        if (Math.abs(u.dot(eixo)) > 0.9) u.set(0, 1, 0);
        u.sub(eixo.clone().multiplyScalar(u.dot(eixo))).normalize();
        const v = eixo.clone().cross(u);
        const anel = Array.from({ length: 65 }, (_, i) => centro.clone().addScaledVector(u, r * Math.cos((i / 64) * Math.PI * 2)).addScaledVector(v, r * Math.sin((i / 64) * Math.PI * 2)));
        g.add(linha(anel), linha([centro.clone().addScaledVector(u, -r), centro.clone().addScaledVector(u, r)]), bolinha(centro, tam * 0.7));
        ancora = centro.clone().addScaledVector(u, r);
      } else {
        const [a, b] = [paraMundo(m.a.p), paraMundo(m.b.p)];
        g.add(bolinha(a, tam), bolinha(b, tam), linha([a, b]));
        ancora = a.clone().lerp(b, 0.5);
      }
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
          atualizar();
        });
        topo.append(apagar);
        li.append(topo, el("span", "cliente-sub", v.detalhe));

        const ajustar = el("button", "botao-texto pequeno", "Quero que tenha… (ajustar escala)");
        ajustar.type = "button";
        ajustar.addEventListener("click", () => {
          const linhaEscala = el("form", "vz-linha");
          const caixa = el("div", "entrada");
          const entrada = el("input");
          entrada.inputMode = "decimal";
          entrada.setAttribute("aria-label", "Medida desejada");
          entrada.value = (unidade === "pol" ? v.principal / 25.4 : v.principal).toFixed(unidade === "pol" ? 3 : 2).replace(".", ",");
          caixa.append(entrada, el("em", "", unidade === "pol" ? "pol" : "mm"));
          const ok = el("button", "botao-secundario pequeno", "Aplicar");
          ok.type = "submit";
          linhaEscala.append(caixa, ok);
          linhaEscala.addEventListener("submit", (ev) => {
            ev.preventDefault();
            let desejado = Number(entrada.value.replace(",", "."));
            if (unidade === "pol") desejado *= 25.4;
            if (!(desejado > 0) || !(v.principal > 0)) return;
            ctx.aoEscalar(ctx.escala() * (desejado / v.principal));
          });
          ajustar.replaceWith(linhaEscala);
          entrada.focus();
          entrada.select();
        });
        li.append(ajustar);
        return li;
      }),
    );
    $("vz-medidas-vazio").hidden = medidas.length > 0;
    $("vz-limpar-medidas").hidden = medidas.length === 0;
  }

  function atualizar() {
    desenhar();
    renderizarLista();
  }

  // ---------- Cliques ----------
  function clicar(ev, modo) {
    const centroDeFuros = $("vz-centro-furos").checked && modo !== "diametro";
    const ponto = pontoNaPeca(ev, { centroDeFuros });
    if (!ponto) return;
    if (modo === "diametro") {
      const furo = medirDiametro(ponto.pos, ponto.p, ponto.n);
      if (!furo) {
        ctx.avisar("Não achei um furo ou pino redondo aí. Clique na parede de dentro do furo (ou na lateral do pino).");
        return;
      }
      adicionar({ tipo: "diametro", furo });
      return;
    }
    if (!pendente) {
      pendente = ponto;
      ctx.dica(modo === "profundidade" ? "Agora clique no fundo (ou no outro degrau)." : "Agora clique no segundo ponto.");
      desenhar();
      return;
    }
    adicionar({ tipo: modo, a: pendente, b: ponto });
    pendente = null;
  }

  function adicionar(m) {
    contador++;
    medidas.push({ ...m, id: contador, nome: `${NOMES[m.tipo]} ${contador}` });
    ctx.dicaPadrao();
    atualizar();
  }

  // Marcador que mostra onde o ponto vai grudar.
  function mover(ev, modo) {
    if (!modo) {
      marcador.visible = false;
      return;
    }
    const ponto = pontoNaPeca(ev, { centroDeFuros: false });
    marcador.visible = Boolean(ponto);
    if (!ponto) return;
    marcador.position.copy(paraMundo(ponto.p));
    marcador.scale.setScalar(tamanhoMarcador() * (ponto.tipoSnap ? 1.15 : 0.75));
    renderizador.domElement.title = ponto.tipoSnap ? `Grudar no ${ponto.tipoSnap}` : "";
  }

  function cancelar() {
    pendente = null;
    marcador.visible = false;
    desenhar();
  }

  function limpar() {
    medidas = [];
    pendente = null;
    contador = 0;
    marcador.visible = false;
    atualizar();
  }

  $("vz-limpar-medidas").addEventListener("click", limpar);
  $("vz-unidade").addEventListener("change", () => {
    unidade = $("vz-unidade").value;
    atualizar();
    ctx.aoMudar();
  });

  // Usado pela análise automática: põe um furo/pino encontrado na lista de medidas.
  const adicionarDiametro = (furo) => adicionar({ tipo: "diametro", furo });

  return { clicar, mover, atualizar, quadro, cancelar, limpar, adicionarDiametro, unidade: () => unidade };
}
