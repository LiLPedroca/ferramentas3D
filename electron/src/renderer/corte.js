// Corte (plano de seção): esconde parte da peça para ver o lado de dentro (parede, fundo, furos).
// Usa o recorte do próprio Three.js (clippingPlanes). As faces de trás que ficam à mostra no corte
// são pintadas de laranja liso, o que parece o "recheio" da peça cortada.
// Direções (coordenadas do Three.js, Y para cima):
//   altura: some o que está acima do corte (vista de cima mostra a camada)
//   frente: some a parte da frente (Z+), para olhar pela vista de frente
//   lado:   some a parte da direita (X+), para olhar pela vista de lado
import * as THREE from "three";

export const COR_CORTE = 0xff8a3d;

const DIRECOES = {
  altura: { eixo: "y", normal: new THREE.Vector3(0, -1, 0) },
  frente: { eixo: "z", normal: new THREE.Vector3(0, 0, -1) },
  lado: { eixo: "x", normal: new THREE.Vector3(-1, 0, 0) },
};

// Posição do corte no eixo: fracao 0 = começo da peça, 1 = fim. Devolve { valor, desdeInicio }.
export function posicaoDoCorte(min, max, fracao) {
  const f = Math.min(Math.max(fracao, 0), 1);
  const valor = min + (max - min) * f;
  return { valor, desdeInicio: valor - min };
}

export function criarCorte({ cena, renderizador, peca }) {
  renderizador.localClippingEnabled = true;
  const plano = new THREE.Plane(DIRECOES.altura.normal.clone(), 0);
  const tampas = new THREE.Group();
  tampas.matrixAutoUpdate = false;
  tampas.visible = false;
  cena.add(tampas);
  // polygonOffset: o fundo cortado fica na mesma altura da grade da mesa e não pode piscar com ela
  const materialTampa = new THREE.MeshBasicMaterial({
    color: COR_CORTE,
    side: THREE.BackSide,
    clippingPlanes: [plano],
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const estado = { ligado: false, direcao: "altura", fracao: 0.5, faixa: null };

  // As tampas usam as mesmas geometrias da peça; refaz quando a peça muda de arquivo.
  function sincronizar() {
    const malhas = peca.children;
    const iguais = tampas.children.length === malhas.length && tampas.children.every((t, i) => t.geometry === malhas[i].geometry);
    if (!iguais) {
      tampas.clear();
      for (const m of malhas) tampas.add(new THREE.Mesh(m.geometry, materialTampa));
    }
    for (const m of malhas) {
      const planos = estado.ligado ? [plano] : null;
      if (m.material.clippingPlanes !== planos) m.material.clippingPlanes = planos;
    }
  }

  // Recalcula o plano pelo tamanho atual da peça (depois de girar, mover ou escalar).
  function atualizar() {
    sincronizar();
    tampas.visible = estado.ligado && peca.children.length > 0;
    if (!estado.ligado || !peca.children.length) {
      estado.faixa = null;
      return null;
    }
    peca.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(peca);
    const { eixo, normal } = DIRECOES[estado.direcao];
    const { valor, desdeInicio } = posicaoDoCorte(caixa.min[eixo], caixa.max[eixo], estado.fracao);
    // distancia(p) = normal·p + constante ≥ 0 fica visível; normal aponta para o lado que fica
    plano.normal.copy(normal);
    plano.constant = valor;
    estado.faixa = { valor, desdeInicio, total: caixa.max[eixo] - caixa.min[eixo] };
    return estado.faixa;
  }

  return {
    ligado: () => estado.ligado,
    direcao: () => estado.direcao,
    fracao: () => estado.fracao,
    ligar(sim) {
      estado.ligado = Boolean(sim);
      return atualizar();
    },
    definir({ direcao, fracao }) {
      if (direcao && DIRECOES[direcao]) estado.direcao = direcao;
      if (Number.isFinite(fracao)) estado.fracao = Math.min(Math.max(fracao, 0), 1);
      return atualizar();
    },
    atualizar,
    // Um ponto (no mundo) está na parte que aparece?
    visivel: (ponto) => !estado.ligado || plano.distanceToPoint(ponto) >= -1e-6,
    quadro() {
      if (!tampas.visible) return;
      peca.updateMatrixWorld();
      tampas.matrix.copy(peca.matrixWorld);
      tampas.matrixWorldNeedsUpdate = true;
    },
  };
}
