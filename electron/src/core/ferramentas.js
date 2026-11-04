// Grupos e ferramentas da tela inicial. Só entram ferramentas que já funcionam;
// um grupo sem ferramenta pronta não aparece.
// "tela" é o id da tela que a ferramenta abre (registrada no app).

export const GRUPOS = [
  {
    id: "financeiro",
    titulo: "Gestão financeira",
    descricao: "Calculadora, produtos e clientes.",
    foto: "assets/grupo-financeiro.jpg",
  },
  {
    id: "ferramentas",
    titulo: "Ferramentas",
    descricao: "Visualização e análise de modelos.",
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
    descricao: "Contatos, documento e cidade dos seus clientes.",
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
];
