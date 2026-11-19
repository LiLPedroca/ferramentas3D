// Processo principal do Electron: cria a janela e cuida da atualização pelo GitHub.
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { criarServicoProdutos, responder } = require("./produtos.cjs");
const { criarServicoClientes } = require("./clientes.cjs");
const { criarServicoOrcamentos } = require("./orcamentos.cjs");
const { criarEstoqueProdutos } = require("./estoque-produtos.cjs");
const { criarServicoBackup } = require("./backup.cjs");
const { criarServicoFavoritos } = require("./favoritos.cjs");
const { criarServicoPrintables } = require("./printables.cjs");
const { criarServicoProjetos } = require("./projetos.cjs");
const { criarServicoFilamentos } = require("./filamentos.cjs");
const { Documento } = require("./armazenamento.cjs");
const { criarPdfsOrcamentos, gravarPdf } = require("./pdfs-orcamentos.cjs");
const { NOME_RAIZ, criarPastasUsuario } = require("./pastas-usuario.cjs");
const { CANDIDATOS, abrirFatiador, detectarFatiadores } = require("./fatiador.cjs");
const { nomeBackup } = require("../core/backup.cjs");
const backupZip = require("./backup-zip.cjs");
const { RODAPE_PDF, gerarHtmlOrcamento, nomeArquivoPdf } = require("../core/orcamento-pdf.cjs");
const { ErroValidacao } = require("../core/validacao.cjs");

// Converte HTML em PDF numa janela invisível, sem scripts e sem acesso a nada local.
async function htmlParaPdf(html, opcoes = {}) {
  const janela = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await janela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await janela.webContents.printToPDF({ printBackground: true, pageSize: "A4", preferCSSPageSize: true, ...opcoes });
  } finally {
    janela.destroy();
  }
}
const { criarServicoConfiguracoes, responderConfig } = require("./configuracoes.cjs");
const { criarServicoFinanceiro } = require("./financeiro.cjs");
const { criarServicoDadosTeste } = require("./dados-teste.cjs");
const { criarServicoImpressoes, pastaArquivosDoBackup } = require("./impressoes.cjs");

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
    backgroundColor: "#0a0a0a",
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
// Procura versão nova ao abrir e a cada 5 minutos. Achou: baixa sozinho, sem perguntar.
// Baixou: a tela mostra o aviso "Atualizar agora / Mais tarde" (uma vez por versão).
// "Mais tarde" ou fechar o programa: a versão é instalada ao fechar (autoInstallOnAppQuit),
// e o programa já abre atualizado da próxima vez.
// estado: "parada" | "baixando" | "pronta".
const INTERVALO_ATUALIZACAO = 5 * 60 * 1000;
const atualizacao = { estado: "parada", versao: "", avisada: false, telaOuvindo: false, janela: null };

function procurarAtualizacao() {
  if (!autoUpdater || atualizacao.estado !== "parada") return;
  autoUpdater.checkForUpdates().catch(() => {});
}

// Manda o aviso para a tela quando a versão está baixada e a tela já está pronta para mostrar.
function avisarTela() {
  const janela = atualizacao.janela;
  if (atualizacao.estado !== "pronta" || atualizacao.avisada || !atualizacao.telaOuvindo) return;
  if (!janela || janela.isDestroyed()) return;
  atualizacao.avisada = true;
  janela.webContents.send("atualizacao:pronta", { versao: atualizacao.versao });
}

function configurarAtualizacao(janela, { verificarAoAbrir = true } = {}) {
  atualizacao.janela = janela;
  if (!autoUpdater) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (info) => {
    atualizacao.estado = "baixando";
    atualizacao.versao = info?.version ?? "";
  });
  autoUpdater.on("update-downloaded", (info) => {
    atualizacao.estado = "pronta";
    atualizacao.versao = info?.version ?? atualizacao.versao;
    avisarTela();
  });
  // Erros de rede não interrompem o uso: a próxima verificação tenta de novo.
  autoUpdater.on("error", (erro) => {
    if (atualizacao.estado === "baixando") atualizacao.estado = "parada";
    console.error("Atualização:", erro?.message ?? erro);
  });

  if (verificarAoAbrir) {
    procurarAtualizacao();
    setInterval(procurarAtualizacao, INTERVALO_ATUALIZACAO);
  }
}

