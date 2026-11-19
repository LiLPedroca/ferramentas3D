// Prévia 2D de chaveiros, vista de cima: camadas coloridas e a argola arrastável pela borda.
// modelo: { camadas: [{ lacos, cor }], perimetro, argola: { t, centro, raio, afastamento }, caixa: { min, max } }
// Com várias argolas: modelo.argolas = [argola, ...] (cada uma arrastável; aoSoltar(t, indice)).
// Com modelo.simbolo ({ caixa: { min, max } }), o símbolo também pode ser arrastado (aoSoltarSimbolo recebe o deslocamento em mm).
// Com modelo.alcas ([{ id, caixa, largura }]) e aoRedimensionar, cada peça ganha alças nos cantos: puxar
// muda o tamanho proporcionalmente e, ao soltar, aoRedimensionar(id, novaLargura) recebe a largura em mm.
// modelo.rotulos ([{ texto, ponto }]) escreve textos na prévia; modelo.clicavel + aoClicarItem(id): clique numa peça.
// camada.regra ("evenodd" | "nonzero") escolhe como preencher (padrão: 1ª camada evenodd).
import { maisPertoNoLaco, pontoNoLaco } from "./manifold.js";

// Miniatura PNG (para Meus modelos): as camadas vistas de cima, centralizadas, fundo transparente.
export function miniatura(modelo, largura = 320, altura = 200) {
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  const ctx = c.getContext("2d");
  const { min, max } = modelo.caixa;
  const margem = 10;
  const escala = Math.min((largura - 2 * margem) / (max[0] - min[0]), (altura - 2 * margem) / (max[1] - min[1]));
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  modelo.camadas.forEach((camada, i) => {
    ctx.beginPath();
    for (const laco of camada.lacos) {
      laco.forEach(([x, y], k) => {
        const px = largura / 2 + (x - cx) * escala;
        const py = altura / 2 - (y - cy) * escala;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
    ctx.fillStyle = camada.cor;
    ctx.fill(i === 0 ? "evenodd" : "nonzero");
    if (i === 0) {
      ctx.strokeStyle = "rgba(127,127,127,0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
  return c.toDataURL("image/png");
}

export function criarPrevia2d(canvas, { aoComecar, aoSoltar, aoComecarSimbolo, aoSoltarSimbolo, aoRedimensionar, aoClicarItem } = {}) {
  let modelo = null;
  let ativa = true;
  let zoom = 1;
  let desvio = [0, 0]; // arrasto da vista (px do canvas)
  let panorama = null; // { x, y, desvio } enquanto arrasta a vista (botão direito ou do meio)
  let arrasto = null; // { t, centro }
  let arrastoSimbolo = null; // { inicio: [x, y], atual: [x, y] } em mm
  let destaque = null; // id da camada contornada (parte escolhida no 2D para 3D)
  let arrastoTamanho = null; // { alca, ancora, canto, fator } enquanto puxa uma alça
  let clique = null; // { id, x, y } clique numa peça (visão com várias peças)

  function transformacao() {
    const { min, max } = modelo.caixa;
    const margem = 18;
    const escala = Math.min(canvas.width / (max[0] - min[0] + margem), canvas.height / (max[1] - min[1] + margem)) * zoom;
    const cx = (min[0] + max[0]) / 2;
    const cy = (min[1] + max[1]) / 2;
    return {
      escala,
      paraTela: ([x, y]) => [canvas.width / 2 + desvio[0] + (x - cx) * escala, canvas.height / 2 + desvio[1] - (y - cy) * escala],
      paraModelo: (px, py) => [cx + (px - canvas.width / 2 - desvio[0]) / escala, cy - (py - canvas.height / 2 - desvio[1]) / escala],
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

  const argolasDoModelo = () => modelo?.argolas ?? (modelo?.argola ? [modelo.argola] : []);

  function centroDaArgola(t, argola) {
    const { ponto, normal } = pontoNoLaco(modelo.perimetro, t);
    const d = argola.afastamento;
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
      const regra = camada.regra ?? (i === 0 ? "evenodd" : "nonzero");
      ctx.fill(regra);
      if (regra === "evenodd") {
        ctx.strokeStyle = "rgba(127,127,127,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
    const escolhida = destaque === null ? null : modelo.camadas.find((c) => c.id === destaque);
    if (escolhida) {
      caminho(ctx, escolhida.lacos, paraTela);
      ctx.save();
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    // símbolo arrastável: moldura tracejada (e a posição nova enquanto arrasta)
    if (modelo.simbolo && aoSoltarSimbolo) {
      const { min, max } = modelo.simbolo.caixa;
      const d = arrastoSimbolo ? [arrastoSimbolo.atual[0] - arrastoSimbolo.inicio[0], arrastoSimbolo.atual[1] - arrastoSimbolo.inicio[1]] : [0, 0];
      const [x1, y1] = paraTela([min[0] + d[0], max[1] + d[1]]);
      const [x2, y2] = paraTela([max[0] + d[0], min[1] + d[1]]);
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.strokeStyle = "#e8a93a";
      ctx.lineWidth = 1.6 * dpr;
      ctx.strokeRect(x1 - 3 * dpr, y1 - 3 * dpr, x2 - x1 + 6 * dpr, y2 - y1 + 6 * dpr);
      ctx.setLineDash([]);
      if (arrastoSimbolo) {
        ctx.fillStyle = "rgba(232,169,58,0.18)";
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
    // nomes e medidas embaixo de cada peça
    if (modelo.rotulos?.length) {
      ctx.fillStyle = "rgba(170,170,170,0.95)";
      ctx.font = `${12 * dpr}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const r of modelo.rotulos) {
        const [x, y] = paraTela(r.ponto);
        ctx.fillText(r.texto, x, y);
      }
    }
    // alças de tamanho nos cantos (e o novo tamanho enquanto puxa)
    if (aoRedimensionar && modelo.alcas?.length) {
      for (const alca of modelo.alcas) {
        if (arrastoTamanho?.alca === alca) continue;
        for (const canto of cantosDe(alca.caixa)) {
          const [x, y] = paraTela(canto);
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#5b8def";
          ctx.lineWidth = 1.5 * dpr;
          ctx.fillRect(x - 4 * dpr, y - 4 * dpr, 8 * dpr, 8 * dpr);
          ctx.strokeRect(x - 4 * dpr, y - 4 * dpr, 8 * dpr, 8 * dpr);
        }
      }
      if (arrastoTamanho) {
        const { ancora, canto, fator, alca } = arrastoTamanho;
        const fim = [ancora[0] + (canto[0] - ancora[0]) * fator, ancora[1] + (canto[1] - ancora[1]) * fator];
        const [x1, y1] = paraTela(ancora);
        const [x2, y2] = paraTela(fim);
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.strokeStyle = "#5b8def";
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(91,141,239,0.12)";
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.font = `600 ${13 * dpr}px "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "#5b8def";
        ctx.fillText(`${(alca.largura * fator).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`, x2, y2 - 8 * dpr);
      }
    }
    // argolas (peça sem argola: Palavras decorativas)
    argolasDoModelo().forEach((argola, i) => {
      const arrastando = arrasto?.indice === i;
      const [x, y] = paraTela(arrastando ? arrasto.centro : argola.centro);
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.strokeStyle = "#5b8def";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, (argola.raio + 1.2) * escala, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (arrastando) {
        ctx.fillStyle = "rgba(91,141,239,0.25)";
        ctx.beginPath();
        ctx.arc(x, y, argola.raio * escala, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function pontoDoEvento(e) {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    return transformacao().paraModelo((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
  }

  // Índice da argola sob o ponto, ou -1.
  function argolaSob(p) {
    return argolasDoModelo().findIndex((a) => Math.hypot(p[0] - a.centro[0], p[1] - a.centro[1]) <= a.raio * 1.6 + 1);
  }
  const sobreArgola = (p) => argolaSob(p) >= 0;

  // Cantos de uma caixa: [min-min, max-min, max-max, min-max]
  function cantosDe({ min, max }) {
    return [min, [max[0], min[1]], max, [min[0], max[1]]];
  }

  // Alça sob o ponto do canvas (px): { alca, canto, ancora } ou null.
  function alcaSob(px, py) {
    if (!aoRedimensionar || !modelo.alcas?.length) return null;
    const { paraTela } = transformacao();
    const dpr = window.devicePixelRatio || 1;
    for (const alca of modelo.alcas) {
      const cantos = cantosDe(alca.caixa);
      for (let k = 0; k < 4; k++) {
        const [x, y] = paraTela(cantos[k]);
        if (Math.abs(px - x) <= 9 * dpr && Math.abs(py - y) <= 9 * dpr) return { alca, canto: cantos[k], ancora: cantos[(k + 2) % 4] };
      }
    }
    return null;
  }

  // Peça (da visão com várias) sob o ponto, em mm.
  function itemSob(p) {
    if (!modelo.clicavel || !aoClicarItem) return null;
    return (modelo.alcas ?? []).find(({ caixa: { min, max } }) => p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1]) ?? null;
  }

  function sobreSimbolo(p) {
    if (!modelo.simbolo || !aoSoltarSimbolo) return false;
    const { min, max } = modelo.simbolo.caixa;
    return p[0] >= min[0] - 1 && p[0] <= max[0] + 1 && p[1] >= min[1] - 1 && p[1] <= max[1] + 1;
  }

  const noCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
  };
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    if (!modelo || !ativa) return;
    // botão direito ou do meio: arrasta a vista
    if (e.button === 1 || e.button === 2) {
      canvas.setPointerCapture?.(e.pointerId);
      const [x, y] = noCanvas(e);
      panorama = { x, y, desvio: desvio.slice() };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0) return;
    const [cx0, cy0] = noCanvas(e);
    const alca = alcaSob(cx0, cy0);
    if (alca) {
      canvas.setPointerCapture?.(e.pointerId);
      arrastoTamanho = { ...alca, fator: 1 };
      desenhar();
      return;
    }
    const p = pontoDoEvento(e);
    const item = argolaSob(p) < 0 && !sobreSimbolo(p) ? itemSob(p) : null;
    if (item) {
      clique = { id: item.id, x: cx0, y: cy0 };
      return;
    }
    if (!sobreArgola(p) && sobreSimbolo(p)) {
      canvas.setPointerCapture?.(e.pointerId);
      arrastoSimbolo = { inicio: p, atual: p };
      aoComecarSimbolo?.();
      desenhar();
      return;
    }
    const indice = argolaSob(p);
    if (indice < 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    const argola = argolasDoModelo()[indice];
    arrasto = { indice, t: argola.t, centro: argola.centro };
    aoComecar?.();
    desenhar();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!modelo || !ativa) return;
    if (panorama) {
      const [x, y] = noCanvas(e);
      desvio = [panorama.desvio[0] + x - panorama.x, panorama.desvio[1] + y - panorama.y];
      desenhar();
      api.aoMudarVista?.();
      return;
    }
    const p = pontoDoEvento(e);
    if (arrastoTamanho) {
      const { ancora, canto } = arrastoTamanho;
      const v0 = [canto[0] - ancora[0], canto[1] - ancora[1]];
      const v = [p[0] - ancora[0], p[1] - ancora[1]];
      const fator = (v[0] * v0[0] + v[1] * v0[1]) / (v0[0] * v0[0] + v0[1] * v0[1]);
      arrastoTamanho = { ...arrastoTamanho, fator: Math.min(4, Math.max(0.2, fator)) };
      canvas.style.cursor = "nwse-resize";
      desenhar();
      return;
    }
    if (arrastoSimbolo) {
      canvas.style.cursor = "grabbing";
      arrastoSimbolo = { ...arrastoSimbolo, atual: p };
      desenhar();
      return;
    }
    if (!arrasto) {
      const [cx1, cy1] = noCanvas(e);
      canvas.style.cursor = alcaSob(cx1, cy1) ? "nwse-resize" : sobreArgola(p) || sobreSimbolo(p) ? "grab" : itemSob(p) ? "pointer" : "";
      return;
    }
    canvas.style.cursor = "grabbing";
    const t = maisPertoNoLaco(modelo.perimetro, p).t;
    arrasto = { ...arrasto, t, centro: centroDaArgola(t, argolasDoModelo()[arrasto.indice]) };
    desenhar();
  });
  const soltar = (e, cancelar) => {
    if (panorama) {
      panorama = null;
      canvas.style.cursor = "";
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      return;
    }
    if (arrastoTamanho) {
      const { alca, fator } = arrastoTamanho;
      arrastoTamanho = null;
      canvas.style.cursor = "";
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      desenhar();
      if (!cancelar && Math.abs(fator - 1) > 0.01) aoRedimensionar(alca.id, Math.round(alca.largura * fator * 10) / 10);
      return;
    }
    if (clique) {
      const [x, y] = noCanvas(e);
      const { id, x: x0, y: y0 } = clique;
      clique = null;
      if (!cancelar && Math.hypot(x - x0, y - y0) < 6) aoClicarItem(id);
      return;
    }
    if (arrastoSimbolo) {
      const { inicio, atual } = arrastoSimbolo;
      arrastoSimbolo = null;
      canvas.style.cursor = "";
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      desenhar();
      const d = [atual[0] - inicio[0], atual[1] - inicio[1]];
      if (!cancelar && Math.hypot(d[0], d[1]) > 0.2) aoSoltarSimbolo(d);
      return;
    }
    if (!arrasto) return;
    const { t, indice } = arrasto;
    arrasto = null;
    canvas.style.cursor = "";
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    desenhar();
    if (!cancelar) aoSoltar?.(Math.round(t * 1e5) / 1e5, indice);
  };
  canvas.addEventListener("pointerup", (e) => soltar(e, false));
  canvas.addEventListener("pointercancel", (e) => soltar(e, true));
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!ativa || !modelo) return;
      e.preventDefault();
      api.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, noCanvas(e));
    },
    { passive: false },
  );
  new ResizeObserver(desenhar).observe(canvas);

  const api = {
    mostrar(novo) {
      modelo = novo;
      desenhar();
    },
    // contorna a camada com esse id (null tira o contorno)
    destacar(id) {
      destaque = id ?? null;
      desenhar();
    },
    ativar(sim) {
      ativa = sim;
      canvas.hidden = !sim;
      desenhar();
    },
    // fator < 1 aproxima, > 1 afasta (mesmo sentido da prévia 3D). foco: ponto do canvas que fica parado.
    zoom(fator, foco = null) {
      const novo = Math.min(16, Math.max(0.3, zoom / fator));
      if (modelo && foco) {
        const antes = transformacao().paraModelo(foco[0], foco[1]);
        zoom = novo;
        const depois = transformacao().paraTela(antes);
        desvio = [desvio[0] + foco[0] - depois[0], desvio[1] + foco[1] - depois[1]];
      } else zoom = novo;
      desenhar();
      api.aoMudarVista?.();
    },
    ajustar() {
      zoom = 1;
      desvio = [0, 0];
      desenhar();
      api.aoMudarVista?.();
    },
    // quanto de zoom (1 = peça inteira na tela)
    nivel: () => zoom,
    // ponto da tela (clientX/Y) → mm da peça, e mm → ponto do canvas (px do canvas)
    paraModelo(clientX, clientY) {
      if (!modelo) return null;
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / r.width;
      return transformacao().paraModelo((clientX - r.left) * dpr, (clientY - r.top) * dpr);
    },
    paraTela(ponto) {
      return modelo ? transformacao().paraTela(ponto) : null;
    },
    // Alças de tamanho em coordenadas da tela (clientX/Y), para testes: [{ id, cantos: [[x, y], ...] }]
    alcasNaTela() {
      if (!modelo?.alcas) return [];
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / r.width;
      const { paraTela } = transformacao();
      return modelo.alcas.map((a) => ({ id: a.id, cantos: cantosDe(a.caixa).map((c) => paraTela(c)).map(([x, y]) => [r.left + x / dpr, r.top + y / dpr]) }));
    },
    // mm da peça por px (CSS) da tela
    mmPorPixel() {
      const r = canvas.getBoundingClientRect();
      return modelo && r.width ? canvas.width / r.width / transformacao().escala : 1;
    },
    aoMudarVista: null,
  };
  return api;
}
