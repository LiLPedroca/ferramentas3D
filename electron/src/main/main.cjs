// Processo principal do Electron: cria a janela e cuida da atualização pelo GitHub.
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { criarServicoProdutos, responder } = require("./produtos.cjs");

// Só funciona com o app instalado (empacotado). Em desenvolvimento, não verifica.
let autoUpdater = null;
if (app.isPackaged) {
  ({ autoUpdater } = require("electron-updater"));
}

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    title: "Programa Ferramentas 3D",
    backgroundColor: "#0b0d12",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  janela.loadFile(path.join(__dirname, "..", "..", "build", "renderer", "index.html"));

  // Links externos abrem no navegador, nunca dentro do programa.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return janela;
}

function configurarAtualizacao(janela) {
  if (!autoUpdater) return;

  autoUpdater.autoDownload = false;

  autoUpdater.on("update-available", async (info) => {
    const { response } = await dialog.showMessageBox(janela, {
      type: "info",
      buttons: ["Atualizar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
      title: "Atualização disponível",
      message: `Existe a versão ${info.version} (você tem a ${app.getVersion()}).`,
      detail: "A atualização é baixada e instalada. O programa reabre sozinho.",
    });
    if (response === 0) autoUpdater.downloadUpdate().catch(() => {});
  });

  autoUpdater.on("update-downloaded", async () => {
    const { response } = await dialog.showMessageBox(janela, {
      type: "info",
      buttons: ["Reiniciar e instalar", "Mais tarde"],
      defaultId: 0,
      cancelId: 1,
      title: "Atualização pronta",
      message: "A atualização foi baixada.",
      detail: "Reinicie o programa para concluir a instalação.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // Erros de rede não devem incomodar o usuário: a verificação tenta de novo na próxima abertura.
  autoUpdater.on("error", (erro) => console.error("Atualização:", erro?.message ?? erro));

  autoUpdater.checkForUpdates().catch(() => {});
}

// Dados do usuário ficam em %APPDATA%\Programa Ferramentas 3D\dados.
// FERRAMENTAS_DADOS troca a pasta (usado nos testes, para não tocar nos dados reais).
function registrarDados() {
  const pasta = process.env.FERRAMENTAS_DADOS || path.join(app.getPath("userData"), "dados");
  const produtos = criarServicoProdutos(pasta);

  // Só aceita chamadas vindas das páginas do próprio programa.
  const daTela = (evento) => evento.senderFrame?.url?.startsWith("file://");
  const negado = { ok: false, erro: "Origem não autorizada." };

  ipcMain.handle("produtos:listar", (e) => (daTela(e) ? responder(produtos.listar()) : negado));
  ipcMain.handle("produtos:salvar", (e, valores, id) =>
    daTela(e) ? responder(produtos.salvar(valores, typeof id === "string" ? id : undefined)) : negado,
  );
  ipcMain.handle("produtos:excluir", (e, id) =>
    daTela(e) && typeof id === "string" ? responder(produtos.excluir(id)) : negado,
  );
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registrarDados();
  const janela = criarJanela();
  janela.once("ready-to-show", () => {
    janela.show();
    // Modo de teste: tira uma captura da tela em PNG e fecha. Não é usado no dia a dia.
    if (process.env.FERRAMENTAS_CAPTURA) {
      const fs = require("node:fs");
      const altura = Number(process.env.FERRAMENTAS_ALTURA) || 0;
      const largura = Number(process.env.FERRAMENTAS_LARGURA) || 0;
      if (altura > 0 || largura > 0) janela.setSize(largura || 1180, altura || 780);
      setTimeout(async () => {
        const aba = process.env.FERRAMENTAS_ABA;
        if (aba) {
          await janela.webContents.executeJavaScript(`window.irPara(${JSON.stringify(aba)})`);
          await new Promise((r) => setTimeout(r, 700)); // dá tempo de carregar dados da tela
        }
        // Só muda o tema na tela da captura, sem salvar a preferência do usuário.
        const tema = process.env.FERRAMENTAS_TEMA;
        if (tema) {
          await janela.webContents.executeJavaScript(
            `document.documentElement.dataset.theme = ${JSON.stringify(tema)}`,
          );
          await new Promise((r) => setTimeout(r, 400));
        }
        // Roteiro de teste opcional, executado na tela antes da captura.
        if (process.env.FERRAMENTAS_JS) {
          await janela.webContents.executeJavaScript(fs.readFileSync(process.env.FERRAMENTAS_JS, "utf8"));
          await new Promise((r) => setTimeout(r, 800));
        }
        const stl = process.env.FERRAMENTAS_STL;
        if (stl) {
          const base64 = fs.readFileSync(stl).toString("base64");
          await janela.webContents.executeJavaScript(`
            (() => {
              const bytes = Uint8Array.from(atob("${base64}"), (c) => c.charCodeAt(0));
              const arquivo = new File([bytes], "teste.stl", { type: "model/stl" });
              const transferencia = new DataTransfer();
              transferencia.items.add(arquivo);
              const entrada = document.getElementById("arquivo-stl");
              entrada.files = transferencia.files;
              entrada.dispatchEvent(new Event("change"));
            })()
          `);
          await new Promise((r) => setTimeout(r, 2500));
        }
        const imagem = await janela.webContents.capturePage();
        fs.writeFileSync(process.env.FERRAMENTAS_CAPTURA, imagem.toPNG());
        app.quit();
      }, 2000);
      return;
    }
    configurarAtualizacao(janela);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
