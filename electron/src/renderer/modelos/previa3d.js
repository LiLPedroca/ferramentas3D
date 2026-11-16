// Pré-visualização 3D reutilizável: mostra as partes de um modelo, cada uma com sua cor.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { criarRenderizador, mostrarSem3d } from "./webgl.js";

// Sem WebGL: a prévia vira um aviso e os comandos não fazem nada (exportar etc. continuam funcionando).
const PREVIA_SEM_3D = {
  sem3d: true, colorir() {}, mostrarGrade() {}, mostrar() {}, enquadrar() {}, verBase() {}, zoom() {},
  pontoNaPeca: () => null, paraTela: () => null, mmPorPixel: () => 1, modoPintura() {}, nivel: () => 1, aoMudarVista: null,
};

const mm2 = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Linhas das cotas X (na frente da peça) e Y (ao lado), em mm, a partir da caixa { min, max }.
export function cotasDaCaixa({ min, max }, afastamento = 8) {
  return {
    x: { de: [min[0], min[1] - afastamento, 0], ate: [max[0], min[1] - afastamento, 0], valor: `X: ${mm2(max[0] - min[0])} mm` },
    y: { de: [max[0] + afastamento, min[1], 0], ate: [max[0] + afastamento, max[1], 0], valor: `Y: ${mm2(max[1] - min[1])} mm` },
  };
}

