import { describe, it, expect } from "vitest";
import { formatPrice, formatTargetPrice, variationColorClass } from "./formatters";

describe("formatPrice", () => {
  it("formata preço em reais no padrão pt-BR", () => {
    const result = formatPrice(1299.9);
    expect(result).toMatch(/1\.299/);
    expect(result).toMatch(/R\$/);
  });

  it("formata zero como moeda", () => {
    const result = formatPrice(0);
    expect(result).toMatch(/R\$/);
    expect(result).toMatch(/0,00/);
  });

  it('retorna "Não encontrado" para null', () => {
    expect(formatPrice(null)).toBe("Não encontrado");
  });
});

describe("formatTargetPrice", () => {
  it("formata preço alvo positivo em reais", () => {
    const result = formatTargetPrice(99.9);
    expect(result).toMatch(/R\$/);
    expect(result).toMatch(/99,90/);
  });

  it('retorna "Não definido" para null', () => {
    expect(formatTargetPrice(null)).toBe("Não definido");
  });

  it('retorna "Não definido" para zero (sem alvo)', () => {
    expect(formatTargetPrice(0)).toBe("Não definido");
  });
});

describe("variationColorClass", () => {
  it("retorna text-error para variação positiva (preço subiu)", () => {
    expect(variationColorClass(50)).toBe("text-error");
  });

  it("retorna text-success para variação negativa (preço caiu)", () => {
    expect(variationColorClass(-20)).toBe("text-success");
  });

  it("retorna text-warning para variação zero (sem mudança)", () => {
    expect(variationColorClass(0)).toBe("text-warning");
  });

  it("retorna text-error para valor positivo pequeno", () => {
    expect(variationColorClass(0.01)).toBe("text-error");
  });

  it("retorna text-success para valor negativo pequeno", () => {
    expect(variationColorClass(-0.01)).toBe("text-success");
  });
});
