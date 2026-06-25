import { describe, it, expect } from "vitest";
import {
  extractASIN,
  parsePrice,
  resolveTargetPrice,
  hasTargetPrice,
  parseTargetPriceInput,
  targetPriceForDb,
  formatDateTime,
  getPriceVariation,
  checkVariation,
  isValidLogin,
  normalizeLogin,
} from "./utils";

describe("extractASIN", () => {
  it("extrai ASIN de URL com /dp/", () => {
    expect(extractASIN("https://www.amazon.com.br/dp/B08N5WRWNW")).toBe("B08N5WRWNW");
  });

  it("extrai ASIN de URL com /gp/product/", () => {
    expect(extractASIN("https://www.amazon.com.br/gp/product/B08N5WRWNW")).toBe("B08N5WRWNW");
  });

  it("extrai ASIN mesmo com query string após o ASIN", () => {
    expect(
      extractASIN("https://www.amazon.com.br/Produto-Titulo/dp/B08N5WRWNW?ref=sr_1_1"),
    ).toBe("B08N5WRWNW");
  });

  it("retorna null para URL sem ASIN", () => {
    expect(extractASIN("https://www.amazon.com.br/s?k=notebook")).toBeNull();
  });

  it("retorna null para string vazia", () => {
    expect(extractASIN("")).toBeNull();
  });

  it("retorna null para URL com ASIN curto demais", () => {
    expect(extractASIN("https://www.amazon.com.br/dp/B08N5")).toBeNull();
  });
});

describe("parsePrice", () => {
  it("parseia preço com prefixo R$ e separadores BRL", () => {
    expect(parsePrice("R$ 1.299,90")).toBe(1299.9);
  });

  it("parseia preço sem prefixo R$", () => {
    expect(parsePrice("1.299,90")).toBe(1299.9);
  });

  it("parseia preço sem separador de milhar", () => {
    expect(parsePrice("R$199,90")).toBe(199.9);
  });

  it("parseia preço com espaço em branco", () => {
    expect(parsePrice("  R$ 50,00  ")).toBe(50.0);
  });

  it("retorna null para texto não numérico", () => {
    expect(parsePrice("Não disponível")).toBeNull();
  });

  it("retorna null para string vazia", () => {
    expect(parsePrice("")).toBeNull();
  });
});

describe("resolveTargetPrice", () => {
  it("retorna o valor quando positivo", () => {
    expect(resolveTargetPrice(99.9)).toBe(99.9);
  });

  it("retorna null para null", () => {
    expect(resolveTargetPrice(null)).toBeNull();
  });

  it("retorna null para undefined", () => {
    expect(resolveTargetPrice(undefined)).toBeNull();
  });

  it("retorna null para zero", () => {
    expect(resolveTargetPrice(0)).toBeNull();
  });

  it("retorna null para valor negativo", () => {
    expect(resolveTargetPrice(-5)).toBeNull();
  });

  it("retorna null para Infinity", () => {
    expect(resolveTargetPrice(Infinity)).toBeNull();
  });
});

describe("hasTargetPrice", () => {
  it("retorna true para valor positivo", () => {
    expect(hasTargetPrice(99.9)).toBe(true);
  });

  it("retorna false para zero", () => {
    expect(hasTargetPrice(0)).toBe(false);
  });

  it("retorna false para null", () => {
    expect(hasTargetPrice(null)).toBe(false);
  });
});

describe("parseTargetPriceInput", () => {
  it("parseia entrada em ponto flutuante padrão", () => {
    expect(parseTargetPriceInput("99.9")).toBe(99.9);
  });

  it("parseia inteiro como valor positivo", () => {
    expect(parseTargetPriceInput("100")).toBe(100);
  });

  it("retorna null para string vazia", () => {
    expect(parseTargetPriceInput("")).toBeNull();
  });

  it("retorna null para string só de espaços", () => {
    expect(parseTargetPriceInput("   ")).toBeNull();
  });

  it("retorna null para valor negativo", () => {
    expect(parseTargetPriceInput("-50")).toBeNull();
  });

  it("retorna null para zero", () => {
    expect(parseTargetPriceInput("0")).toBeNull();
  });
});

describe("targetPriceForDb", () => {
  it("converte null para 0", () => {
    expect(targetPriceForDb(null)).toBe(0);
  });

  it("mantém valor positivo", () => {
    expect(targetPriceForDb(99.9)).toBe(99.9);
  });
});

describe("formatDateTime", () => {
  it("formata data no formato SQLite (com espaço)", () => {
    const result = formatDateTime("2024-01-15 10:30:00");
    expect(result).toMatch(/15\/01\/2024/);
  });

  it("formata data no formato ISO (com T)", () => {
    const result = formatDateTime("2024-01-15T10:30:00");
    expect(result).toMatch(/15\/01\/2024/);
  });

  it('retorna "Não verificado" para null', () => {
    expect(formatDateTime(null)).toBe("Não verificado");
  });

  it('retorna "Não verificado" para string vazia', () => {
    expect(formatDateTime("")).toBe("Não verificado");
  });

  it('retorna "Não verificado" para data inválida', () => {
    expect(formatDateTime("não-é-data")).toBe("Não verificado");
  });
});

describe("getPriceVariation", () => {
  it("retorna ⬆️🔴 quando preço subiu", () => {
    const result = getPriceVariation(150, 100);
    expect(result?.icon).toBe("⬆️🔴");
    expect(result?.diff).toBe(50);
  });

  it("retorna ⬇️🟢 quando preço caiu", () => {
    const result = getPriceVariation(80, 100);
    expect(result?.icon).toBe("⬇️🟢");
    expect(result?.diff).toBe(-20);
  });

  it("retorna ➖🟡 quando preço não mudou", () => {
    const result = getPriceVariation(100, 100);
    expect(result?.icon).toBe("➖🟡");
    expect(result?.diff).toBe(0);
  });

  it("retorna null quando previousPrice é null", () => {
    expect(getPriceVariation(100, null)).toBeNull();
  });

  it("retorna null quando price é null", () => {
    expect(getPriceVariation(null, 100)).toBeNull();
  });

  it("inclui formattedDiff com sinal no resultado", () => {
    const result = getPriceVariation(120, 100);
    expect(result?.formattedDiff).toContain("+");
  });
});

describe("checkVariation", () => {
  it("retorna string vazia quando previousPrice é undefined", () => {
    expect(checkVariation(100, undefined)).toBe("");
  });

  it("retorna string com ícone e valor formatado", () => {
    const result = checkVariation(80, 100);
    expect(result).toContain("⬇️🟢");
  });
});

describe("isValidLogin", () => {
  it('aceita "admin" literal', () => {
    expect(isValidLogin("admin")).toBe(true);
  });

  it("aceita e-mail válido", () => {
    expect(isValidLogin("user@example.com")).toBe(true);
  });

  it("aceita e-mail com subdomínio", () => {
    expect(isValidLogin("user@mail.example.com")).toBe(true);
  });

  it("rejeita string sem @", () => {
    expect(isValidLogin("nao-e-email")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(isValidLogin("")).toBe(false);
  });

  it("rejeita string só de espaços", () => {
    expect(isValidLogin("   ")).toBe(false);
  });
});

describe("normalizeLogin", () => {
  it('preserva "admin" em minúsculas', () => {
    expect(normalizeLogin("admin")).toBe("admin");
  });

  it("converte e-mail para minúsculas", () => {
    expect(normalizeLogin("User@EMAIL.com")).toBe("user@email.com");
  });

  it("remove espaços ao redor", () => {
    expect(normalizeLogin("  user@example.com  ")).toBe("user@example.com");
  });
});
