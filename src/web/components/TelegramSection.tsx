import { useEffect, useState } from "preact/hooks";
import { formatDateTime } from "../../utils";
import { apiFetch } from "../lib/api";

type TelegramStatus =
  | { connected: false }
  | {
      connected: true;
      enabled: boolean;
      telegramUsername: string | null;
      telegramFirstName: string | null;
      telegramLastName: string | null;
      telegramLanguageCode: string | null;
      telegramChatType: string | null;
      linkedAt: string;
      lastInteractionAt: string | null;
    };

type Feedback = {
  type: "success" | "warning" | "error" | "info";
  text: string;
};

const ALERT_CLASS: Record<Feedback["type"], string> = {
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
  info: "alert-info",
};

function connectedLabel(status: Extract<TelegramStatus, { connected: true }>) {
  if (status.telegramUsername) {
    return `Conectado como @${status.telegramUsername}`;
  }
  if (status.telegramFirstName) {
    const name = [status.telegramFirstName, status.telegramLastName]
      .filter(Boolean)
      .join(" ");
    return `Conectado como ${name}`;
  }
  return "Telegram conectado";
}

export function TelegramSection() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function fetchStatus(): Promise<TelegramStatus> {
    const response = await apiFetch("/api/telegram/status");
    if (!response.ok) {
      throw new Error("Não foi possível consultar o status do Telegram.");
    }
    return (await response.json()) as TelegramStatus;
  }

  async function loadStatus() {
    try {
      setStatus(await fetchStatus());
    } catch {
      // status silencioso no card; erros aparecem dentro do modal
    }
  }

  useEffect(() => {
    loadStatus().finally(() => setLoading(false));
  }, []);

  function openModal() {
    setFeedback(null);
    setBotUrl(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  async function handleConnect() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await apiFetch("/api/telegram/link-token", {
        method: "POST",
      });
      const data = (await response.json()) as {
        telegramBotUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.telegramBotUrl) {
        throw new Error(data.error ?? "Erro ao gerar link de conexão.");
      }
      setBotUrl(data.telegramBotUrl);
      setFeedback({
        type: "info",
        text: "Link gerado. Abra o Telegram, toque em Iniciar/Start no bot e depois volte aqui.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao gerar link.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setBusy(true);
    setFeedback(null);
    try {
      const data = await fetchStatus();
      setStatus(data);
      if (data.connected) {
        setBotUrl(null);
        setFeedback({
          type: "success",
          text: data.telegramUsername
            ? `Telegram conectado como @${data.telegramUsername}! 🎉`
            : "Telegram conectado com sucesso! 🎉",
        });
      } else {
        setFeedback({
          type: "warning",
          text: "Ainda não detectamos a conexão. Confirme que você abriu o link e enviou /start ao bot, depois tente novamente.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao consultar o status. Tente novamente.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await apiFetch("/api/telegram/test", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao enviar mensagem de teste.");
      }
      setFeedback({
        type: "success",
        text: "Mensagem de teste enviada. Confira seu Telegram.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao enviar teste.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await apiFetch("/api/telegram/disconnect", {
        method: "POST",
      });
      const data = (await response.json()) as TelegramStatus & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao desconectar.");
      }
      setStatus(data as TelegramStatus);
      setBotUrl(null);
      setFeedback({ type: "info", text: "Telegram desconectado." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao desconectar.",
      });
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.connected === true;

  return (
    <>
      <section className="card bg-base-100 shadow-md">
        <div className="card-body flex-row flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="card-title text-lg">Telegram</h2>
              {!loading && connected && (
                <span className="badge badge-success badge-sm">Conectado</span>
              )}
              {!loading && status && !connected && (
                <span className="badge badge-ghost badge-sm">Não conectado</span>
              )}
            </div>
            <p className="mt-1 text-sm text-base-content/70">
              {connected && status?.connected
                ? connectedLabel(status)
                : "Receba alertas dos seus itens monitorados diretamente no Telegram."}
            </p>
          </div>

          {loading ? (
            <span className="loading loading-spinner loading-md" />
          ) : connected ? (
            <button
              type="button"
              className="btn btn-outline btn-primary btn-sm shrink-0"
              onClick={openModal}
            >
              Gerenciar conexão
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm shrink-0"
              onClick={openModal}
            >
              Conectar Telegram
            </button>
          )}
        </div>
      </section>

      <dialog className={`modal ${open ? "modal-open" : ""}`} onClose={closeModal}>
        <div className="modal-box max-w-md">
          <h3 className="text-lg font-bold">
            {connected ? "Conexão do Telegram" : "Conectar Telegram"}
          </h3>

          {feedback && (
            <div className={`alert ${ALERT_CLASS[feedback.type]} mt-4 py-2`}>
              <span>{feedback.text}</span>
            </div>
          )}

          {connected && status?.connected ? (
            <div className="mt-4 grid gap-3">
              <p className="text-base-content/80">{connectedLabel(status)}</p>
              <p className="text-sm text-base-content/60">
                Você receberá alertas apenas dos seus itens monitorados.
              </p>
              {status.lastInteractionAt && (
                <p className="text-xs text-base-content/50">
                  Última interação: {formatDateTime(status.lastInteractionAt)}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={handleTest}
                >
                  Enviar mensagem de teste
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-error btn-sm"
                  disabled={busy}
                  onClick={handleDisconnect}
                >
                  Desconectar Telegram
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <p className="text-sm text-base-content/70">
                Gere um link, abra o bot no Telegram e confirme a conexão.
              </p>

              {!botUrl ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={handleConnect}
                >
                  {busy ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Gerando link...
                    </>
                  ) : (
                    "Gerar link de conexão"
                  )}
                </button>
              ) : (
                <div className="grid gap-2">
                  <a
                    href={botUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-info"
                  >
                    📱 Abrir Telegram e conectar
                  </a>
                  <p className="text-xs text-base-content/60">
                    O link expira em 15 minutos. Se expirar, gere um novo.
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline btn-primary"
                    disabled={busy}
                    onClick={handleRefresh}
                  >
                    {busy ? (
                      <>
                        <span className="loading loading-spinner loading-xs" />
                        Verificando...
                      </>
                    ) : (
                      "Já conectei, atualizar status"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={closeModal}
            >
              Fechar
            </button>
          </div>
        </div>

        <form method="dialog" className="modal-backdrop">
          <button type="button" onClick={closeModal}>
            fechar
          </button>
        </form>
      </dialog>
    </>
  );
}
