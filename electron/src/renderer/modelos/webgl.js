// Cria o desenhista 3D (WebGL). Em alguns computadores (driver de vídeo antigo, acesso remoto, máquina virtual)
// o WebGL não liga: o processo principal já pede o modo por software (SwiftShader), e se nem assim der,
// a tela mostra um aviso em português e o resto da ferramenta continua funcionando.
import * as THREE from "three";

export const SEM_3D = "O 3D não pôde ser ligado neste computador. Atualize o driver da placa de vídeo.";

export function criarRenderizador() {
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    return r;
  } catch {
    return null;
  }
}

export function mostrarSem3d(container) {
  if (container.querySelector(".sem-3d")) return;
  const aviso = document.createElement("p");
  aviso.className = "sem-3d";
  aviso.textContent = SEM_3D;
  container.append(aviso);
}
