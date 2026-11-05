// Gera recursos/icone.ico (16 a 256 px, PNG dentro do ICO) e recursos/icone.png a partir de
// recursos/icone.svg, desenhando o SVG no Chromium do próprio Electron.
// Uso: npx electron scripts/gerar-icone.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const pasta = path.join(__dirname, "..", "recursos");
const TAMANHOS = [16, 20, 24, 32, 40, 48, 64, 128, 256];

function ico(pngs) {
  // ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes cada) + PNGs
  const cabecalho = Buffer.alloc(6 + 16 * pngs.length);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(pngs.length, 4);
  let deslocamento = cabecalho.length;
  pngs.forEach(({ tamanho, dados }, i) => {
    const o = 6 + 16 * i;
    cabecalho.writeUInt8(tamanho >= 256 ? 0 : tamanho, o);
    cabecalho.writeUInt8(tamanho >= 256 ? 0 : tamanho, o + 1);
    cabecalho.writeUInt8(0, o + 2);
    cabecalho.writeUInt8(0, o + 3);
    cabecalho.writeUInt16LE(1, o + 4);
    cabecalho.writeUInt16LE(32, o + 6);
    cabecalho.writeUInt32LE(dados.length, o + 8);
    cabecalho.writeUInt32LE(deslocamento, o + 12);
    deslocamento += dados.length;
  });
  return Buffer.concat([cabecalho, ...pngs.map((p) => p.dados)]);
}

app.whenReady().then(async () => {
  const janela = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await janela.loadURL("data:text/html,<body></body>");
  const svg = fs.readFileSync(path.join(pasta, "icone.svg"), "utf8");
  const pngs = [];
  for (const tamanho of TAMANHOS) {
    const base64 = await janela.webContents.executeJavaScript(`(async () => {
      const img = new Image();
      img.src = "data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}";
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = ${tamanho};
      c.getContext("2d").drawImage(img, 0, 0, ${tamanho}, ${tamanho});
      return c.toDataURL("image/png").split(",")[1];
    })()`);
    pngs.push({ tamanho, dados: Buffer.from(base64, "base64") });
  }
  fs.writeFileSync(path.join(pasta, "icone.ico"), ico(pngs));
  fs.writeFileSync(path.join(pasta, "icone.png"), pngs[pngs.length - 1].dados);
  console.log("ícone gerado:", TAMANHOS.join(", "), "px");
  app.quit();
});
