import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  clearAllTables,
  createTestAdmin,
  createTestUser,
  createTelegramConnection,
} from "./__tests__/setup";
import { addProduct } from "./database";

vi.mock("./database", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./database")>();
  return {
    ...mod,
    fetchProductInfo: vi.fn(),
  };
});

// Mantém htmlEscape real; mocka apenas o envio de rede.
vi.mock("./telegram", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./telegram")>();
  return {
    ...mod,
    sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
  };
});

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

  it("envia mensagem Telegram quando há relatórios e conexão ativa", async () => {
    const admin = createTestAdmin();
    createTelegramConnection(admin.id, "admin-chat");
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });

    await runPriceMonitor();
    expect(vi.mocked(sendTelegramMessage)).toHaveBeenCalledOnce();
    const [chatId] = vi.mocked(sendTelegramMessage).mock.calls[0]!;
    expect(chatId).toBe("admin-chat");
  });

  it("não envia Telegram para usuário sem conexão (sem erro)", async () => {
    const admin = createTestAdmin();
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });

    const result = await runPriceMonitor();
    expect(result.checked).toBe(1);
    expect(vi.mocked(sendTelegramMessage)).not.toHaveBeenCalled();
  });

  it("não envia para conexão desabilitada", async () => {
    const admin = createTestAdmin();
    createTelegramConnection(admin.id, "admin-chat", { enabled: 0 });
    addProduct({ userId: admin.id, user: admin, url: SAMPLE_URL, title: "Prod", imageUrl: null });

    await runPriceMonitor();
    expect(vi.mocked(sendTelegramMessage)).not.toHaveBeenCalled();
  });

  it("CRUX: cada usuário recebe apenas os próprios itens, sem vazamento", async () => {
    const userA = createTestUser("a@example.com", 5);
    const userB = createTestUser("b@example.com", 5);
    createTelegramConnection(userA.id, "chat-a");
    createTelegramConnection(userB.id, "chat-b");

    vi.mocked(fetchProductInfo).mockImplementation(async (url: string) => {
      if (url === SAMPLE_URL) return { title: "Produto X", imageUrl: null, price: 100 };
      return { title: "Produto Y", imageUrl: null, price: 200 };
    });

    addProduct({ userId: userA.id, user: userA, url: SAMPLE_URL, title: "X", imageUrl: null });
    addProduct({ userId: userB.id, user: userB, url: SAMPLE_URL_2, title: "Y", imageUrl: null });

    await runPriceMonitor();

    const calls = vi.mocked(sendTelegramMessage).mock.calls;
    expect(calls).toHaveLength(2);

    const msgA = calls.find(([chat]) => chat === "chat-a")?.[1] ?? "";
    const msgB = calls.find(([chat]) => chat === "chat-b")?.[1] ?? "";

    expect(msgA).toContain("Produto X");
    expect(msgA).not.toContain("Produto Y");
    expect(msgB).toContain("Produto Y");
    expect(msgB).not.toContain("Produto X");
  });

  it("usuário soft-deletado com conexão ativa não recebe", async () => {
    const user = createTestUser("gone@example.com", 5);
    createTelegramConnection(user.id, "chat-gone");
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: "Prod", imageUrl: null });

    const { db } = await import("./database");
    db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    await runPriceMonitor();
    expect(vi.mocked(sendTelegramMessage)).not.toHaveBeenCalled();
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
