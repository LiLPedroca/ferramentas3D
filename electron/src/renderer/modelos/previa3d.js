// Pré-visualização 3D reutilizável: mostra as partes de um modelo, cada uma com sua cor.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function criarPrevia(container) {
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

  const grade = new THREE.GridHelper(300, 30, 0x4a5570, 0x2a3142);
  grade.rotation.x = Math.PI / 2;
  grade.material.transparent = true;
  grade.material.opacity = 0.45;
  cena.add(grade);

  const controles = new OrbitControls(camera, renderizador.domElement);
  controles.enableDamping = true;

  let malhas = [];
  let primeiraVez = true;

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
    // partes: [{ cor, geometria }]
    mostrar(partes) {
      for (const m of malhas) {
        cena.remove(m);
        m.material.dispose();
      }
      malhas = partes.map((p) => {
        const material = new THREE.MeshStandardMaterial({ color: p.cor, roughness: 0.5, metalness: 0.05 });
        const malha = new THREE.Mesh(p.geometria, material);
        cena.add(malha);
        return malha;
      });
      const caixa = new THREE.Box3();
      malhas.forEach((m) => caixa.expandByObject(m));
      const centro = caixa.getCenter(new THREE.Vector3());
      const tamanho = caixa.getSize(new THREE.Vector3());
      grade.position.set(centro.x, centro.y, 0);
      if (primeiraVez) {
        const alcance = Math.max(tamanho.x, tamanho.y, 10);
        camera.position.set(centro.x - alcance * 0.15, centro.y - alcance * 1.1, alcance * 0.95);
        primeiraVez = false;
      }
      controles.target.copy(centro);
      controles.update();
    },
  };
}
