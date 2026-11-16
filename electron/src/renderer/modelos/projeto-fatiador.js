// Projeto completo do Anycubic Slicer Next (Metadata/project_settings.config) para a Kobra X 0.4.
// Sem o projeto completo o Anycubic ignora as cores dos filamentos do 3MF (o branco abria verde).
// O modelo embutido tem um filamento só; aqui ele é repetido para cada cor, no material escolhido.
import modelo from "../assets/fatiador/projeto-kobra-x.json" with { type: "json" };

export const MATERIAIS_IMPRESSAO = ["PLA", "PETG"];
const CHAVE = "impressao-material";

// Último material escolhido em "Como você vai imprimir?" (PLA na primeira vez).
export function materialAtual() {
  try {
    const m = globalThis.localStorage?.getItem(CHAVE);
    return MATERIAIS_IMPRESSAO.includes(m) ? m : "PLA";
  } catch {
    return "PLA";
  }
}

export function guardarMaterial(material) {
  if (!MATERIAIS_IMPRESSAO.includes(material)) return;
  try {
    globalThis.localStorage?.setItem(CHAVE, material);
  } catch {
    // sem armazenamento: vale só nesta exportação
  }
}

// cores: uma por filamento (posição 1, 2, 3…), "#rrggbb".
export function projetoDoFatiador(cores, material = "PLA") {
  const perfil = structuredClone(modelo.base);
  const doMaterial = modelo.materiais[MATERIAIS_IMPRESSAO.includes(material) ? material : "PLA"];
  const n = Math.max(1, cores.length);
  for (const chave of modelo.porFilamento) {
    const valor = doMaterial[chave] ?? perfil[chave];
    if (Array.isArray(valor)) perfil[chave] = Array.from({ length: n }, () => valor[0]);
  }
  perfil.filament_colour = Array.from({ length: n }, (_, i) => (cores[i] ?? "#808080").toUpperCase());
  // filament_colour_info: as bolinhas da lista de filamentos na janela do Anycubic (sem isso, aparecia verde)
  perfil.filament_colour_info = [...perfil.filament_colour];
  perfil.filament_map = Array.from({ length: n }, () => "1");
  perfil.flush_volumes_chan_multipliers = Array.from({ length: n }, () => "1");
  perfil.flush_volumes_vector = Array(n * 2).fill("140");
  perfil.flush_volumes_matrix = Array.from({ length: n * n }, (_, k) => (Math.floor(k / n) === k % n ? "0" : "280"));
  return perfil;
}
