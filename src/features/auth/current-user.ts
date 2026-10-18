import "server-only";

import { cookies } from "next/headers";
import { getProductionAuthRouteDependencies } from "@/server/auth";
import { readSession } from "./auth-service";
import { sessionUserSchema } from "./auth-routes";
import { parseSessionToken, sessionCookie } from "./session-cookie";
import type { SessionUser } from "./auth-types";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const values = (await cookies()).getAll(sessionCookie.name);
  const token = values.length === 1 ? parseSessionToken(values[0]?.value) : null;
  if (!token) return null;
  try {
    const dependencies = getProductionAuthRouteDependencies();
    const user = await readSession(token, dependencies.repository, dependencies.now());
    return user ? sessionUserSchema.parse(user) : null;
  } catch {
    throw new Error("Session lookup failed");
  }
}
