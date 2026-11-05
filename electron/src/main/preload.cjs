// Ponte entre a tela e o processo principal. A tela só enxerga estas funções.
const { contextBridge, ipcRenderer } = require("electron");

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

contextBridge.exposeInMainWorld("modelos", {
  lerFonte: (nome) => ipcRenderer.invoke("fontes:ler", nome),
  lerMotor: () => ipcRenderer.invoke("modelos:wasm"),
  salvar: (bytes, nome, extensao) => ipcRenderer.invoke("modelos:salvar", bytes, nome, extensao),
});

contextBridge.exposeInMainWorld("fatiador", {
  detectar: () => ipcRenderer.invoke("fatiador:detectar"),
  procurar: () => ipcRenderer.invoke("fatiador:procurar"),
  abrir: (bytes, nome, extensao) => ipcRenderer.invoke("fatiador:abrir", bytes ?? null, nome ?? null, extensao ?? null),
});

contextBridge.exposeInMainWorld("backup", {
  resumo: () => ipcRenderer.invoke("backup:resumo"),
  exportar: () => ipcRenderer.invoke("backup:exportar"),
  escolher: () => ipcRenderer.invoke("backup:escolher"),
  escolherAutomatico: (nome) => ipcRenderer.invoke("backup:escolher-automatico", nome),
  restaurar: () => ipcRenderer.invoke("backup:restaurar"),
});

contextBridge.exposeInMainWorld("dados", {
  clientes: cadastro("clientes"),
  favoritos: cadastro("favoritos"),
  projetos: cadastro("projetos"),
  etiquetas: (pedido) => ipcRenderer.invoke("etiquetas:pdf", pedido),
  filamentos: { ...cadastro("filamentos"), descontar: (id, gramas) => ipcRenderer.invoke("filamentos:descontar", id, gramas) },
  orcamentos: { ...cadastro("orcamentos"), pdf: (id) => ipcRenderer.invoke("orcamentos:pdf", id) },
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
