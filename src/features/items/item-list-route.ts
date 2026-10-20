import "server-only";
import type { AuthRepository } from "../auth/auth-repository";
import { readSession } from "../auth/auth-service";
import { requestSessionToken } from "../auth/session-cookie";
import type { AppDatabase } from "@/server/db/types";
import { apiError, jsonResponse } from "@/server/http/json";
import { ItemError } from "./item-repository";
import { parseItemQuery, queryItems } from "./item-query";

export function createItemListHandler(deps: { database: AppDatabase; authRepository: AuthRepository; now: () => Date; cursorKey: string }) {
 return async (request: Request) => {
  try {
   const now = deps.now(); const token = requestSessionToken(request);
   const user = token ? await readSession(token, deps.authRepository, now) : null;
   if (!user) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
   return jsonResponse(await queryItems(deps.database, user.id, parseItemQuery(new URL(request.url).searchParams), now, deps.cursorKey));
  } catch (error) {
   if (error instanceof ItemError) return apiError(error.code, error.code === "NOT_FOUND" ? 404 : 400, "The requested items could not be found.");
   return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
  }
 };
}
