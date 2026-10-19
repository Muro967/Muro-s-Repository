// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createOnboardingHandler } from "@/features/onboarding/onboarding-routes";
import { completeOnboarding, readProfileSettings } from "@/features/onboarding/onboarding-service";
import { DrizzleAuthRepository } from "@/server/db/drizzle-auth-repository";
import { migrateDatabase } from "@/server/db/migrate";
import { schema } from "@/server/db/schema";
import { hashSessionToken } from "@/features/auth/crypto";
import { jsonRequest } from "../../helpers/http-request";

vi.mock("server-only", () => ({}));
const token = "onboarding-session-with-more-than-forty-characters";
const input = { name: "小沐", city: "上海", hairLength: "中长发", hairTexture: "偏直", wardrobeName: "主卧衣柜" } as const;

async function setup() {
  const client = new PGlite();
  const database = drizzle({ client, schema });
  await migrateDatabase(database);
  const repository = new DrizzleAuthRepository(database);
  await repository.createInvite({ codeHash: "invite", maxUses: 2, expiresAt: new Date("2030-01-01") });
  const user = await repository.register({ inviteHash: "invite", email: "muro@example.com", passwordHash: "private-password-hash", name: "Muro", sessionHash: hashSessionToken(token), sessionExpiresAt: new Date("2030-01-01"), now: new Date("2026-10-16") });
  return { client, user, database, repository, now: () => new Date("2026-10-18"), appUrl: "http://localhost:3000" };
}
function request(body: unknown = input, cookie = `aiw_session=${token}`) {
  const req = jsonRequest("/api/onboarding", body);
  req.headers.set("cookie", cookie);
  return req;
}

test("requires a valid session and same origin before changing data", async () => {
  const deps = await setup();
  try {
    expect((await createOnboardingHandler(deps)(request(input, ""))).status).toBe(401);
    const crossOrigin = request();
    crossOrigin.headers.set("origin", "https://attacker.example");
    const response = await createOnboardingHandler(deps)(crossOrigin);
    expect(response.status).toBe(403);
    expect(crossOrigin.bodyUsed).toBe(false);
    const malformed = await createOnboardingHandler(deps)(request({ ...input, hairLength: "任意值", userId: deps.user.id }));
    expect(malformed.status).toBe(400);
    expect((await deps.repository.findSession(hashSessionToken(token), deps.now()))?.onboardingComplete).toBe(false);
  } finally { await deps.client.close(); }
});

test("rejects native form fallback safely and checks its origin before reading profile values", async () => {
  const deps = await setup();
  try {
    const nativeRequest = (origin: string) => new Request("http://localhost:3000/api/onboarding", {
      method: "POST",
      headers: { origin, host: "localhost:3000", cookie: `aiw_session=${token}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(input).toString(),
    });
    const sameOrigin = nativeRequest("http://localhost:3000");
    const response = await createOnboardingHandler(deps)(sameOrigin);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_INPUT", message: "A valid JSON request body is required." } });
    expect(sameOrigin.bodyUsed).toBe(false);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const crossOrigin = nativeRequest("https://attacker.example");
    expect((await createOnboardingHandler(deps)(crossOrigin)).status).toBe(403);
    expect(crossOrigin.bodyUsed).toBe(false);
    expect((await deps.repository.findSession(hashSessionToken(token), deps.now()))?.onboardingComplete).toBe(false);
    expect(await readProfileSettings(deps.database, deps.user.id)).toEqual({ city: "", hairLength: "", hairTexture: "" });
  } finally { await deps.client.close(); }
});

test("atomically saves owned profile, settings, and the first wardrobe without exposing secrets", async () => {
  const deps = await setup();
  try {
    const other = await deps.repository.register({ inviteHash: "invite", email: "other@example.com", passwordHash: "other-hash", name: "Other", sessionHash: "other-session-hash", sessionExpiresAt: new Date("2030-01-01"), now: deps.now() });
    const response = await createOnboardingHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ user: { ...deps.user, name: "小沐", onboardingComplete: true } });
    const state = await deps.client.query("select u.name, u.onboarding_complete, s.city, s.hair_length, s.hair_texture, w.name as wardrobe from users u join user_settings s on s.user_id=u.id join wardrobes w on w.user_id=u.id where u.id=$1", [deps.user.id]);
    expect(state.rows[0]).toEqual({ name: "小沐", onboarding_complete: true, city: "上海", hair_length: "中长发", hair_texture: "偏直", wardrobe: "主卧衣柜" });
    const untouched = await deps.client.query("select name, onboarding_complete from users where id=$1", [other.id]);
    expect(untouched.rows[0]).toEqual({ name: "Other", onboarding_complete: false });
    expect(await readProfileSettings(deps.database, deps.user.id)).toEqual({ city: "上海", hairLength: "中长发", hairTexture: "偏直" });
    expect(await readProfileSettings(deps.database, other.id)).toEqual({ city: "", hairLength: "", hairTexture: "" });
    await createOnboardingHandler(deps)(request({ ...input, name: "overwrite" }));
    expect((await deps.repository.findSession(hashSessionToken(token), deps.now()))?.name).toBe("小沐");
  } finally { await deps.client.close(); }
});

test("rolls back all onboarding writes if the wardrobe update fails", async () => {
  const deps = await setup();
  try {
    await deps.client.exec("alter table wardrobes add constraint reject_name check (name <> '主卧衣柜')");
    const response = await createOnboardingHandler(deps)(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("reject_name");
    const state = await deps.client.query("select u.name, u.onboarding_complete, s.city, w.name as wardrobe from users u join user_settings s on s.user_id=u.id join wardrobes w on w.user_id=u.id where u.id=$1", [deps.user.id]);
    expect(state.rows[0]).toEqual({ name: "Muro", onboarding_complete: false, city: "", wardrobe: "我的衣柜" });
    await expect(completeOnboarding(deps.database, deps.user.id, input, deps.now())).rejects.toThrow("Onboarding persistence failed");
  } finally { await deps.client.close(); }
});
