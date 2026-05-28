import { LocationProvider, Route, Router } from "preact-iso";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoginPage } from "./pages/LoginPage";
import { NewProductPage } from "./pages/NewProductPage";
import { ProductsPage } from "./pages/ProductsPage";
import "./style.css";

function AppShell() {
  const { isAuthenticated, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <>
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

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => logout()}
          >
            Sair
          </button>
        </div>
      </nav>

      <Router>
        <Route path="/" component={ProductsPage} />
        <Route path="/new" component={NewProductPage} />
      </Router>
    </>
  );
}

export function App() {
  return (
    <LocationProvider>
      <AuthProvider>
        <main className="min-h-screen bg-base-200 p-6">
          <div className="mx-auto max-w-5xl">
            <AppShell />
          </div>
        </main>
      </AuthProvider>
    </LocationProvider>
  );
}
