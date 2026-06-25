import { BrandLogo } from "./BrandLogo";
import { useAuth } from "../lib/auth";

type AppNavbarProps = {
  onLogout: () => void;
};

export function AppNavbar({ onLogout }: AppNavbarProps) {
  const { isAdmin, user } = useAuth();

  return (
    <nav className="navbar mb-8 min-h-16 rounded-box bg-[#111827] px-4 text-neutral-content shadow sm:px-6">
      <div className="flex-1">
        <BrandLogo size="sm" showTitle className="min-h-14" />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {user && (
          <span className="hidden text-xs text-neutral-content/70 sm:inline">
            {user.login}
          </span>
        )}

        <a href="/" className="btn btn-ghost btn-sm text-neutral-content">
          Produtos
        </a>

        {isAdmin && (
          <a href="/admin" className="btn btn-ghost btn-sm text-neutral-content">
            Admin
          </a>
        )}

        <a href="/new" className="btn btn-primary btn-sm">
          Novo produto
        </a>

        <button
          type="button"
          className="btn btn-ghost btn-sm text-neutral-content"
          onClick={onLogout}
        >
          Sair
        </button>
      </div>
    </nav>
  );
}
