import { describe, expect, it, vi } from "vitest";
import {
  createLoginHandler,
  createLogoutHandler,
  createRegisterHandler,
  createSessionHandler,
} from "@/features/auth/auth-routes";
import { hashSessionToken } from "@/features/auth/crypto";
import { jsonRequest } from "../../helpers/http-request";
import { testAuthRouteDeps } from "../../helpers/test-auth-route-deps";

vi.mock("server-only", () => ({}));

const registerBody = {
  inviteCode: "valid-code",
  email: "muro@example.com",
  password: "wardrobe-pass-2026",
  name: "Muro",
};

async function parseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("auth route handlers", () => {
  it.each(["aiw_session=short", "aiw_session=bad%20token", `aiw_session=${"a".repeat(257)}`,
    `aiw_session=${"a".repeat(43)}; aiw_session=${"b".repeat(43)}`])(
    "rejects malformed or ambiguous cookies %s", async (cookie) => {
      const dependencies = testAuthRouteDeps();
      const response = await createSessionHandler(dependencies)(new Request("http://localhost:3000/api/auth/session", {
        headers: { cookie },
      }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } });
    },
  );

  it("rejects a session at its exact expiry instant and sanitizes lookup failures", async () => {
    const dependencies = testAuthRouteDeps();
    const registration = await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", registerBody));
    const { user } = await registration.json() as { user: { id: string } };
    const token = "expiry-session-token-with-more-than-forty-characters";
    await dependencies.repository.createSession(user.id, hashSessionToken(token), dependencies.now());
    const request = () => new Request("http://localhost:3000/api/auth/session", { headers: { cookie: `aiw_session=${token}` } });
    expect((await createSessionHandler(dependencies)(request())).status).toBe(401);
    dependencies.repository.findSession = async () => { throw new Error("secret-session-hash"); };
    const failure = await createSessionHandler(dependencies)(request());
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toContain("secret-session-hash");
  });

  it("returns the same public error for unknown emails and wrong passwords", async () => {
    const dependencies = testAuthRouteDeps();
    await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", registerBody));
    const login = createLoginHandler(dependencies);
    const wrong = await login(jsonRequest("/api/auth/login", { email: registerBody.email, password: "wrong-password" }));
    const unknown = await login(jsonRequest("/api/auth/login", { email: "unknown@example.com", password: "wrong-password" }));
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("does not leak unknown input keys or repository-only user fields", async () => {
    const dependencies = testAuthRouteDeps();
    const invalid = await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", {
      ...registerBody, "secret-invite-value": "secret-password-value",
    }));
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).not.toContain("secret-invite-value");

    const register = dependencies.repository.register.bind(dependencies.repository);
    dependencies.repository.register = async (input) => ({
      ...await register(input), passwordHash: "secret-password-hash", sessionToken: "secret-token",
    });
    const response = await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", registerBody));
    expect(response.status).toBe(201);
    expect(await response.text()).not.toContain("secret-");
  });

  it.each([createRegisterHandler, createLoginHandler, createLogoutHandler])(
    "rejects the origin before reading the body or using auth dependencies", async (factory) => {
      const dependencies = testAuthRouteDeps();
      dependencies.repository.findUserByEmail = async () => { throw new Error("credentials-read"); };
      dependencies.repository.deleteSession = async () => { throw new Error("credentials-read"); };
      const request = new Request("http://localhost:3000/api/auth/login", {
        method: "POST", headers: { host: "localhost:3000" }, body: "private-body",
      });
      const response = await factory(dependencies)(request);
      expect(response.status).toBe(403);
      expect(request.bodyUsed).toBe(false);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it.each([null, [], 42, {}, { ...registerBody, password: "short" }])(
    "rejects invalid register payload %j without side effects", async (payload) => {
      const dependencies = testAuthRouteDeps();
      const response = await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", payload));
      expect(response.status).toBe(400);
      expect(dependencies.repository).toHaveProperty("userCount", 0);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("accepts Unicode passwords up to the domain's 128-code-point bound", async () => {
    const dependencies = testAuthRouteDeps();
    const response = await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", {
      ...registerBody, password: "😀".repeat(128),
    }));
    expect(response.status).toBe(201);
  });

  it("sanitizes unexpected persistence failures and clears the cookie on failed logout", async () => {
    const dependencies = testAuthRouteDeps();
    dependencies.repository.findUserByEmail = async () => { throw new Error("secret-query-password"); };
    const failed = await createLoginHandler(dependencies)(jsonRequest("/api/auth/login", {
      email: registerBody.email, password: registerBody.password,
    }));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: {
      code: "INTERNAL_ERROR", message: "The request could not be completed.",
    } });
    dependencies.repository.deleteSession = async () => { throw new Error("secret-session"); };
    const logout = await createLogoutHandler(dependencies)(new Request("http://localhost:3000/api/auth/logout", {
      method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000",
        cookie: `aiw_session=${dependencies.createSessionToken()}` },
    }));
    expect(logout.status).toBe(500);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await logout.text()).not.toContain("secret-session");
  });

  it("keeps independent test dependency stores and generated sessions isolated", async () => {
    const first = testAuthRouteDeps();
    const second = testAuthRouteDeps();
    const response = await createRegisterHandler(first)(jsonRequest("/api/auth/register", registerBody));
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    expect((await createSessionHandler(second)(new Request("http://localhost:3000/api/auth/session", {
      headers: { cookie },
    }))).status).toBe(401);
    const login = await createLoginHandler(first)(jsonRequest("/api/auth/login", {
      email: registerBody.email, password: registerBody.password,
    }));
    expect(login.headers.get("set-cookie")).not.toBe(response.headers.get("set-cookie"));
  });

  it("registers with an invite and sets an http-only same-site cookie", async () => {
    const dependencies = testAuthRouteDeps();
    const response = await createRegisterHandler(dependencies)(
      jsonRequest("/api/auth/register", registerBody),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    const result = await parseBody(response);
    expect(result).toEqual({
      user: {
        id: expect.any(String),
        email: "muro@example.com",
        name: "Muro",
        onboardingComplete: false,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(registerBody.password);
    expect(serialized).not.toContain(registerBody.inviteCode);
    expect(serialized).not.toContain("deterministic-test-session-token");
  });

  it("rejects cross-origin registration before consuming an invite", async () => {
    const dependencies = testAuthRouteDeps();
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(registerBody),
    });

    const response = await createRegisterHandler(dependencies)(request);
    expect(response.status).toBe(403);
    expect(await parseBody(response)).toMatchObject({ error: { code: "ORIGIN_MISMATCH" } });
    expect(dependencies.repository).toHaveProperty("inviteUseCount", 0);
  });

  it.each([
    ["malformed JSON", "{"],
    ["wrong content type", JSON.stringify(registerBody), "text/plain"],
  ])("returns stable invalid-input errors for %s", async (_label, body, contentType = "application/json") => {
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": contentType,
      },
      body,
    });
    const response = await createRegisterHandler(testAuthRouteDeps())(request);
    expect(response.status).toBe(400);
    expect(await parseBody(response)).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  it("maps an invalid invite to a stable public error", async () => {
    const dependencies = testAuthRouteDeps();
    const response = await createRegisterHandler(dependencies)(
      jsonRequest("/api/auth/register", { ...registerBody, inviteCode: "wrong-code" }),
    );
    expect(response.status).toBe(400);
    expect(await parseBody(response)).toMatchObject({ error: { code: "INVALID_INVITE" } });
  });

  it("maps duplicate email to a stable public error", async () => {
    const dependencies = testAuthRouteDeps();
    const register = createRegisterHandler(dependencies);
    expect((await register(jsonRequest("/api/auth/register", registerBody))).status).toBe(201);
    const response = await register(
      jsonRequest("/api/auth/register", { ...registerBody, inviteCode: "valid-code" }),
    );
    expect(response.status).toBe(409);
    expect(await parseBody(response)).toMatchObject({ error: { code: "EMAIL_IN_USE" } });
  });

  it("returns the same credential error for an incorrect password", async () => {
    const dependencies = testAuthRouteDeps();
    await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", registerBody));
    const response = await createLoginHandler(dependencies)(
      jsonRequest("/api/auth/login", { email: registerBody.email, password: "wrong-password" }),
    );

    expect(response.status).toBe(401);
    expect(await parseBody(response)).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
  });

  it("logs in with a valid password and keeps the session token out of JSON", async () => {
    const dependencies = testAuthRouteDeps();
    await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", registerBody));
    const response = await createLoginHandler(dependencies)(
      jsonRequest("/api/auth/login", {
        email: " MURO@example.com ",
        password: registerBody.password,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=2592000");
    const body = await parseBody(response);
    expect(body).toMatchObject({ user: { email: "muro@example.com" } });
    expect(JSON.stringify(body)).not.toContain("deterministic-test-session-token");
    expect(JSON.stringify(body)).not.toContain(registerBody.password);
  });

  it("logs out by deleting the session and clearing cookie attributes", async () => {
    const dependencies = testAuthRouteDeps();
    const registration = await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", {
      ...registerBody,
      email: "logout@example.com",
    }));
    const sessionToken = registration.headers.get("set-cookie")!.match(/aiw_session=([^;]+)/)![1]!;
    const request = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        cookie: `aiw_session=${sessionToken}`,
      },
    });

    const response = await createLogoutHandler(dependencies)(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(await parseBody(response)).toEqual({ ok: true });
    const session = await createSessionHandler(dependencies)(new Request("http://localhost:3000/api/auth/session", {
      headers: { cookie: `aiw_session=${sessionToken}` },
    }));
    expect(session.status).toBe(401);
  });

  it("marks session cookies Secure when enabled in route dependencies", async () => {
    const dependencies = testAuthRouteDeps();
    dependencies.sessionCookieSecure = true;
    const response = await createRegisterHandler(dependencies)(
      jsonRequest("/api/auth/register", registerBody),
    );
    expect(response.headers.get("set-cookie")).toContain("Secure");

    const logout = await createLogoutHandler(dependencies)(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { origin: "http://localhost:3000", host: "localhost:3000" },
      }),
    );
    expect(logout.headers.get("set-cookie")).toContain("Secure");
  });

  it("returns the current user for a valid session and unauthorized for absent or expired sessions", async () => {
    const dependencies = testAuthRouteDeps();
    const register = await createRegisterHandler(dependencies)(jsonRequest("/api/auth/register", registerBody));
    const token = register.headers.get("set-cookie")?.match(/aiw_session=([^;]+)/)?.[1];
    expect(token).toBeTruthy();

    const session = await createSessionHandler(dependencies)(
      new Request("http://localhost:3000/api/auth/session", {
        headers: { cookie: `aiw_session=${token}` },
      }),
    );
    expect(session.status).toBe(200);
    expect(await parseBody(session)).toMatchObject({ user: { email: "muro@example.com" } });

    const missing = await createSessionHandler(dependencies)(
      new Request("http://localhost:3000/api/auth/session"),
    );
    expect(missing.status).toBe(401);
    expect(await parseBody(missing)).toMatchObject({ error: { code: "UNAUTHORIZED" } });

    const expiredDependencies = testAuthRouteDeps();
    const expiredRegister = await createRegisterHandler(expiredDependencies)(
      jsonRequest("/api/auth/register", { ...registerBody, email: "expired@example.com" }),
    );
    const expiredUser = await parseBody(expiredRegister) as { user: { id: string } };
    const expiredToken = "expired-session-token-with-more-than-forty-characters";
    await expiredDependencies.repository.createSession(
      expiredUser.user.id,
      hashSessionToken(expiredToken),
      new Date("2026-10-16T11:00:00.000Z"),
    );
    const expired = await createSessionHandler(expiredDependencies)(
      new Request("http://localhost:3000/api/auth/session", {
        headers: { cookie: `aiw_session=${expiredToken}` },
      }),
    );
    expect(expired.status).toBe(401);
  });
});
