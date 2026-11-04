// Meu fatiador: encontra fatiadores instalados e abre o escolhido (com um arquivo, se houver).
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ErroValidacao } = require("../core/validacao.cjs");

// pasta: caminho fixo. prefixo: pasta cujo nome muda com a versão (ex.: "UltiMaker Cura 5.8.1").
const CANDIDATOS = [
  { nome: "Bambu Studio", pasta: "Bambu Studio", exe: "bambu-studio.exe" },
  { nome: "OrcaSlicer", pasta: "OrcaSlicer", exe: "orca-slicer.exe" },
  { nome: "PrusaSlicer", pasta: path.join("Prusa3D", "PrusaSlicer"), exe: "prusa-slicer.exe" },
  { nome: "Creality Print", prefixo: path.join("Creality", "Creality Print"), exe: "CrealityPrint.exe" },
  { nome: "UltiMaker Cura", prefixo: "UltiMaker Cura", exe: "UltiMaker-Cura.exe" },
  { nome: "Ultimaker Cura", prefixo: "Ultimaker Cura", exe: "Cura.exe" },
  { nome: "Anycubic Slicer Next", pasta: "AnycubicSlicerNext", exe: "AnycubicSlicerNext.exe" },
  { nome: "ElegooSlicer", pasta: "ElegooSlicer", exe: "elegoo-slicer.exe" },
];

async function existe(arquivo) {
  try {
    return (await fs.stat(arquivo)).isFile();
  } catch {
    return false;
  }
}

function pastasBase(ambiente = process.env) {
  return [ambiente.ProgramFiles, ambiente["ProgramFiles(x86)"], ambiente.LOCALAPPDATA && path.join(ambiente.LOCALAPPDATA, "Programs")].filter(Boolean);
}

async function detectarFatiadores(bases = pastasBase()) {
  const achados = [];
  for (const base of bases) {
    for (const c of CANDIDATOS) {
      if (c.pasta) {
        const caminho = path.join(base, c.pasta, c.exe);
        if (await existe(caminho)) achados.push({ nome: c.nome, caminho });
      } else {
        const pai = path.join(base, path.dirname(c.prefixo));
        const inicio = path.basename(c.prefixo).toLowerCase();
        let nomes = [];
        try {
          nomes = await fs.readdir(pai);
        } catch {
          continue;
        }
        for (const nome of nomes.filter((n) => n.toLowerCase().startsWith(inicio)).sort().reverse()) {
          const caminho = path.join(pai, nome, c.exe);
          if (await existe(caminho)) {
            achados.push({ nome: nome.replace(/^Ultimaker/i, "UltiMaker"), caminho });
            break; // a versão mais nova basta
          }
        }
      }
    }
  }
  const vistos = new Set();
  return achados.filter((a) => (vistos.has(a.caminho.toLowerCase()) ? false : vistos.add(a.caminho.toLowerCase())));
}

// Abre o fatiador. arquivo (opcional): modelo para já abrir nele.
async function abrirFatiador(caminhoExe, arquivo, { iniciar = spawn } = {}) {
  if (typeof caminhoExe !== "string" || !path.isAbsolute(caminhoExe) || !/\.exe$/i.test(caminhoExe)) {
    throw new ErroValidacao("Escolha o seu fatiador em Configurações.");
  }
  if (!(await existe(caminhoExe))) throw new ErroValidacao("O fatiador não foi encontrado nesse caminho. Escolha de novo em Configurações.");
  const argumentos = arquivo ? [arquivo] : [];
  const processo = iniciar(caminhoExe, argumentos, { detached: true, stdio: "ignore", cwd: path.dirname(caminhoExe) });
  processo.unref?.();
  return true;
}

module.exports = { CANDIDATOS, abrirFatiador, detectarFatiadores, pastasBase };
