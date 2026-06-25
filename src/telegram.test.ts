import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendTelegramMessage } from "./telegram";

beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sendTelegramMessage", () => {
  it("loga no console e não chama fetch quando credenciais ausentes", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await sendTelegramMessage("teste");

    expect(consoleSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("chama a URL correta do Telegram com credenciais configuradas", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "fake-token";
    process.env.TELEGRAM_CHAT_ID = "12345";

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "ok",
    });
    vi.stubGlobal("fetch", fakeFetch);

    await sendTelegramMessage("olá!");

    expect(fakeFetch).toHaveBeenCalledOnce();
    const [url, init] = fakeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("fake-token/sendMessage");
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe("12345");
    expect(body.text).toBe("olá!");
    expect(body.parse_mode).toBe("HTML");
  });

  it("lança erro quando a resposta HTTP não é ok", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "fake-token";
    process.env.TELEGRAM_CHAT_ID = "12345";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    }));

    await expect(sendTelegramMessage("msg")).rejects.toThrow("400");
  });
});
