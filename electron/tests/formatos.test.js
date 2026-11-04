import { describe, expect, it } from "vitest";
import { formatarDocumento, formatarTelefone, iniciais, linkWhatsApp } from "../src/core/formatos.js";

describe("formatos", () => {
  it("telefone", () => {
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("2133334444")).toBe("(21) 3333-4444");
    expect(formatarTelefone("5511987654321")).toBe("+55 (11) 98765-4321");
    expect(formatarTelefone("")).toBe("");
  });

  it("CPF e CNPJ", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("link do WhatsApp", () => {
    expect(linkWhatsApp("11987654321")).toBe("https://wa.me/5511987654321");
    expect(linkWhatsApp("5511987654321")).toBe("https://wa.me/5511987654321");
    expect(linkWhatsApp("987654321")).toBeNull();
  });

  it("iniciais", () => {
    expect(iniciais("Maria Souza Lima")).toBe("ML");
    expect(iniciais("ana")).toBe("A");
    expect(iniciais("")).toBe("?");
  });
});
