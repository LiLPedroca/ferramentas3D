import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { montarProjeto, validarProjeto } = require("../src/core/projeto.cjs");
const { lerBackup, montarBackup } = require("../src/core/backup.cjs");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("Meus modelos", () => {
  it("monta um chaveiro salvo com opções, miniatura e datas", () => {
    const p = montarProjeto(
      { tipo: "chaveiro", nome: "  Chaveiro   Pedro ", opcoes: { texto: "Pedro", largura: 70 }, miniatura: PNG },
      { id: ID, agora: "2026-11-04T10:00:00.000Z" },
    );
    expect(p.nome).toBe("Chaveiro Pedro");
    expect(p.opcoes).toEqual({ texto: "Pedro", largura: 70 });
    expect(p.imagem).toBe("");
    expect(p.criadoEm).toBe("2026-11-04T10:00:00.000Z");
    expect(validarProjeto(p)).toBe(true);
  });

  it("ao editar, mantém o tipo e a data de criação", () => {
    const anterior = montarProjeto({ tipo: "palavras", nome: "Lar", opcoes: { modo: "placa" } }, { id: ID, agora: "2026-11-01T00:00:00.000Z" });
    const novo = montarProjeto({ tipo: "chaveiro", nome: "Lar doce lar", opcoes: { modo: "letreiro" } }, { id: ID, anterior, agora: "2026-11-04T00:00:00.000Z" });
    expect(novo.tipo).toBe("palavras");
    expect(novo.criadoEm).toBe("2026-11-01T00:00:00.000Z");
    expect(novo.atualizadoEm).toBe("2026-11-04T00:00:00.000Z");
  });

  it("logo precisa da imagem; recusa tipos, nomes e imagens inválidos", () => {
    expect(() => montarProjeto({ tipo: "logo", nome: "Logo", opcoes: {} }, { id: ID })).toThrow(/imagem do logo/);
    expect(montarProjeto({ tipo: "logo", nome: "Logo", opcoes: {}, imagem: PNG }, { id: ID }).imagem).toBe(PNG);
    expect(() => montarProjeto({ tipo: "foguete", nome: "x", opcoes: {} }, { id: ID })).toThrow(/Tipo/);
    expect(() => montarProjeto({ tipo: "chaveiro", nome: " ", opcoes: {} }, { id: ID })).toThrow(/Nome/);
    expect(() => montarProjeto({ tipo: "chaveiro", nome: "x", opcoes: {}, miniatura: "javascript:alert(1)" }, { id: ID })).toThrow(/Miniatura/);
    expect(() => montarProjeto({ tipo: "chaveiro", nome: "x", opcoes: [] }, { id: ID })).toThrow(/Opções/);
  });

  it("entra no backup e volta na restauração", () => {
    const p = montarProjeto({ tipo: "chaveiro", nome: "Pedro", opcoes: { texto: "Pedro" } }, { id: ID });
    const texto = JSON.stringify(montarBackup({ projetos: [p, { id: "x" }] }, { versaoApp: "0.22.0" }));
    const { dados, resumo, descartados } = lerBackup(texto);
    expect(dados.projetos).toEqual([p]);
    expect(resumo.projetos).toBe(1);
    expect(descartados).toBe(1);
  });
});
