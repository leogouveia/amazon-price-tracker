import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "hono/cookie";

export const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

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

export function createSessionToken(): string {
  const payload = JSON.stringify({
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string): boolean {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return false;
  }

  const expected = sign(encoded);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as { exp?: number };

    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function validateAppPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    throw new Error("APP_PASSWORD não configurado");
  }

  const passwordBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);

  if (passwordBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(passwordBuffer, expectedBuffer);
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

export function getSessionFromRequest(c: Context): string | undefined {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token || !verifySessionToken(token)) {
    return undefined;
  }
  return token;
}

export function isAuthenticatedRequest(c: Context): boolean {
  if (getSessionFromRequest(c)) {
    return true;
  }

  const apiToken = c.req.header("x-api-token");
  const expectedToken = process.env.API_TOKEN;

  return Boolean(expectedToken && apiToken === expectedToken);
}
