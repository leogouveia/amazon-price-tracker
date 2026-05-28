import { LocationProvider, Route, Router } from "preact-iso";
import { NewProductPage } from "./pages/NewProductPage.js";
import { ProductsPage } from "./pages/ProductsPage.js";
import "./style.css";

export function App() {
  return (
    <LocationProvider>
      <main className="min-h-screen bg-base-200 p-6">
        <div className="mx-auto max-w-5xl">
          <nav className="navbar mb-8 rounded-box bg-base-100 px-6 shadow">
            <div className="flex-1">
              <a href="/" className="text-xl font-bold">
                Amazon Price Tracker
              </a>
            </div>

            <div className="flex gap-2">
              <a href="/" className="btn btn-ghost">
                Produtos
              </a>

              <a href="/new" className="btn btn-primary">
                Novo produto
              </a>
            </div>
          </nav>

          <Router>
            <Route path="/" component={ProductsPage} />
            <Route path="/new" component={NewProductPage} />
          </Router>
        </div>
      </main>
    </LocationProvider>
  );
}