// opcoes.mesa: [x, y] em mm, desenha a mesa da impressora (placa + grade de 10 mm) em volta da peça.
// opcoes.cotas: linhas X (vermelha) e Y (verde) com a medida escrita junto.
export function criarPrevia(container, opcoes = {}) {
  const renderizador = criarRenderizador();
  if (!renderizador) {
    mostrarSem3d(container);
    return PREVIA_SEM_3D;
  }
  container.append(renderizador.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.up.set(0, 0, 1); // Z para cima, como nos fatiadores
  cena.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.2));
  const luz = new THREE.DirectionalLight(0xffffff, 1.5);
  luz.position.set(-60, -80, 160);
  cena.add(luz);
  if (opcoes.luzExtra) {
    // luz de preenchimento do outro lado: o relevo fica legível sem sombras chapadas
    const preencher = new THREE.DirectionalLight(0xffffff, 0.7);
    preencher.position.set(90, 60, 120);
    cena.add(preencher);
    const contra = new THREE.DirectionalLight(0xffffff, 0.35);
    contra.position.set(0, 120, 40);
    cena.add(contra);
  }
  const luzFundo = new THREE.DirectionalLight(0xffffff, 1.3);
  luzFundo.visible = false;
  cena.add(luzFundo);

  const ladoMesa = opcoes.mesa ? Math.max(...opcoes.mesa) : 300;
  const grade = new THREE.GridHelper(ladoMesa, Math.round(ladoMesa / 10), 0x4d4d4d, 0x2b2b2b);
  if (opcoes.mesa) grade.scale.set(opcoes.mesa[0] / ladoMesa, 1, opcoes.mesa[1] / ladoMesa);
  let placa = null;
  if (opcoes.mesa) {
    placa = new THREE.Mesh(new THREE.PlaneGeometry(opcoes.mesa[0], opcoes.mesa[1]), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
    placa.position.z = -0.05;
    cena.add(placa);
  }
  const cotas = opcoes.cotas ? criarCotas(cena, container) : null;
  grade.rotation.x = Math.PI / 2;
  grade.material.transparent = true;
  grade.material.opacity = opcoes.gradeSuave ? 0.18 : 0.45;
  cena.add(grade);

  const controles = new OrbitControls(camera, renderizador.domElement);
  controles.enableDamping = true;
  const BOTOES = { ...controles.mouseButtons };
  const raio = new THREE.Raycaster();
  let distanciaInicial = 1;

  let malhas = [];
  let extras = [];
  let primeiraVez = true;
  let centro = new THREE.Vector3();
  let tamanho = new THREE.Vector3(10, 10, 10);
  let gradeAtiva = true;
  let vendoBase = false;

  const ajustar = () => {
    const l = container.clientWidth;
    const a = container.clientHeight;
    if (!l || !a) return;
    renderizador.setSize(l, a, false);
    camera.aspect = l / a;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(ajustar).observe(container);
  ajustar();

  const animar = () => {
    controles.update();
    renderizador.render(cena, camera);
    cotas?.posicionar(camera, renderizador.domElement);
    requestAnimationFrame(animar);
  };
  animar();

  const api = {
    colorir(cores) {
      malhas.forEach((malha, i) => { if (cores[i]) malha.material.color.set(cores[i]); });
    },
    mostrarGrade(visivel) { gradeAtiva = visivel; grade.visible = visivel && !vendoBase; },
    // partes: [{ cor, geometria }]
    mostrar(partes) {
      for (const m of malhas) {
        cena.remove(m);
        m.material.dispose();
        if (m.userData.copia) m.geometry.dispose();
      }
      malhas = partes.map((p) => {
        const material = new THREE.MeshStandardMaterial({ color: p.cor, roughness: 0.5, metalness: 0.05 });
        // geometria indexada (Manifold): faces planas na prévia, sem suavizar as quinas
        let geometria = p.geometria;
        if (geometria.index) {
          geometria = geometria.toNonIndexed();
          geometria.computeVertexNormals();
        }
        const malha = new THREE.Mesh(geometria, material);
        malha.userData.copia = geometria !== p.geometria;
        cena.add(malha);
        return malha;
      });
      const caixa = new THREE.Box3();
      malhas.forEach((m) => caixa.expandByObject(m));
      centro = caixa.getCenter(new THREE.Vector3());
      tamanho = caixa.getSize(new THREE.Vector3());
      grade.position.set(centro.x, centro.y, 0);
      placa?.position.set(centro.x, centro.y, -0.05);
      if (malhas.length) cotas?.mostrar(cotasDaCaixa({ min: caixa.min.toArray(), max: caixa.max.toArray() }));
      if (primeiraVez) {
        this.enquadrar();
        primeiraVez = false;
      }
      controles.target.copy(centro);
      controles.update();
    },
    // câmera de frente, um pouco de cima, com a peça inteira na tela
    enquadrar() {
      vendoBase = false;
      grade.visible = gradeAtiva;
      luzFundo.visible = false;
      // distância para a peça caber na tela, na largura e na altura (campo de visão vertical de 35°)
      const tangente = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const pelaLargura = Math.max(tamanho.x, 10) / 2 / tangente / Math.max(camera.aspect, 0.6);
      const pelaAltura = Math.max(tamanho.y, tamanho.z, 10) / 2 / tangente;
      const distancia = Math.max(pelaLargura, pelaAltura * 1.15) * 1.25;
      camera.position.set(centro.x - distancia * 0.1, centro.y - distancia * (opcoes.frente ? 0.94 : 0.75), centro.z + distancia * (opcoes.frente ? 0.30 : 0.65));
      controles.target.copy(centro);
      controles.update();
      distanciaInicial = camera.position.distanceTo(controles.target);
    },
    verBase() {
      const fundo = centro.z - tamanho.z / 2;
      const distancia = Math.max(tamanho.x, tamanho.y, 10) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.2 / Math.min(camera.aspect, 1);
      vendoBase = true;
      grade.visible = false;
      luzFundo.visible = true;
      luzFundo.position.set(centro.x - 40, centro.y - 40, fundo - 160);
      controles.target.set(centro.x, centro.y, fundo);
      camera.position.set(centro.x, centro.y + distancia * 0.01, fundo - distancia);
      controles.update();
    },
    // fator < 1 aproxima, > 1 afasta
    zoom(fator) {
      const d = camera.position.clone().sub(controles.target).multiplyScalar(fator);
      camera.position.copy(controles.target).add(d);
      controles.update();
    },
    // quanto de zoom (1 = enquadrado)
    nivel: () => (malhas.length ? distanciaInicial / Math.max(1e-6, camera.position.distanceTo(controles.target)) : 1),
    // Pintura sobre a peça: o botão esquerdo fica livre (pinta) e o direito gira.
    modoPintura(sim) {
      Object.assign(controles.mouseButtons, sim ? { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } : BOTOES);
    },
    // ponto da peça sob o mouse (clientX/Y), em coordenadas da cena; null fora da peça
    pontoNaPeca(clientX, clientY) {
      const r = renderizador.domElement.getBoundingClientRect();
      if (!r.width || !malhas.length) return null;
      raio.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
      const acerto = raio.intersectObjects(malhas, false)[0];
      return acerto ? [acerto.point.x, acerto.point.y, acerto.point.z] : null;
    },
    // ponto da cena → px (CSS) dentro do quadro da prévia
    paraTela([x, y, z]) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return [((v.x + 1) / 2) * container.clientWidth, ((1 - v.y) / 2) * container.clientHeight];
    },
    // mm da cena por px (CSS) da tela, perto de um ponto
    mmPorPixel(ponto) {
      const a = this.paraTela(ponto);
      const dir = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); // direita da câmera
      const b = this.paraTela([ponto[0] + dir.x, ponto[1] + dir.y, ponto[2] + dir.z]);
      return 1 / Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
    },
    // Peças a mais por cima da principal (ex.: logos no copo), sem mexer no enquadramento.
    // lista: [{ id, cor, posicoes (Float32Array, triângulos soltos) }]
    extras(lista) {
      for (const m of extras) {
        cena.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
      extras = lista.map((e) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(e.posicoes, 3));
        g.computeVertexNormals();
        const malha = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.5, metalness: 0.05, emissive: 0x000000 }));
        malha.userData.id = e.id;
        cena.add(malha);
        return malha;
      });
    },
    // id da peça a mais sob o mouse (ou null)
    extraNoPonto(clientX, clientY) {
      const r = renderizador.domElement.getBoundingClientRect();
      if (!r.width || !extras.length) return null;
      raio.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
      return raio.intersectObjects(extras, false)[0]?.object.userData.id ?? null;
    },
    // realça as peças a mais de um id (as outras ficam normais)
    realcarExtra(id) {
      for (const m of extras) m.material.emissive.setHex(m.userData.id === id && id !== null ? 0x1d3d7a : 0x000000);
    },
    // gira as peças a mais de um id em volta de um eixo vertical (centro [x, y]) e sobe dz (arrastar)
    moverExtra(id, angulo, dz, [cx, cy]) {
      const c = Math.cos(angulo);
      const s = Math.sin(angulo);
      for (const m of extras) {
        if (m.userData.id !== id) continue;
        m.rotation.z = angulo;
        m.position.set(cx - (c * cx - s * cy), cy - (s * cx + c * cy), dz);
      }
    },
    // trava o giro da câmera (enquanto arrasta algo na peça)
    travarGiro(sim) {
      controles.enabled = !sim;
    },
    aoMudarVista: null,
  };
  controles.addEventListener("change", () => api.aoMudarVista?.());
  return api;
}

