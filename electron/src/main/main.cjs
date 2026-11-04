// Processo principal do Electron: cria a janela e cuida da atualização pelo GitHub.
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { criarServicoProdutos, responder } = require("./produtos.cjs");
const { criarServicoClientes } = require("./clientes.cjs");
const { criarServicoOrcamentos } = require("./orcamentos.cjs");
const { gerarHtmlOrcamento, nomeArquivoPdf } = require("../core/orcamento-pdf.cjs");
const { ErroValidacao } = require("../core/validacao.cjs");

// Converte HTML em PDF numa janela invisível, sem scripts e sem acesso a nada local.
async function htmlParaPdf(html) {
  const janela = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await janela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await janela.webContents.printToPDF({ printBackground: true, pageSize: "A4", preferCSSPageSize: true });
  } finally {
    janela.destroy();
  }
}
const { criarServicoConfiguracoes, responderConfig } = require("./configuracoes.cjs");

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
  // Só endereços https (ex.: WhatsApp, sites de modelos 3D).
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  // Nunca navega a própria janela para outro endereço.
  janela.webContents.on("will-navigate", (ev) => ev.preventDefault());

  return janela;
}

// ---------- Atualização ----------
// estado: "parada" | "baixando" | "pronta". Evita perguntar de novo ou baixar duas vezes.
const atualizacao = { estado: "parada", perguntando: false, janela: null };

