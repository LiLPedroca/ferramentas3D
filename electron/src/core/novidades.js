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
  {
    id: "calculadora-nova",
    versao: "0.43.0",
    tela: "calculadora",
    icone: "calculadora",
    titulo: "Sua calculadora está de cara nova",
    texto: "A Calculadora 3D agora usa os seus custos habituais e leva o cálculo para o orçamento.",
    itens: ["Padrões em Configurações > Dados da calculadora", "Adicione o cálculo direto ao orçamento", "O cálculo usado fica guardado na venda"],
    botao: "Conhecer a nova calculadora",
  },
  {
    id: "orcamentos-etapas",
    versao: "0.43.0",
    tela: "orcamentos",
    icone: "orcamentos",
    titulo: "Orçamentos em 4 etapas",
    texto: "Monte o orçamento por etapas e veja o PDF enquanto preenche.",
    itens: ["Cliente, Produtos, Condições e Finalizar", "Prévia do PDF em tempo real e rascunho automático", "Sinal, formas de pagamento e entrega"],
    botao: "Conhecer os novos orçamentos",
  },
  {
    id: "financeiro-painel",
    versao: "0.43.0",
    tela: "financeiro",
    icone: "taxas",
    titulo: "Gestão financeira completa",
    texto: "Vendas, recebimentos, despesas e lucro num só painel.",
    itens: ["Cada orçamento finalizado vira uma venda", "Registre pagamentos e acompanhe o que falta receber", "Lucro calculado com os custos guardados"],
    botao: "Conhecer o financeiro",
  },
  {
    id: "clientes-teste",
    versao: "0.44.0",
    tela: "clientes",
    icone: "clientes",
    titulo: "Cliente Teste para experimentar",
    texto: "Teste orçamentos, PDF e pagamentos sem mexer nos seus números.",
    itens: ["Cliente Teste e Peça teste já cadastrados", "Orçamentos de teste com numeração própria e marca TESTE no PDF", "Limpe tudo em Configurações > Geral"],
    botao: "Entendi",
  },
  {
    id: "orcamentos-pagamento-dividido",
    versao: "0.45.0",
    tela: "orcamentos",
    icone: "orcamentos",
    titulo: "Frete à vista e pagamento dividido",
    texto: "Ajustes nos orçamentos para lançar o frete e o pagamento mais rápido.",
    itens: ["O campo Frete aparece direto em Condições", "Pagou com mais de uma forma? Divida o valor entre elas", "A soma precisa bater com o valor recebido"],
    botao: "Entendi",
  },
  {
    id: "financeiro-pagamento-dividido",
    versao: "0.45.0",
    tela: "financeiro",
    icone: "taxas",
    titulo: "Pagamento dividido entre formas",
    texto: "Um recebimento pode ter parte em Pix e parte em dinheiro, por exemplo.",
    itens: ["Marque as formas e informe quanto foi em cada uma", "O total distribuído e o que falta aparecem na hora", "Cada pagamento mostra a divisão na venda"],
    botao: "Entendi",
  },  {
    id: "impressoes-nova",
    versao: "0.46.0",
    tela: "impressoes",
    icone: "impressoes",
    titulo: "Conheça Minhas Impressões",
    texto: "Um lugar para guardar os arquivos que você imprime, com o que deu certo em cada um.",
    itens: ["Arraste arquivos STL, 3MF, OBJ ou PLY para guardar", "Peso, tempo, material e configurações em cada cartão", "Abra no fatiador ou calcule o custo com um clique"],
    botao: "Começar",
  },
  {
    id: "chaveiro-simbolo-varios",
    versao: "0.47.0",
    tela: "chaveiro",
    icone: "chaveiro",
    titulo: "Símbolo e vários nomes no chaveiro",
    texto: "Coloque um logo junto do nome e gere os chaveiros de uma equipe inteira num arquivo só.",
    itens: ["Símbolo à esquerda, à direita, acima ou abaixo, arrastável na prévia", "Um nome por linha: todos no mesmo 3MF, arrumados na mesa", "Peso de cada um e o total, para o orçamento"],
    botao: "Experimentar",
  },
  // Fotos HEIC (iPhone): um aviso em cada ferramenta que recebe imagem.
  ...["produtos", "impressoes", "svg", "logo", "chaveiro", "caneca", "detector", "configuracoes"].map((tela) => ({
    id: `heic-${tela}`,
    versao: "0.48.0",
    tela,
    icone: tela,
    titulo: "Fotos HEIC do iPhone",
    texto: "Agora dá para usar fotos HEIC direto, sem converter antes.",
    itens: ["Escolha ou arraste a foto como qualquer imagem", "JPEG, PNG e WebP continuam valendo"],
    botao: "Entendi",
  })),
  {
    id: "inicio-novo",
    versao: "0.49.0",
    tela: "inicio",
    icone: "inicio",
    titulo: "Início e menu de cara nova",
    texto: "Mais limpo, mais escuro e mais fácil de voltar para onde você estava.",
    itens: ["Minhas Impressões com cartão próprio", "Menu com grupos que abrem e fecham", "Voltar refaz o caminho que você fez", "O botão Meu fatiador mostra o seu fatiador"],
    botao: "Ver",
  },
  {
    id: "produtos-venda-lucro",
    versao: "0.49.0",
    tela: "produtos",
    icone: "produtos",
    titulo: "Venda e lucro em destaque",
    texto: "Cada produto mostra quanto você vende e quanto lucra, lado a lado.",
    itens: ["Ordene por recentes, nome, preço ou lucro", "Veja em grade ou em lista", "No ⋯: editar, duplicar ou excluir"],
    botao: "Ver meus produtos",
  },
  {
    id: "impressoes-material-cores",
    versao: "0.49.0",
    tela: "impressoes",
    icone: "impressoes",
    titulo: "Cadastro mais simples",
    texto: "Só o que importa: nome, categoria, peso, tempo, material e cores.",
    itens: ["Material para escolher na lista", "Toque nas cores da peça (pode ser mais de uma)"],
    botao: "Entendi",
  },
  {
    id: "backup-zip",
    versao: "0.49.0",
    tela: "backup",
    icone: "backup",
    titulo: "Backup em um arquivo só",
    texto: "O backup agora é um .zip com tudo, inclusive os 3MF e STL de Minhas Impressões.",
    itens: ["Leve o .zip para outro computador", "Para restaurar, escolha ou arraste o .zip"],
    botao: "Entendi",
  },
  {
    id: "3d-sem-placa",
    versao: "0.49.1",
    tela: "visualizador",
    icone: "visualizador",
    titulo: "3D em mais computadores",
    texto: "Se a placa de vídeo não ajudar, o programa desenha o 3D sozinho. Fica mais lento, mas funciona.",
    itens: ["Vale para o Visualizador e as prévias dos modelos", "Se nem assim der, aparece um aviso e o resto da tela continua funcionando"],
    botao: "Entendi",
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