// Linhas e rótulos das cotas. Os rótulos são elementos da página por cima do canvas, reposicionados a
// cada quadro (o texto fica sempre legível, de frente para a tela).
function criarCotas(cena, container) {
  const linhas = {};
  const rotulos = {};
  let atual = null;
  for (const [eixo, cor] of [["x", 0xe5484d], ["y", 0x30a46c]]) {
    const linha = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: cor, depthTest: false }));
    linha.renderOrder = 10;
    linha.visible = false;
    cena.add(linha);
    linhas[eixo] = linha;
    const r = document.createElement("span");
    r.className = `previa-cota previa-cota-${eixo}`;
    r.hidden = true;
    container.append(r);
    rotulos[eixo] = r;
  }
  return {
    mostrar(novas) {
      atual = novas;
      for (const eixo of ["x", "y"]) {
        const { de, ate, valor } = novas[eixo];
        // linha da medida e dois tracinhos nas pontas (perpendiculares, 4 mm)
        const n = eixo === "x" ? [0, 2, 0] : [2, 0, 0];
        const pts = [de, ate, [de[0] - n[0], de[1] - n[1], 0], [de[0] + n[0], de[1] + n[1], 0], [ate[0] - n[0], ate[1] - n[1], 0], [ate[0] + n[0], ate[1] + n[1], 0]];
        linhas[eixo].geometry.setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
        linhas[eixo].visible = true;
        rotulos[eixo].textContent = valor;
        rotulos[eixo].hidden = false;
      }
    },
    posicionar(camera, canvas) {
      if (!atual) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      for (const eixo of ["x", "y"]) {
        const { de, ate } = atual[eixo];
        const meio = new THREE.Vector3((de[0] + ate[0]) / 2 + (eixo === "y" ? 6 : 0), (de[1] + ate[1]) / 2 - (eixo === "x" ? 6 : 0), 0).project(camera);
        const r = rotulos[eixo];
        r.hidden = meio.z > 1;
        r.style.transform = `translate(${((meio.x + 1) / 2) * w}px, ${((1 - meio.y) / 2) * h}px) translate(-50%, -50%)`;
      }
    },
  };
}
