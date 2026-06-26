import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { htmlEscape, sendTelegramMessage } from "./telegram";

beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("htmlEscape", () => {
  it("escapa caracteres reservados do HTML do Telegram", () => {
    expect(htmlEscape("Tom & Jerry <b>")).toBe("Tom &amp; Jerry &lt;b&gt;");
  });
});

describe("sendTelegramMessage", () => {
  it("loga no console e não chama fetch quando o token está ausente", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await sendTelegramMessage("999", "teste");

    expect(consoleSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia para o chat_id informado (não usa TELEGRAM_CHAT_ID)", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "fake-token";
    process.env.TELEGRAM_CHAT_ID = "global-chat";

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "ok",
    });
    vi.stubGlobal("fetch", fakeFetch);

    await sendTelegramMessage("user-chat-42", "olá!");

    expect(fakeFetch).toHaveBeenCalledOnce();
    const [url, init] = fakeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("fake-token/sendMessage");
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe("user-chat-42");
    expect(body.text).toBe("olá!");
    expect(body.parse_mode).toBe("HTML");
  });

  it("lança erro quando a resposta HTTP não é ok", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "fake-token";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      }),
    );

    await expect(sendTelegramMessage("123", "msg")).rejects.toThrow("400");
  });
});