// Botão "Verificar atualizações".
// estado devolvido: "atualizado" | "baixando" | "pronta" (com versao) | "indisponivel" | "erro"
async function verificarManualmente() {
  if (!autoUpdater) return { estado: "indisponivel" };
  if (atualizacao.estado === "baixando") return { estado: "baixando" };
  if (atualizacao.estado === "pronta") return { estado: "pronta", versao: atualizacao.versao };
  try {
    const resultado = await autoUpdater.checkForUpdates();
    if (!resultado) return { estado: "indisponivel" };
    const versao = resultado.updateInfo?.version;
    const disponivel = resultado.isUpdateAvailable ?? (Boolean(versao) && versao !== app.getVersion());
    return disponivel ? { estado: "baixando", versao } : { estado: "atualizado", versao: app.getVersion() };
  } catch {
    return { estado: "erro" };
  }
}

// Copia os arquivos e abre a conversa no WhatsApp com a mensagem pronta (sem o aplicativo:
// navegador). Se não der para copiar, mostra o arquivo na pasta para arrastar.
async function abrirConversaComArquivos(numero, mensagem, arquivos) {
  const wpp = require("../core/whatsapp-orcamento.cjs");
  const copiado = await copiarArquivosParaAreaDeTransferencia(arquivos);
  if (process.env.FERRAMENTAS_CAPTURA) return { copiado, link: wpp.linkAppWhatsapp(numero, mensagem) };
  if (!copiado) shell.showItemInFolder(arquivos[0]);
  try {
    await shell.openExternal(wpp.linkAppWhatsapp(numero, mensagem));
  } catch {
    await shell.openExternal(wpp.linkWebWhatsapp(numero, mensagem));
  }
  return { copiado };
}

