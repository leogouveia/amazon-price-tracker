import { useEffect, useState } from "preact/hooks";
import "./style.css";

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

function formatDate(date: string | null) {
  if (date === null) return "Não verificado";
  return new Date(date).toLocaleString("pt-BR");
}

export function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-base-200 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-4xl font-bold">Amazon Price Tracker</h1>

          <p className="text-base-content/60">Produtos monitorados</p>
        </header>

        {loading ? (
          <div className="grid gap-4">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="card bg-base-100 shadow-md">
                <div className="card-body">
                  <div className="flex gap-5">
                    <div className="skeleton h-24 w-24 rounded-xl" />

                    <div className="flex-1">
                      <div className="skeleton h-6 w-72 mb-2" />
                      <div className="skeleton h-4 w-32 mb-4" />

                      <div className="grid grid-cols-3 gap-3">
                        <div className="skeleton h-24" />
                        <div className="skeleton h-24" />
                        <div className="skeleton h-24" />
                      </div>
                    </div>

                    <div className="skeleton h-10 w-24 self-center" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {products.map((product) => (
              <div key={product.id} className="card bg-base-100 shadow-md">
                <div className="card-body">
                  <div className="flex gap-5">
                    <img
                      src={product.image_url ?? "https://placehold.co/96"}
                      className="h-24 w-24 rounded-xl object-cover"
                    />

                    <div className="flex-1">
                      <h2 className="card-title">{product.title}</h2>

                      <p className="text-sm opacity-60">{product.asin}</p>

                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <div className="stat rounded-box bg-base-200">
                          <div className="stat-title">Preço atual</div>

                          <div className="stat-value text-lg">
                            {formatPrice(product.last_price)}
                          </div>
                        </div>

                        <div className="stat rounded-box bg-base-200">
                          <div className="stat-title">Preço alvo</div>

                          <div className="stat-value text-lg">
                            {formatPrice(product.target_price)}
                          </div>
                        </div>

                        <div className="stat rounded-box bg-base-200">
                          <div className="stat-title">Última verificação</div>

                          <div className="stat-value text-sm">
                            {formatDate(product.last_checked_at)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="self-center">
                      <a
                        className="btn btn-primary"
                        href={product.url}
                        target="_blank"
                      >
                        Abrir
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
