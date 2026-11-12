// Ponte entre a tela e o processo principal. A tela só enxerga estas funções.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("atualizacao", {
  verificar: () => ipcRenderer.invoke("atualizacao:verificar"),
});

const cadastro = (nome) => ({
  listar: () => ipcRenderer.invoke(`${nome}:listar`),
  salvar: (valores, id) => ipcRenderer.invoke(`${nome}:salvar`, valores, id ?? null),
  excluir: (id) => ipcRenderer.invoke(`${nome}:excluir`, id),
});

contextBridge.exposeInMainWorld("arquivos", {
  salvarCopias: (lista) => ipcRenderer.invoke("arquivos:salvar-copias", lista),
  abrirPasta: (caminho) => ipcRenderer.invoke("arquivos:abrir-pasta", caminho),
});

contextBridge.exposeInMainWorld("stl", {
  printables: (termo, pagina) => ipcRenderer.invoke("stl:printables", termo, pagina ?? 1),
  miniatura: (url) => ipcRenderer.invoke("stl:miniatura", url),
});

contextBridge.exposeInMainWorld("imagens", {
  heicParaRgba: (bytes) => ipcRenderer.invoke("imagens:heic", bytes),
});

contextBridge.exposeInMainWorld("modelos", {
  lerCopo: (id, original = false) => ipcRenderer.invoke("copos:ler", id, original),
  lerCopoMultipartes: id => ipcRenderer.invoke("copos:multipartes", id),
  lerFonte: (nome) => ipcRenderer.invoke("fontes:ler", nome),
  lerMotor: () => ipcRenderer.invoke("modelos:wasm"),
  salvar: (bytes, nome, extensao) => ipcRenderer.invoke("modelos:salvar", bytes, nome, extensao),
});

contextBridge.exposeInMainWorld("fatiador", {
  detectar: () => ipcRenderer.invoke("fatiador:detectar"),
  procurar: () => ipcRenderer.invoke("fatiador:procurar"),
  nomes: () => ipcRenderer.invoke("fatiador:nomes"),
  icone: (caminho) => ipcRenderer.invoke("fatiador:icone", caminho),
  abrir: (bytes, nome, extensao) => ipcRenderer.invoke("fatiador:abrir", bytes ?? null, nome ?? null, extensao ?? null),
});

contextBridge.exposeInMainWorld("backup", {
  resumo: () => ipcRenderer.invoke("backup:resumo"),
  exportar: () => ipcRenderer.invoke("backup:exportar"),
  escolher: (arquivo) => ipcRenderer.invoke("backup:escolher", arquivo ? webUtils.getPathForFile(arquivo) : undefined),
  escolherAutomatico: (nome) => ipcRenderer.invoke("backup:escolher-automatico", nome),
  restaurar: () => ipcRenderer.invoke("backup:restaurar"),
});

contextBridge.exposeInMainWorld("dados", {
  clientes: cadastro("clientes"),
  favoritos: cadastro("favoritos"),
  projetos: cadastro("projetos"),
  etiquetas: (pedido) => ipcRenderer.invoke("etiquetas:pdf", pedido),
  filamentos: { ...cadastro("filamentos"), descontar: (id, gramas) => ipcRenderer.invoke("filamentos:descontar", id, gramas) },
  orcamentos: {
    ...cadastro("orcamentos"),
    pdf: (id) => ipcRenderer.invoke("orcamentos:pdf", id),
    situacao: (id, situacao) => ipcRenderer.invoke("orcamentos:situacao", id, situacao),
  },
  impressoes: {
    listar: () => ipcRenderer.invoke("impressoes:listar"),
    salvar: (valores, id) => ipcRenderer.invoke("impressoes:salvar", valores, id ?? null),
    adicionar: (novo) => ipcRenderer.invoke("impressoes:adicionar", novo),
    excluir: (id) => ipcRenderer.invoke("impressoes:excluir", id),
    ler: (id) => ipcRenderer.invoke("impressoes:ler", id),
    imprimi: (id, hoje) => ipcRenderer.invoke("impressoes:imprimi", id, hoje),
    fatiador: (id) => ipcRenderer.invoke("impressoes:fatiador", id),
  },
  teste: {
    recriar: () => ipcRenderer.invoke("teste:recriar"),
    limpar: () => ipcRenderer.invoke("teste:limpar"),
  },
  rascunho: {
    ler: () => ipcRenderer.invoke("rascunho:ler"),
    salvar: (dados) => ipcRenderer.invoke("rascunho:salvar", dados),
  },
  financeiro: {
    listar: () => ipcRenderer.invoke("financeiro:listar"),
    salvarVenda: (valores, id) => ipcRenderer.invoke("financeiro:salvar-venda", valores, id ?? null),
    excluirVenda: (id) => ipcRenderer.invoke("financeiro:excluir-venda", id),
    pagamento: (id, pagamento) => ipcRenderer.invoke("financeiro:pagamento", id, pagamento),
    producao: (id, producao) => ipcRenderer.invoke("financeiro:producao", id, producao),
    sincronizar: (orcamentoId, resposta) => ipcRenderer.invoke("financeiro:sincronizar", orcamentoId, resposta),
    vincular: (orcamentoId, vendaId) => ipcRenderer.invoke("financeiro:vincular", orcamentoId, vendaId),
    salvarDespesa: (valores, id) => ipcRenderer.invoke("financeiro:salvar-despesa", valores, id ?? null),
    excluirDespesa: (id) => ipcRenderer.invoke("financeiro:excluir-despesa", id),
  },
  abrirPasta: () => ipcRenderer.invoke("dados:abrir-pasta"),
  config: {
    ler: () => ipcRenderer.invoke("config:ler"),
    salvar: (alteracao) => ipcRenderer.invoke("config:salvar", alteracao),
  },
  produtos: {
    listar: () => ipcRenderer.invoke("produtos:listar"),
    salvar: (valores, id) => ipcRenderer.invoke("produtos:salvar", valores, id ?? null),
    excluir: (id) => ipcRenderer.invoke("produtos:excluir", id),
  },
});
