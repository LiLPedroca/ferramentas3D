// Ponte entre a tela e o processo principal. A tela só enxerga estas funções.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atualizacao", {
  verificar: () => ipcRenderer.invoke("atualizacao:verificar"),
});

contextBridge.exposeInMainWorld("dados", {
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
