import { useEffect, useState } from "preact/hooks";
import "../style.css";
import { formatDateTime, hasTargetPrice } from "../../utils";
import { DeleteProductDialog } from "../components/DeleteProductDialog";
import { apiFetch } from "../lib/api";

type Product = {
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

function formatDate(date: string | null) {
  return formatDateTime(date);
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingAsin, setDeletingAsin] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
      })
      .finally(() => setLoading(false));
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;

    const product = pendingDelete;

    try {
      setError(null);
      setDeletingAsin(product.asin);

      const response = await apiFetch(`/api/products/${product.asin}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao remover produto");
      }

      setProducts((current) => current.filter((p) => p.asin !== product.asin));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover produto");
    } finally {
      setDeletingAsin(null);
    }
  }

  const isConfirmingDelete =
    pendingDelete !== null && deletingAsin === pendingDelete.asin;

  return (
    <div className="grid gap-6">
      <DeleteProductDialog
        open={pendingDelete !== null}
        loading={isConfirmingDelete}
        title={pendingDelete?.title ?? null}
        asin={pendingDelete?.asin ?? ""}
        imageUrl={pendingDelete?.image_url ?? null}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <header>
        <h1 className="text-2xl font-bold">Produtos monitorados</h1>
        <p className="text-base-content/60">
          {loading
            ? "Carregando..."
            : `${products.length} produto${products.length === 1 ? "" : "s"}`}
        </p>
      </header>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="card bg-base-100 shadow-md">
              <div className="card-body">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="skeleton h-28 w-28 shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-3">
                    <div className="skeleton h-6 w-3/4" />
                    <div className="skeleton h-4 w-32" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="skeleton h-20" />
                      <div className="skeleton h-20" />
                      <div className="skeleton h-20" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body items-center text-center">
            <p className="text-base-content/60">Nenhum produto cadastrado.</p>
            <a href="/new" className="btn btn-primary mt-2">
              Adicionar produto
            </a>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {products.map((product) => {
            const isDeleting = deletingAsin === product.asin;

            return (
              <div key={product.id} className="card bg-base-100 shadow-md">
                <div className="card-body gap-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <img
                      src={product.image_url ?? "https://placehold.co/112"}
                      alt={product.title ?? product.asin}
                      className="h-28 w-28 shrink-0 rounded-xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="text-lg font-bold leading-snug">
                            {product.title ?? "Produto sem título"}
                          </h2>
                          <p className="mt-1 text-sm text-base-content/60">
                            {product.asin}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                          <a
                            className="btn btn-primary btn-sm"
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Abrir na Amazon
                          </a>

                          <button
                            type="button"
                            className="btn btn-outline btn-error btn-sm"
                            disabled={isDeleting}
                            onClick={() => setPendingDelete(product)}
                          >
                            {isDeleting ? (
                              <>
                                <span className="loading loading-spinner loading-xs" />
                                Removendo...
                              </>
                            ) : (
                              "Remover"
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-box bg-base-200 px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                            Preço atual
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {formatPrice(product.last_price)}
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

                        <div className="rounded-box bg-base-200 px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                            Última verificação
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-snug">
                            {formatDate(product.last_checked_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
