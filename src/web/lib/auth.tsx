import {
  createContext,
  type ComponentChildren,
} from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { apiFetch } from "./api";

type AuthContextValue = {
  isAuthenticated: boolean;
  loading: boolean;
  login: (password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  checkSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ComponentChildren }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  async function checkSession(): Promise<boolean> {
    try {
      const response = await apiFetch("/api/auth/me");
      const authenticated = response.ok;
      setIsAuthenticated(authenticated);
      return authenticated;
    } catch {
      setIsAuthenticated(false);
      return false;
    }
  }

  useEffect(() => {
    checkSession().finally(() => setLoading(false));
  }, []);

  async function login(password: string): Promise<string | null> {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return data.error ?? "Credenciais inválidas";
    }

    setIsAuthenticated(true);
    return null;
  }

  async function logout(): Promise<void> {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, loading, login, logout, checkSession }}
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
