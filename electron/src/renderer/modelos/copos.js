import { BufferGeometry, Float32BufferAttribute } from "three";

export const CATALOGO_COPOS = [{ id: 1, nome: "Copo 1" }, { id: 2, nome: "Copo 2" }, { id: 3, nome: "Copo 3" }];
export function lerPacoteCopo(bytes) {
  if (bytes.byteLength < 4) throw new Error("Arquivo do copo incompleto.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(0, true);
  if (n % 4 || n + 4 > bytes.length) throw new Error("Arquivo do copo inválido.");
  const info = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
  const partes = info.partes.map((p, i) => {
    if (p.count % 9 || p.offset < 0 || n + 4 + p.offset + p.count * 4 > bytes.length) throw new Error("Geometria do copo incompleta.");
    const pos = new Float32Array(bytes.buffer.slice(bytes.byteOffset + 4 + n + p.offset, bytes.byteOffset + 4 + n + p.offset + p.count * 4));
    const geometria = new BufferGeometry();
    geometria.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometria.computeVertexNormals();
    return { nome: i === 0 ? "Principal" : i === 1 ? "Detalhes" : `Cor ${i + 1}`, cor: p.cor, geometria, slot: i + 1 };
  });
  return { ...info, partes };
}
export const aplicarCores = (partes, cores) => partes.map((p, i) => ({ ...p, cor: /^#[0-9a-f]{6}$/i.test(cores[i]) ? cores[i] : p.cor }));
