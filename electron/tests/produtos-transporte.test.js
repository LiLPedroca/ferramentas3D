import { describe, expect, it } from "vitest";
import transporte from "../src/core/produtos-transporte.cjs";

const { aplicarImportacao, lerPacoteProdutos, montarPacoteProdutos, planejarImportacao } = transporte;

const produto = (id, nome, atualizadoEm = "2026-11-10T10:00:00.000Z", extra = {}) => ({
  id,
  nome,
  categoria: "",
  precoCentavos: "1000",
  pesoG: "",
  alturaMm: "",
  larguraMm: "",
  comprimentoMm: "",
  observacoes: "",
  criadoEm: "2026-11-01T10:00:00.000Z",
  atualizadoEm,
  ...extra,
});

const texto = (produtos) => JSON.stringify(montarPacoteProdutos(produtos));

describe("Produtos: exportar e importar", () => {
  it("o arquivo leva todos os produtos com as informações (foto inclusa), menos os de teste", () => {
    const foto = "data:image/jpeg;base64,AAAA";
    const { produtos } = lerPacoteProdutos(texto([produto("aaaaaaaa-1", "Vaso", undefined, { foto }), produto("bbbbbbbb-2", "Teste", undefined, { teste: true })]));
    expect(produtos.map((p) => p.nome)).toEqual(["Vaso"]);
    expect(produtos[0].foto).toBe(foto);
  });

  it("arquivo de outra coisa dá erro em pt-BR", () => {
    expect(() => lerPacoteProdutos("{}")).toThrow(/não é de produtos/);
    expect(() => lerPacoteProdutos("lixo")).toThrow(/não é de produtos/);
  });

  it("produto inválido no arquivo é pulado e contado", () => {
    const json = montarPacoteProdutos([produto("aaaaaaaa-1", "Vaso")]);
    json.produtos.push({ id: "x", nome: "" });
    const r = lerPacoteProdutos(JSON.stringify(json));
    expect(r.produtos).toHaveLength(1);
    expect(r.invalidos).toBe(1);
  });

  it("junta e nunca apaga: novo entra, mesmo id mais recente atualiza, o que só existe aqui fica", () => {
    const aqui = [produto("aaaaaaaa-1", "Vaso"), produto("cccccccc-3", "Só em casa")];
    const vindos = [produto("aaaaaaaa-1", "Vaso grande", "2026-11-15T10:00:00.000Z"), produto("bbbbbbbb-2", "Chaveiro")];
    const plano = planejarImportacao(aqui, vindos);
    const r = aplicarImportacao(aqui, plano);
    expect(r.novos).toBe(1);
    expect(r.atualizados).toBe(1);
    expect(r.produtos.map((p) => p.nome).sort()).toEqual(["Chaveiro", "Só em casa", "Vaso grande"]);
  });

  it("mesmo id, mas a versão daqui é mais nova: fica a daqui", () => {
    const aqui = [produto("aaaaaaaa-1", "Vaso novo", "2026-11-15T10:00:00.000Z")];
    const plano = planejarImportacao(aqui, [produto("aaaaaaaa-1", "Vaso velho")]);
    expect(plano.iguais).toBe(1);
    expect(aplicarImportacao(aqui, plano).produtos[0].nome).toBe("Vaso novo");
  });

  it("id diferente com o mesmo nome (sem ligar para maiúsculas e acentos) vai para a pergunta", () => {
    const aqui = [produto("aaaaaaaa-1", "Porta-Copos Ação")];
    const plano = planejarImportacao(aqui, [produto("bbbbbbbb-2", "porta-copos acao")]);
    expect(plano.mesmoNome).toHaveLength(1);
    expect(plano.novos).toHaveLength(0);
  });

  it("mesmo nome + Atualizar: o produto daqui recebe o importado e mantém o id (orçamentos continuam ligados)", () => {
    const aqui = [produto("aaaaaaaa-1", "Vaso", undefined, { precoCentavos: "1000" })];
    const plano = planejarImportacao(aqui, [produto("bbbbbbbb-2", "Vaso", undefined, { precoCentavos: "2500" })]);
    const r = aplicarImportacao(aqui, plano, "atualizar");
    expect(r.produtos).toHaveLength(1);
    expect(r.produtos[0].id).toBe("aaaaaaaa-1");
    expect(r.produtos[0].precoCentavos).toBe("2500");
    expect(r.atualizados).toBe(1);
  });

  it("mesmo nome + Manter os dois: o importado entra como outro produto", () => {
    const aqui = [produto("aaaaaaaa-1", "Vaso")];
    const plano = planejarImportacao(aqui, [produto("bbbbbbbb-2", "Vaso")]);
    const r = aplicarImportacao(aqui, plano, "manter");
    expect(r.produtos).toHaveLength(2);
    expect(r.novos).toBe(1);
  });
});
