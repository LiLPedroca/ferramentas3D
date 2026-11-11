// Avisos de novidade: aparecem uma vez, ao abrir uma ferramenta que mudou numa atualização.
// Cada aviso vale para quem já usava o programa antes da versão em que a mudança chegou.

export const NOVIDADES = [
  {
    id: "produtos-categorias",
    versao: "0.42.0",
    tela: "produtos",
    icone: "produtos",
    titulo: "Seus produtos agora têm categorias",
    texto: "Organize o catálogo com categorias criadas por você.",
    itens: ["Crie categorias no botão Categorias", "Escolha a categoria da lista ao cadastrar", "Filtre os produtos por categoria"],
    botao: "Conhecer as categorias",
  },
];

// "0.41.0" < "0.42.0"
export function compararVersoes(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

// Aviso a mostrar ao entrar na tela, ou null.
// config: { ocultarNovidades, novidadesVistas, primeiraVersao }
export function novidadeDaTela(tela, config, versaoApp, lista = NOVIDADES) {
  if (!config || config.ocultarNovidades) return null;
  const vistas = new Set(config.novidadesVistas ?? []);
  const primeira = config.primeiraVersao || "0.0.0";
  return (
    lista.find(
      (n) =>
        n.tela === tela &&
        !vistas.has(n.id) &&
        compararVersoes(n.versao, versaoApp) <= 0 && // não mostra o que esta versão ainda não tem
        compararVersoes(primeira, n.versao) < 0, // quem instalou já com a mudança não precisa do aviso
    ) ?? null
  );
}
