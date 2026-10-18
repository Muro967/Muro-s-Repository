import "server-only";

import { z } from "zod";

export const sessionCookie = {
  name: "aiw_session",
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  },
} as const;

export function createSessionCookie(token: string, secure: boolean): string {
  const validatedToken = parseSessionToken(token);
  if (!validatedToken) throw new Error("Invalid session token");
  return [
    `${sessionCookie.name}=${validatedToken}`,
    "Path=/",
    `Max-Age=${sessionCookie.options.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

const tokenSchema = z.string().min(40).max(256).regex(/^[A-Za-z0-9_-]+$/);

export function parseSessionToken(token: unknown): string | null {
  const result = tokenSchema.safeParse(token);
  return result.success ? result.data : null;
}

export function requestSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const values = cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== sessionCookie.name) return [];
    return [part.slice(separator + 1).trim()];
  });
  return values.length === 1 ? parseSessionToken(values[0]) : null;
}

export function clearSessionCookie(secure: boolean): string {
  return [
    `${sessionCookie.name}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
