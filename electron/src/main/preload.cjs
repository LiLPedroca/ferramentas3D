// Ponte entre a tela e o processo principal. A tela só enxerga estas funções.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dados", {
  produtos: {
    listar: () => ipcRenderer.invoke("produtos:listar"),
    salvar: (valores, id) => ipcRenderer.invoke("produtos:salvar", valores, id ?? null),
    excluir: (id) => ipcRenderer.invoke("produtos:excluir", id),
  },
});
