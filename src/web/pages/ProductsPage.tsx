import { useEffect, useState } from "preact/hooks";
import "../style.css";
import { formatDateTime, getPriceVariation, hasTargetPrice } from "../../utils";
import { DeleteProductDialog } from "../components/DeleteProductDialog";
import { apiFetch } from "../lib/api";
import {
  getTotalPages,
  PAGE_SIZE,
  paginateProducts,
  sortProducts,
  type ProductSortBy,
  type SortDirection,
} from "../lib/products";

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
  previous_price: number | null;
  previous_checked_at: string | null;
  lowest_price: number | null;
  lowest_checked_at: string | null;
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

function variationColorClass(diff: number): string {
  if (diff > 0) return "text-error";
  if (diff < 0) return "text-success";
  return "text-warning";
}

function matchesSearch(product: Product, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const title = (product.title ?? "").toLowerCase();
  const asin = product.asin.toLowerCase();

  return title.includes(normalized) || asin.includes(normalized);
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<ProductSortBy>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [deletingAsin, setDeletingAsin] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monitorRunning, setMonitorRunning] = useState(false);
  const [monitorMessage, setMonitorMessage] = useState<string | null>(null);

  async function loadProducts() {
    const response = await apiFetch("/api/products");
    const data = await response.json();
    setProducts(data);
  }

  useEffect(() => {
    loadProducts().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortDirection, pageSize]);

  async function handleRunMonitor() {
    try {
      setMonitorRunning(true);
      setError(null);
      setMonitorMessage(null);

      const response = await apiFetch("/api/monitor/run", {
        method: "POST",
      });

      const data = (await response.json()) as {
        checked?: number;
        errors?: Array<{ asin: string; message: string }>;
        durationMs?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao atualizar preços");
      }

      const errorCount = data.errors?.length ?? 0;
      const seconds = Math.round((data.durationMs ?? 0) / 1000);

      setMonitorMessage(
        errorCount > 0
          ? `${data.checked ?? 0} produto(s) verificado(s) em ${seconds}s. ${errorCount} erro(s).`
          : `${data.checked ?? 0} produto(s) verificado(s) em ${seconds}s.`,
      );

      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar preços");
    } finally {
      setMonitorRunning(false);
    }
  }

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

  const filteredProducts = products.filter((product) =>
    matchesSearch(product, search),
  );

  const sortedProducts = sortProducts(filteredProducts, sortBy, sortDirection);
  const totalPages = getTotalPages(sortedProducts.length, pageSize);
  const currentPage = Math.min(page, totalPages);
  const visibleProducts = paginateProducts(sortedProducts, currentPage, pageSize);

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

      <header className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Produtos monitorados</h1>
            <p className="text-base-content/60">
              {loading
                ? "Carregando..."
                : search.trim()
                  ? `${sortedProducts.length} de ${products.length} produto${products.length === 1 ? "" : "s"}`
                  : `${products.length} produto${products.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {!loading && products.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              disabled={monitorRunning}
              onClick={handleRunMonitor}
            >
              {monitorRunning ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Atualizando preços...
                </>
              ) : (
                "Atualizar preços agora"
              )}
            </button>
          )}
        </div>

        {!loading && products.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="form-control min-w-0 flex-1 sm:max-w-md">
              <div className="label py-0">
                <span className="label-text">Buscar por título</span>
              </div>
              <input
                type="search"
                className="input input-bordered"
                placeholder="Digite o nome do produto..."
                value={search}
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
            </label>

            <label className="form-control w-full sm:w-52">
              <div className="label py-0">
                <span className="label-text">Ordenar por</span>
              </div>
              <select
                className="select select-bordered"
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.currentTarget.value as ProductSortBy)
                }
              >
                <option value="created_at">Data de criação</option>
                <option value="title">Nome</option>
                <option value="variation">Variação de preço</option>
                <option value="last_price">Preço atual</option>
                <option value="lowest_price">Menor preço</option>
                <option value="target_price">Preço alvo</option>
              </select>
            </label>

            <button
              type="button"
              className="btn btn-outline"
              aria-label={
                sortDirection === "asc"
                  ? "Ordenação crescente"
                  : "Ordenação decrescente"
              }
              onClick={() =>
                setSortDirection((current) =>
                  current === "asc" ? "desc" : "asc",
                )
              }
            >
              {sortDirection === "asc" ? "↑ Crescente" : "↓ Decrescente"}
            </button>

            <label className="form-control w-full sm:w-36">
              <div className="label py-0">
                <span className="label-text">Itens por página</span>
              </div>
              <select
                className="select select-bordered"
                value={pageSize === Infinity ? "all" : String(pageSize)}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setPageSize(v === "all" ? Infinity : Number(v));
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="all">Todos</option>
              </select>
            </label>
          </div>
        )}
      </header>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {monitorMessage && (
        <div className="alert alert-success">
          <span>{monitorMessage}</span>
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="skeleton h-20" />
                      <div className="skeleton h-20" />
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
      ) : sortedProducts.length === 0 ? (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body items-center text-center">
            <p className="text-base-content/60">
              Nenhum produto encontrado para &quot;{search.trim()}&quot;.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-2"
              onClick={() => setSearch("")}
            >
              Limpar busca
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleProducts.map((product) => {
            const isDeleting = deletingAsin === product.asin;
            const variation = getPriceVariation(
              product.last_price,
              product.previous_price,
            );

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
                            <a
                              href={`/products/${product.asin}`}
                              className="link link-hover"
                            >
                              {product.title ?? "Produto sem título"}
                            </a>
                          </h2>
                          <p className="mt-1 text-sm text-base-content/60">
                            {product.asin}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                          <a
                            className="btn btn-outline btn-sm"
                            href={`/products/${product.asin}`}
                          >
                            Ver detalhes
                          </a>

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

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-box bg-base-200 px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                            Preço atual
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {formatPrice(product.last_price)}
                          </p>
                          <p className="mt-1 text-xs text-base-content/50">
                            {formatDate(product.last_checked_at)}
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
                              ? formatDate(product.previous_checked_at)
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
                              ? formatDate(product.lowest_checked_at)
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
            );
          })}

          {pageSize !== Infinity && totalPages > 1 && (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <p className="text-sm text-base-content/60">
                Página {currentPage} de {totalPages}
              </p>

              <div className="join">
                <button
                  type="button"
                  className="btn join-item btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Anterior
                </button>

                <button
                  type="button"
                  className="btn join-item btn-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
