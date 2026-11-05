// Visualizador 3D: abre STL, 3MF, OBJ e PLY na orientação do fatiador (Z para cima), com as cores do
// arquivo. A peça fica sempre apoiada na mesa da impressora e pode ser movida, girada (90° por eixo,
// livre ou "deitar na face"), escalada e salva como ficou.
// Eixos: o fatiador usa Z para cima; o Three.js usa Y. Impressora X = X, Y = −Z, Z = Y.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { preencherDoModelo } from "./calculadora-tela.js";
import { abrirNoFatiador } from "./fatiador-ui.js";
import { DENSIDADE_PLA } from "./modelos/estimativa.js";
import { gerar3mf, gerarStl } from "./modelos/exportar.js";
import { ler3mf } from "./modelos/ler3mf.js";
import { formatarMedida } from "./modelos/medidas.js";
import { criarAnalise } from "./analise-tela.js";
import { criarPaquimetro } from "./paquimetro.js";
import { mostrarAviso } from "./shell.js";

const MODOS_MEDIDA = ["distancia", "diametro", "profundidade"];
const DICAS = {
  vista: "Arraste para girar a vista, botão direito para deslocar, roda para zoom.",
  mover: "Arraste as setas para mover a peça sobre a mesa.",
  girar: "Arraste os anéis para girar a peça. Ela continua apoiada na mesa.",
  face: "Clique na face que deve ficar encostada na mesa.",
  distancia: "Clique em dois pontos. Em faces paralelas, mede como os bicos do paquímetro. Esc cancela.",
  diametro: "Clique na parede de dentro de um furo (ou na lateral de um pino).",
  profundidade: "Clique na borda (a face de cima) e depois no fundo ou no outro degrau. Esc cancela.",
};

const $ = (id) => document.getElementById(id);
const COR_PADRAO = "#7aa5ff";
const EXTENSOES = ["stl", "3mf", "obj", "ply"];

// Mesas (largura X × profundidade Y × altura Z, em mm)
export const MESAS = [
  { id: "kobra-x", nome: "Anycubic Kobra X", x: 260, y: 260, z: 260 },
  { id: "kobra-3", nome: "Anycubic Kobra 3", x: 250, y: 250, z: 260 },
  { id: "bambu-a1", nome: "Bambu Lab A1 / P1S / X1", x: 256, y: 256, z: 256 },
  { id: "bambu-a1-mini", nome: "Bambu Lab A1 mini", x: 180, y: 180, z: 180 },
  { id: "prusa-mk4", nome: "Prusa MK4", x: 250, y: 210, z: 220 },
  { id: "ender-3", nome: "Creality Ender 3", x: 220, y: 220, z: 250 },
  { id: "k1", nome: "Creality K1", x: 220, y: 220, z: 250 },
];

let estado = null;

