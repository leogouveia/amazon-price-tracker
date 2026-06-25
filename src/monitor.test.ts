import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearAllTables, createTestAdmin, createTestUser } from "./__tests__/setup";
import { addProduct } from "./database";

vi.mock("./database", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./database")>();
  return {
    ...mod,
    fetchProductInfo: vi.fn(),
  };
});

vi.mock("./telegram", () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
}));

import { runPriceMonitor, isMonitorRunning, MonitorAlreadyRunningError } from "./monitor";
import { fetchProductInfo } from "./database";
import { sendTelegramMessage } from "./telegram";

const SAMPLE_URL = "https://www.amazon.com.br/dp/B08N5WRWNW";
const SAMPLE_URL_2 = "https://www.amazon.com.br/dp/B09XYZ12AB";

beforeEach(() => {
  clearAllTables();
  vi.mocked(fetchProductInfo).mockResolvedValue({ title: "Produto Teste", imageUrl: null, price: 199.9 });
  vi.mocked(sendTelegramMessage).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("isMonitorRunning", () => {
  it("retorna false antes de qualquer run", () => {
    expect(isMonitorRunning()).toBe(false);
  });

  it("retorna false após run completar", async () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });
    await runPriceMonitor();
    expect(isMonitorRunning()).toBe(false);
  });
});

describe("runPriceMonitor", () => {
  it("retorna resultado com shape correto", async () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });

    const result = await runPriceMonitor();
    expect(result).toHaveProperty("checked");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("durationMs");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.durationMs).toBe("number");
  });

  it("deduplica por ASIN: 2 usuários com mesmo produto → fetchProductInfo chamado 1x", async () => {
    const admin = createTestAdmin();
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: "Prod", imageUrl: null });

    const result = await runPriceMonitor();
    expect(vi.mocked(fetchProductInfo)).toHaveBeenCalledTimes(1);
    expect(result.checked).toBe(2);
  });

  it("erro num ASIN não aborta os outros", async () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod A", imageUrl: null });
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL_2, title: "Prod B", imageUrl: null });

    vi.mocked(fetchProductInfo)
      .mockRejectedValueOnce(new Error("falha de scraping"))
      .mockResolvedValueOnce({ title: "Prod B", imageUrl: null, price: 150 });

    const result = await runPriceMonitor();
    expect(result.errors).toHaveLength(1);
    expect(result.checked).toBe(1);
  });

  it("inclui ASIN no array de erros quando fetch falha", async () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });
    vi.mocked(fetchProductInfo).mockRejectedValue(new Error("timeout"));

    const result = await runPriceMonitor();
    expect(result.errors[0]?.asin).toBe("B08N5WRWNW");
    expect(result.errors[0]?.message).toContain("timeout");
  });

  it("retorna checked=0 e erros vazios quando não há itens ativos", async () => {
    const result = await runPriceMonitor();
    expect(result.checked).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(vi.mocked(sendTelegramMessage)).not.toHaveBeenCalled();
  });

  it("envia mensagem Telegram quando há relatórios", async () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });

    await runPriceMonitor();
    expect(vi.mocked(sendTelegramMessage)).toHaveBeenCalledOnce();
  });
});

describe("MonitorAlreadyRunningError", () => {
  it("lança erro se monitor já está em execução", async () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });

    let resolveFetch!: () => void;
    vi.mocked(fetchProductInfo).mockImplementation(
      () =>
        new Promise<{ title: string; imageUrl: null; price: number }>((resolve) => {
          resolveFetch = () => resolve({ title: "Prod", imageUrl: null, price: 100 });
        }),
    );

    const firstRun = runPriceMonitor();
    await Promise.resolve(); // cede controle para o event loop iniciar a execução

    await expect(runPriceMonitor()).rejects.toThrow(MonitorAlreadyRunningError);

    resolveFetch();
    await firstRun;
  });
});
