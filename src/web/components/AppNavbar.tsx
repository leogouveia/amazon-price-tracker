import { BrandLogo } from "./BrandLogo";

type AppNavbarProps = {
  onLogout: () => void;
};

export function AppNavbar({ onLogout }: AppNavbarProps) {
  return (
    <nav className="navbar mb-8 min-h-16 rounded-box bg-[#111827] px-4 text-neutral-content shadow sm:px-6">
      <div className="flex-1">
        <BrandLogo size="sm" showTitle className="min-h-14" />
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <a href="/" className="btn btn-ghost btn-sm text-neutral-content">
          Produtos
        </a>

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
