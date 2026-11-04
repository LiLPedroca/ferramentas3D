// Gera build/renderer: junta o JavaScript da tela (com Three.js) em um arquivo só
// e copia o HTML e o CSS. O Electron carrega esses arquivos com file://.
import { build } from "esbuild";
import { copyFile, cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const saida = join(raiz, "build", "renderer");
const pacote = JSON.parse(await readFile(join(raiz, "package.json"), "utf8"));

await mkdir(saida, { recursive: true });

await build({
  entryPoints: [join(raiz, "src", "renderer", "app.js")],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outfile: join(saida, "app.js"),
  define: { __VERSAO__: JSON.stringify(pacote.version) },
  // o manifold-3d só importa "node:module" quando roda no Node; na tela recebe o .wasm pronto
  external: ["node:module"],
  logLevel: "warning",
});

// Worker do Conversor SVG (arquivo separado, carregado com new Worker()).
await build({
  entryPoints: [join(raiz, "src", "renderer", "svg-worker.js")],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outfile: join(saida, "svg-worker.js"),
  logLevel: "warning",
});

for (const arquivo of ["index.html", "styles.css"]) {
  await copyFile(join(raiz, "src", "renderer", arquivo), join(saida, arquivo));
}
await cp(join(raiz, "src", "renderer", "assets"), join(saida, "assets"), { recursive: true });
// Manifold (geometria dos modelos personalizados): o .wasm é lido pelo processo principal
await copyFile(join(raiz, "node_modules", "manifold-3d", "manifold.wasm"), join(saida, "assets", "manifold.wasm"));
await copyFile(join(raiz, "node_modules", "manifold-3d", "LICENSE"), join(saida, "assets", "manifold-LICENSE.txt"));

console.log(`Renderer gerado em ${saida} (versão ${pacote.version})`);