// ---------- Cena ----------
export function iniciarVisualizador() {
  if (estado) return;

  const palco = $("palco");
  const renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderizador.setClearColor(0x000000, 0);
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  palco.append(renderizador.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 20000);
  camera.position.set(260, 220, 320);

  cena.add(new THREE.HemisphereLight(0xffffff, 0x2a3142, 1.15));
  const luz = new THREE.DirectionalLight(0xffffff, 1.5);
  luz.position.set(200, 400, 300);
  cena.add(luz);
  const luzTras = new THREE.DirectionalLight(0xffffff, 0.45);
  luzTras.position.set(-250, 150, -300);
  cena.add(luzTras);

  const controles = new OrbitControls(camera, renderizador.domElement);
  controles.enableDamping = true;

  const transformador = new TransformControls(camera, renderizador.domElement);
  transformador.setSize(0.8);
  transformador.addEventListener("dragging-changed", (ev) => {
    controles.enabled = !ev.value;
    if (!ev.value) depoisDeMexer();
  });
  cena.add(transformador.getHelper());

  const peca = new THREE.Group(); // a peça inteira (transformações do usuário)
  cena.add(peca);

  estado = {
    renderizador, cena, camera, controles, transformador, peca, palco,
    mesa: null, volumeMesa: null,
    arquivo: null, nome: "", temCores: false, triangulos: 0,
    modo: "vista", escala: 1,
  };

  const ajustarTamanho = () => {
    const largura = palco.clientWidth;
    const altura = palco.clientHeight;
    if (largura === 0 || altura === 0) return;
    renderizador.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(ajustarTamanho).observe(palco);
  ajustarTamanho();

  estado.paquimetro = criarPaquimetro({
    cena, camera, renderizador, peca, palco,
    escala: () => estado.escala,
    aoEscalar: (fator) => definirEscala(fator),
    aoMudar: () => {
      atualizarInfo();
      estado.analise?.atualizar();
    },
    avisar: mostrarAviso,
    dica: (texto) => {
      $("vz-dica").textContent = texto;
    },
    dicaPadrao: () => {
      $("vz-dica").textContent = DICAS[estado.modo];
    },
  });

  estado.analise = criarAnalise({
    cena, peca,
    escala: () => estado.escala,
    unidade: () => estado.paquimetro.unidade(),
    paquimetro: estado.paquimetro,
  });

  // Usado só pelos roteiros do modo de captura (testes da tela), para achar pontos na peça.
  window.__visualizadorTeste = { estado, THREE };

  const animar = () => {
    controles.update();
    renderizador.render(cena, camera);
    estado.paquimetro.quadro();
    requestAnimationFrame(animar);
  };
  animar();

  montarMesas();
  desenharMesa();
  ligarControles();
  ligarArquivo();
}

// ---------- Mesa da impressora ----------
function mesaEscolhida() {
  let id = "kobra-x";
  try {
    id = localStorage.getItem("visualizador-mesa") || id;
  } catch {
    // sem armazenamento: usa a padrão
  }
  return MESAS.find((m) => m.id === id) ?? MESAS[0];
}

function montarMesas() {
  const seletor = $("vz-mesa");
  seletor.replaceChildren(...MESAS.map((m) => new Option(`${m.nome} (${m.x}×${m.y}×${m.z})`, m.id)));
  seletor.value = mesaEscolhida().id;
  seletor.addEventListener("change", () => {
    try {
      localStorage.setItem("visualizador-mesa", seletor.value);
    } catch {
      // tudo bem
    }
    desenharMesa();
    atualizarInfo();
  });
}

function desenharMesa() {
  const { cena } = estado;
  for (const obj of [estado.mesa, estado.volumeMesa]) {
    if (!obj) continue;
    cena.remove(obj);
    obj.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
  }
  const m = mesaEscolhida();
  const mesa = new THREE.Group();
  const placa = new THREE.Mesh(
    new THREE.PlaneGeometry(m.x, m.y),
    new THREE.MeshStandardMaterial({ color: 0x1c2333, roughness: 0.9, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  placa.rotation.x = -Math.PI / 2;
  placa.position.y = -0.05;
  mesa.add(placa);
  const grade = new THREE.GridHelper(Math.max(m.x, m.y), Math.round(Math.max(m.x, m.y) / 10), 0x4a5570, 0x2a3142);
  grade.scale.set(m.x / Math.max(m.x, m.y), 1, m.y / Math.max(m.x, m.y));
  grade.material.transparent = true;
  grade.material.opacity = 0.55;
  mesa.add(grade);
  // seta da frente da impressora
  const frente = new THREE.Mesh(new THREE.CircleGeometry(4, 3), new THREE.MeshBasicMaterial({ color: 0x5b8def }));
  frente.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  frente.position.set(0, 0.02, m.y / 2 + 8);
  mesa.add(frente);
  cena.add(mesa);

  const caixa = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(m.x, m.z, m.y)),
    new THREE.LineBasicMaterial({ color: 0x5b8def, transparent: true, opacity: 0.18 }),
  );
  caixa.position.y = m.z / 2;
  cena.add(caixa);
  estado.mesa = mesa;
  estado.volumeMesa = caixa;
}

// ---------- Abrir arquivos ----------
function ligarArquivo() {
  const zona = $("zona-arquivo");
  const entrada = $("arquivo-stl");
  zona.addEventListener("click", () => entrada.click());
  zona.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      entrada.click();
    }
  });
  entrada.addEventListener("change", () => {
    if (entrada.files[0]) carregarArquivo(entrada.files[0]);
    entrada.value = "";
  });
  zona.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    zona.classList.add("sobre");
  });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", (ev) => {
    ev.preventDefault();
    zona.classList.remove("sobre");
    const arquivo = ev.dataTransfer.files[0];
    if (arquivo) carregarArquivo(arquivo);
  });
  $("vz-placa").addEventListener("change", () => {
    if (estado.arquivo) carregarArquivo(estado.arquivo, { placa: $("vz-placa").value });
  });
}

