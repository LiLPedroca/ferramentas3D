// Ícones de traço (24×24, stroke = currentColor), um por ferramenta.
const P = {
  calculadora: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><rect x="8" y="6" width="8" height="3.5" rx="1"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>',
  visualizador: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  orcamentos: '<path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.8.8 3 2.6 3 4.5"/>',
  produtos: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  taxas: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  etiquetas: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.6"/>',
  filamentos: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v5.5M20.5 12H15"/>',
  comparador: '<path d="M4 20h16"/><rect x="5" y="11" width="4" height="9" rx="1"/><rect x="15" y="6" width="4" height="14" rx="1"/><path d="M10 8h4M12 6l2 2-2 2"/>',
  encaixes: '<path d="M4 9h5a2 2 0 1 1 4 0h7v11H4V9Z"/><path d="M8 4h8v5"/>',
  medidas: '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6.5 8v3M10 8v4.5M13.5 8v3M17 8v4.5"/>',
  ficha: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M9 10h6M9 14h6M9 18h3"/>',
  falhas: '<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  biblioteca: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z"/>',
  svg: '<path d="M4 20c4-1 6-5 8-9s4-7 8-7"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="4" r="1.6"/><path d="M12 11h.01"/>',
  fotos: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/>',
  organizador: '<path d="M8 3h8l4 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M4 7v12a2 2 0 0 0 2 2h9M10 12h6M10 15.5h4"/>',
  backup: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5 4 4 0 0 1 17.5 18"/><path d="M12 12v8M9 15l3-3 3 3"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  stl: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><circle cx="12" cy="12" r="3.2"/><path d="m14.4 14.4 2.6 2.6"/>',
  detector: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/><path d="M10.5 7.5v2M10.5 11.5v2M7.5 10.5h2M11.5 10.5h2"/>',
  metadados: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m21 15-4-4-6 6"/><path d="M3 3l18 18"/>',
  inicio: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z"/>',
  configuracoes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  voltar: '<path d="M15 5 8 12l7 7"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

export function icone(nome, tamanho = 22) {
  const caminho = P[nome] ?? P.visualizador;
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminho}</svg>`;
}
