// Encaixes e tolerâncias: folga recomendada entre pino e furo, e a peça de teste para calibrar.
// Folga = diferença total de diâmetro (furo − pino), em mm.
import { secaoDoTexto } from "./chaveiro.js";
import { comEscopo, malhaDoSolido } from "./manifold.js";

export const ENCAIXES = {
  justo: { nome: "Justo (sob pressão, não sai sozinho)", folga: 0.1 },
  deslizante: { nome: "Deslizante (entra e sai com a mão)", folga: 0.2 },
  folgado: { nome: "Folgado (gira ou corre livre)", folga: 0.4 },
};

// o quanto cada material pede a mais (encolhe ou "gruda" mais que o PLA)
export const MATERIAIS_ENCAIXE = { PLA: 0, PETG: 0.05, ABS: 0.05, ASA: 0.05, TPU: 0.1 };

const arred = (n) => Math.round(n * 100) / 100;

// Devolve { folga, furo, pino } em mm. medida = diâmetro (ou largura) nominal da peça de referência.
// calibrada (opcional): folga que funcionou na peça de teste; substitui a recomendação.
export function calcularEncaixe({ medida, encaixe = "deslizante", material = "PLA", bico = 0.4, calibrada = null }) {
  const m = Number(medida);
  if (!(m > 0 && m <= 500)) throw new Error("Medida: use de 0,1 a 500 mm.");
  if (!ENCAIXES[encaixe]) throw new Error("Tipo de encaixe inválido.");
  let folga;
  if (calibrada !== null && calibrada !== undefined && calibrada !== "") {
    folga = Number(calibrada);
    if (!(folga >= 0 && folga <= 2)) throw new Error("Folga calibrada: use de 0 a 2 mm.");
  } else {
    const fator = Math.max(1, Number(bico) / 0.4 || 1);
    folga = (ENCAIXES[encaixe].folga + (MATERIAIS_ENCAIXE[material] ?? 0)) * fator;
  }
  folga = arred(folga);
  return { folga, furo: arred(m + folga), pino: arred(m - folga) };
}

export const LIMITES_TESTE = { diametro: [2, 30], folgaInicial: [0, 1], passo: [0.02, 0.3], quantidade: [3, 8], espessura: [2, 10] };

// Peça de teste: placa com furos de folga crescente (valor gravado acima de cada um) + pino da
// medida exata. fonte: para os números. Devolve { malhas, folgas, dimensoes, camadas, caixa }.
export function gerarPecaTeste(M, fonte, entrada) {
  const o = { diametro: 8, folgaInicial: 0.1, passo: 0.05, quantidade: 6, espessura: 4, ...entrada };
  for (const [chave, [min, max]] of Object.entries(LIMITES_TESTE)) {
    const v = Number(o[chave]);
    if (!(v >= min && v <= max)) throw new Error(`Peça de teste: ${chave} fora do limite (${min} a ${max}).`);
    o[chave] = v;
  }
  o.quantidade = Math.round(o.quantidade);
  const C = M.CrossSection;
  return comEscopo(M, (guardar) => {
    const folgas = Array.from({ length: o.quantidade }, (_, i) => arred(o.folgaInicial + i * o.passo));
    const maiorFuro = o.diametro + folgas[folgas.length - 1];
    const passoX = maiorFuro + 4;
    const alturaNumero = Math.max(3, Math.min(5, o.diametro * 0.5));
    const largura = passoX * o.quantidade + 4;
    const altura = maiorFuro + alturaNumero + 9;
    const cyFuro = 4.5 + maiorFuro / 2;
    const placa = guardar(guardar(guardar(C.square([largura, altura])).offset(1.5, "Round", 2, 32)).translate([1.5, 1.5]));
    const segmentos = Math.max(96, Math.round(o.diametro * 12));
    let furos = null;
    let numeros = null;
    folgas.forEach((f, i) => {
      const cx = 3.5 + passoX * i + passoX / 2;
      const furo = guardar(guardar(C.circle((o.diametro + f) / 2, segmentos)).translate([cx, cyFuro]));
      furos = furos ? guardar(furos.add(furo)) : furo;
      // número: "0,15" centralizado acima do furo, com a altura pedida
      const texto = secaoDoTexto(M, guardar, fonte, f.toFixed(2).replace(".", ","), 100);
      const b = texto.bounds();
      const larguraTexto = b.max[0] - b.min[0] || 1;
      // altura pedida, sem passar da largura de cada coluna
      const escala = Math.min(alturaNumero / (b.max[1] - b.min[1]), (passoX - 1.5) / larguraTexto);
      const pos = guardar(guardar(texto.scale([escala, escala])).translate([cx - (larguraTexto * escala) / 2, cyFuro + maiorFuro / 2 + 2]));
      numeros = numeros ? guardar(numeros.add(pos)) : pos;
    });
    const secaoPlaca = guardar(placa.subtract(furos));
    let solidoPlaca = guardar(secaoPlaca.extrude(o.espessura));
    // números gravados 0,6 mm na face de cima
    const gravura = guardar(guardar(numeros.extrude(0.61)).translate([0, 0, o.espessura - 0.6]));
    solidoPlaca = guardar(solidoPlaca.subtract(gravura));
    // pino ao lado da placa, em pé, com 1,5 × a espessura + 4 mm de altura
    const alturaPino = o.espessura * 1.5 + 4;
    const pino = guardar(guardar(M.Manifold.cylinder(alturaPino, o.diametro / 2, o.diametro / 2, segmentos)).translate([largura + 3 + 4 + o.diametro / 2, cyFuro, 0]));
    const caixaPlaca = secaoPlaca.bounds();
    const larguraTotal = largura + 3 + 4 + o.diametro;
    return {
      malhas: [
        { nome: "Placa de teste", cor: "#2563eb", ...malhaDoSolido(solidoPlaca, "placa") },
        { nome: "Pino", cor: "#f59e0b", ...malhaDoSolido(pino, "pino") },
      ],
      folgas,
      opcoes: o,
      dimensoes: [larguraTotal, caixaPlaca.max[1] - caixaPlaca.min[1], alturaPino],
      camadas: [
        { lacos: secaoPlaca.toPolygons(), cor: "#2563eb" },
        { lacos: numeros.toPolygons(), cor: "#93c5fd" },
        { lacos: guardar(guardar(C.circle(o.diametro / 2, segmentos)).translate([largura + 3 + 4 + o.diametro / 2, cyFuro])).toPolygons(), cor: "#f59e0b" },
      ],
      caixa: { min: [0, 0], max: [larguraTotal, altura + 3] },
      perimetro: null,
      argola: null,
    };
  });
}
