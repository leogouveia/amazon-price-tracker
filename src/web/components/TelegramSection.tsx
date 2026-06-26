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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    try {
      const response = await apiFetch("/api/telegram/status");
      if (!response.ok) {
        throw new Error("Não foi possível carregar o status do Telegram.");
      }
      setStatus((await response.json()) as TelegramStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar status");
    }
  }

  useEffect(() => {
    loadStatus().finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await apiFetch("/api/telegram/link-token", {
        method: "POST",
      });
      const data = (await response.json()) as {
        telegramBotUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.telegramBotUrl) {
        throw new Error(data.error ?? "Erro ao gerar link de conexão");
      }
      setBotUrl(data.telegramBotUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setBusy(true);
    setError(null);
    await loadStatus();
    setBusy(false);
  }

  async function handleTest() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await apiFetch("/api/telegram/test", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao enviar mensagem de teste");
      }
      setInfo("Mensagem de teste enviada. Confira seu Telegram.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar teste");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await apiFetch("/api/telegram/disconnect", {
        method: "POST",
      });
      const data = (await response.json()) as TelegramStatus & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao desconectar");
      }
      setStatus(data as TelegramStatus);
      setBotUrl(null);
      setInfo("Telegram desconectado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desconectar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card bg-base-100 shadow-md">
      <div className="card-body gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title text-lg">Telegram</h2>
          {!loading && status?.connected && (
            <span className="badge badge-success badge-sm">Conectado</span>
          )}
          {!loading && status && !status.connected && (
            <span className="badge badge-ghost badge-sm">Não conectado</span>
          )}
        </div>

        {error && (
          <div className="alert alert-error py-2">
            <span>{error}</span>
          </div>
        )}
        {info && (
          <div className="alert alert-success py-2">
            <span>{info}</span>
          </div>
        )}

        {loading ? (
          <span className="loading loading-spinner loading-md" />
        ) : status?.connected ? (
          <div className="grid gap-3">
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
          <div className="grid gap-3">
            <p className="text-sm text-base-content/70">
              Receba atualizações dos seus itens monitorados diretamente no
              Telegram.
            </p>

            {botUrl ? (
              <div className="grid gap-2">
                <a
                  href={botUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm w-fit"
                >
                  Abrir Telegram e conectar
                </a>
                <p className="text-xs text-base-content/60">
                  O link expira em 15 minutos. Se expirar, gere um novo.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm w-fit"
                  disabled={busy}
                  onClick={handleRefresh}
                >
                  Já conectei, atualizar status
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm w-fit"
                disabled={busy}
                onClick={handleConnect}
              >
                Conectar Telegram
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
