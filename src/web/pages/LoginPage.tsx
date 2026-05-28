import { useState } from "preact/hooks";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      const loginError = await login(password);
      if (loginError) {
        setError(loginError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <h1 className="card-title text-2xl">Entrar</h1>

          <p className="text-sm text-base-content/60">
            Informe a senha para acessar o monitor de preços.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
            <label className="form-control">
              <div className="label">
                <span className="label-text">Senha</span>
              </div>

              <input
                type="password"
                className="input input-bordered"
                placeholder="Sua senha"
                value={password}
                onInput={(event) => setPassword(event.currentTarget.value)}
                disabled={loading}
                required
                autoComplete="current-password"
              />
            </label>

            {error && (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
