import referencia from '../assets/copos/perfil-petg.json' with { type: 'json' };

// Preset oficial Kobra X/PETG com processo de copos; sempre clona os vetores,
// pois as cores de um arquivo não podem mudar a exportação seguinte.
export function perfilCopo(cores) {
  const perfil = structuredClone(referencia);
  const numero = cores.length;
  for (const [chave, valor] of Object.entries(perfil)) {
    if (chave.startsWith('filament_') && Array.isArray(valor)) perfil[chave] = cores.map((_cor, i) => valor[i] ?? valor[0]);
  }
  perfil.filament_colour = [...cores];
  perfil.filament_map = cores.map((_c, i) => String(i + 1));
  perfil.flush_volumes_chan_multipliers = cores.map(() => '1');
  perfil.flush_volumes_vector = Array(numero * 2).fill('140');
  perfil.flush_volumes_matrix = cores.flatMap((_c, i) => cores.map((_d, j) => i === j ? '0' : '280'));
  return perfil;
}
