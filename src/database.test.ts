import { describe, it, expect, beforeEach } from "vitest";
import {
  addProduct,
  findCanonicalProductByAsin,
  deleteProduct,
  listActiveMonitorItems,
  savePriceHistory,
  getPreviousPrice,
  getProductDetailByAsin,
  listProductsPriceHistory,
  DuplicateProductError,
  ItemLimitReachedError,
  db,
} from "./database";
import { clearAllTables, createTestAdmin, createTestUser } from "./__tests__/setup";

const SAMPLE_URL = "https://www.amazon.com.br/dp/B08N5WRWNW";
const SAMPLE_ASIN = "B08N5WRWNW";
const SAMPLE_URL_2 = "https://www.amazon.com.br/dp/B09XYZ12AB";
const SAMPLE_ASIN_2 = "B09XYZ12AB";

beforeEach(() => {
  clearAllTables();
});

describe("findCanonicalProductByAsin", () => {
  it("retorna produto existente pelo ASIN", () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Produto A", imageUrl: null });
    const product = findCanonicalProductByAsin(SAMPLE_ASIN);
    expect(product).toBeDefined();
    expect(product?.asin).toBe(SAMPLE_ASIN);
  });

  it("retorna undefined para ASIN inexistente", () => {
    expect(findCanonicalProductByAsin("XXXXXXXXXXXX")).toBeUndefined();
  });
});

describe("addProduct", () => {
  it("cria produto canônico e user_item para novo produto", () => {
    const admin = createTestAdmin();
    const result = addProduct({
      userId: admin.id,
      user: admin,
      url: SAMPLE_URL,
      title: "Echo Dot",
      imageUrl: null,
      initialPrice: 299.9,
    });
    expect(result.asin).toBe(SAMPLE_ASIN);
    expect(result.title).toBe("Echo Dot");
    expect(result.last_price).toBe(299.9);
  });

  it("dois usuários com o mesmo ASIN compartilham o mesmo produto canônico", () => {
    const admin = createTestAdmin();
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Echo", imageUrl: null });
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: "Echo", imageUrl: null });

    const products = db.prepare("SELECT COUNT(*) AS cnt FROM products WHERE asin = ?").get(SAMPLE_ASIN) as { cnt: number };
    expect(products.cnt).toBe(1);

    const userItems = db.prepare("SELECT COUNT(*) AS cnt FROM user_items").get() as { cnt: number };
    expect(userItems.cnt).toBe(2);
  });

  it("lança DuplicateProductError para item ativo duplicado do mesmo usuário", () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: null, imageUrl: null });
    expect(() =>
      addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: null, imageUrl: null }),
    ).toThrow(DuplicateProductError);
  });

  it("reativa item soft-deletado do mesmo usuário", () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });
    deleteProduct(user.id, SAMPLE_ASIN);

    const result = addProduct({ userId: user.id, user, url: SAMPLE_URL, title: "Novo título", imageUrl: null });
    expect(result.asin).toBe(SAMPLE_ASIN);

    const items = db.prepare("SELECT COUNT(*) AS cnt FROM user_items WHERE user_id = ?").get(user.id) as { cnt: number };
    expect(items.cnt).toBe(1);
  });

  it("lança ItemLimitReachedError quando usuário atingiu o limite", () => {
    const user = createTestUser("user@example.com", 1);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });
    expect(() =>
      addProduct({ userId: user.id, user, url: SAMPLE_URL_2, title: null, imageUrl: null }),
    ).toThrow(ItemLimitReachedError);
  });

  it("admin não tem limite de itens", () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: null, imageUrl: null });
    expect(() =>
      addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL_2, title: null, imageUrl: null }),
    ).not.toThrow();
  });
});

describe("deleteProduct", () => {
  it("soft-deleta item ativo e retorna true", () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });
    expect(deleteProduct(user.id, SAMPLE_ASIN)).toBe(true);

    const item = db.prepare(
      "SELECT ui.deleted_at FROM user_items ui INNER JOIN products p ON p.id = ui.product_id WHERE p.asin = ?",
    ).get(SAMPLE_ASIN) as { deleted_at: string | null };
    expect(item.deleted_at).not.toBeNull();
  });

  it("preserva histórico de preços após soft delete", () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null, initialPrice: 100 });
    deleteProduct(user.id, SAMPLE_ASIN);

    const count = db.prepare("SELECT COUNT(*) AS cnt FROM price_history").get() as { cnt: number };
    expect(count.cnt).toBeGreaterThan(0);
  });

  it("retorna false para ASIN inexistente", () => {
    const user = createTestUser("user@example.com", 5);
    expect(deleteProduct(user.id, "XXXXXXXXXX")).toBe(false);
  });

  it("retorna false ao tentar deletar produto de outro usuário", () => {
    const user1 = createTestUser("user1@example.com", 5);
    const user2 = createTestUser("user2@example.com", 5);
    addProduct({ userId: user1.id, user: user1, url: SAMPLE_URL, title: null, imageUrl: null });
    expect(deleteProduct(user2.id, SAMPLE_ASIN)).toBe(false);
  });
});

