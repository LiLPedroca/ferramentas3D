// Motor de geometria Manifold (WASM, licença Apache 2.0): união, diferença e contorno de verdade.
// Na tela, os bytes do .wasm vêm do processo principal (o file:// não deixa o WASM ser baixado).
import Module from "manifold-3d";

let motor = null;

// opcoes: { wasmBinary } na tela; nos testes (Node) o próprio pacote acha o arquivo.
export function carregarManifold(opcoes = {}) {
  motor ??= (async () => {
    const extra = opcoes.wasmBinary ? { wasmBinary: opcoes.wasmBinary, locateFile: () => "manifold.wasm" } : {};
    const M = await Module(extra);
    M.setup();
    return M;
  })().catch((erro) => {
    motor = null;
    throw erro;
  });
  return motor;
}

// Executa "trabalho" liberando no fim todos os objetos do WASM criados com guardar().
export function comEscopo(M, trabalho) {
  const criados = [];
  const guardar = (x) => (criados.push(x), x);
  try {
    return trabalho(guardar);
  } finally {
    for (let i = criados.length - 1; i >= 0; i--) criados[i].delete();
  }
}

// Malha do Manifold → { vertices: Float32Array, triangulos: Uint32Array }.
export function malhaDoSolido(solido, nome) {
  if (solido.status() !== "NoError" || solido.volume() <= 0) throw new Error(`Não foi possível validar a peça (${nome}).`);
  const m = solido.getMesh();
  const n = m.vertProperties.length / m.numProp;
  const vertices = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    vertices[i * 3] = m.vertProperties[i * m.numProp];
    vertices[i * 3 + 1] = m.vertProperties[i * m.numProp + 1];
    vertices[i * 3 + 2] = m.vertProperties[i * m.numProp + 2];
  }
  return { vertices, triangulos: Uint32Array.from(m.triVerts) };
}

export const areaComSinal = (laco) => {
  let s = 0;
  for (let i = 0; i < laco.length; i++) {
    const p = laco[i];
    const q = laco[(i + 1) % laco.length];
    s += p[0] * q[1] - p[1] * q[0];
  }
  return s / 2;
};

// Maior laço externo de uma seção, no sentido anti-horário (normal para fora = (dy, -dx)).
export function contornoExterno(secao) {
  const lacos = secao.toPolygons().sort((a, b) => Math.abs(areaComSinal(b)) - Math.abs(areaComSinal(a)));
  const externo = lacos[0].map((p) => [p[0], p[1]]);
  if (areaComSinal(externo) < 0) externo.reverse();
  return externo;
}

const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Posição t (0 a 1, pelo comprimento) do ponto do laço mais perto de p.
export function maisPertoNoLaco(laco, p) {
  const comprimentos = laco.map((a, i) => distancia(a, laco[(i + 1) % laco.length]));
  const perimetro = comprimentos.reduce((s, x) => s + x, 0);
  let melhor = null;
  let percorrido = 0;
  laco.forEach((a, i) => {
    const b = laco[(i + 1) % laco.length];
    const c = comprimentos[i];
    if (c > 0) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (c * c)));
      const q = [a[0] + t * dx, a[1] + t * dy];
      const d = distancia(q, p);
      if (!melhor || d < melhor.distancia) melhor = { ponto: q, distancia: d, t: (percorrido + t * c) / perimetro };
    }
    percorrido += c;
  });
  return melhor;
}

// Ponto e normal (para fora) na posição t do laço anti-horário.
export function pontoNoLaco(laco, t) {
  const comprimentos = laco.map((a, i) => distancia(a, laco[(i + 1) % laco.length]));
  const perimetro = comprimentos.reduce((s, x) => s + x, 0);
  let resta = (((t % 1) + 1) % 1) * perimetro;
  for (let i = 0; i < laco.length; i++) {
    const c = comprimentos[i];
    if (c > 0 && resta <= c) {
      const a = laco[i];
      const b = laco[(i + 1) % laco.length];
      return { ponto: [a[0] + ((b[0] - a[0]) * resta) / c, a[1] + ((b[1] - a[1]) * resta) / c], normal: [(b[1] - a[1]) / c, -(b[0] - a[0]) / c] };
    }
    resta -= c;
  }
  const a = laco[0];
  const b = laco[1];
  const c = distancia(a, b) || 1;
  return { ponto: a, normal: [(b[1] - a[1]) / c, -(b[0] - a[0]) / c] };
}

// Liga partes soltas de uma seção com pontes arredondadas (o menor caminho entre elas).
export function unirIlhas(M, guardar, secao, larguraPonte, maxPassadas = 60) {
  const C = M.CrossSection;
  for (let passada = 0; passada < maxPassadas; passada++) {
    const partes = secao.decompose().map(guardar);
    if (partes.length <= 1) return secao;
    if (partes.length > 100) throw new Error("Há muitas partes soltas. Simplifique o desenho.");
    const pontos = partes.map((p) => {
      const todos = p.toPolygons().flat();
      const passo = Math.max(1, Math.ceil(todos.length / 150));
      return todos.filter((_, i) => i % passo === 0);
    });
    let melhor = null;
    for (let i = 1; i < pontos.length; i++) {
      for (const a of pontos[0]) {
        for (const b of pontos[i]) {
          const d = distancia(a, b);
          if (!melhor || d < melhor.d) melhor = { a, b, d };
        }
      }
    }
    const r = larguraPonte / 2;
    const ponte = guardar(C.hull([guardar(C.circle(r, 32).translate(melhor.a)), guardar(C.circle(r, 32).translate(melhor.b))]));
    secao = guardar(secao.add(ponte));
  }
  throw new Error("Não foi possível unir a base. Use Cápsula ou Retangular.");
}