// Converte coordenadas do fatiador (Z para cima) para o Three.js (Y para cima).
function geometriaDoFatiador(posicoes, coresTriangulos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));
  if (coresTriangulos) {
    const cores = new Float32Array(posicoes.length);
    const c = new THREE.Color();
    coresTriangulos.forEach((hex, t) => {
      c.set(hex ?? COR_PADRAO).convertSRGBToLinear();
      for (let k = 0; k < 3; k++) cores.set([c.r, c.g, c.b], t * 9 + k * 3);
    });
    g.setAttribute("color", new THREE.BufferAttribute(cores, 3));
  }
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

async function lerPartes(arquivo, extensao, opcoes) {
  const buffer = await arquivo.arrayBuffer();
  if (extensao === "3mf") {
    const r = ler3mf(new Uint8Array(buffer), opcoes);
    return { ...r, partes: r.pecas.map((p) => ({ nome: p.nome, cor: p.cor, geometria: geometriaDoFatiador(p.posicoes, p.coresTriangulos) })) };
  }
  let geometrias = [];
  if (extensao === "stl") {
    geometrias = [new STLLoader().parse(buffer)];
  } else if (extensao === "ply") {
    geometrias = [new PLYLoader().parse(buffer)];
  } else {
    const grupo = new OBJLoader().parse(new TextDecoder().decode(buffer));
    grupo.traverse((o) => {
      if (o.isMesh) geometrias.push(o.geometry);
    });
  }
  const partes = geometrias.map((g, i) => {
    const solta = g.index ? g.toNonIndexed() : g;
    const temCor = Boolean(solta.attributes.color) && (extensao !== "stl" || g.hasColors);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", solta.attributes.position);
    if (temCor) geo.setAttribute("color", solta.attributes.color);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return { nome: geometrias.length > 1 ? `Parte ${i + 1}` : "", cor: null, geometria: geo };
  });
  return { partes, temCores: partes.some((p) => p.geometria.attributes.color), placas: [], placa: null };
}

async function carregarArquivo(arquivo, opcoes = {}) {
  const extensao = arquivo.name.toLowerCase().split(".").pop();
  if (!EXTENSOES.includes(extensao)) {
    mostrarAviso("Escolha um arquivo .stl, .3mf, .obj ou .ply.");
    return;
  }
  $("palco-vazio").hidden = false;
  $("palco-vazio").textContent = "Abrindo…";
  let lido;
  try {
    lido = await lerPartes(arquivo, extensao, opcoes);
  } catch (erro) {
    $("palco-vazio").textContent = estado.peca.children.length ? "" : "Nenhum modelo carregado.";
    $("palco-vazio").hidden = estado.peca.children.length > 0;
    mostrarAviso(erro.message || "Não foi possível abrir este arquivo.");
    return;
  }
  limparPeca();
  estado.paquimetro.limpar();
  const { peca } = estado;
  let triangulos = 0;
  for (const parte of lido.partes) {
    const material = new THREE.MeshStandardMaterial({ color: COR_PADRAO, roughness: 0.5, metalness: 0.04 });
    const malha = new THREE.Mesh(parte.geometria, material);
    malha.userData = { corOriginal: parte.cor, temCorVertice: Boolean(parte.geometria.attributes.color), nome: parte.nome };
    peca.add(malha);
    triangulos += parte.geometria.attributes.position.count / 3;
  }
  // centraliza a peça na mesa (no X e no Y do fatiador)
  const caixa = new THREE.Box3().setFromObject(peca);
  const centro = caixa.getCenter(new THREE.Vector3());
  for (const m of peca.children) m.geometry.translate(-centro.x, -caixa.min.y, -centro.z);

  Object.assign(estado, { arquivo, nome: arquivo.name.replace(/\.[^.]+$/, ""), temCores: lido.temCores, triangulos, escala: 1 });
  $("vz-cores-arquivo").checked = lido.temCores;
  $("vz-cores-linha").hidden = !lido.temCores;
  $("vz-placa-linha").hidden = !lido.placas.length;
  $("vz-placa").replaceChildren(...lido.placas.map((p) => new Option(p.nome, p.id)));
  if (lido.placa) $("vz-placa").value = lido.placa;
  $("vz-escala").value = "100";
  pintar();
  apoiarNaMesa();
  enquadrar("iso");
  $("palco-vazio").hidden = true;
  $("vz-ferramentas").hidden = false;
  atualizarInfo();
  estado.analise.aoCarregar(triangulos);
}

