import { useEffect, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ConfirmDialog } from "../components/ConfirmDialog";

type AdminUser = {
  id: number;
  login: string;
  role: "user";
  max_items: number | null;
  active_item_count: number;
  created_at: string;
  updated_at: string;
};

type AdminProduct = {
  id: number;
  asin: string;
  title: string | null;
  url: string;
  image_url: string | null;
  target_price: number;
  last_price: number | null;
};

export function AdminPage() {
  const location = useLocation();
  const { isAdmin, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newMaxItems, setNewMaxItems] = useState("10");
  const [creating, setCreating] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [reactivationMessage, setReactivationMessage] = useState<string | null>(
    null,
  );

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editMaxItems, setEditMaxItems] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);

  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);
  const [userProducts, setUserProducts] = useState<AdminProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [pendingDeleteUser, setPendingDeleteUser] = useState<AdminUser | null>(
    null,
  );
  const [pendingDeleteAllProducts, setPendingDeleteAllProducts] =
    useState<AdminUser | null>(null);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<{
    user: AdminUser;
    asin: string;
    title: string | null;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      location.route("/");
    }
  }, [authLoading, isAdmin, location]);

  useEffect(() => {
    if (!success) return;

    const timer = setTimeout(() => setSuccess(null), 8000);
    return () => clearTimeout(timer);
  }, [success]);

  async function handleCopyPassword() {
    if (!generatedPassword) return;

    try {
      await navigator.clipboard.writeText(generatedPassword);
      setPasswordCopied(true);
    } catch {
      setError("Não foi possível copiar a senha.");
    }
  }

  function handleDismissPassword() {
    setGeneratedPassword(null);
    setReactivationMessage(null);
    setPasswordCopied(false);
  }

  async function loadUsers() {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch("/api/admin/users");
      const data = await response.json();
      if (!response.ok) {
        throw new Error((data as { error?: string }).error ?? "Erro ao carregar");
      }
      setUsers(data as AdminUser[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  async function handleCreateUser(e: Event) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    setGeneratedPassword(null);
    setReactivationMessage(null);
    setPasswordCopied(false);

    try {
      const response = await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: newEmail,
          maxItems: Number.parseInt(newMaxItems, 10),
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        generatedPassword?: string;
        reactivated?: boolean;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao criar usuário");
      }

      setGeneratedPassword(data.generatedPassword ?? null);
      if (data.reactivated && data.message) {
        setReactivationMessage(data.message);
      } else {
        setSuccess("Usuário criado com sucesso.");
      }

      setNewEmail("");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveLimit() {
    if (!editingUser) return;

    setSavingLimit(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          maxItems: Number.parseInt(editMaxItems, 10),
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao atualizar limite");
      }

      setEditingUser(null);
      setSuccess("Limite atualizado.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar limite");
    } finally {
      setSavingLimit(false);
    }
  }

  async function loadUserProducts(user: AdminUser) {
    setViewingUser(user);
    setLoadingProducts(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/admin/users/${user.id}/products`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error((data as { error?: string }).error ?? "Erro ao carregar itens");
      }
      setUserProducts(data as AdminProduct[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar itens");
      setUserProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function confirmDeleteUser() {
    if (!pendingDeleteUser) return;

    setActionLoading(true);
    try {
      const response = await apiFetch(
        `/api/admin/users/${pendingDeleteUser.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao excluir usuário");
      }
      setPendingDeleteUser(null);
      if (viewingUser?.id === pendingDeleteUser.id) {
        setViewingUser(null);
        setUserProducts([]);
      }
      setSuccess("Usuário excluído.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir usuário");
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmDeleteAllProducts() {
    if (!pendingDeleteAllProducts) return;

    setActionLoading(true);
    try {
      const response = await apiFetch(
        `/api/admin/users/${pendingDeleteAllProducts.id}/products`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao excluir itens");
      }
      setPendingDeleteAllProducts(null);
      setSuccess("Itens do usuário excluídos.");
      await loadUsers();
      if (viewingUser?.id === pendingDeleteAllProducts.id) {
        await loadUserProducts(pendingDeleteAllProducts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir itens");
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmDeleteProduct() {
    if (!pendingDeleteProduct) return;

    setActionLoading(true);
    try {
      const response = await apiFetch(
        `/api/admin/users/${pendingDeleteProduct.user.id}/products/${pendingDeleteProduct.asin}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao excluir item");
      }
      setPendingDeleteProduct(null);
      setSuccess("Item excluído.");
      await loadUsers();
      if (viewingUser) {
        await loadUserProducts(viewingUser);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir item");
    } finally {
      setActionLoading(false);
    }
  }

  if (authLoading || !isAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <ConfirmDialog
        open={pendingDeleteUser !== null}
        loading={actionLoading}
        title="Excluir usuário"
        description={`Excluir o usuário ${pendingDeleteUser?.login}? O registro será mantido com soft delete.`}
        confirmClassName="btn-error"
        confirmLabel="Excluir usuário"
        onConfirm={confirmDeleteUser}
        onCancel={() => setPendingDeleteUser(null)}
      />

      <ConfirmDialog
        open={pendingDeleteAllProducts !== null}
        loading={actionLoading}
        title="Excluir todos os itens"
        description={`Excluir todos os itens ativos de ${pendingDeleteAllProducts?.login}?`}
        confirmClassName="btn-error"
        confirmLabel="Excluir todos"
        onConfirm={confirmDeleteAllProducts}
        onCancel={() => setPendingDeleteAllProducts(null)}
      />

      <ConfirmDialog
        open={pendingDeleteProduct !== null}
        loading={actionLoading}
        title="Excluir item"
        description={`Excluir ${pendingDeleteProduct?.title ?? pendingDeleteProduct?.asin}?`}
        confirmClassName="btn-error"
        confirmLabel="Excluir item"
        onConfirm={confirmDeleteProduct}
        onCancel={() => setPendingDeleteProduct(null)}
      />

      <header>
        <h1 className="text-2xl font-bold">Administração de usuários</h1>
        <p className="text-base-content/60">
          Cadastre usuários, defina limites e gerencie itens monitorados.
        </p>
      </header>

      {error && (
        <div className="alert alert-error">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setError(null)}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <span className="flex-1">{success}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSuccess(null)}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      )}

      {generatedPassword && (
        <div className="alert alert-warning">
          <div className="flex-1">
            <p className="font-semibold">Senha gerada (copie agora):</p>
            <p className="mt-1 font-mono text-lg">{generatedPassword}</p>
            {reactivationMessage && (
              <p className="mt-2 text-sm">{reactivationMessage}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void handleCopyPassword()}
            >
              {passwordCopied ? "Copiado!" : "Copiar senha"}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleDismissPassword}
            >
              Já copiei
            </button>
          </div>
        </div>
      )}

      <section className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h2 className="card-title text-lg">Novo usuário</h2>
          <form onSubmit={handleCreateUser} className="grid gap-4 sm:grid-cols-2">
            <label className="form-control">
              <div className="label py-0">
                <span className="label-text">E-mail</span>
              </div>
              <input
                type="email"
                className="input input-bordered"
                value={newEmail}
                onInput={(e) => setNewEmail(e.currentTarget.value)}
                required
                disabled={creating}
              />
            </label>

            <label className="form-control">
              <div className="label py-0">
                <span className="label-text">Limite de itens</span>
              </div>
              <input
                type="number"
                min="1"
                className="input input-bordered"
                value={newMaxItems}
                onInput={(e) => setNewMaxItems(e.currentTarget.value)}
                required
                disabled={creating}
              />
            </label>

            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Criando...
                  </>
                ) : (
                  "Criar usuário"
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h2 className="card-title text-lg">Usuários</h2>

          {loading ? (
            <span className="loading loading-spinner loading-md" />
          ) : users.length === 0 ? (
            <p className="text-base-content/60">Nenhum usuário cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Itens ativos</th>
                    <th>Limite</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.login}</td>
                      <td>{user.active_item_count}</td>
                      <td>{user.max_items}</td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => loadUserProducts(user)}
                          >
                            Ver itens
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => {
                              setEditingUser(user);
                              setEditMaxItems(String(user.max_items ?? 10));
                            }}
                          >
                            Editar limite
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => setPendingDeleteAllProducts(user)}
                          >
                            Excluir itens
                          </button>
                          <button
                            type="button"
                            className="btn btn-error btn-xs"
                            onClick={() => setPendingDeleteUser(user)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {editingUser && (
        <section className="card bg-base-100 shadow-md">
          <div className="card-body">
            <h2 className="card-title text-lg">
              Editar limite — {editingUser.login}
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="form-control flex-1">
                <div className="label py-0">
                  <span className="label-text">Limite máximo</span>
                </div>
                <input
                  type="number"
                  min="1"
                  className="input input-bordered"
                  value={editMaxItems}
                  onInput={(e) => setEditMaxItems(e.currentTarget.value)}
                  disabled={savingLimit}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditingUser(null)}
                  disabled={savingLimit}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveLimit}
                  disabled={savingLimit}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {viewingUser && (
        <section className="card bg-base-100 shadow-md">
          <div className="card-body">
            <div className="flex items-center justify-between gap-3">
              <h2 className="card-title text-lg">
                Itens de {viewingUser.login}
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setViewingUser(null);
                  setUserProducts([]);
                }}
              >
                Fechar
              </button>
            </div>

            {loadingProducts ? (
              <span className="loading loading-spinner loading-md" />
            ) : userProducts.length === 0 ? (
              <p className="text-base-content/60">Nenhum item ativo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>ASIN</th>
                      <th>Preço atual</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userProducts.map((product) => (
                      <tr key={product.id}>
                        <td>{product.title ?? "Sem título"}</td>
                        <td>{product.asin}</td>
                        <td>
                          {product.last_price?.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }) ?? "—"}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn btn-error btn-xs"
                            onClick={() =>
                              setPendingDeleteProduct({
                                user: viewingUser,
                                asin: product.asin,
                                title: product.title,
                              })
                            }
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
