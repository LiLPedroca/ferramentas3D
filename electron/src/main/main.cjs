// Processo principal do Electron: cria a janela e cuida da atualização pelo GitHub.
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { criarServicoProdutos, responder } = require("./produtos.cjs");
const { criarServicoClientes } = require("./clientes.cjs");
const { criarServicoOrcamentos } = require("./orcamentos.cjs");
const { criarServicoBackup } = require("./backup.cjs");
const { criarServicoFavoritos } = require("./favoritos.cjs");
const { criarServicoPrintables } = require("./printables.cjs");
const { criarServicoProjetos } = require("./projetos.cjs");
const { criarServicoFilamentos } = require("./filamentos.cjs");
const { abrirFatiador, detectarFatiadores } = require("./fatiador.cjs");
const { nomeBackup } = require("../core/backup.cjs");
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
    icon: path.join(__dirname, "..", "..", "build", "renderer", "assets", "icone.png"),
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
  const favoritos = criarServicoFavoritos(pasta);
  const projetos = criarServicoProjetos(pasta);
  const filamentos = criarServicoFilamentos(pasta);
  const cadastros = { clientes, orcamentos, favoritos, projetos, filamentos };

  // ---------- Backup e armazenamento ----------
  const backup = criarServicoBackup(pasta, {
    colecoes: { produtos, clientes, orcamentos, favoritos, projetos, filamentos },
    configuracoes,
    versaoApp: app.getVersion(),
  });
  let backupEscolhido = null; // backup lido e aguardando confirmação para restaurar
  const janelaDe = (e) => BrowserWindow.fromWebContents(e.sender);
  const comTela = (funcao) => (e, ...args) => (daTela(e) ? responder(funcao(e, ...args)) : negado);

  // ---------- Caçador de STL: busca do Printables dentro do programa ----------
  const printables = criarServicoPrintables();
  ipcMain.handle("stl:printables", comTela((_e, termo, pagina) => printables.pesquisar(termo, pagina)));
  ipcMain.handle("stl:miniatura", comTela((_e, url) => printables.miniatura(url)));

  ipcMain.handle("backup:resumo", comTela(() => backup.resumo()));
  ipcMain.handle(
    "backup:exportar",
    comTela(async (e) => {
      const nome = nomeBackup("Backup-Ferramentas3D");
      let destino;
      if (process.env.FERRAMENTAS_SALVAR_DESTINO) destino = path.join(process.env.FERRAMENTAS_SALVAR_DESTINO, nome);
      else {
        const escolha = await dialog.showSaveDialog(janelaDe(e), {
          title: "Salvar backup",
          defaultPath: path.join(app.getPath("documents"), nome),
          filters: [{ name: "Backup", extensions: ["json"] }],
        });
        if (escolha.canceled || !escolha.filePath) return null;
        destino = escolha.filePath;
      }
      await require("node:fs/promises").writeFile(destino, await backup.gerarTexto(), "utf8");
      return destino;
    }),
  );
  ipcMain.handle(
    "backup:escolher",
    comTela(async (e) => {
      let caminho = process.env.FERRAMENTAS_BACKUP_ARQUIVO;
      if (!caminho) {
        const escolha = await dialog.showOpenDialog(janelaDe(e), {
          title: "Escolher backup para restaurar",
          properties: ["openFile"],
          filters: [{ name: "Backup", extensions: ["json"] }],
        });
        if (escolha.canceled || !escolha.filePaths[0]) return null;
        caminho = escolha.filePaths[0];
      }
      backupEscolhido = await backup.lerArquivoBackup(caminho);
      return { resumo: backupEscolhido.resumo, descartados: backupEscolhido.descartados, nome: path.basename(caminho) };
    }),
  );
  ipcMain.handle(
    "backup:escolher-automatico",
    comTela(async (_e, nome) => {
      backupEscolhido = await backup.lerAutomatico(String(nome));
      return { resumo: backupEscolhido.resumo, descartados: backupEscolhido.descartados, nome: String(nome) };
    }),
  );
  ipcMain.handle(
    "backup:restaurar",
    comTela(async () => {
      if (!backupEscolhido) throw new ErroValidacao("Escolha um backup antes de restaurar.");
      const resultado = await backup.restaurar(backupEscolhido);
      backupEscolhido = null;
      return resultado;
    }),
  );
  if (!process.env.FERRAMENTAS_CAPTURA) {
    backup.copiaDiaria().catch((erro) => console.error("Cópia diária:", erro.message));
  }

  // ---------- Salvar cópias de arquivos (ex.: imagens sem metadados) ----------
  // Pergunta a pasta, nunca sobrescreve: acrescenta " (2)", " (3)"... se o nome já existir.
  ipcMain.handle(
    "arquivos:salvar-copias",
    comTela(async (e, lista) => {
      const fsp = require("node:fs/promises");
      if (!Array.isArray(lista) || lista.length === 0 || lista.length > 100) throw new ErroValidacao("Nada para salvar.");
      for (const item of lista) {
        if (!item || typeof item.nome !== "string" || !(item.bytes instanceof Uint8Array)) throw new ErroValidacao("Arquivo inválido.");
        if (item.bytes.length > 100 * 1024 * 1024) throw new ErroValidacao("Arquivo grande demais.");
      }
      let pastaDestino = process.env.FERRAMENTAS_SALVAR_DESTINO;
      if (!pastaDestino) {
        const escolha = await dialog.showOpenDialog(janelaDe(e), {
          title: "Escolher a pasta para salvar as cópias",
          properties: ["openDirectory", "createDirectory"],
        });
        if (escolha.canceled || !escolha.filePaths[0]) return null;
        pastaDestino = escolha.filePaths[0];
      }
      const salvos = [];
      for (const item of lista) {
        const limpo = path.basename(item.nome).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 150) || "arquivo";
        const ext = path.extname(limpo);
        const base = limpo.slice(0, limpo.length - ext.length);
        let destino = path.join(pastaDestino, limpo);
        for (let n = 2; ; n++) {
          try {
            await fsp.writeFile(destino, item.bytes, { flag: "wx" }); // falha se já existir
            break;
          } catch (erro) {
            if (erro.code !== "EEXIST" || n > 999) throw erro;
            destino = path.join(pastaDestino, `${base} (${n})${ext}`);
          }
        }
        salvos.push(path.basename(destino));
      }
      return { pasta: pastaDestino, salvos };
    }),
  );
  // ---------- Modelos 3D: fontes, salvar e abrir no fatiador ----------
  const pastaFontes = path.join(__dirname, "..", "..", "build", "renderer", "assets", "fontes");
  ipcMain.handle("copos:multipartes", comTela(async (_e, id) => {
    if (id !== 1) throw new Error("Exportação em multipartes indisponível para este copo.");
    return new Uint8Array(await require("node:fs/promises").readFile(path.join(pastaFontes, "..", "copos", "1-multipartes.3mf")));
  }));
  ipcMain.handle("copos:ler", comTela(async (_e, id, original) => {
    if (![1, 2, 3].includes(id)) throw new Error("Copo inválido.");
    const bytes = await require("node:fs/promises").readFile(path.join(pastaFontes, "..", "copos", `${id}.${original ? "3mf" : "bin.gz"}`));
    return new Uint8Array(original ? bytes : require("node:zlib").gunzipSync(bytes));
  }));
  ipcMain.handle(
    "fontes:ler",
    comTela(async (_e, nome) => {
      if (typeof nome !== "string" || !/^[A-Za-z0-9]{2,40}$/.test(nome)) throw new ErroValidacao("Fonte inválida.");
      return new Uint8Array(await require("node:fs/promises").readFile(path.join(pastaFontes, `${nome}-Regular.ttf`)));
    }),
  );
  // Motor de geometria (Manifold, WASM): a tela não consegue baixar o .wasm pelo file://
  ipcMain.handle(
    "modelos:wasm",
    comTela(async () => new Uint8Array(await require("node:fs/promises").readFile(path.join(pastaFontes, "..", "manifold.wasm")))),
  );

  const nomeModelo = (nome, extensao) => {
    const base = String(nome ?? "modelo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().slice(0, 60) || "modelo";
    return `${base}.${extensao}`;
  };
  const conferirModelo = (bytes, extensao) => {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 300 * 1024 * 1024) throw new ErroValidacao("Modelo inválido.");
    if (!["3mf", "stl"].includes(extensao)) throw new ErroValidacao("Formato inválido.");
  };

  ipcMain.handle(
    "modelos:salvar",
    comTela(async (e, bytes, nome, extensao) => {
      conferirModelo(bytes, extensao);
      const arquivo = nomeModelo(nome, extensao);
      let destino;
      if (process.env.FERRAMENTAS_SALVAR_DESTINO) destino = path.join(process.env.FERRAMENTAS_SALVAR_DESTINO, arquivo);
      else {
        const escolha = await dialog.showSaveDialog(janelaDe(e), {
          title: "Salvar modelo",
          defaultPath: path.join(app.getPath("documents"), arquivo),
          filters: [{ name: extensao.toUpperCase(), extensions: [extensao] }],
        });
        if (escolha.canceled || !escolha.filePath) return null;
        destino = escolha.filePath;
      }
      await require("node:fs/promises").writeFile(destino, bytes);
      return destino;
    }),
  );

  ipcMain.handle("fatiador:detectar", comTela(() => detectarFatiadores()));
  ipcMain.handle(
    "fatiador:procurar",
    comTela(async (e) => {
      const escolha = await dialog.showOpenDialog(janelaDe(e), {
        title: "Escolher o programa do fatiador",
        properties: ["openFile"],
        filters: [{ name: "Programas", extensions: ["exe"] }],
      });
      if (escolha.canceled || !escolha.filePaths[0]) return null;
      const caminho = escolha.filePaths[0];
      return { nome: path.basename(caminho, path.extname(caminho)), caminho };
    }),
  );
  // Abre o fatiador escolhido; com bytes, grava o modelo numa pasta temporária e abre nele.
  ipcMain.handle(
    "fatiador:abrir",
    comTela(async (_e, bytes, nome, extensao) => {
      const { fatiador } = await configuracoes.ler();
      if (!fatiador.caminho) throw new ErroValidacao("SEM_FATIADOR");
      let arquivo = null;
      if (bytes) {
        conferirModelo(bytes, extensao);
        const pastaTemp = path.join(app.getPath("temp"), "ProgramaFerramentas3D");
        await require("node:fs/promises").mkdir(pastaTemp, { recursive: true });
        arquivo = path.join(pastaTemp, nomeModelo(nome, extensao));
        await require("node:fs/promises").writeFile(arquivo, bytes);
      }
      await abrirFatiador(fatiador.caminho, arquivo);
      return fatiador.nome;
    }),
  );

  ipcMain.handle(
    "arquivos:abrir-pasta",
    comTela(async (_e, caminho) => {
      if (typeof caminho !== "string" || !path.isAbsolute(caminho)) throw new ErroValidacao("Pasta inválida.");
      const erro = await shell.openPath(caminho);
      if (erro) throw new ErroValidacao(`Não foi possível abrir a pasta: ${erro}`);
      return true;
    }),
  );

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
  // Etiquetas em PDF: a tela manda só ids e cópias; o conteúdo vem dos dados gravados.
  ipcMain.handle("etiquetas:pdf", async (e, pedidoTela) => {
    if (!daTela(e)) return negado;
    return responder(
      (async () => {
        const et = require("../core/etiquetas.cjs");
        const pedido = et.validarPedidoEtiquetas(pedidoTela);
        const { empresa } = await configuracoes.ler();
        let etiquetas;
        if (pedido.tipo === "produtos") {
          const todos = await produtos.listar();
          const itens = pedido.itens.map((i) => ({ produto: todos.find((p) => p.id === i.id), copias: i.copias })).filter((i) => i.produto);
          etiquetas = et.etiquetasDeProdutos(itens, { empresa, mostrarPreco: pedido.mostrarPreco, qr: pedido.qr });
        } else {
          const todos = await orcamentos.listar();
          const itens = pedido.itens.map((i) => ({ orcamento: todos.find((o) => o.id === i.id), copias: i.copias })).filter((i) => i.orcamento);
          etiquetas = et.etiquetasDePedidos(itens, { empresa, qr: pedido.qr });
        }
        if (pedido.qr && !et.linkWhatsApp(empresa.telefone)) {
          throw new ErroValidacao("Para o QR code, cadastre o telefone da empresa em Configurações.");
        }
        const html = et.gerarHtmlEtiquetas(etiquetas, pedido.tamanho);
        const nome = `Etiquetas ${pedido.tipo === "produtos" ? "de produtos" : "de pedidos"} ${new Date().toISOString().slice(0, 10)}.pdf`;
        let destino;
        if (process.env.FERRAMENTAS_PDF_DESTINO) {
          destino = path.join(process.env.FERRAMENTAS_PDF_DESTINO, nome);
        } else {
          const escolha = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
            title: "Salvar etiquetas em PDF",
            defaultPath: path.join(app.getPath("documents"), nome),
            filters: [{ name: "PDF", extensions: ["pdf"] }],
          });
          if (escolha.canceled || !escolha.filePath) return null;
          destino = escolha.filePath;
        }
        const pdf = await htmlParaPdf(html);
        await require("node:fs/promises").writeFile(destino, pdf);
        if (!process.env.FERRAMENTAS_PDF_DESTINO) shell.openPath(destino);
        return { destino, quantidade: etiquetas.length };
      })(),
    );
  });
  ipcMain.handle("filamentos:descontar", (e, id, gramas) =>
    daTela(e) && typeof id === "string" ? responder(filamentos.descontar(id, gramas)) : negado,
  );
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

// Modo de captura (testes): continua desenhando mesmo com a janela encoberta ou a tela bloqueada.
if (process.env.FERRAMENTAS_CAPTURA) {
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
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
      // se o roteiro falhar, grava o erro no .txt e fecha (em vez de ficar parado)
      const falhou = (erro) => {
        fs.writeFileSync(`${process.env.FERRAMENTAS_CAPTURA}.txt`, `ERRO NA CAPTURA: ${erro?.stack ?? erro}`);
        app.quit();
      };
      setTimeout(() => capturar().catch(falhou), 2000);
      const capturar = async () => {
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
        // O roteiro de teste pode deixar um resultado no título da página.
        fs.writeFileSync(`${process.env.FERRAMENTAS_CAPTURA}.txt`, await janela.webContents.executeJavaScript("document.title"));
        app.quit();
      };
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
