import { useState } from "preact/hooks";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../lib/auth";
import { isValidLogin } from "../../utils";

export function LoginPage() {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (!isValidLogin(loginId)) {
      setError("Informe um e-mail válido ou admin");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const loginError = await login(loginId, password);
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
          <div className="mb-2 flex justify-center">
            <BrandLogo size="md" showTitle={false} />
          </div>

          <h1 className="card-title text-2xl">Entrar</h1>

          <p className="text-sm text-base-content/60">
            Use seu e-mail ou <code>admin</code> e sua senha.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
            <label className="form-control">
              <div className="label">
                <span className="label-text">E-mail ou admin</span>
              </div>

              <input
                type="text"
                className="input input-bordered"
                placeholder="usuario@email.com ou admin"
                value={loginId}
                onInput={(event) => setLoginId(event.currentTarget.value)}
                disabled={loading}
                required
                autoComplete="username"
              />
            </label>

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
