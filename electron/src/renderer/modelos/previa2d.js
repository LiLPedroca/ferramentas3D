// Prévia 2D de chaveiros, vista de cima: camadas coloridas e a argola arrastável pela borda.
// modelo: { camadas: [{ lacos, cor }], perimetro, argola: { t, centro, raio, afastamento }, caixa: { min, max } }
import { maisPertoNoLaco, pontoNoLaco } from "./manifold.js";

export function criarPrevia2d(canvas, { aoComecar, aoSoltar } = {}) {
  let modelo = null;
  let ativa = true;
  let zoom = 1;
  let arrasto = null; // { t, centro }

  function transformacao() {
    const { min, max } = modelo.caixa;
    const margem = 18;
    const escala = Math.min(canvas.width / (max[0] - min[0] + margem), canvas.height / (max[1] - min[1] + margem)) * zoom;
    const cx = (min[0] + max[0]) / 2;
    const cy = (min[1] + max[1]) / 2;
    return {
      escala,
      paraTela: ([x, y]) => [canvas.width / 2 + (x - cx) * escala, canvas.height / 2 - (y - cy) * escala],
      paraModelo: (px, py) => [cx + (px - canvas.width / 2) / escala, cy - (py - canvas.height / 2) / escala],
    };
  }

  function caminho(ctx, lacos, paraTela) {
    ctx.beginPath();
    for (const laco of lacos) {
      laco.forEach((p, i) => {
        const [x, y] = paraTela(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }

  function centroDaArgola(t) {
    const { ponto, normal } = pontoNoLaco(modelo.perimetro, t);
    const d = modelo.argola.afastamento;
    return [ponto[0] + normal[0] * d, ponto[1] + normal[1] * d];
  }

  function desenhar() {
    const ctx = canvas.getContext("2d");
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (r.width && (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr))) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!modelo || !ativa) return;
    const { paraTela, escala } = transformacao();
    modelo.camadas.forEach((camada, i) => {
      ctx.fillStyle = camada.cor;
      caminho(ctx, camada.lacos, paraTela);
      ctx.fill(i === 0 ? "evenodd" : "nonzero");
      if (i === 0) {
        ctx.strokeStyle = "rgba(127,127,127,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
    if (!modelo.argola) return; // peça sem argola (Palavras decorativas)
    const centro = arrasto ? arrasto.centro : modelo.argola.centro;
    const [x, y] = paraTela(centro);
    ctx.setLineDash([6 * dpr, 5 * dpr]);
    ctx.strokeStyle = "#5b8def";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(x, y, (modelo.argola.raio + 1.2) * escala, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (arrasto) {
      ctx.fillStyle = "rgba(91,141,239,0.25)";
      ctx.beginPath();
      ctx.arc(x, y, modelo.argola.raio * escala, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function pontoDoEvento(e) {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    return transformacao().paraModelo((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
  }

  function sobreArgola(p) {
    if (!modelo.argola) return false;
    const [cx, cy] = modelo.argola.centro;
    return Math.hypot(p[0] - cx, p[1] - cy) <= modelo.argola.raio * 1.6 + 1;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!modelo || !ativa || !sobreArgola(pontoDoEvento(e))) return;
    canvas.setPointerCapture?.(e.pointerId);
    arrasto = { t: modelo.argola.t, centro: modelo.argola.centro };
    aoComecar?.();
    desenhar();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!modelo || !ativa) return;
    const p = pontoDoEvento(e);
    if (!arrasto) {
      canvas.style.cursor = sobreArgola(p) ? "grab" : "";
      return;
    }
    canvas.style.cursor = "grabbing";
    const t = maisPertoNoLaco(modelo.perimetro, p).t;
    arrasto = { t, centro: centroDaArgola(t) };
    desenhar();
  });
  const soltar = (e, cancelar) => {
    if (!arrasto) return;
    const { t } = arrasto;
    arrasto = null;
    canvas.style.cursor = "";
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    desenhar();
    if (!cancelar) aoSoltar?.(Math.round(t * 1e5) / 1e5);
  };
  canvas.addEventListener("pointerup", (e) => soltar(e, false));
  canvas.addEventListener("pointercancel", (e) => soltar(e, true));
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!ativa || !modelo) return;
      e.preventDefault();
      api.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);
    },
    { passive: false },
  );
  new ResizeObserver(desenhar).observe(canvas);

  const api = {
    mostrar(novo) {
      modelo = novo;
      desenhar();
    },
    ativar(sim) {
      ativa = sim;
      canvas.hidden = !sim;
      desenhar();
    },
    // fator < 1 aproxima, > 1 afasta (mesmo sentido da prévia 3D)
    zoom(fator) {
      zoom = Math.min(8, Math.max(0.3, zoom / fator));
      desenhar();
    },
    ajustar() {
      zoom = 1;
      desenhar();
    },
  };
  return api;
}
