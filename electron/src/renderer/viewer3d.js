// Visualizador de modelos STL com Three.js: carregar, girar, dar zoom e ver medidas.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const $ = (id) => document.getElementById(id);
let estado = null;

export function iniciarVisualizador() {
  if (estado) return;

  const palco = $("palco");
  const renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderizador.setClearColor(0x000000, 0);
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  palco.append(renderizador.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  camera.position.set(120, 90, 160);

  cena.add(new THREE.HemisphereLight(0xffffff, 0x2a3142, 1.1));
  const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1.6);
  luzPrincipal.position.set(150, 220, 180);
  cena.add(luzPrincipal);

  const grade = new THREE.GridHelper(400, 40, 0x4a5570, 0x2a3142);
  grade.material.transparent = true;
  grade.material.opacity = 0.5;
  cena.add(grade);

  const controles = new OrbitControls(camera, renderizador.domElement);
  controles.enableDamping = true;

  estado = { renderizador, cena, camera, controles, modelo: null, palco };

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

  const animar = () => {
    controles.update();
    renderizador.render(cena, camera);
    requestAnimationFrame(animar);
  };
  animar();

  ligarArquivo();
}

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
}

async function carregarArquivo(arquivo) {
  if (!arquivo.name.toLowerCase().endsWith(".stl")) {
    alert("Escolha um arquivo .stl.");
    return;
  }
  const buffer = await arquivo.arrayBuffer();
  const geometria = new STLLoader().parse(buffer);
  // Muitos STL trazem normais zeradas; recalcular dá sombreamento correto por face.
  geometria.computeVertexNormals();
  geometria.computeBoundingBox();

  const caixa = geometria.boundingBox;
  const tamanho = new THREE.Vector3();
  caixa.getSize(tamanho);
  const centro = new THREE.Vector3();
  caixa.getCenter(centro);
  geometria.translate(-centro.x, -centro.y, -centro.z);

  const material = new THREE.MeshStandardMaterial({
    color: 0x7aa5ff,
    roughness: 0.45,
    metalness: 0.05,
  });
  const malha = new THREE.Mesh(geometria, material);

  // Coloca o modelo sobre a grade e enquadra a câmera.
  malha.position.y = tamanho.y / 2;
  const { cena, camera, controles } = estado;
  if (estado.modelo) {
    cena.remove(estado.modelo);
    estado.modelo.geometry.dispose();
    estado.modelo.material.dispose();
  }
  cena.add(malha);
  estado.modelo = malha;

  const alcance = Math.max(tamanho.x, tamanho.y, tamanho.z, 1);
  camera.position.set(alcance * 1.3, alcance * 0.9, alcance * 1.6);
  controles.target.set(0, tamanho.y / 2, 0);
  controles.update();

  $("palco-vazio").hidden = true;
  preencherInfo(arquivo.name, tamanho, geometria);
}

function preencherInfo(nome, tamanho, geometria) {
  const triangulos = geometria.attributes.position.count / 3;
  const volumeMm3 = volumeDaMalha(geometria);
  const dados = [
    nome,
    `${tamanho.x.toFixed(1)} × ${tamanho.y.toFixed(1)} × ${tamanho.z.toFixed(1)}`,
    (Math.abs(volumeMm3) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
    triangulos.toLocaleString("pt-BR"),
  ];
  const valores = $("info-modelo").querySelectorAll("dd");
  dados.forEach((texto, i) => {
    valores[i].textContent = texto;
  });
}

// Volume com sinal pelo teorema da divergência (soma de tetraedros com a origem).
function volumeDaMalha(geometria) {
  const pos = geometria.attributes.position;
  let soma = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    soma += a.dot(b.clone().cross(c)) / 6;
  }
  return soma;
}
