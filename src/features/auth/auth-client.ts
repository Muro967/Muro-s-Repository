import { z } from "zod";
import type { LoginInput, RegisterInput, SessionUser } from "./auth-types";
import type { OnboardingInput } from "@/features/onboarding/onboarding-types";

export type ClientError = { code: string; message: string; fields?: Record<string, string> };
export type ClientResult<T> = { ok: true; value: T } | { ok: false; error: ClientError };
export const connectionError: ClientError = { code: "NETWORK_ERROR", message: "暂时无法连接，请检查网络连接后重试。" };
const userSchema = z.object({ id: z.string(), email: z.string().email(), name: z.string(), onboardingComplete: z.boolean() });
const errorSchema = z.object({ error: z.object({ code: z.string(), fields: z.record(z.string(), z.string()).optional() }) });
const fieldHints: Record<string, string> = {
  inviteCode: "请检查邀请码是否完整、有效", email: "请输入有效的邮箱地址", password: "请输入符合要求的密码", name: "请输入 1–80 个字符的昵称",
  city: "请输入常用城市，最多 80 个字符", hairLength: "请选择发长", hairTexture: "请选择发质", wardrobeName: "请输入 1–80 个字符的衣柜名称",
};
function publicError(body: unknown): ClientError {
  const parsed = errorSchema.safeParse(body);
  const code = parsed.success ? parsed.data.error.code : "INTERNAL_ERROR";
  const fields: Record<string, string> = {};
  if (parsed.success) for (const key of Object.keys(parsed.data.error.fields ?? {})) if (fieldHints[key]) fields[key] = fieldHints[key];
  const messages: Record<string, string> = {
    INVALID_INPUT: "请检查填写内容后重试。", INVALID_INVITE: "邀请码无效或已过期，请检查邀请码或联系邀请人。", EMAIL_IN_USE: "这个邮箱已注册，请直接登录。",
    INVALID_CREDENTIALS: "邮箱或密码不正确，请检查后重试。", UNAUTHORIZED: "登录已过期，请重新登录。", ORIGIN_MISMATCH: "请求未能验证，请刷新页面后重试。",
  };
  if (code === "INVALID_INVITE") fields.inviteCode = fieldHints.inviteCode;
  if (code === "EMAIL_IN_USE") fields.email = "这个邮箱已注册，请前往登录";
  return { code, message: messages[code] ?? "暂时无法保存，请稍后重试。", fields };
}
async function post<T>(path: string, input: unknown, schema: z.ZodType<T>): Promise<ClientResult<T>> {
  try {
    const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const body: unknown = await response.json();
    if (!response.ok) return { ok: false, error: publicError(body) };
    const parsed = schema.safeParse(body);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: publicError(null) };
  } catch { return { ok: false, error: connectionError }; }
}
async function postUser(path: string, input: unknown): Promise<ClientResult<SessionUser>> {
  const result = await post(path, input, z.object({ user: userSchema }));
  return result.ok ? { ok: true, value: result.value.user } : result;
}
export function submitAuth(mode: "register" | "login", input: RegisterInput | LoginInput) {
  return postUser(`/api/auth/${mode}`, input);
}
export function submitOnboarding(input: OnboardingInput) { return postUser("/api/onboarding", input); }
export function logout() { return post("/api/auth/logout", {}, z.object({ ok: z.literal(true) })); }