function limparPeca() {
  const { peca, transformador } = estado;
  transformador.detach();
  for (const m of [...peca.children]) {
    peca.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  peca.position.set(0, 0, 0);
  peca.quaternion.identity();
  peca.scale.setScalar(1);
}

// ---------- Aparência ----------
function pintar() {
  const usarArquivo = estado.temCores && $("vz-cores-arquivo").checked;
  const escolhida = $("vz-cor").value || COR_PADRAO;
  const aramado = $("vz-aramado").checked;
  for (const m of estado.peca.children) {
    const { corOriginal, temCorVertice } = m.userData;
    m.material.vertexColors = usarArquivo && temCorVertice;
    m.material.color.set(m.material.vertexColors ? "#ffffff" : usarArquivo && corOriginal ? corOriginal : escolhida);
    m.material.wireframe = aramado;
    m.material.needsUpdate = true;
  }
}

// ---------- Posição ----------
// Mantém a peça encostada na mesa (como os fatiadores fazem).
function apoiarNaMesa() {
  const { peca } = estado;
  peca.updateMatrixWorld(true);
  const caixa = new THREE.Box3().setFromObject(peca);
  if (caixa.isEmpty()) return;
  peca.position.y -= caixa.min.y;
}

function depoisDeMexer() {
  apoiarNaMesa();
  atualizarInfo();
  estado.paquimetro?.atualizar();
  estado.analise?.atualizar();
}

const EIXOS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1), z: new THREE.Vector3(0, 1, 0) };

function girar(eixo, graus) {
  if (!estado.peca.children.length) return;
  estado.peca.rotateOnWorldAxis(EIXOS[eixo], THREE.MathUtils.degToRad(graus));
  depoisDeMexer();
}

function centralizar() {
  const { peca } = estado;
  const caixa = new THREE.Box3().setFromObject(peca);
  const centro = caixa.getCenter(new THREE.Vector3());
  peca.position.x -= centro.x;
  peca.position.z -= centro.z;
  depoisDeMexer();
}

function restaurar() {
  const { peca } = estado;
  peca.quaternion.identity();
  peca.position.set(0, 0, 0);
  definirEscala(1);
  centralizar();
}

function definirEscala(fator) {
  if (!Number.isFinite(fator) || fator <= 0) return;
  estado.escala = Math.min(Math.max(fator, 0.001), 1000);
  estado.peca.scale.setScalar(estado.escala);
  $("vz-escala").value = String(Math.round(estado.escala * 10000) / 100);
  depoisDeMexer();
}

// "Deitar na face": a face clicada vira para baixo e encosta na mesa.
const raio = new THREE.Raycaster();
function deitarNaFace(ev) {
  const { renderizador, camera, peca } = estado;
  const r = renderizador.domElement.getBoundingClientRect();
  const ponto = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raio.setFromCamera(ponto, camera);
  const achado = raio.intersectObjects(peca.children, false)[0];
  if (!achado?.face) return;
  const normal = achado.face.normal.clone().transformDirection(achado.object.matrixWorld).normalize();
  const giro = new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, -1, 0));
  peca.quaternion.premultiply(giro);
  depoisDeMexer();
  mudarModo("vista");
  mostrarAviso("Face apoiada na mesa.");
}