describe("listActiveMonitorItems", () => {
  it("retorna apenas itens com deleted_at IS NULL", () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: "Prod A", imageUrl: null });
    addProduct({ userId: user.id, user, url: SAMPLE_URL_2, title: "Prod B", imageUrl: null });
    deleteProduct(user.id, SAMPLE_ASIN_2);

    const items = listActiveMonitorItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.asin).toBe(SAMPLE_ASIN);
  });

  it("retorna array vazio sem itens ativos", () => {
    expect(listActiveMonitorItems()).toHaveLength(0);
  });
});

describe("savePriceHistory + getPreviousPrice", () => {
  it("salva e recupera preço anterior", () => {
    const user = createTestUser("user@example.com", 5);
    // addProduct sem initialPrice para não poluir o histórico com null
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });

    const item = db.prepare("SELECT ui.id FROM user_items ui INNER JOIN products p ON p.id = ui.product_id WHERE p.asin = ?").get(SAMPLE_ASIN) as { id: number };

    // Insere com timestamps explícitos para garantir ordem determinística
    db.prepare("INSERT INTO price_history (user_item_id, price, checked_at) VALUES (?, ?, ?)").run(item.id, 100, "2024-01-01 10:00:00");
    db.prepare("INSERT INTO price_history (user_item_id, price, checked_at) VALUES (?, ?, ?)").run(item.id, 90, "2024-01-01 11:00:00");

    const prev = getPreviousPrice(item.id);
    expect(prev).toBeDefined();
    expect(prev?.price).toBe(100);
  });

  it("retorna undefined quando não há histórico anterior", () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });

    const item = db.prepare("SELECT ui.id FROM user_items ui INNER JOIN products p ON p.id = ui.product_id WHERE p.asin = ?").get(SAMPLE_ASIN) as { id: number };
    expect(getPreviousPrice(item.id)).toBeUndefined();
  });

  it("salva preço null sem lançar erro (produto indisponível)", () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });
    const item = db.prepare("SELECT ui.id FROM user_items ui INNER JOIN products p ON p.id = ui.product_id WHERE p.asin = ?").get(SAMPLE_ASIN) as { id: number };
    expect(() => savePriceHistory({ userItemId: item.id, price: null })).not.toThrow();
  });
});

describe("getProductDetailByAsin", () => {
  it("retorna detalhes do produto com histórico de preços", () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: "Echo", imageUrl: null, initialPrice: 200 });

    const detail = getProductDetailByAsin(user.id, SAMPLE_ASIN);
    expect(detail).toBeDefined();
    expect(detail?.asin).toBe(SAMPLE_ASIN);
    expect(detail?.last_price).toBe(200);
    expect(detail?.lowest_price).toBe(200);
  });

  it("retorna undefined para ASIN de outro usuário (isolamento)", () => {
    const user1 = createTestUser("user1@example.com", 5);
    const user2 = createTestUser("user2@example.com", 5);
    addProduct({ userId: user1.id, user: user1, url: SAMPLE_URL, title: null, imageUrl: null });

    expect(getProductDetailByAsin(user2.id, SAMPLE_ASIN)).toBeUndefined();
  });
});

describe("listProductsPriceHistory", () => {
  it("retorna apenas produtos ativos do usuário", () => {
    const user1 = createTestUser("user1@example.com", 5);
    const user2 = createTestUser("user2@example.com", 5);
    addProduct({ userId: user1.id, user: user1, url: SAMPLE_URL, title: null, imageUrl: null });
    addProduct({ userId: user2.id, user: user2, url: SAMPLE_URL_2, title: null, imageUrl: null });

    const list = listProductsPriceHistory(user1.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.asin).toBe(SAMPLE_ASIN);
  });

  it("não inclui itens soft-deletados", () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });
    deleteProduct(user.id, SAMPLE_ASIN);

    expect(listProductsPriceHistory(user.id)).toHaveLength(0);
  });
});
