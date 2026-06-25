import { describe, it, expect } from "vitest";
import { sortProducts, getTotalPages, paginateProducts, type ProductForSort } from "./products";

function makeProduct(overrides: Partial<ProductForSort> = {}): ProductForSort {
  return {
    asin: "B000000001",
    title: "Produto Teste",
    target_price: 0,
    created_at: "2024-01-01 10:00:00",
    last_price: 100,
    previous_price: 100,
    lowest_price: 90,
    ...overrides,
  };
}

describe("sortProducts", () => {
  it("ordena por created_at em ordem crescente", () => {
    const a = makeProduct({ asin: "A", created_at: "2024-01-01 10:00:00" });
    const b = makeProduct({ asin: "B", created_at: "2024-06-01 10:00:00" });
    const result = sortProducts([b, a], "created_at", "asc");
    expect(result[0]!.asin).toBe("A");
    expect(result[1]!.asin).toBe("B");
  });

  it("ordena por created_at em ordem decrescente", () => {
    const a = makeProduct({ asin: "A", created_at: "2024-01-01 10:00:00" });
    const b = makeProduct({ asin: "B", created_at: "2024-06-01 10:00:00" });
    const result = sortProducts([a, b], "created_at", "desc");
    expect(result[0]!.asin).toBe("B");
  });

  it("ordena por title em ordem alfabética (pt-BR)", () => {
    const a = makeProduct({ asin: "A", title: "Banana" });
    const b = makeProduct({ asin: "B", title: "Abacaxi" });
    const result = sortProducts([a, b], "title", "asc");
    expect(result[0]!.asin).toBe("B");
  });

  it("usa asin como fallback quando title é null", () => {
    const a = makeProduct({ asin: "Z", title: null });
    const b = makeProduct({ asin: "A", title: null });
    const result = sortProducts([a, b], "title", "asc");
    expect(result[0]!.asin).toBe("A");
  });

  it("ordena por last_price colocando nulls no final", () => {
    const a = makeProduct({ asin: "A", last_price: 50 });
    const b = makeProduct({ asin: "B", last_price: null });
    const c = makeProduct({ asin: "C", last_price: 80 });
    const result = sortProducts([b, a, c], "last_price", "asc");
    expect(result[0]!.asin).toBe("A");
    expect(result[1]!.asin).toBe("C");
    expect(result[2]!.asin).toBe("B");
  });

  it("ordena por target_price colocando itens sem alvo no final", () => {
    const a = makeProduct({ asin: "A", target_price: 50 });
    const b = makeProduct({ asin: "B", target_price: 0 });
    const c = makeProduct({ asin: "C", target_price: 30 });
    const result = sortProducts([a, b, c], "target_price", "asc");
    expect(result[0]!.asin).toBe("C");
    expect(result[1]!.asin).toBe("A");
    expect(result[2]!.asin).toBe("B");
  });

  it("ordena por variação de preço", () => {
    const a = makeProduct({ asin: "A", last_price: 120, previous_price: 100 }); // +20
    const b = makeProduct({ asin: "B", last_price: 80, previous_price: 100 });  // -20
    const result = sortProducts([a, b], "variation", "asc");
    expect(result[0]!.asin).toBe("B");
  });

  it("não muta o array original", () => {
    const products = [
      makeProduct({ asin: "B", created_at: "2024-06-01 10:00:00" }),
      makeProduct({ asin: "A", created_at: "2024-01-01 10:00:00" }),
    ];
    const original = [...products];
    sortProducts(products, "created_at", "asc");
    expect(products[0]!.asin).toBe(original[0]!.asin);
  });
});

describe("getTotalPages", () => {
  it("calcula número de páginas para 12 itens com pageSize 5", () => {
    expect(getTotalPages(12, 5)).toBe(3);
  });

  it("retorna 1 para 0 itens (mínimo garantido)", () => {
    expect(getTotalPages(0, 5)).toBe(1);
  });

  it("retorna 1 quando total de itens é exatamente pageSize", () => {
    expect(getTotalPages(5, 5)).toBe(1);
  });

  it("retorna 2 quando há um item extra além do pageSize", () => {
    expect(getTotalPages(6, 5)).toBe(2);
  });

  it("usa PAGE_SIZE padrão quando pageSize não informado", () => {
    expect(getTotalPages(10)).toBeGreaterThanOrEqual(1);
  });
});

describe("paginateProducts", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));

  it("retorna os primeiros 5 itens na página 1", () => {
    const result = paginateProducts(items, 1, 5);
    expect(result).toHaveLength(5);
    expect(result[0]!.id).toBe(1);
  });

  it("retorna os itens corretos na página 3", () => {
    const result = paginateProducts(items, 3, 5);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(11);
  });

  it("retorna todos os itens quando pageSize é Infinity", () => {
    const result = paginateProducts(items, 1, Infinity);
    expect(result).toHaveLength(12);
  });

  it("retorna array vazio para página além do total", () => {
    const result = paginateProducts(items, 10, 5);
    expect(result).toHaveLength(0);
  });
});