function mudarModo(modo) {
  const { transformador, peca, renderizador } = estado;
  if (estado.modo !== modo) estado.paquimetro?.cancelar();
  estado.modo = modo;
  for (const b of document.querySelectorAll("[data-vz-modo]")) b.classList.toggle("ativo", b.dataset.vzModo === modo);
  if (modo === "mover" || modo === "girar") {
    transformador.attach(peca);
    transformador.setMode(modo === "mover" ? "translate" : "rotate");
    transformador.showY = modo !== "mover"; // mover só sobre a mesa
  } else {
    transformador.detach();
  }
  renderizador.domElement.style.cursor = modo === "face" || MODOS_MEDIDA.includes(modo) ? "crosshair" : "";
  $("vz-dica").textContent = DICAS[modo];
}

// ---------- Câmera ----------
function enquadrar(vista) {
  const { camera, controles, peca } = estado;
  const caixa = new THREE.Box3().setFromObject(peca);
  const centro = caixa.isEmpty() ? new THREE.Vector3(0, 40, 0) : caixa.getCenter(new THREE.Vector3());
  const tamanho = caixa.isEmpty() ? 120 : Math.max(...caixa.getSize(new THREE.Vector3()).toArray(), 10);
  const d = tamanho * 2.2;
  const direcao = {
    iso: new THREE.Vector3(0.8, 0.65, 1),
    frente: new THREE.Vector3(0, 0, 1),
    topo: new THREE.Vector3(0, 1, 0.0001),
    lado: new THREE.Vector3(1, 0, 0),
  }[vista].normalize();
  camera.position.copy(centro).addScaledVector(direcao, d);
  controles.target.copy(centro);
  controles.update();
}

// ---------- Medidas ----------
function geometriasNoMundo() {
  const { peca } = estado;
  peca.updateMatrixWorld(true);
  return peca.children.map((m) => {
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    return { malha: m, geometria: g };
  });
}

function volumeMm3(geometria) {
  const pos = geometria.attributes.position;
  let soma = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const [ax, ay, az] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [bx, by, bz] = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)];
    const [cx, cy, cz] = [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)];
    soma += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(soma);
}

const mm = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const medida = (n) => (estado.paquimetro?.unidade() === "pol" ? formatarMedida(n, "pol") : mm(n));