async function perguntarSeAtualiza(info) {
  if (atualizacao.estado !== "parada" || atualizacao.perguntando) return;
  atualizacao.perguntando = true;
  try {
    const { response } = await dialog.showMessageBox(atualizacao.janela, {
      type: "info",
      buttons: ["Atualizar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
      title: "Atualização disponível",
      message: `Existe a versão ${info.version} (você tem a ${app.getVersion()}).`,
      detail: "A atualização é baixada e instalada. O programa reabre sozinho.",
    });
    if (response === 0) {
      atualizacao.estado = "baixando";
      autoUpdater.downloadUpdate().catch(() => {
        atualizacao.estado = "parada";
      });
    }
  } finally {
    atualizacao.perguntando = false;
  }
}

async function perguntarSeReinicia() {
  if (atualizacao.perguntando) return;
  atualizacao.perguntando = true;
  try {
    const { response } = await dialog.showMessageBox(atualizacao.janela, {
      type: "info",
      buttons: ["Reiniciar e instalar", "Mais tarde"],
      defaultId: 0,
      cancelId: 1,
      title: "Atualização pronta",
      message: "A atualização foi baixada.",
      detail: "Reinicie o programa para concluir a instalação.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  } finally {
    atualizacao.perguntando = false;
  }
}

function configurarAtualizacao(janela, { verificarAoAbrir = true } = {}) {
  atualizacao.janela = janela;
  if (!autoUpdater) return;

  autoUpdater.autoDownload = false;
  autoUpdater.on("update-available", perguntarSeAtualiza);
  autoUpdater.on("update-downloaded", () => {
    atualizacao.estado = "pronta";
    perguntarSeReinicia();
  });
  // Erros de rede não interrompem o uso: a próxima verificação tenta de novo.
  autoUpdater.on("error", (erro) => {
    if (atualizacao.estado === "baixando") atualizacao.estado = "parada";
    console.error("Atualização:", erro?.message ?? erro);
  });

  if (verificarAoAbrir) autoUpdater.checkForUpdates().catch(() => {});
}

// Botão "Verificar atualizações". Se houver versão nova, a pergunta de sempre aparece.
// estado devolvido: "atualizado" | "disponivel" | "baixando" | "pronta" | "indisponivel" | "erro"
async function verificarManualmente() {
  if (!autoUpdater) return { estado: "indisponivel" };
  if (atualizacao.estado === "baixando") return { estado: "baixando" };
  if (atualizacao.estado === "pronta") {
    perguntarSeReinicia();
    return { estado: "pronta" };
  }
  try {
    const resultado = await autoUpdater.checkForUpdates();
    if (!resultado) return { estado: "indisponivel" };
    const versao = resultado.updateInfo?.version;
    const disponivel = resultado.isUpdateAvailable ?? (Boolean(versao) && versao !== app.getVersion());
    return disponivel ? { estado: "disponivel", versao } : { estado: "atualizado", versao: app.getVersion() };
  } catch {
    return { estado: "erro" };
  }
}

// Só aceita chamadas vindas das páginas do próprio programa.
const daTela = (evento) => evento.senderFrame?.url?.startsWith("file://");

// Dados do usuário ficam em %APPDATA%\Programa Ferramentas 3D\dados.
// FERRAMENTAS_DADOS troca a pasta (usado nos testes, para não tocar nos dados reais).
function registrarDados() {
  const pasta = process.env.FERRAMENTAS_DADOS || path.join(app.getPath("userData"), "dados");
  const produtos = criarServicoProdutos(pasta);
  const configuracoes = criarServicoConfiguracoes(pasta);
  const negado = { ok: false, erro: "Origem não autorizada." };

  // Cadastros em lista: <nome>:listar, <nome>:salvar, <nome>:excluir.
  const clientes = criarServicoClientes(pasta);
  const orcamentos = criarServicoOrcamentos(pasta, { clientes });
  const cadastros = { clientes, orcamentos };

  // PDF do orçamento: pergunta onde salvar e abre o arquivo pronto.
  // FERRAMENTAS_PDF_DESTINO (testes) salva direto nessa pasta, sem perguntar nem abrir.
  ipcMain.handle("orcamentos:pdf", async (e, id) => {
    if (!daTela(e) || typeof id !== "string") return negado;
    return responder(
      (async () => {
        const orcamento = (await orcamentos.listar()).find((o) => o.id === id);
        if (!orcamento) throw new ErroValidacao("Este orçamento não existe mais.");
        const config = await configuracoes.ler();
        const nome = nomeArquivoPdf(orcamento);
        let destino;
        if (process.env.FERRAMENTAS_PDF_DESTINO) {
          destino = path.join(process.env.FERRAMENTAS_PDF_DESTINO, nome);
        } else {
          const escolha = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
            title: "Salvar orçamento em PDF",
            defaultPath: path.join(app.getPath("documents"), nome),
            filters: [{ name: "PDF", extensions: ["pdf"] }],
          });
          if (escolha.canceled || !escolha.filePath) return null;
          destino = escolha.filePath;
        }
        const pdf = await htmlParaPdf(gerarHtmlOrcamento(orcamento, config.empresa));
        await require("node:fs/promises").writeFile(destino, pdf);
        if (!process.env.FERRAMENTAS_PDF_DESTINO) shell.openPath(destino);
        return destino;
      })(),
    );
  });
  for (const [nome, servico] of Object.entries(cadastros)) {
    ipcMain.handle(`${nome}:listar`, (e) => (daTela(e) ? responder(servico.listar()) : negado));
    ipcMain.handle(`${nome}:salvar`, (e, valores, id) =>
      daTela(e) ? responder(servico.salvar(valores, typeof id === "string" ? id : undefined)) : negado,
    );
    ipcMain.handle(`${nome}:excluir`, (e, id) =>
      daTela(e) && typeof id === "string" ? responder(servico.excluir(id)) : negado,
    );
  }

  ipcMain.handle("config:ler", (e) => (daTela(e) ? responderConfig(configuracoes.ler()) : negado));
  ipcMain.handle("config:salvar", (e, alteracao) =>
    daTela(e) ? responderConfig(configuracoes.salvar(alteracao)) : negado,
  );
  ipcMain.handle("dados:abrir-pasta", async (e) => {
    if (!daTela(e)) return negado;
    await require("node:fs/promises").mkdir(pasta, { recursive: true });
    const erro = await shell.openPath(pasta);
    return erro ? { ok: false, erro: `Não foi possível abrir a pasta: ${erro}` } : { ok: true, dados: pasta };
  });

  ipcMain.handle("atualizacao:verificar", (e) => (daTela(e) ? verificarManualmente() : { estado: "erro" }));

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
      configurarAtualizacao(janela, { verificarAoAbrir: false }); // o botão funciona, sem checar sozinho
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
