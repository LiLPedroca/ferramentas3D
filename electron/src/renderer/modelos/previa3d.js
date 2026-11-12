// Pré-visualização 3D reutilizável: mostra as partes de um modelo, cada uma com sua cor.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function criarPrevia(container, opcoes = {}) {
  const renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderizador.setClearColor(0x000000, 0);
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderizador.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.up.set(0, 0, 1); // Z para cima, como nos fatiadores
  cena.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.2));
  const luz = new THREE.DirectionalLight(0xffffff, 1.5);
  luz.position.set(-60, -80, 160);
  cena.add(luz);
  const luzFundo = new THREE.DirectionalLight(0xffffff, 1.3);
  luzFundo.visible = false;
  cena.add(luzFundo);

  const grade = new THREE.GridHelper(300, 30, 0x4d4d4d, 0x2b2b2b);
  grade.rotation.x = Math.PI / 2;
  grade.material.transparent = true;
  grade.material.opacity = opcoes.gradeSuave ? 0.18 : 0.45;
  cena.add(grade);

  const controles = new OrbitControls(camera, renderizador.domElement);
  controles.enableDamping = true;

  let malhas = [];
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
    requestAnimationFrame(animar);
  };
  animar();

  return {
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
  };
}
