import "server-only";

import { headers } from "next/headers";
import { getProductionAuthRouteDependencies } from "@/server/auth";
import { readSession } from "./auth-service";
import { sessionUserSchema } from "./auth-routes";
import { requestSessionToken } from "./session-cookie";
import type { SessionUser } from "./auth-types";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = requestSessionToken({ headers: await headers() });
  if (!token) return null;
  try {
    const dependencies = getProductionAuthRouteDependencies();
    const user = await readSession(token, dependencies.repository, dependencies.now());
    return user ? sessionUserSchema.parse(user) : null;
  } catch {
    throw new Error("Session lookup failed");
  }
}
