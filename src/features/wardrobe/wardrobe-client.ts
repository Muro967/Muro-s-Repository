import { z } from "zod";
import type { ClientError, ClientResult } from "@/features/auth/auth-client";
import type { CreateZoneInput } from "./wardrobe-repository";
import { zoneKinds } from "./wardrobe-types";

const zoneSchema = z.object({ id: z.string(), wardrobeId: z.string(), name: z.string(), kind: z.enum(zoneKinds), sortOrder: z.number() });
const wardrobeSchema = z.object({ id: z.string(), name: z.string(), sortOrder: z.number(), zones: z.array(zoneSchema) });
const savedSchema = z.object({ ok: z.literal(true) });
const errorSchema = z.object({ error: z.object({ code: z.string() }) });
const messages: Record<string, string> = {
  NETWORK_ERROR: "暂时无法连接，请检查网络连接后重试。",
  INVALID_INPUT: "请填写 1–80 个字符的名称，并检查所选分区。",
  UNAUTHORIZED: "登录已过期，请重新登录后继续。",
  ORIGIN_MISMATCH: "请求未能验证，请刷新页面后重试。",
  NOT_FOUND: "这个衣柜或分区已不存在，请重新加载。",
  LAST_WARDROBE: "至少需要保留一个衣柜，可以先新建衣柜再删除。",
  LOCATION_REQUIRED: "这里还有衣物，请先选择一个分区安置它们。",
  INTERNAL_ERROR: "暂时无法完成操作，请稍后重试。",
  INVALID_RESPONSE: "未能确认服务器返回的结果，请重新加载后核对。",
};
function errorFor(code: string): ClientError { return { code, message: messages[code] ?? messages.INTERNAL_ERROR }; }
async function request<T>(path: string, method: string, schema: z.ZodType<T>, input?: unknown): Promise<ClientResult<T>> {
  let response: Response;
  try { response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", ...(input === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(input) }) }); }
  catch { return { ok: false, error: errorFor("NETWORK_ERROR") }; }
  let body: unknown;
  try { body = await response.json(); } catch { return { ok: false, error: errorFor("INVALID_RESPONSE") }; }
  if (!response.ok) { const parsed = errorSchema.safeParse(body); return { ok: false, error: errorFor(parsed.success ? parsed.data.error.code : "INTERNAL_ERROR") }; }
  const parsed = schema.safeParse(body);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: errorFor("INVALID_RESPONSE") };
}
const idPath = (id: string) => encodeURIComponent(id);
export const wardrobeClient = {
  async list() { const result = await request("/api/wardrobes", "GET", z.object({ wardrobes: z.array(wardrobeSchema) })); return result.ok ? { ok: true as const, value: result.value.wardrobes } : result; },
  async createWardrobe(name: string) { const result = await request("/api/wardrobes", "POST", z.object({ wardrobe: wardrobeSchema }), { name }); return result.ok ? { ok: true as const, value: result.value.wardrobe } : result; },
  renameWardrobe(id: string, name: string) { return request(`/api/wardrobes/${idPath(id)}`, "PATCH", savedSchema, { name }); },
  reorderWardrobes(orderedIds: string[]) { return request("/api/wardrobes/reorder", "POST", savedSchema, { orderedIds }); },
  deleteWardrobe(id: string, destinationZoneId?: string) { return request(`/api/wardrobes/${idPath(id)}`, "DELETE", savedSchema, { destinationZoneId }); },
  async createZone(wardrobeId: string, input: CreateZoneInput) { const result = await request(`/api/wardrobes/${idPath(wardrobeId)}/zones`, "POST", z.object({ zone: zoneSchema }), input); return result.ok ? { ok: true as const, value: result.value.zone } : result; },
  renameZone(id: string, name: string) { return request(`/api/zones/${idPath(id)}`, "PATCH", savedSchema, { name }); },
  reorderZones(wardrobeId: string, orderedIds: string[]) { return request(`/api/wardrobes/${idPath(wardrobeId)}/zones/reorder`, "POST", savedSchema, { orderedIds }); },
  deleteZone(id: string, destinationZoneId?: string) { return request(`/api/zones/${idPath(id)}`, "DELETE", savedSchema, { destinationZoneId }); },
};
