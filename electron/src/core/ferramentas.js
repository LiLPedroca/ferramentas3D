// Grupos e ferramentas da tela inicial. Só entram ferramentas que já funcionam;
// um grupo sem ferramenta pronta não aparece.
// "tela" é o id da tela que a ferramenta abre (registrada no app).

export const GRUPOS = [
  {
    id: "financeiro",
    titulo: "Gestão financeira",
    descricao: "Calculadora, orçamentos, clientes e produtos.",
    foto: "assets/grupo-financeiro.jpg",
  },
  {
    id: "ferramentas",
    titulo: "Ferramentas",
    descricao: "Conversão, análise e organização.",
    foto: "assets/grupo-ferramentas.jpg",
  },
  {
    id: "modelos",
    titulo: "Modelos personalizados",
    descricao: "Da sua ideia a uma peça única.",
    foto: "assets/grupo-modelos.jpg",
  },
];

export const FERRAMENTAS = [
  {
    id: "calculadora",
    grupo: "financeiro",
    titulo: "Calculadora 3D",
    descricao: "Custo e preço de venda por peça.",
    categoria: "Gestão financeira",
    disponivel: true,
    tela: "calculadora",
  },
  {
    id: "orcamentos",
    grupo: "financeiro",
    titulo: "Orçamentos",
    descricao: "Monte pedidos e gere o PDF para o cliente.",
    categoria: "Gestão financeira",
    disponivel: true,
    tela: "orcamentos",
  },
  {
    id: "produtos",
    grupo: "financeiro",
    titulo: "Produtos",
    descricao: "Seu catálogo com preço, peso e foto.",
    categoria: "Gestão financeira",
    disponivel: true,
    tela: "produtos",
  },
  {
    id: "clientes",
    grupo: "financeiro",
    titulo: "Clientes",
    descricao: "Contatos e histórico de orçamentos.",
    categoria: "Gestão financeira",
    disponivel: true,
    tela: "clientes",
  },
  {
    id: "visualizador",
    grupo: "ferramentas",
    titulo: "Visualizar 3D",
    descricao: "Abra um STL e veja medidas e volume.",
    categoria: "Ferramentas",
    disponivel: true,
    tela: "visualizador",
  },
  {
    id: "svg",
    grupo: "ferramentas",
    titulo: "Conversor SVG",
    descricao: "Transforme imagens em vetores.",
    categoria: "Ferramentas",
    disponivel: true,
    tela: "svg",
  },
  {
    id: "detector",
    grupo: "ferramentas",
    titulo: "Detector de IA",
    descricao: "Procure sinais de imagem gerada por IA.",
    categoria: "Ferramentas",
    disponivel: true,
    tela: "detector",
  },
  {
    id: "metadados",
    grupo: "ferramentas",
    titulo: "Removedor de metadados",
    descricao: "Veja e tire GPS, câmera e autor das fotos.",
    categoria: "Ferramentas",
    disponivel: true,
    tela: "metadados",
  },
  {
    id: "backup",
    grupo: "ferramentas",
    titulo: "Backup e armazenamento",
    descricao: "Salve e restaure todos os seus dados.",
    categoria: "Ferramentas",
    disponivel: true,
    tela: "backup",
  },
];
