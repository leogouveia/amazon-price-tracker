import { LocationProvider, Route, Router } from "preact-iso";
import { AppNavbar } from "./components/AppNavbar";
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
      <AppNavbar onLogout={logout} />

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
