// Google Drive para computador: achar a pasta "Meu Drive" e levar a pasta Modelos 3D para lá.
// O programa não fala com o Google: o próprio Drive para computador sobe os arquivos.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const NOMES = ["Meu Drive", "My Drive"];
const DESTINO = ["Programa Ferramentas 3D", "Modelos 3D"];
const PAGINA_DOWNLOAD = "https://www.google.com/drive/download/";

async function ehPasta(caminho) {
  try {
    return (await fs.stat(caminho)).isDirectory();
  } catch {
    return false;
  }
}

// Lugares onde o Drive para computador costuma ficar: uma letra (G:\Meu Drive) ou a pasta do usuário.
function candidatos({ letras = "DEFGHIJKLMNOPQRSTUVWXYZ", pessoal = process.env.USERPROFILE ?? "" } = {}) {
  const lista = [];
  for (const letra of letras) for (const nome of NOMES) lista.push(`${letra}:\\${nome}`);
  if (pessoal) {
    for (const nome of NOMES) {
      lista.push(path.join(pessoal, nome));
      lista.push(path.join(pessoal, "Google Drive", nome));
    }
  }
  return lista;
}

async function acharMeuDrive(lista = candidatos()) {
  for (const c of lista) if (await ehPasta(c)) return c;
  return "";
}

const destinoNoDrive = (meuDrive) => path.join(meuDrive, ...DESTINO);

// A pasta está dentro do Meu Drive?
function dentroDe(pasta, meuDrive) {
  if (!pasta || !meuDrive) return false;
  const relativo = path.relative(meuDrive.toLowerCase(), pasta.toLowerCase());
  return relativo === "" || (!relativo.startsWith("..") && !path.isAbsolute(relativo));
}

// Copia tudo de origem para destino. Nunca sobrescreve nem apaga: arquivo que já existe lá fica.
// Devolve quantos arquivos foram copiados.
async function copiarModelos(origem, destino) {
  await fs.mkdir(destino, { recursive: true });
  if (!(await ehPasta(origem)) || path.resolve(origem).toLowerCase() === path.resolve(destino).toLowerCase()) return 0;
  let copiados = 0;
  async function copiar(de, para) {
    for (const item of await fs.readdir(de, { withFileTypes: true })) {
      const a = path.join(de, item.name);
      const b = path.join(para, item.name);
      if (item.isDirectory()) {
        if (path.resolve(a).toLowerCase() === path.resolve(destino).toLowerCase()) continue; // destino dentro da origem
        await fs.mkdir(b, { recursive: true });
        await copiar(a, b);
      } else if (item.isFile()) {
        try {
          await fs.copyFile(a, b, fs.constants.COPYFILE_EXCL);
          copiados++;
        } catch (erro) {
          if (erro.code !== "EEXIST") throw erro;
        }
      }
    }
  }
  await copiar(origem, destino);
  return copiados;
}

module.exports = { PAGINA_DOWNLOAD, acharMeuDrive, candidatos, copiarModelos, dentroDe, destinoNoDrive };
