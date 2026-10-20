import { randomUUID } from "node:crypto";
import { DrizzleIdleRepository } from "@/server/db/drizzle-idle-repository";
import { createIdleService } from "@/features/idle/idle-service";
import { createIdleSettingsService } from "@/features/idle/idle-settings-service";
import { wardrobeFixture } from "./wardrobe-fixture";

export async function idleFixture() {
  const f = await wardrobeFixture();
  const repository = new DrizzleIdleRepository(f.database);
  const service = createIdleService(repository, f.now);
  const settingsService = createIdleSettingsService(repository);
  async function item(options: { status?: "active" | "watching" | "draft" | "disposed"; userId?: string; addedOn?: string; manualLastWornOn?: string; seasonIds?: string[]; deleted?: boolean } = {}) {
    const id = randomUUID();
    const owner = options.userId === f.other.id ? f.foreign : f.source;
    const status = options.status ?? "active";
    await f.client.query(`insert into items (id,user_id,wardrobe_id,zone_id,name,category_id,status,added_on,manual_last_worn_on,season_ids,deleted_at,watch_started_on,watch_due_on) values ($1,$2,$3,$4,'Shirt','tops',$5,$6,$7,$8::jsonb,$9,$10,$11)`, [id, options.userId ?? f.user.id, owner.id, owner.zones[0]!.id, status, options.addedOn ?? "2026-01-01", options.manualLastWornOn ?? null, JSON.stringify(options.seasonIds ?? []), options.deleted ? "2026-10-19" : null, status === "watching" ? "2026-10-01" : null, status === "watching" ? "2026-10-15" : null]);
    return id;
  }
  async function state(id: string) {
    return (await f.client.query(`select status,watch_started_on::text,watch_due_on::text,manual_last_worn_on::text from items where user_id=$1 and id=$2`, [f.user.id, id])).rows[0];
  }
  return { ...f, repository, service, settingsService, item, state };
}
