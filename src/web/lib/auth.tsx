import {
  createContext,
  type ComponentChildren,
} from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { apiFetch } from "./api";

export type AuthUser = {
  id: number;
  login: string;
  role: "admin" | "user";
  max_items: number | null;
  active_item_count: number;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (login: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ComponentChildren }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function checkSession(): Promise<boolean> {
    try {
      const response = await apiFetch("/api/auth/me");
      if (!response.ok) {
        setUser(null);
        return false;
      }

      const data = (await response.json()) as {
        authenticated: boolean;
        user: AuthUser;
      };
      setUser(data.user);
      return true;
    } catch {
      setUser(null);
      return false;
    }
  }

  async function refreshUser(): Promise<void> {
    await checkSession();
  }

  useEffect(() => {
    checkSession().finally(() => setLoading(false));
  }, []);

  async function login(loginId: string, password: string): Promise<string | null> {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: loginId, password }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return data.error ?? "Credenciais inválidas";
    }

    const data = (await response.json()) as { user: AuthUser };
    setUser(data.user);
    return null;
  }

  async function logout(): Promise<void> {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user != null,
        isAdmin: user?.role === "admin",
        loading,
        login,
        logout,
        checkSession,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