function atualizarInfo() {
  const valores = $("info-modelo").querySelectorAll("dd");
  if (!estado.peca.children.length) return;
  const caixa = new THREE.Box3().setFromObject(estado.peca);
  const t = caixa.getSize(new THREE.Vector3());
  const tamanho = { x: t.x, y: t.z, z: t.y }; // eixos do fatiador
  const volume = geometriasNoMundo().reduce((s, { geometria }) => {
    const v = volumeMm3(geometria);
    geometria.dispose();
    return s + v;
  }, 0);
  const gramas = (volume / 1000) * DENSIDADE_PLA;
  estado.gramas = gramas;
  const dados = [
    estado.arquivo?.name ?? "—",
    `${medida(tamanho.x)} × ${medida(tamanho.y)} × ${medida(tamanho.z)}`,
    (volume / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
    `≈ ${gramas.toLocaleString("pt-BR", { maximumFractionDigits: gramas < 10 ? 1 : 0 })} g (PLA maciço)`,
    estado.triangulos.toLocaleString("pt-BR"),
  ];
  dados.forEach((texto, i) => {
    valores[i].textContent = texto;
  });

  const m = mesaEscolhida();
  const fora =
    caixa.min.x < -m.x / 2 - 0.01 || caixa.max.x > m.x / 2 + 0.01 || caixa.min.z < -m.y / 2 - 0.01 || caixa.max.z > m.y / 2 + 0.01;
  const altaDemais = caixa.max.y > m.z + 0.01;
  const aviso = $("vz-cabe");
  aviso.className = `vz-cabe ${fora || altaDemais ? "nao" : "sim"}`;
  aviso.textContent = altaDemais
    ? `Mais alta que a impressora (${mm(tamanho.z)} de ${m.z} mm).`
    : fora
      ? "Passa da borda da mesa. Centralize, gire ou diminua a escala."
      : `Cabe na mesa da ${m.nome}.`;
  estado.volumeMesa.material.color.set(fora || altaDemais ? 0xe5534b : 0x5b8def);
  estado.volumeMesa.material.opacity = fora || altaDemais ? 0.6 : 0.18;

  const maior = Math.max(tamanho.x, tamanho.y, tamanho.z);
  $("vz-polegadas-aviso").hidden = !(maior > 0 && maior < 12 && estado.escala === 1);
}

// ---------- Salvar como ficou ----------
// Partes nas coordenadas do fatiador (Z para cima), com a posição, o giro e a escala escolhidos.
function partesParaSalvar() {
  return geometriasNoMundo().map(({ malha, geometria }, i) => {
    geometria.rotateX(Math.PI / 2);
    const cor = malha.material.vertexColors ? malha.userData.corOriginal ?? COR_PADRAO : `#${malha.material.color.getHexString()}`;
    return { nome: malha.userData.nome || `Parte ${i + 1}`, cor, geometria };
  });
}

async function salvar(extensao) {
  if (!estado.peca.children.length) return;
  const partes = partesParaSalvar();
  const bytes = extensao === "stl" ? gerarStl(partes) : gerar3mf(partes, { titulo: estado.nome });
  partes.forEach((p) => p.geometria.dispose());
  const resposta = await window.modelos.salvar(bytes, `${estado.nome}-posicionado`, extensao);
  if (!resposta.ok) mostrarAviso(resposta.erro);
  else if (resposta.dados) mostrarAviso(`${extensao.toUpperCase()} salvo.`);
}

async function mandarAoFatiador() {
  if (!estado.peca.children.length) return;
  const partes = partesParaSalvar();
  const bytes = gerar3mf(partes, { titulo: estado.nome });
  partes.forEach((p) => p.geometria.dispose());
  await abrirNoFatiador(bytes, `${estado.nome}-posicionado`, "3mf");
}

// ---------- Botões ----------
function ligarControles() {
  for (const b of document.querySelectorAll("[data-vz-modo]")) b.addEventListener("click", () => mudarModo(b.dataset.vzModo));
  for (const b of document.querySelectorAll("[data-vz-girar]")) {
    b.addEventListener("click", () => {
      const [eixo, graus] = b.dataset.vzGirar.split(":");
      girar(eixo, Number(graus));
    });
  }
  for (const b of document.querySelectorAll("[data-vz-vista]")) b.addEventListener("click", () => enquadrar(b.dataset.vzVista));
  $("vz-centralizar").addEventListener("click", centralizar);
  $("vz-restaurar").addEventListener("click", restaurar);
  $("vz-escala").addEventListener("change", () => definirEscala(Number(String($("vz-escala").value).replace(",", ".")) / 100));
  $("vz-polegadas").addEventListener("click", () => definirEscala(estado.escala * 25.4));
  $("vz-cor").addEventListener("input", pintar);
  $("vz-cores-arquivo").addEventListener("change", pintar);
  $("vz-aramado").addEventListener("change", pintar);
  $("vz-salvar-stl").addEventListener("click", () => salvar("stl"));
  $("vz-salvar-3mf").addEventListener("click", () => salvar("3mf"));
  $("vz-fatiador").addEventListener("click", mandarAoFatiador);
  $("vz-custo").addEventListener("click", () => {
    if (!estado.peca.children.length) return;
    preencherDoModelo({ nome: estado.nome, pesoG: estado.gramas ?? 0, detalhe: "volume do arquivo em PLA, peça maciça" });
  });
  // Clique sem arrastar (arrastar gira a vista e não deve marcar ponto).
  const tela = estado.renderizador.domElement;
  let inicio = null;
  tela.addEventListener("pointerdown", (ev) => {
    inicio = { x: ev.clientX, y: ev.clientY };
  });
  tela.addEventListener("click", (ev) => {
    if (inicio && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) > 4) return;
    if (estado.modo === "face") deitarNaFace(ev);
    else if (MODOS_MEDIDA.includes(estado.modo)) estado.paquimetro.clicar(ev, estado.modo);
  });
  tela.addEventListener("pointermove", (ev) => {
    if (ev.buttons === 0) estado.paquimetro.mover(ev, MODOS_MEDIDA.includes(estado.modo) ? estado.modo : null);
  });
  tela.addEventListener("pointerleave", () => estado.paquimetro.mover(null, null));
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && MODOS_MEDIDA.includes(estado.modo)) {
      estado.paquimetro.cancelar();
      $("vz-dica").textContent = DICAS[estado.modo];
    }
  });
  mudarModo("vista");
}
