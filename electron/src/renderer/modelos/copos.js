import { BufferGeometry, Float32BufferAttribute } from "three";

export const CATALOGO_COPOS = [{ id: 1, nome: "Copo 1" }, { id: 2, nome: "Copo 2" }, { id: 3, nome: "Copo 3" }, { id: 4, nome: "Copo 4" }];
// Copos que já têm o projeto em peças separadas (assets/copos/<id>-multipartes.3mf).
export const COPOS_MULTIPARTES = [1, 2, 3, 4];
// Copos que aparecem no catálogo mas ainda não podem ser usados (passando por ajustes).
export const COPOS_EM_AJUSTE = [4];
const CORES_PADRAO = ["#000000", "#ffffff"];
// Onde cada copo fica na mesa do 3MF original (mm): as logos vão ao lado.
export const COPO_NA_MESA = {
  1: { min: [86.4, 86.4], max: [173.6, 174.1] },
  2: { min: [92.6, 93.1], max: [183.0, 183.3] },
  3: { min: [79.3, 79.6], max: [176.8, 176.4] },
  4: { min: [80.25, 80.25], max: [175.75, 175.75] },
};
export const coresIniciais = (partes, salvas = []) => partes.map((_p, i) => /^#[0-9a-f]{6}$/i.test(salvas[i]) ? salvas[i] : CORES_PADRAO[i % CORES_PADRAO.length]);
// Prévia sem a assinatura Criae3D do fundo: ela é só pintura nas faces de baixo (z = 0), em duas cores
// (copos 1 a 3: fundo na cor de detalhes e logo na principal; copo 4: o contrário). Na prévia o fundo
// inteiro fica na cor que mais aparece nele; o arquivo exportado continua com a assinatura.
export function semAssinaturaNoFundo(posicoes) {
  if (posicoes.length < 2) return posicoes;
  const noFundo = (a, i) => a[i + 2] <= 0.01 && a[i + 5] <= 0.01 && a[i + 8] <= 0.01;
  // a logo pode ser uma lâmina de até 0,2 mm (paredes e teto dela também saem da prévia)
  const naLamina = (a, i) => a[i + 2] <= 0.25 && a[i + 5] <= 0.25 && a[i + 8] <= 0.25;
  const area = (a, i) => Math.abs((a[i + 3] - a[i]) * (a[i + 7] - a[i + 1]) - (a[i + 4] - a[i + 1]) * (a[i + 6] - a[i])) / 2;
  const areas = [0, 1].map((k) => {
    let s = 0;
    for (let i = 0; i < posicoes[k].length; i += 9) if (noFundo(posicoes[k], i)) s += area(posicoes[k], i);
    return s;
  });
  if (!areas[0] || !areas[1]) return posicoes;
  const de = areas[0] < areas[1] ? 0 : 1; // a cor menor do fundo (a da logo) passa para a maior
  const para = 1 - de;
  const origem = posicoes[de];
  const fica = [], sai = [];
  for (let i = 0; i < origem.length; i += 9) (naLamina(origem, i) ? sai : fica).push(i);
  const copiar = (lista) => {
    const r = new Float32Array(lista.length * 9);
    lista.forEach((i, k) => r.set(origem.subarray(i, i + 9), k * 9));
    return r;
  };
  const destino = new Float32Array(posicoes[para].length + sai.length * 9);
  destino.set(posicoes[para]);
  destino.set(copiar(sai), posicoes[para].length);
  const saida = [...posicoes];
  saida[de] = copiar(fica);
  saida[para] = destino;
  return saida;
}

export function lerPacoteCopo(bytes) {
  if (bytes.byteLength < 4) throw new Error("Arquivo do copo incompleto.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(0, true);
  if (n % 4 || n + 4 > bytes.length) throw new Error("Arquivo do copo inválido.");
  const info = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
  const lidas = info.partes.map((p) => {
    if (p.count % 9 || p.offset < 0 || n + 4 + p.offset + p.count * 4 > bytes.length) throw new Error("Geometria do copo incompleta.");
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset + 4 + n + p.offset, bytes.byteOffset + 4 + n + p.offset + p.count * 4));
  });
  const posicoes = semAssinaturaNoFundo(lidas);
  const partes = info.partes.map((p, i) => {
    const pos = posicoes[i];
    const geometria = new BufferGeometry();
    geometria.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometria.computeVertexNormals();
    return { nome: i === 0 ? "Principal" : i === 1 ? "Detalhes" : `Cor ${i + 1}`, cor: p.cor, geometria, slot: i + 1 };
  });
  return { ...info, partes };
}
export const aplicarCores = (partes, cores) => partes.map((p, i) => ({ ...p, cor: /^#[0-9a-f]{6}$/i.test(cores[i]) ? cores[i] : p.cor }));
