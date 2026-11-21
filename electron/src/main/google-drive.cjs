// Google Drive para computador: achar a pasta "Meu Drive" e levar a pasta Modelos 3D para lá.
// O programa não fala com o Google: o próprio Drive para computador sobe os arquivos.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

// "Meu Drive" muda de nome com o idioma do Windows (ex.: notebook em português de Portugal).
const NOMES = ["Meu Drive", "My Drive", "O meu disco", "Mi unidad", "Mon Drive", "Meine Ablage", "Il mio Drive", "Mijn Drive", "Mój dysk", "Мой диск"];
// Pastas da raiz do Drive que não são o "Meu Drive" (usadas quando o nome é desconhecido).
const OUTRAS = ["drives compartilhados", "drives partilhados", "shared drives", "unidades compartidas", "outros computadores", "other computers", "otros ordenadores", "computadores"];
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

// Nome do volume da letra (ex.: "Google Drive"), pelo comando "vol" do Windows.
function rotuloDoVolume(letra) {
  return new Promise((ok) => {
    require("node:child_process").execFile("cmd.exe", ["/d", "/c", "vol", `${letra}:`], { windowsHide: true, timeout: 5000 }, (_erro, saida) => ok(String(saida ?? "")));
  });
}

// Pelo nome do volume "Google Drive": a pasta da raiz que sobra (o "Meu Drive" em qualquer idioma).
async function pelaLetra(letras, rotulo, raizDe = (letra) => `${letra}:\\`) {
  for (const letra of letras) {
    const raiz = raizDe(letra);
    if (!(await ehPasta(raiz))) continue;
    if (!/google drive/i.test(await rotulo(letra))) continue;
    let nomes = [];
    try {
      nomes = (await fs.readdir(raiz, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }
    const restantes = nomes.filter((n) => !/^[.$]/.test(n) && n !== "System Volume Information" && !OUTRAS.includes(n.toLowerCase()));
    if (restantes.length === 1) return path.join(raiz, restantes[0]);
  }
  return "";
}

// opcoes (testes): { lista, letras, rotulo }
async function acharMeuDrive({ lista = candidatos(), letras = "DEFGHIJKLMNOPQRSTUVWXYZ", rotulo = rotuloDoVolume, raizDe } = {}) {
  for (const c of lista) if (await ehPasta(c)) return c;
  return pelaLetra(letras, rotulo, raizDe);
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
