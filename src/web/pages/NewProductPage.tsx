import { useLocation } from "preact-iso";
import { useState } from "preact/hooks";
import { hasTargetPrice, parseTargetPriceInput } from "../../utils";
import { apiFetch } from "../lib/api";

type ProductPreview = {
  asin: string;
  url: string;
  title: string | null;
  imageUrl: string | null;
  targetPrice: number | null;
  currentPrice: number | null;
  willReactivate?: boolean;
};

function formatPrice(price: number | null) {
  if (price === null) return "Não encontrado";

  return price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatTargetPrice(price: number | null) {
  if (!hasTargetPrice(price)) return "Não definido";

  return price!.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function NewProductPage() {
  const location = useLocation();
  const [url, setUrl] = useState("");
  const [targetPrice, setTargetPrice] = useState("");

  const [preview, setPreview] = useState<ProductPreview | null>(null);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function handlePreview(e: Event) {
    e.preventDefault();

    try {
      setError(null);
      setLoadingPreview(true);
      setError(null);
      setPreview(null);

      const response = await apiFetch("/api/products/preview", {
        method: "POST",
        body: JSON.stringify({
          url,
          targetPrice: parseTargetPriceInput(targetPrice),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Erro ao adicionar produto. Tente novamente.");
        return;
      }

      setPreview(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSubmit() {
    if (!preview) return;

    try {
      setLoadingSubmit(true);
      setError(null);

      const response = await apiFetch("/api/products", {
        method: "POST",
        body: JSON.stringify(preview),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao cadastrar produto");
      }

      location.route("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setLoadingSubmit(false);
    }
  }

  function handleClear() {
    setUrl("");
    setTargetPrice("");
    setPreview(null);
    setError(null);
  }

  function handleTryAnother() {
    setPreview(null);
    setError(null);
  }

  return (
    <div className="grid gap-6">
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h1 className="card-title text-2xl">Novo produto</h1>

          <p className="text-base-content/60">
            Cole a URL da Amazon e consulte o produto antes de cadastrar. O
            preço alvo é opcional.
          </p>

          <form onSubmit={handlePreview} className="mt-4 grid gap-4">
            <label className="form-control">
              <div className="label">
                <span className="label-text">URL da Amazon</span>
              </div>

              <input
                type="url"
                className="input input-bordered"
                placeholder="https://www.amazon.com.br/dp/..."
                value={url}
                onInput={(event) => setUrl(event.currentTarget.value)}
                disabled={loadingPreview || loadingSubmit}
                required
              />
            </label>

            <label className="form-control">
              <div className="label">
                <span className="label-text">Preço alvo (opcional)</span>
              </div>

              <input
                type="number"
                step="0.01"
                min="0"
                className="input input-bordered"
                placeholder="Deixe em branco para apenas monitorar"
                value={targetPrice}
                onInput={(event) => setTargetPrice(event.currentTarget.value)}
                disabled={loadingPreview || loadingSubmit}
              />
            </label>

            {error && (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            <div className="card-actions justify-end">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleClear}
                disabled={loadingPreview || loadingSubmit}
              >
                Limpar
              </button>

              <button
                type="submit"
                className="btn btn-secondary"
                disabled={loadingPreview || loadingSubmit}
              >
                {loadingPreview ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Consultando...
                  </>
                ) : (
                  "Consultar produto"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {preview && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Produto encontrado</h2>

            {preview.willReactivate && (
              <div className="alert alert-info mt-2">
                <span>
                  Este produto foi removido antes e será reativado ao
                  cadastrar.
                </span>
              </div>
            )}

            <div className="flex gap-5">
              <img
                src={preview.imageUrl ?? "https://placehold.co/120"}
                alt={preview.title ?? preview.asin}
                className="h-32 w-32 rounded-xl object-cover"
              />

              <div className="flex-1">
                <h3 className="text-xl font-bold">
                  {preview.title ?? "Produto sem título"}
                </h3>

                <p className="text-sm opacity-60">{preview.asin}</p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="stat rounded-box bg-base-200">
                    <div className="stat-title">Preço atual</div>
                    <div className="stat-value text-lg">
                      {formatPrice(preview.currentPrice)}
                    </div>
                  </div>

                  <div className="stat rounded-box bg-base-200">
                    <div className="stat-title">Preço alvo</div>
                    <div className="stat-value text-lg">
                      {formatTargetPrice(preview.targetPrice)}
                    </div>
                  </div>
                </div>

                <a
                  href={preview.url}
                  target="_blank"
                  className="link mt-4 inline-block"
                >
                  Abrir produto na Amazon
                </a>
              </div>
            </div>

            <div className="card-actions justify-end">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleTryAnother}
                disabled={loadingSubmit}
              >
                Tentar outro produto
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loadingSubmit}
              >
                {loadingSubmit ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Cadastrando...
                  </>
                ) : preview.willReactivate ? (
                  "Reativar produto"
                ) : (
                  "Cadastrar produto"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
