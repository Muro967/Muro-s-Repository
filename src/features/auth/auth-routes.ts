import "server-only";

import { z } from "zod";

import { AuthError } from "./auth-errors";
import { loginWithPassword, logoutSession, readSession, registerWithInvite } from "./auth-service";
import { clearSessionCookie, createSessionCookie, requestSessionToken } from "./session-cookie";
import type { AuthDependencies } from "./auth-types";
import { apiError, jsonResponse, readJsonBody, zodFields } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";

export type AuthRouteDependencies = AuthDependencies & {
  appUrl: string;
  sessionCookieSecure: boolean;
};

// Strip repository-only fields before crossing the HTTP/server-component boundary.
export const sessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string(),
  onboardingComplete: z.boolean(),
});

const registerSchema = z.object({
  inviteCode: z.string().min(1).max(256),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(128),
  name: z.string().trim().min(1).max(80),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
}).strict();

function originError(request: Request, appUrl: string): Response | null {
  try {
    assertSameOrigin(request, appUrl);
    return null;
  } catch {
    return apiError("ORIGIN_MISMATCH", 403, "Request origin is not allowed.");
  }
}

async function validatedBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const parsedJson = await readJsonBody(request);
  if (!parsedJson.ok) {
    return {
      ok: false,
      response: apiError("INVALID_INPUT", 400, "A valid JSON request body is required."),
    };
  }
  const parsed = schema.safeParse(parsedJson.value);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        "INVALID_INPUT",
        400,
        "The request contains invalid fields.",
        zodFields(parsed.error),
      ),
    };
  }
  return { ok: true, value: parsed.data };
}

function authFailure(error: unknown): Response {
  if (error instanceof AuthError) {
    switch (error.code) {
      case "INVALID_INVITE":
        return apiError("INVALID_INVITE", 400, "The invitation code is invalid or unavailable.");
      case "EMAIL_ALREADY_REGISTERED":
        return apiError("EMAIL_IN_USE", 409, "An account already uses this email address.");
      case "INVALID_PASSWORD":
        return apiError("INVALID_INPUT", 400, "The password does not meet the requirements.", {
          password: "Use a password between 10 and 128 characters.",
        });
      case "INVALID_CREDENTIALS":
        return apiError("INVALID_CREDENTIALS", 401, "Email or password is incorrect.");
    }
  }
  return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
}

export function createRegisterHandler(dependencies: AuthRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const mismatch = originError(request, dependencies.appUrl);
    if (mismatch) return mismatch;
    const body = await validatedBody(request, registerSchema);
    if (!body.ok) return body.response;
    try {
      const result = await registerWithInvite(body.value, dependencies);
      return jsonResponse(
        { user: sessionUserSchema.parse(result.user) },
        201,
        { "set-cookie": createSessionCookie(result.sessionToken, dependencies.sessionCookieSecure) },
      );
    } catch (error) {
      return authFailure(error);
    }
  };
}

export function createLoginHandler(dependencies: AuthRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const mismatch = originError(request, dependencies.appUrl);
    if (mismatch) return mismatch;
    const body = await validatedBody(request, loginSchema);
    if (!body.ok) return body.response;
    try {
      const result = await loginWithPassword(body.value, dependencies);
      return jsonResponse(
        { user: sessionUserSchema.parse(result.user) },
        200,
        { "set-cookie": createSessionCookie(result.sessionToken, dependencies.sessionCookieSecure) },
      );
    } catch (error) {
      return authFailure(error);
    }
  };
}

export function createLogoutHandler(dependencies: AuthRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const mismatch = originError(request, dependencies.appUrl);
    if (mismatch) return mismatch;
    const token = requestSessionToken(request);
    try {
      if (token) await logoutSession(token, dependencies.repository);
      return jsonResponse(
        { ok: true },
        200,
        { "set-cookie": clearSessionCookie(dependencies.sessionCookieSecure) },
      );
    } catch {
      return apiError(
        "INTERNAL_ERROR",
        500,
        "The request could not be completed.",
        undefined,
        { "set-cookie": clearSessionCookie(dependencies.sessionCookieSecure) },
      );
    }
  };
}

export function createSessionHandler(dependencies: AuthRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const token = requestSessionToken(request);
    if (!token) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
    try {
      const user = await readSession(token, dependencies.repository, dependencies.now());
      if (!user) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
      return jsonResponse({ user: sessionUserSchema.parse(user) });
    } catch {
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };
}