// Põe arquivos na área de transferência do jeito do Explorador (Ctrl+V cola o arquivo).
// Os caminhos vão por variável de ambiente, nunca dentro do comando.
function copiarArquivosParaAreaDeTransferencia(arquivos) {
  const { execFile } = require("node:child_process");
  const env = { ...process.env };
  arquivos.forEach((c, i) => (env[`FERRAMENTAS_ARQ${i}`] = c));
  const lista = arquivos.map((_c, i) => `$env:FERRAMENTAS_ARQ${i}`).join(",");
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `Set-Clipboard -LiteralPath @(${lista})`],
      { env, windowsHide: true, timeout: 15000 },
      (erro) => resolve(!erro),
    );
  });
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
  const orcamentos = criarServicoOrcamentos(pasta, { clientes, configuracoes });
  const financeiro = criarServicoFinanceiro(pasta, { orcamentos });
  const favoritos = criarServicoFavoritos(pasta);
  const projetos = criarServicoProjetos(pasta);
  const filamentos = criarServicoFilamentos(pasta);
  const impressoes = criarServicoImpressoes(pasta);
  const cadastros = { clientes, orcamentos, favoritos, projetos, filamentos };
  // Reservas e saídas do estoque de produtos acompanham orçamentos e vendas.
  const estoque = criarEstoqueProdutos({ produtos, orcamentos, vendas: financeiro.vendas });
  const comEstoque = (funcao) => (...args) => estoque.depois(Promise.resolve().then(() => funcao(...args)));

  // ---------- Dados de teste (cliente e produto fictícios) ----------
  const dadosTeste = criarServicoDadosTeste({ clientes, produtos, orcamentos, vendas: financeiro.vendas, configuracoes });
  const prontoTeste = dadosTeste.criarNaPrimeiraVez().catch((erro) => console.error("Dados de teste:", erro));

  // ---------- Backup e armazenamento ----------
  const backup = criarServicoBackup(pasta, {
    colecoes: { produtos, clientes, orcamentos, favoritos, projetos, filamentos, vendas: financeiro.vendas, despesas: financeiro.despesas, impressoes },
    configuracoes,
    versaoApp: app.getVersion(),
  });
  let backupEscolhido = null; // backup lido e aguardando confirmação para restaurar
  let pastaArquivosEscolhida = null; // pasta "(arquivos)" ao lado do backup escolhido, se houver
  const janelaDe = (e) => BrowserWindow.fromWebContents(e.sender);
  const comTela = (funcao) => (e, ...args) => (daTela(e) ? responder(funcao(e, ...args)) : negado);

  // ---------- Caçador de STL: busca do Printables dentro do programa ----------
  const printables = criarServicoPrintables();
  ipcMain.handle("stl:printables", comTela((_e, termo, pagina) => printables.pesquisar(termo, pagina)));
  ipcMain.handle("stl:miniatura", comTela((_e, url) => printables.miniatura(url)));

  // ---------- Minhas Impressões ----------
  ipcMain.handle("impressoes:listar", comTela(() => impressoes.listar()));
  ipcMain.handle("impressoes:salvar", comTela((_e, valores, id) => impressoes.salvar(valores, typeof id === "string" ? id : undefined)));
  ipcMain.handle("impressoes:adicionar", comTela((_e, novo) => impressoes.adicionar(novo)));
  ipcMain.handle("impressoes:excluir", comTela((_e, id) => impressoes.excluir(id)));
  ipcMain.handle("impressoes:ler", comTela((_e, id) => impressoes.lerArquivo(id)));
  ipcMain.handle("impressoes:imprimi", comTela((_e, id, hoje) => impressoes.marcarImpressa(id, hoje)));
  // Abre uma cópia (na pasta temporária) no fatiador: o arquivo guardado nunca é alterado pelo fatiador.
  ipcMain.handle(
    "impressoes:fatiador",
    comTela(async (_e, id) => {
      const { fatiador } = await configuracoes.ler();
      if (!fatiador.caminho) throw new ErroValidacao("SEM_FATIADOR");
      const { bytes, nome, extensao } = await impressoes.lerArquivo(id);
      const pastaTemp = path.join(app.getPath("temp"), "ProgramaFerramentas3D");
      await require("node:fs/promises").mkdir(pastaTemp, { recursive: true });
      const arquivo = path.join(pastaTemp, nomeModelo(nome.replace(/\.[^.]+$/, ""), extensao));
      await require("node:fs/promises").writeFile(arquivo, bytes);
      await abrirFatiador(fatiador.caminho, arquivo);
      return fatiador.nome;
    }),
  );

  ipcMain.handle("teste:recriar", comTela(() => dadosTeste.recriar()));
  ipcMain.handle("teste:limpar", comTela(() => dadosTeste.limpar()));
  ipcMain.handle("backup:resumo", comTela(() => backup.resumo()));
  ipcMain.handle(
    "backup:exportar",
    comTela(async (e) => {
      const nome = nomeBackup("Backup-Ferramentas3D").replace(/\.json$/, ".zip");
      let destino;
      if (process.env.FERRAMENTAS_SALVAR_DESTINO) destino = path.join(process.env.FERRAMENTAS_SALVAR_DESTINO, nome);
      else {
        const escolha = await dialog.showSaveDialog(janelaDe(e), {
          title: "Salvar backup",
          defaultPath: path.join(await pastasUsuario.garantir("backups"), nome),
          filters: [{ name: "Backup", extensions: ["zip"] }],
        });
        if (escolha.canceled || !escolha.filePath) return null;
        destino = escolha.filePath;
      }
      // Um arquivo só: dados + arquivos de Minhas Impressões.
      await backupZip.gravarZip(destino, await backup.gerarTexto(), await impressoes.arquivosParaBackup());
      return destino;
    }),
  );
  // Pasta temporária com os arquivos extraídos de um backup .zip (apagada depois de restaurar ou ao trocar).
  let pastaTemporariaZip = null;
  const limparTemporariaZip = () => {
    if (pastaTemporariaZip) require("node:fs").rmSync(pastaTemporariaZip, { recursive: true, force: true });
    pastaTemporariaZip = null;
  };
  ipcMain.handle(
    "backup:escolher",
    // arrastado: caminho de um arquivo solto na tela (pelo preload); sem ele, abre a janela de escolha.
    comTela(async (e, arrastado) => {
      let caminho = process.env.FERRAMENTAS_BACKUP_ARQUIVO;
      if (typeof arrastado === "string" && arrastado) {
        if (!path.isAbsolute(arrastado) || !/\.(zip|json)$/i.test(arrastado)) throw new ErroValidacao("Escolha o arquivo .zip do backup.");
        caminho = arrastado;
      }
      if (!caminho) {
        const escolha = await dialog.showOpenDialog(janelaDe(e), {
          title: "Escolher backup para restaurar",
          properties: ["openFile"],
          filters: [{ name: "Backup", extensions: ["zip", "json"] }],
        });
        if (escolha.canceled || !escolha.filePaths[0]) return null;
        caminho = escolha.filePaths[0];
      }
      limparTemporariaZip();
      if (/\.zip$/i.test(caminho)) {
        pastaTemporariaZip = path.join(app.getPath("temp"), `ferramentas3d-restaurar-${process.pid}-${Date.now()}`);
        try {
          backupEscolhido = await backup.lerTextoBackup(await backupZip.lerZip(caminho, pastaTemporariaZip));
        } catch (erro) {
          limparTemporariaZip();
          throw erro;
        }
        pastaArquivosEscolhida = pastaTemporariaZip;
      } else {
        // formato antigo: .json com a pasta "(arquivos)" ao lado
        backupEscolhido = await backup.lerArquivoBackup(caminho);
        pastaArquivosEscolhida = pastaArquivosDoBackup(caminho);
      }
      return { resumo: backupEscolhido.resumo, descartados: backupEscolhido.descartados, nome: path.basename(caminho) };
    }),
  );
  ipcMain.handle(
    "backup:escolher-automatico",
    comTela(async (_e, nome) => {
      backupEscolhido = await backup.lerAutomatico(String(nome));
      pastaArquivosEscolhida = null;
      return { resumo: backupEscolhido.resumo, descartados: backupEscolhido.descartados, nome: String(nome) };
    }),
  );
  ipcMain.handle(
    "backup:restaurar",
    comTela(async () => {
      if (!backupEscolhido) throw new ErroValidacao("Escolha um backup antes de restaurar.");
      const resultado = await backup.restaurar(backupEscolhido);
      backupEscolhido = null;
      await impressoes.recuperarArquivos(pastaArquivosEscolhida);
      pastaArquivosEscolhida = null;
      limparTemporariaZip();
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
    if (![1, 2].includes(id)) throw new Error("Exportação em multipartes indisponível para este copo.");
    return new Uint8Array(await require("node:fs/promises").readFile(path.join(pastaFontes, "..", "copos", `${id}-multipartes.3mf`)));
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
  // Fotos HEIC: o Chromium não abre; o main decodifica e devolve RGBA
  ipcMain.handle("imagens:heic", comTela((_e, bytes) => require("./heic.cjs").heicParaRgba(bytes)));
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
          defaultPath: path.join(await pastasUsuario.garantir("modelos"), arquivo),
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
  ipcMain.handle("fatiador:nomes", comTela(() => [...new Set(CANDIDATOS.map((c) => c.nome))]));
  // Ícone do programa (para o cartão do fatiador). Só caminhos .exe absolutos.
  ipcMain.handle(
    "fatiador:icone",
    comTela(async (_e, caminho) => {
      if (typeof caminho !== "string" || !path.isAbsolute(caminho) || !/\.exe$/i.test(caminho)) throw new ErroValidacao("Caminho inválido.");
      const imagem = await app.getFileIcon(caminho, { size: "normal" });
      return imagem.isEmpty() ? null : imagem.toDataURL();
    }),
  );
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
        const nome = nomeArquivoPdf(orcamento, { hoje: new Date() });
        // Orçamento editado: atualiza o mesmo PDF gerado antes (se o arquivo ainda existe).
        let destino = await pdfsOrcamentos.caminhoExistente(id);
        const atualizado = Boolean(destino);
        if (destino) {
          // mesmo arquivo de antes: não pergunta onde salvar
        } else if (process.env.FERRAMENTAS_PDF_DESTINO) {
          destino = path.join(process.env.FERRAMENTAS_PDF_DESTINO, nome);
        } else {
          const escolha = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
            title: "Salvar orçamento em PDF",
            defaultPath: path.join(await pastasUsuario.garantir("orcamentos"), nome),
            filters: [{ name: "PDF", extensions: ["pdf"] }],
          });
          if (escolha.canceled || !escolha.filePath) return null;
          destino = escolha.filePath;
        }
        const pdf = await htmlParaPdf(gerarHtmlOrcamento(orcamento, config.empresa), {
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate: RODAPE_PDF,
        });
        await gravarPdf(destino, pdf);
        await pdfsOrcamentos.lembrar(id, destino);
        if (!process.env.FERRAMENTAS_PDF_DESTINO) shell.openPath(destino);
        return { caminho: destino, atualizado };
      })(),
    );
  });
  // Orçamentos que já têm PDF gerado (o histórico mostra o botão do WhatsApp neles).
  ipcMain.handle("orcamentos:com-pdf", comTela(() => pdfsOrcamentos.idsComPdf()));
  // Enviar pelo WhatsApp (sem API): copia o PDF para a área de transferência (como o Explorador
  // copia um arquivo) e abre a conversa do cliente direto no aplicativo, com a mensagem pronta.
  // Se não der para copiar, abre a pasta com o PDF selecionado para arrastar.
  ipcMain.handle(
    "orcamentos:whatsapp",
    comTela(async (_e, id) => {
      const wpp = require("../core/whatsapp-orcamento.cjs");
      const orcamento = (await orcamentos.listar()).find((o) => o.id === String(id));
      if (!orcamento) throw new ErroValidacao("Este orçamento não existe mais.");
      const numero = wpp.numeroWhatsapp(orcamento.cliente?.telefone);
      if (!numero) throw new ErroValidacao("Cadastre o telefone do cliente.");
      const arquivos = await pdfsOrcamentos.arquivos(orcamento.id);
      if (!arquivos.length) throw new ErroValidacao("Gere o PDF do orçamento antes de enviar.");
      const config = await configuracoes.ler();
      const mensagem = wpp.montarMensagem(config.orcamento?.mensagemWhatsapp, wpp.valoresDaMensagem(orcamento, config.empresa?.pix));
      return abrirConversaComArquivos(numero, mensagem, arquivos);
    }),
  );

  // ---------- Recibos ----------
  // Gera (ou refaz, com o mesmo número) o recibo de um pagamento e guarda o registro na venda.
  async function gerarRecibo(vendaId, pagamentoId, assinar) {
    const rec = require("../core/recibo.cjs");
    const todas = await financeiro.vendas.listar();
    const venda = todas.find((v) => v.id === String(vendaId));
    if (!venda) throw new ErroValidacao("Esta venda não existe mais.");
    const linha = rec.linhasDaVenda(venda).find((l) => l.pagamento?.id === String(pagamentoId));
    if (!linha) throw new ErroValidacao("Este pagamento não existe mais.");
    const orcamento = venda.orcamentoId ? ((await orcamentos.listar()).find((o) => o.id === venda.orcamentoId) ?? null) : null;
    const config = await configuracoes.ler();
    const numero = linha.recibo?.numero ?? rec.proximoNumero(todas, config.ultimoRecibo);
    let destino = linha.recibo?.caminho;
    try {
      if (destino) await require("node:fs/promises").access(destino);
    } catch {
      destino = null; // arquivo apagado ou movido: grava de novo na pasta Recibos
    }
    if (!destino) {
      const pasta = process.env.FERRAMENTAS_PDF_DESTINO || (await pastasUsuario.garantir("recibos"));
      const nome = rec.nomeArquivoRecibo({ numero, cliente: orcamento?.cliente?.nome || venda.cliente, orcamentoNumero: orcamento?.numero ?? venda.orcamentoNumero, tipo: linha.tipo, teste: venda.teste });
      destino = path.join(pasta, nome);
    }
    const pdf = await htmlParaPdf(rec.gerarHtmlRecibo({ venda, orcamento, empresa: config.empresa, linha, numero, assinar: assinar === true }));
    await gravarPdf(destino, pdf);
    await financeiro.registrarRecibo(venda.id, { numero, pagamentoId: linha.pagamento.id, tipo: linha.tipo, data: linha.pagamento.data, valorCentavos: linha.pagamento.valorCentavos, caminho: destino });
    if (!linha.recibo) await configuracoes.salvar({ ultimoRecibo: numero });
    return { numero, caminho: destino, venda, orcamento };
  }
  ipcMain.handle(
    "recibos:gerar",
    comTela(async (_e, vendaId, pagamentoId, opcoes) => {
      const r = await gerarRecibo(vendaId, pagamentoId, opcoes?.assinar);
      if (!process.env.FERRAMENTAS_PDF_DESTINO) shell.openPath(r.caminho);
      return { numero: r.numero, caminho: r.caminho };
    }),
  );
  ipcMain.handle(
    "recibos:whatsapp",
    comTela(async (_e, vendaId, pagamentoId, opcoes) => {
      const rec = require("../core/recibo.cjs");
      const wpp = require("../core/whatsapp-orcamento.cjs");
      const r = await gerarRecibo(vendaId, pagamentoId, opcoes?.assinar);
      const numero = wpp.numeroWhatsapp(r.orcamento?.cliente?.telefone);
      if (!numero) throw new ErroValidacao("Cadastre o telefone do cliente.");
      const mensagem = rec.mensagemRecibo({ cliente: r.orcamento?.cliente?.nome || r.venda.cliente, numero: r.numero, orcamentoNumero: r.orcamento?.numero ?? r.venda.orcamentoNumero });
      return { numero: r.numero, ...(await abrirConversaComArquivos(numero, mensagem, [r.caminho])) };
    }),
  );
  // As duas versões do orçamento (gravação a laser: frente / frente e verso), uma em cada PDF,
  // na pasta Orçamentos. O cliente escolhe; o orçamento continua com a versão marcada.
  ipcMain.handle(
    "orcamentos:pdf-versoes",
    comTela(async (_e, id) => {
      const { itensNaVersao, versoesDo } = require("../core/orcamento.cjs");
      const orcamento = (await orcamentos.listar()).find((o) => o.id === String(id));
      if (!orcamento) throw new ErroValidacao("Este orçamento não existe mais.");
      const rotulos = versoesDo(orcamento.itens);
      if (!rotulos) throw new ErroValidacao("Este orçamento não tem duas versões.");
      const config = await configuracoes.ler();
      const pasta = process.env.FERRAMENTAS_PDF_DESTINO || (await pastasUsuario.garantir("orcamentos"));
      const base = nomeArquivoPdf(orcamento, { hoje: new Date() }).replace(/\.pdf$/i, "");
      const caminhos = [];
      for (const [indice, rotulo] of rotulos.entries()) {
        const versao = { ...orcamento, itens: itensNaVersao(orcamento.itens, indice) };
        const pdf = await htmlParaPdf(gerarHtmlOrcamento(versao, config.empresa), {
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate: RODAPE_PDF,
        });
        const destino = path.join(pasta, `${base} - ${rotulo}.pdf`);
        await gravarPdf(destino, pdf);
        caminhos.push(destino);
      }
      await pdfsOrcamentos.lembrar(orcamento.id, caminhos);
      if (!process.env.FERRAMENTAS_PDF_DESTINO) for (const c of caminhos) shell.openPath(c);
      return { caminhos };
    }),
  );
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
            defaultPath: path.join(await pastasUsuario.garantir("etiquetas"), nome),
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
  // ---------- Gestão financeira ----------
  const texto = (v) => typeof v === "string";
  ipcMain.handle("financeiro:listar", comTela(() => financeiro.listar()));
  ipcMain.handle("financeiro:salvar-venda", comTela(comEstoque((_e, valores, id) => financeiro.salvarVenda(valores, texto(id) ? id : undefined))));
  ipcMain.handle("financeiro:excluir-venda", comTela(comEstoque((_e, id) => financeiro.excluirVenda(String(id)))));
  ipcMain.handle("financeiro:pagamento", comTela((_e, id, pagamento) => financeiro.registrarPagamento(String(id), pagamento)));
  ipcMain.handle("financeiro:producao", comTela(comEstoque((_e, id, producao) => financeiro.definirProducao(String(id), producao))));
  ipcMain.handle("financeiro:sincronizar", comTela(comEstoque((_e, orcamentoId, resposta) => financeiro.sincronizarOrcamento(String(orcamentoId), resposta))));
  ipcMain.handle("financeiro:vincular", comTela(comEstoque((_e, orcamentoId, vendaId) => financeiro.vincularOrcamento(String(orcamentoId), String(vendaId)))));
  ipcMain.handle("financeiro:salvar-despesa", comTela((_e, valores, id) => financeiro.salvarDespesa(valores, texto(id) ? id : undefined)));
  ipcMain.handle("financeiro:excluir-despesa", comTela((_e, id) => financeiro.excluirDespesa(String(id))));
  // Rascunho do orçamento em andamento (estado do formulário). Fica na pasta de dados.
  const rascunho = new Documento(pasta, "rascunho-orcamento");
  // FERRAMENTAS_PASTAS (testes) troca Documentos\Programa Ferramentas 3D por outra pasta.
  const pastasUsuario = criarPastasUsuario(process.env.FERRAMENTAS_PASTAS || path.join(app.getPath("documents"), NOME_RAIZ));
  const pdfsOrcamentos = criarPdfsOrcamentos(pasta);
  ipcMain.handle("rascunho:ler", comTela(() => rascunho.ler()));
  ipcMain.handle(
    "rascunho:salvar",
    comTela((_e, dados) => {
      const texto = JSON.stringify(dados ?? {});
      if (texto.length > 2_000_000) throw new ErroValidacao("Rascunho grande demais.");
      return rascunho.alterarValor(async () => ({ novo: JSON.parse(texto), resultado: new Date().toISOString() }));
    }),
  );
  ipcMain.handle("orcamentos:situacao", comTela(comEstoque((_e, id, situacao) => orcamentos.definirSituacao(String(id), situacao))));

  ipcMain.handle("filamentos:descontar", (e, id, gramas) =>
    daTela(e) && typeof id === "string" ? responder(filamentos.descontar(id, gramas)) : negado,
  );
  ipcMain.handle("filamentos:descontarVarios", (e, lista) =>
    daTela(e) && Array.isArray(lista) ? responder(filamentos.descontarVarios(lista.map((u) => ({ id: String(u?.id), gramas: Number(u?.gramas) })))) : negado,
  );
  ipcMain.handle("filamentos:pesar", (e, id, balancaG, carretelG) =>
    daTela(e) && typeof id === "string" ? responder(filamentos.pesar(id, String(balancaG), String(carretelG))) : negado,
  );
  ipcMain.handle("filamentos:abrirRoloNovo", (e, id) => (daTela(e) && typeof id === "string" ? responder(filamentos.abrirRoloNovo(id)) : negado));
  ipcMain.handle("filamentos:posicionar", (e, id, posicao) =>
    daTela(e) && (typeof id === "string" || id === null) ? responder(filamentos.posicionar(id, posicao ?? null)) : negado,
  );
  for (const [nome, servico] of Object.entries(cadastros)) {
    // Espera a criação dos dados de teste na primeira abertura, para a lista já vir com eles.
    ipcMain.handle(`${nome}:listar`, (e) => (daTela(e) ? responder(prontoTeste.then(() => servico.listar())) : negado));
    const acerto = nome === "orcamentos" ? estoque.depois : (p) => p;
    ipcMain.handle(`${nome}:salvar`, (e, valores, id) =>
      daTela(e) ? responder(acerto(servico.salvar(valores, typeof id === "string" ? id : undefined))) : negado,
    );
    ipcMain.handle(`${nome}:excluir`, (e, id) =>
      daTela(e) && typeof id === "string" ? responder(acerto(servico.excluir(id))) : negado,
    );
  }

  ipcMain.handle("config:ler", (e) => (daTela(e) ? responderConfig(configuracoes.ler()) : negado));
  ipcMain.handle("config:salvar", (e, alteracao) =>
    daTela(e) ? responderConfig(configuracoes.salvar(alteracao)) : negado,
  );
  // Minhas pastas (Configurações): lista e abre no Explorador. "raiz" abre a pasta principal.
  ipcMain.handle("pastas:listar", comTela(() => ({ raiz: pastasUsuario.raiz, pastas: pastasUsuario.listar(), dados: pasta })));
  ipcMain.handle(
    "pastas:abrir",
    comTela(async (_e, tipo) => {
      let alvo;
      if (tipo === "dados") {
        await require("node:fs/promises").mkdir(pasta, { recursive: true });
        alvo = pasta;
      } else if (tipo === "raiz") alvo = await pastasUsuario.garantirTodas();
      else if (typeof tipo === "string" && pastasUsuario.listar().some((p) => p.tipo === tipo)) alvo = await pastasUsuario.garantir(tipo);
      else throw new ErroValidacao("Pasta inválida.");
      if (process.env.FERRAMENTAS_CAPTURA) return alvo; // testes: não abre o Explorador
      const erro = await shell.openPath(alvo);
      if (erro) throw new ErroValidacao(`Não foi possível abrir a pasta: ${erro}`);
      return alvo;
    }),
  );
  ipcMain.handle("dados:abrir-pasta", async (e) => {
    if (!daTela(e)) return negado;
    await require("node:fs/promises").mkdir(pasta, { recursive: true });
    const erro = await shell.openPath(pasta);
    return erro ? { ok: false, erro: `Não foi possível abrir a pasta: ${erro}` } : { ok: true, dados: pasta };
  });

  ipcMain.handle("atualizacao:verificar", (e) => (daTela(e) ? verificarManualmente() : { estado: "erro" }));
  // A tela avisa que já pode mostrar o aviso de versão baixada.
  ipcMain.handle("atualizacao:ouvir", (e) => {
    if (!daTela(e)) return;
    atualizacao.telaOuvindo = true;
    avisarTela();
  });
  // "Atualizar agora": fecha, instala sem perguntar nada e abre de novo.
  ipcMain.handle("atualizacao:instalar", (e) => {
    if (!daTela(e) || !autoUpdater || atualizacao.estado !== "pronta") return false;
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  });

  ipcMain.handle("produtos:listar", (e) => (daTela(e) ? responder(prontoTeste.then(() => produtos.listar())) : negado));
  ipcMain.handle("produtos:salvar", (e, valores, id) =>
    daTela(e) ? responder(produtos.salvar(valores, typeof id === "string" ? id : undefined)) : negado,
  );
  ipcMain.handle("produtos:excluir", (e, id) =>
    daTela(e) && typeof id === "string" ? responder(produtos.excluir(id)) : negado,
  );

  // Levar produtos para outro PC: exportar todos num arquivo; importar juntando (nunca apaga).
  const transporte = require("../core/produtos-transporte.cjs");
  ipcMain.handle(
    "produtos:exportar",
    comTela(async (e) => {
      const lista = await produtos.listar();
      if (!lista.some((p) => p.teste !== true)) throw new ErroValidacao("Ainda não há produtos para exportar.");
      const nome = `Produtos Ferramentas 3D ${new Date().toISOString().slice(0, 10)}.json`;
      let destino;
      if (process.env.FERRAMENTAS_SALVAR_DESTINO) destino = path.join(process.env.FERRAMENTAS_SALVAR_DESTINO, nome);
      else {
        const escolha = await dialog.showSaveDialog(janelaDe(e), {
          title: "Exportar produtos",
          defaultPath: path.join(await pastasUsuario.garantir("produtos"), nome),
          filters: [{ name: "Produtos", extensions: ["json"] }],
        });
        if (escolha.canceled || !escolha.filePath) return null;
        destino = escolha.filePath;
      }
      const pacote = transporte.montarPacoteProdutos(lista);
      await require("node:fs/promises").writeFile(destino, JSON.stringify(pacote, null, 2), "utf8");
      return { destino, quantidade: pacote.produtos.length };
    }),
  );
  let importacao = null; // produtos lidos do arquivo, à espera da resposta sobre os de mesmo nome
  ipcMain.handle(
    "produtos:importar-abrir",
    comTela(async (e) => {
      let caminho = process.env.FERRAMENTAS_IMPORTAR_ARQUIVO;
      if (!caminho) {
        const escolha = await dialog.showOpenDialog(janelaDe(e), {
          title: "Importar produtos",
          properties: ["openFile"],
          filters: [{ name: "Produtos", extensions: ["json"] }],
        });
        if (escolha.canceled || !escolha.filePaths[0]) return null;
        caminho = escolha.filePaths[0];
      }
      const lido = transporte.lerPacoteProdutos(await require("node:fs/promises").readFile(caminho, "utf8"));
      importacao = lido;
      const plano = transporte.planejarImportacao(await produtos.listar(), lido.produtos);
      return { novos: plano.novos.length, atualizar: plano.atualizar.length, mesmoNome: plano.mesmoNome.map((m) => m.atual.nome), invalidos: lido.invalidos };
    }),
  );
  ipcMain.handle(
    "produtos:importar-aplicar",
    comTela(async (_e, escolha) => {
      if (!importacao) throw new ErroValidacao("Escolha o arquivo de produtos de novo.");
      const vindos = importacao.produtos;
      importacao = null;
      // o plano é refeito sobre o que está gravado agora (algo pode ter mudado enquanto a pergunta estava aberta)
      return produtos.colecao.alterar(async (itens) => {
        const r = transporte.aplicarImportacao(itens, transporte.planejarImportacao(itens, vindos), escolha === "atualizar" ? "atualizar" : "manter");
        return { itens: r.produtos, resultado: { novos: r.novos, atualizados: r.atualizados } };
      });
    }),
  );
}

// 3D: se a placa de vídeo não puder ser usada (driver antigo, acesso remoto, máquina virtual), o Chromium
// desenha o WebGL por software (SwiftShader). Mais lento, mas a prévia aparece. O "unsafe" do nome vale para
// sites da internet; aqui a tela só carrega arquivos do próprio programa, com CSP.
app.commandLine.appendSwitch("enable-unsafe-swiftshader");
// Testes: simular um computador sem placa de vídeo (FERRAMENTAS_SEM_GPU=1) ou sem nenhum 3D (=sem-3d).
if (process.env.FERRAMENTAS_SEM_GPU) {
  app.disableHardwareAcceleration();
  if (process.env.FERRAMENTAS_SEM_GPU === "sem-3d") app.commandLine.appendSwitch("disable-webgl");
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
