import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "hono/cookie";
import { findUserById, type User, type UserPublic, toUserPublic } from "./users";

export const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  sub: number;
  role: "admin" | "user";
  exp: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: User): string {
  const payload: SessionPayload = {
    sub: user.id,
    role: user.role,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function parseSessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (
      typeof payload.sub !== "number" ||
      (payload.role !== "admin" && payload.role !== "user") ||
      typeof payload.exp !== "number" ||
      payload.exp <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

function readBearerToken(c: Context): string | undefined {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

export function getSessionTokenFromRequest(c: Context): string | undefined {
  const cookieToken = getCookie(c, SESSION_COOKIE_NAME);
  if (cookieToken && parseSessionToken(cookieToken)) {
    return cookieToken;
  }

  const bearerToken = readBearerToken(c);
  if (bearerToken && parseSessionToken(bearerToken)) {
    return bearerToken;
  }

  const headerToken = c.req.header("x-session-token");
  if (headerToken && parseSessionToken(headerToken)) {
    return headerToken;
  }

  return undefined;
}

export function isApiTokenRequest(c: Context): boolean {
  const apiToken = c.req.header("x-api-token");
  const expectedToken = process.env.API_TOKEN;
  return Boolean(expectedToken && apiToken === expectedToken);
}

export function getCurrentUser(c: Context): User | null {
  if (isApiTokenRequest(c)) {
    return null;
  }

  const token = getSessionTokenFromRequest(c);
  if (!token) {
    return null;
  }

  const payload = parseSessionToken(token);
  if (!payload) {
    return null;
  }

  const user = findUserById(payload.sub);
  if (!user || user.deleted_at != null) {
    return null;
  }

  if (user.role !== payload.role) {
    return null;
  }

  return user;
}

export function getCurrentUserPublic(c: Context): UserPublic | null {
  const user = getCurrentUser(c);
  if (!user) {
    return null;
  }
  return toUserPublic(user);
}

export function isAuthenticatedRequest(c: Context): boolean {
  if (getCurrentUser(c)) {
    return true;
  }
  return isApiTokenRequest(c);
}

export function isAdminRequest(c: Context): boolean {
  if (isApiTokenRequest(c)) {
    return true;
  }

  const user = getCurrentUser(c);
  return user?.role === "admin";
}

export function isMobileClient(c: Context): boolean {
  const client = c.req.header("x-client")?.toLowerCase();
  return client === "mobile";
}

export function requireUser(c: Context): User {
  const user = getCurrentUser(c);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export function serializeUserResponse(user: User) {
  return toUserPublic(user);
}
