import { useEffect, useState } from "preact/hooks";
import { useRoute } from "preact-iso";
import "../style.css";
import { formatDateTime, getPriceVariation, hasTargetPrice } from "../../utils";
import { apiFetch } from "../lib/api";

type ProductDetail = {
  id: number;
  asin: string;
  title: string | null;
  url: string;
  image_url: string | null;
  target_price: number;
  created_at: string;
  updated_at: string;
  last_price: number | null;
  last_checked_at: string | null;
  previous_price: number | null;
  previous_checked_at: string | null;
  lowest_price: number | null;
  lowest_checked_at: string | null;
};

type PriceHistoryEntry = {
  price: number;
  checked_at: string;
};

function formatPrice(price: number | null) {
  if (price === null) return "Não encontrado";

  return price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatTargetPrice(price: number) {
  if (!hasTargetPrice(price)) return "Não definido";

  return price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function variationColorClass(diff: number): string {
  if (diff > 0) return "text-error";
  if (diff < 0) return "text-success";
  return "text-warning";
}

export function ProductDetailPage() {
  const route = useRoute();
  const asin = route.params.asin ?? "";

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asin) {
      setError("Produto inválido");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [productRes, historyRes] = await Promise.all([
          apiFetch(`/api/products/${encodeURIComponent(asin)}`),
          apiFetch(`/api/products/${encodeURIComponent(asin)}/history`),
        ]);

        const productData = (await productRes.json()) as ProductDetail & {
          error?: string;
        };
        const historyData = (await historyRes.json()) as
          | PriceHistoryEntry[]
          | { error?: string };

        if (!productRes.ok) {
          throw new Error(productData.error ?? "Produto não encontrado");
        }

        if (!historyRes.ok) {
          throw new Error(
            !Array.isArray(historyData) && historyData.error
              ? historyData.error
              : "Erro ao carregar histórico",
          );
        }

        if (!cancelled) {
          setProduct(productData);
          setHistory(historyData as PriceHistoryEntry[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar produto");
          setProduct(null);
          setHistory([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [asin]);

  const variation = product
    ? getPriceVariation(product.last_price, product.previous_price)
    : null;

  const historyNewestFirst = [...history].reverse();

  return (
    <div className="grid gap-6">
      <div>
        <a href="/" className="btn btn-ghost btn-sm -ml-2">
          ← Voltar aos produtos
        </a>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="skeleton h-36 w-36 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-3">
                <div className="skeleton h-8 w-3/4" />
                <div className="skeleton h-4 w-32" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[...Array(5)].map((_, index) => (
                    <div key={index} className="skeleton h-20" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : product ? (
        <>
          <div className="card bg-base-100 shadow-md">
            <div className="card-body gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <img
                  src={product.image_url ?? "https://placehold.co/144"}
                  alt={product.title ?? product.asin}
                  className="h-36 w-36 shrink-0 rounded-xl object-cover"
                />

                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold leading-snug">
                    {product.title ?? "Produto sem título"}
                  </h1>
                  <p className="mt-1 text-sm text-base-content/60">{product.asin}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      className="btn btn-primary btn-sm"
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir na Amazon
                    </a>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-box bg-base-200 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                        Preço atual
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatPrice(product.last_price)}
                      </p>
                      <p className="mt-1 text-xs text-base-content/50">
                        {formatDateTime(product.last_checked_at)}
                      </p>
                    </div>

                    <div className="rounded-box bg-base-200 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                        Variação
                      </p>
                      {variation ? (
                        <p
                          className={`mt-1 text-lg font-semibold ${variationColorClass(variation.diff)}`}
                        >
                          {variation.icon} {variation.formattedDiff}
                        </p>
                      ) : (
                        <p className="mt-1 text-lg font-semibold text-base-content/40">
                          —
                        </p>
                      )}
                      <p className="mt-1 text-xs text-base-content/50">
                        {product.previous_price !== null
                          ? `vs ${formatPrice(product.previous_price)}`
                          : "Sem histórico"}
                      </p>
                    </div>

                    <div className="rounded-box bg-base-200 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                        Preço anterior
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatPrice(product.previous_price)}
                      </p>
                      <p className="mt-1 text-xs text-base-content/50">
                        {product.previous_checked_at
                          ? formatDateTime(product.previous_checked_at)
                          : "—"}
                      </p>
                    </div>

                    <div className="rounded-box bg-base-200 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                        Menor preço
                      </p>
                      <p className="mt-1 text-lg font-semibold text-success">
                        {formatPrice(product.lowest_price)}
                      </p>
                      <p className="mt-1 text-xs text-base-content/50">
                        {product.lowest_checked_at
                          ? formatDateTime(product.lowest_checked_at)
                          : "—"}
                      </p>
                    </div>

                    <div className="rounded-box bg-base-200 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                        Preço alvo
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatTargetPrice(product.target_price)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="card bg-base-100 shadow-md">
            <div className="card-body">
              <h2 className="card-title text-lg">Histórico de preços</h2>
              <p className="text-sm text-base-content/60">
                {history.length === 0
                  ? "Nenhuma verificação com preço registrada."
                  : `${history.length} registro${history.length === 1 ? "" : "s"}`}
              </p>

              {historyNewestFirst.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="table table-zebra">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th className="text-right">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyNewestFirst.map((entry) => (
                        <tr key={entry.checked_at}>
                          <td>{formatDateTime(entry.checked_at)}</td>
                          <td className="text-right font-medium">
                            {formatPrice(entry.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
