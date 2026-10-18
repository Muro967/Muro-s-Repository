import { z } from "zod";
import { newSessionToken } from "@/features/auth/crypto";
import type { AuthRouteDependencies } from "@/features/auth/auth-routes";
import { DrizzleAuthRepository } from "@/server/db/drizzle-auth-repository";
import { getDb } from "./db";
import { readInvitePepper, readServerEnv } from "./env";

const appUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      url.username === "" && url.password === "" && url.pathname === "/" &&
      url.search === "" && url.hash === "";
  } catch {
    return false;
  }
}, "APP_URL must be an origin without a path");

export function getProductionAuthRouteDependencies(): AuthRouteDependencies {
  const environment = readServerEnv();
  const parsedAppUrl = appUrlSchema.safeParse(process.env.APP_URL);
  if (!parsedAppUrl.success) throw new Error("Invalid application URL configuration");
  const cookieSetting = z.enum(["true", "false"]).default("false").safeParse(process.env.SESSION_COOKIE_SECURE);
  if (!cookieSetting.success) throw new Error("Invalid session cookie configuration");
  const sessionCookieSecure = cookieSetting.data === "true";
  if (environment.NODE_ENV === "production" && (!sessionCookieSecure || new URL(parsedAppUrl.data).protocol !== "https:")) {
    throw new Error("Secure session cookies are required in production");
  }
  if (environment.NODE_ENV === "production" && !environment.DATABASE_URL && !environment.PGLITE_DATA_DIR) {
    throw new Error("A durable authentication database is required in production");
  }
  const invitePepper = readInvitePepper();

  return {
    repository: new DrizzleAuthRepository(getDb()),
    invitePepper,
    now: () => new Date(),
    createSessionToken: newSessionToken,
    appUrl: parsedAppUrl.data,
    sessionCookieSecure,
  };
}
