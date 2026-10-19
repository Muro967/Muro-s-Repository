# Phase 2 Wardrobe, Zones, Inventory, and Idle Disposal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a daily-usable manual wardrobe: users manage multiple wardrobes and zones, add and find real garments with private photos, move and soft-delete them, and complete idle, watch, and disposal workflows with truthful statistics.

**Architecture:** Extend the existing Drizzle/PostgreSQL schema with tenant-safe wardrobe inventory tables and one forward migration. Domain services own state transitions and idle calculations; authenticated Next route factories bind them to server-only repositories. React pages use the approved mobile visual system and the existing private upload provider. Idle is always derived from dates, season, and settings; only `draft | active | watching | disposed` is persisted.

**Tech Stack:** Node.js 22, pnpm 11.25, Next.js 16 App Router, React 19, TypeScript 6, Drizzle ORM, PostgreSQL/PGlite, Zod, Sharp, Vitest, Testing Library, Playwright.

## Global Constraints

- UI language is Simplified Chinese; brand is **AI Wardrobe** and tagline is **穿你所有，爱你所穿**.
- Preserve the approved paper/sage/rose visual language, serif display typography, large rounded cards, floating four-tab capsule, 44-pixel controls, visible focus, safe areas, and reduced motion.
- Every query and mutation is scoped by the authenticated `userId`; another user's IDs return 404 without disclosing existence.
- First usable version includes multiple wardrobes, the four zone kinds, manual garment entry, basic search, soft delete/restore, idle/watch/disposal, and truthful statistics.
- AI inference, background removal, inspiration, outfits, wear logs, offline mutation queues, export, and permanent purge workers are explicitly deferred.
- A garment may be saved as a draft without a photo or location. Activation requires name, category, one completed private original image, and an owned wardrobe/zone.
- Garment state is `draft | active | watching | disposed`; `deletedAt` is an independent 30-day recycle-bin marker. Idle is derived, never persisted as a status.
- No wear-log counts are invented. Before wear logs exist, optional `manualLastWornOn` is labeled as manually entered; otherwise idle uses `addedOn`.
- New active garments have a 30-day grace period. A garment is idle only when age is strictly greater than `idleDays`; exactly 90 days is not idle when the default is 90.
- `watching` garments remain in the idle numerator. Watch expiry only produces an overdue warning and never disposes automatically.
- Disposed and soft-deleted garments are excluded from matching/search/idle denominators but retain assets, history, and disposal information.
- Original images remain private. Browser reads use authenticated same-origin streaming with `Cache-Control: private, no-store`; object keys and filesystem paths never reach clients.
- All state changes with multiple writes are transactional and idempotent where retry is expected.
- Never log passwords, invitation codes, session tokens, object credentials, image bytes, or private notes.
- No Tailwind or generic component framework; use CSS Modules and existing tokens.

---

### Task 1: Define Catalogs, Validation, and the Idle Policy

**Files:**
- Create: `src/features/wardrobe/wardrobe-types.ts`
- Create: `src/features/items/item-types.ts`
- Create: `src/features/items/item-catalog.ts`
- Create: `src/features/items/item-validation.ts`
- Create: `src/features/idle/idle-types.ts`
- Create: `src/features/idle/idle-policy.ts`
- Test: `tests/unit/items/item-validation.test.ts`
- Test: `tests/unit/idle/idle-policy.test.ts`
- Test: `tests/unit/idle/idle-statistics.test.ts`

**Interfaces:**
- Produces `zoneKinds = ["hang", "shelf", "drawer", "shoe"] as const`.
- Produces stable category, accessory, style, and season IDs plus Chinese labels.
- Produces `deriveIdleState(item, settings, context): IdleState`.
- Produces `calculateIdleStatistics(items): { availableCount; idleCount; disposedCount; idleRate; disposalRate }`.

- [ ] **Step 1: Write failing boundary tests**

```ts
test("treats day 90 as active and day 91 as idle", () => {
  const base = { status: "active", addedOn: "2026-01-01", manualLastWornOn: "2026-01-01", seasonIds: [] } as const;
  expect(deriveIdleState(base, { idleDays: 90, watchDays: 30 }, { today: "2026-04-01", currentSeason: "spring" }).isIdle).toBe(false);
  expect(deriveIdleState(base, { idleDays: 90, watchDays: 30 }, { today: "2026-04-02", currentSeason: "spring" }).isIdle).toBe(true);
});

test("does not count drafts, disposed, deleted, grace-period, or explicit off-season items", () => {
  const result = ["draft", "disposed"].map((status) =>
    deriveIdleState({ status, addedOn: "2025-01-01", manualLastWornOn: null, seasonIds: ["winter"], deletedAt: null },
      { idleDays: 90, watchDays: 30 }, { today: "2026-07-01", currentSeason: "summer" }),
  );
  expect(result.every((value) => value.isIdle === false)).toBe(true);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/unit/items tests/unit/idle`

Expected: FAIL because the catalogs and policy modules do not exist.

- [ ] **Step 3: Implement stable types and pure policy**

```ts
export type IdlePolicyItem = {
  status: "draft" | "active" | "watching" | "disposed";
  addedOn: string | null;
  manualLastWornOn: string | null;
  seasonIds: readonly SeasonId[];
  watchDueOn?: string | null;
  deletedAt?: Date | null;
};

export function deriveIdleState(item: IdlePolicyItem, settings: IdleSettings, context: IdleContext): IdleState {
  if (item.deletedAt || !item.addedOn || (item.status !== "active" && item.status !== "watching")) return notIdle();
  if (calendarDaysBetween(item.addedOn, context.today) < 30) return notIdle();
  if (isExplicitlyOffSeason(item.seasonIds, context.currentSeason)) return notIdle();
  const baseline = item.manualLastWornOn ?? item.addedOn;
  const isIdle = calendarDaysBetween(baseline, context.today) > settings.idleDays;
  return { isIdle, isWatching: item.status === "watching", isWatchOverdue: isIdle && item.status === "watching" && Boolean(item.watchDueOn && item.watchDueOn < context.today) };
}
```

Use date-only parsing and UTC calendar arithmetic; reject impossible/future dates at input validation. Empty seasons mean unknown and do not exclude idle. All four seasons mean year-round.

- [ ] **Step 4: Verify GREEN and types**

Run: `pnpm test tests/unit/items tests/unit/idle && pnpm typecheck && pnpm lint`

Expected: exact threshold, grace, season, watch-overdue, and zero-denominator tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/wardrobe src/features/items src/features/idle tests/unit/items tests/unit/idle
git commit -m "feat: define wardrobe inventory and idle policy"
```

---

### Task 2: Add Tenant-Safe Inventory Schema and Upgrade Migration

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/drizzle-auth-repository.ts`
- Create: `drizzle/0001_inventory_idle.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0001_snapshot.json`
- Create: `tests/integration/db/phase-2-schema.test.ts`
- Create: `tests/integration/db/phase-2-upgrade.test.ts`
- Modify: `tests/integration/db/foundation-schema.test.ts`
- Modify: `tests/integration/auth/drizzle-auth-repository.test.ts`

**Interfaces:**
- Produces tables `zones`, `items`, `item_assets`, and `disposal_records`.
- Extends `user_settings` with `idleDays`, `watchDays`, `timeZone`, and nullable `seasonOverride`.
- Extends `uploads` with a non-null `kind` backfilled from its existing object key.
- New accounts receive `我的衣柜` plus one `默认挂衣区` zone in the registration transaction.

- [ ] **Step 1: Write upgrade and isolation tests**

```ts
test("upgrades a phase-one database without losing its user or wardrobe", async () => {
  const client = new PGlite();
  await applySql(client, "drizzle/0000_foundation.sql");
  const wardrobeId = await seedPhaseOneUserAndWardrobe(client);
  await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
  expect(await countRows(client, "wardrobes")).toBe(1);
  expect(await zoneNamesForWardrobe(client, wardrobeId)).toEqual(["默认挂衣区"]);
});

test("rejects cross-user zone, asset, and disposal references at the database boundary", async () => {
  await expect(insertForeignTenantReferences(db, fixtures)).rejects.toThrow();
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/integration/db tests/integration/auth/drizzle-auth-repository.test.ts`

Expected: FAIL because the new tables and migration are absent.

- [ ] **Step 3: Implement schema and migration**

The migration must add:

```ts
export const zones = pgTable("zones", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull(),
  wardrobeId: uuid("wardrobe_id").notNull(), name: text("name").notNull(),
  kind: text("kind").notNull(), sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`items` stores scalar metadata plus JSON text arrays for colors/styles/seasons, `status`, `addedOn`, `manualLastWornOn`, watch dates, and `deletedAt`. `item_assets` uniquely binds one `original` per item and one upload to at most one item. `disposal_records` uniquely binds one record per item and stores money as integer minor units. Add composite tenant unique keys and foreign keys so database-level cross-user references fail. Add CHECK constraints for enums, date relationships, and location requirements for active/watching/disposed items.

- [ ] **Step 4: Generate metadata and verify upgrade**

Run: `pnpm exec drizzle-kit generate && pnpm test tests/integration/db tests/integration/auth/drizzle-auth-repository.test.ts && pnpm typecheck`

Expected: migration applies to both fresh and phase-one databases, existing data remains, and Drizzle reports no drift.

- [ ] **Step 5: Commit**

```bash
git add src/server/db drizzle tests/integration/db tests/integration/auth/drizzle-auth-repository.test.ts
git commit -m "feat: add wardrobe inventory schema"
```

---

### Task 3: Implement Wardrobe and Zone Transactions and Routes

**Files:**
- Create: `src/features/wardrobe/wardrobe-repository.ts`
- Create: `src/features/wardrobe/wardrobe-service.ts`
- Create: `src/features/wardrobe/wardrobe-routes.ts`
- Create: `src/server/db/drizzle-wardrobe-repository.ts`
- Create: `src/server/wardrobe.ts`
- Create: `src/app/api/wardrobes/route.ts`
- Create: `src/app/api/wardrobes/reorder/route.ts`
- Create: `src/app/api/wardrobes/[wardrobeId]/route.ts`
- Create: `src/app/api/wardrobes/[wardrobeId]/zones/route.ts`
- Create: `src/app/api/wardrobes/[wardrobeId]/zones/reorder/route.ts`
- Create: `src/app/api/zones/[zoneId]/route.ts`
- Test: `tests/unit/wardrobe/wardrobe-service.test.ts`
- Test: `tests/integration/wardrobe/wardrobe-routes.test.ts`
- Test: `tests/integration/wardrobe/drizzle-wardrobe-repository.test.ts`

**Interfaces:**
- Produces authenticated CRUD and full-list reorder operations for wardrobes and zones.
- Delete requests accept `{ destinationZoneId?: string }`; retained garments are relocated in the same transaction or the request returns `LOCATION_REQUIRED`.

- [ ] **Step 1: Write failing ownership, reorder, and relocation tests**

```ts
test("deleting a non-empty zone requires an owned destination and moves every retained item atomically", async () => {
  await expect(service.deleteZone(userA, sourceZone, {})).rejects.toMatchObject({ code: "LOCATION_REQUIRED" });
  await service.deleteZone(userA, sourceZone, { destinationZoneId: targetZone });
  expect(await repo.itemLocations(userA)).toEqual([{ wardrobeId: targetWardrobe, zoneId: targetZone }]);
});

test("rejects reorder lists with missing, duplicate, or foreign ids", async () => {
  await expect(service.reorderWardrobes(userA, [ownedId, foreignId])).rejects.toMatchObject({ code: "NOT_FOUND" });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/unit/wardrobe tests/integration/wardrobe`

Expected: FAIL because the repository, service, and handlers do not exist.

- [ ] **Step 3: Implement transactional services and strict handlers**

```ts
export interface WardrobeRepository {
  list(userId: string): Promise<WardrobeTree[]>;
  createWardrobe(userId: string, input: { name: string }): Promise<WardrobeTree>;
  renameWardrobe(userId: string, wardrobeId: string, name: string): Promise<void>;
  reorderWardrobes(userId: string, orderedIds: string[]): Promise<void>;
  deleteWardrobe(userId: string, wardrobeId: string, destinationZoneId?: string): Promise<void>;
  createZone(userId: string, wardrobeId: string, input: CreateZoneInput): Promise<Zone>;
  renameZone(userId: string, zoneId: string, name: string): Promise<void>;
  reorderZones(userId: string, wardrobeId: string, orderedIds: string[]): Promise<void>;
  deleteZone(userId: string, zoneId: string, destinationZoneId?: string): Promise<void>;
}
```

All POST/PATCH/DELETE routes run `assertSameOrigin` before body parsing, use strict Zod objects, and resolve user from the session cookie. Serialize user writes by locking the user row, lock source/target containers in stable ID order, relocate retained draft/active/watching/disposed and recycle-bin items, then delete the container. Refuse deletion of the final wardrobe.

- [ ] **Step 4: Verify service, database, HTTP, type, and lint checks**

Run: `pnpm test tests/unit/wardrobe tests/integration/wardrobe && pnpm typecheck && pnpm lint`

Expected: cross-user IDs return 404, malformed reorder is rejected, and injected failures roll back relocation/deletion.

- [ ] **Step 5: Commit**

```bash
git add src/features/wardrobe src/server/wardrobe.ts src/server/db/drizzle-wardrobe-repository.ts src/app/api/wardrobes src/app/api/zones tests/unit/wardrobe tests/integration/wardrobe
git commit -m "feat: add wardrobe and zone management"
```

---

### Task 4: Build the Wardrobe and Zone Management Screen

**Files:**
- Create: `src/components/navigation/detail-shell.tsx`
- Create: `src/components/navigation/detail-shell.module.css`
- Create: `src/components/overlays/bottom-sheet.tsx`
- Create: `src/components/overlays/bottom-sheet.module.css`
- Create: `src/features/wardrobe/wardrobe-client.ts`
- Create: `src/features/wardrobe/wardrobe-manager.tsx`
- Create: `src/features/wardrobe/wardrobe-manager.module.css`
- Create: `src/features/wardrobe/zone-grid.tsx`
- Create: `src/features/wardrobe/location-picker.tsx`
- Create: `src/app/(app)/app/wardrobes/page.tsx`
- Modify: `src/app/(app)/app/wardrobe/page.tsx`
- Modify: `src/app/(app)/app/profile/page.tsx`
- Test: `tests/unit/components/bottom-sheet.test.tsx`
- Test: `tests/unit/wardrobe/wardrobe-manager.test.tsx`
- Test: `tests/unit/wardrobe/location-picker.test.tsx`

**Interfaces:**
- Produces reusable `BottomSheet` and `LocationPicker` for move/disposal flows.
- Produces a protected `/app/wardrobes` page matching reference screens 04–05 without the bottom tab capsule.

- [ ] **Step 1: Write failing accessible-interaction tests**

```tsx
test("resets the zone when a different wardrobe is chosen", async () => {
  render(<LocationPicker wardrobes={fixtures} value={firstLocation} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: "次卧衣柜" }));
  expect(screen.getByRole("button", { name: "先选一个分区" })).toBeDisabled();
});

test("restores focus after closing the bottom sheet", async () => {
  const trigger = renderSheetHarness();
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/unit/components/bottom-sheet.test.tsx tests/unit/wardrobe`

Expected: FAIL because the components are missing.

- [ ] **Step 3: Implement the real management UI**

Follow screenshots 04–05: horizontal wardrobe tabs, wood-toned cabinet frame, four distinct zone visuals, selected zone outline, add/rename/up/down/delete controls, selected-zone garment list, and relocation sheet. Do not make drag or long-press the only way to reorder. `BottomSheet` uses an accessible named dialog, focus trap, Escape and backdrop close, body scroll lock, and trigger focus restoration.

- [ ] **Step 4: Verify responsive and accessibility behavior**

Run: `pnpm test tests/unit/components/bottom-sheet.test.tsx tests/unit/wardrobe && pnpm typecheck && pnpm lint`

Expected: keyboard-only CRUD works; 320–480px layouts have no horizontal document overflow.

- [ ] **Step 5: Commit**

```bash
git add src/components/navigation src/components/overlays src/features/wardrobe src/app tests/unit/components tests/unit/wardrobe
git commit -m "feat: add wardrobe zone management UI"
```

---

### Task 5: Add Garment Drafts, Asset Binding, and Private Image Reads

**Files:**
- Create: `src/features/items/item-repository.ts`
- Create: `src/features/items/item-service.ts`
- Create: `src/features/items/item-routes.ts`
- Create: `src/features/storage/private-image-routes.ts`
- Create: `src/server/db/drizzle-item-repository.ts`
- Create: `src/server/items.ts`
- Create: `src/app/api/items/route.ts`
- Create: `src/app/api/items/[itemId]/route.ts`
- Create: `src/app/api/items/[itemId]/activate/route.ts`
- Create: `src/app/api/items/[itemId]/original/route.ts`
- Create: `src/app/api/items/[itemId]/assets/[assetId]/content/route.ts`
- Modify: `package.json`
- Test: `tests/unit/items/item-service.test.ts`
- Test: `tests/integration/items/item-routes.test.ts`
- Test: `tests/integration/storage/private-image-routes.test.ts`
- Test: `tests/types/item-route-types.ts`

**Interfaces:**
- Produces `createDraft`, `updateItem`, `attachOriginal`, `activateItem`, and `readItem`.
- Produces authenticated private image streaming for owned item assets.

- [ ] **Step 1: Write failing draft, activation, and ownership tests**

```ts
test("activates only with an owned location and one completed decodable wardrobe-original", async () => {
  await expect(service.activateItem(userA, incompleteDraft)).rejects.toMatchObject({ code: "ITEM_INCOMPLETE" });
  await service.attachOriginal(userA, draftId, completedJpegUploadId);
  await service.activateItem(userA, draftId);
  expect((await service.readItem(userA, draftId)).status).toBe("active");
});

test("streams an owned image without exposing object keys", async () => {
  const response = await getImage(ownedRequest, { params: Promise.resolve({ itemId, assetId }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).toBe("image-bytes");
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/unit/items/item-service.test.ts tests/integration/items tests/integration/storage/private-image-routes.test.ts`

Expected: FAIL because item persistence and image reads do not exist.

- [ ] **Step 3: Implement strict state commands and image validation**

```ts
export interface ItemRepository {
  createDraft(userId: string, input: CreateDraftInput): Promise<ItemDetail>;
  updateItem(userId: string, itemId: string, patch: EditableItemPatch): Promise<ItemDetail>;
  attachOriginal(userId: string, itemId: string, uploadId: string, image: VerifiedImage): Promise<void>;
  activateItem(userId: string, itemId: string, today: string): Promise<ItemDetail>;
  findItem(userId: string, itemId: string): Promise<ItemDetail | null>;
}
```

Move `sharp` to production dependencies. Before binding, read the completed object through the provider, bound decoded pixels and dimensions, reject corrupt/unsupported data, validate `upload.kind === "wardrobe-original"`, and bind in one transaction. Activation writes `addedOn` once and requires location, category, name, and original. Generic PATCH must reject status, watch, disposal, tenant, and deletion fields.

The image GET route validates session and owned item/asset/upload, then streams provider bytes with exact MIME, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and no object key. GET does not require an Origin header; anonymous/foreign/unbound/incomplete objects return 404.

- [ ] **Step 4: Verify routes, corruption limits, and production types**

Run: `pnpm test tests/unit/items/item-service.test.ts tests/integration/items tests/integration/storage/private-image-routes.test.ts && pnpm typecheck && pnpm lint`

Expected: cross-user and wrong-kind IDs are indistinguishable 404s; corrupt and decompression-bomb images are rejected; retries do not duplicate assets.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/features/items src/features/storage/private-image-routes.ts src/server/items.ts src/server/db/drizzle-item-repository.ts src/app/api/items tests/unit/items tests/integration/items tests/integration/storage/private-image-routes.test.ts tests/types/item-route-types.ts
git commit -m "feat: add garment drafts and private images"
```

---

### Task 6: Build Photo Selection, Upload, and the Garment Editor

**Files:**
- Create: `src/features/items/item-upload-client.ts`
- Create: `src/features/items/use-item-upload.ts`
- Create: `src/features/items/photo-picker.tsx`
- Create: `src/features/items/item-editor.tsx`
- Create: `src/features/items/item-editor.module.css`
- Create: `src/app/(app)/app/items/new/page.tsx`
- Create: `src/app/(app)/app/items/[itemId]/page.tsx`
- Test: `tests/unit/items/item-upload-client.test.ts`
- Test: `tests/unit/items/photo-picker.test.tsx`
- Test: `tests/unit/items/item-editor.test.tsx`

**Interfaces:**
- Produces `uploadOriginal(file, callbacks): Promise<{ uploadId: string }>` using create → PUT → complete.
- Produces new/edit pages with immediate local preview, draft save, retry, and activation.

- [ ] **Step 1: Write failing immediate-preview and retry tests**

```tsx
test("renders a blob preview before the deferred upload resolves", async () => {
  const upload = deferredPromise();
  render(<ItemEditor submitUpload={() => upload.promise} />);
  await chooseFile(new File([jpegBytes], "coat.jpg", { type: "image/jpeg" }));
  expect(screen.getByRole("img", { name: "衣物照片预览" })).toHaveAttribute("src", "blob:preview");
  expect(screen.getByText("正在上传")).toBeVisible();
});

test("keeps edited fields and the selected file after a retryable failure", async () => {
  expect(await failThenRetryEditor()).toMatchObject({ name: "燕麦针织开衫", state: "retry" });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/unit/items/item-upload-client.test.ts tests/unit/items/photo-picker.test.tsx tests/unit/items/item-editor.test.tsx`

Expected: FAIL because the client and editor do not exist.

- [ ] **Step 3: Implement browser-safe upload and truthful UI**

Synchronously create and display a blob URL before awaiting network work; revoke it on replacement/unmount. Use an AbortController plus selection generation token so stale responses cannot replace a new photo. Strip browser-forbidden `Content-Length` from returned headers; preserve signed `Content-Type` and `If-None-Match`. Do not send app cookies to a cross-origin S3 target.

Use separate camera (`capture="environment"`) and album inputs. Accept JPEG/PNG/WebP only and clearly explain that HEIC is not supported yet. Show `正在上传`, `保存资料失败`, `需要重试`, and `已保存`; do not show AI, cutout, or fabricated timing labels. Draft save may omit photo/location; activation remains disabled until server requirements are met.

- [ ] **Step 4: Verify UI and networking behavior**

Run: `pnpm test tests/unit/items/item-upload-client.test.ts tests/unit/items/photo-picker.test.tsx tests/unit/items/item-editor.test.tsx && pnpm typecheck && pnpm lint`

Expected: preview precedes upload completion; retries reuse the same draft; abort and replacement cannot apply stale state.

- [ ] **Step 5: Commit**

```bash
git add src/features/items src/app/'(app)'/app/items tests/unit/items
git commit -m "feat: add manual garment entry UI"
```

---

### Task 7: Add Wardrobe Browsing, Basic Search, Move, and Recycle Bin

**Files:**
- Create: `src/features/items/item-query.ts`
- Create: `src/features/items/item-card.tsx`
- Create: `src/features/items/item-grid.tsx`
- Create: `src/features/items/category-folders.tsx`
- Create: `src/features/items/wardrobe-browser.tsx`
- Create: `src/features/items/wardrobe-browser.module.css`
- Create: `src/features/items/search-panel.tsx`
- Create: `src/features/items/item-lifecycle.ts`
- Create: `src/app/(app)/app/search/page.tsx`
- Create: `src/app/(app)/app/trash/page.tsx`
- Create: `src/app/api/items/[itemId]/move/route.ts`
- Create: `src/app/api/items/[itemId]/restore/route.ts`
- Modify: `src/app/api/items/[itemId]/route.ts`
- Modify: `src/app/(app)/app/wardrobe/page.tsx`
- Test: `tests/integration/items/item-query.test.ts`
- Test: `tests/integration/items/item-lifecycle-routes.test.ts`
- Test: `tests/unit/items/wardrobe-browser.test.tsx`
- Test: `tests/unit/items/search-panel.test.tsx`
- Test: `tests/unit/items/item-lifecycle.test.ts`

**Interfaces:**
- Produces bounded `GET /api/items` filtering by wardrobe, zone, category, style, and one basic text query.
- Produces move, 30-day soft delete, and restore commands.

- [ ] **Step 1: Write failing query and lifecycle tests**

```ts
test("searches literal percent and underscore characters without wildcard expansion", async () => {
  expect(await queryItems(userA, { q: "100%_棉" })).toEqual([literalNamedItem]);
});

test("soft delete preserves assets and status, while restore before day 30 returns the item", async () => {
  await service.softDeleteItem(userA, itemId, now);
  expect(provider.deleteCalls).toHaveLength(0);
  await service.restoreItem(userA, itemId, addDays(now, 29));
  expect((await service.readItem(userA, itemId)).status).toBe("watching");
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/unit/items tests/integration/items/item-query.test.ts tests/integration/items/item-lifecycle-routes.test.ts`

Expected: FAIL because browse/search/lifecycle behavior is absent.

- [ ] **Step 3: Implement deterministic queries and state commands**

`GET /api/items` accepts a strict bounded object with `limit <= 60`; trim `q`, limit to 80 code points, and escape SQL LIKE metacharacters. Search name, Chinese category label, color names, wardrobe name, and zone name. Sort by manual last-worn descending null-last, created time descending, then ID; paginate using a stable cursor. Ordinary browse excludes drafts, disposed, and deleted items.

Move verifies owned target wardrobe/zone in one transaction. DELETE writes `deletedAt` only and preserves prior state/assets. Restore is allowed while `today < deletedOn + 30 days`; at the exact deadline it returns `RESTORE_EXPIRED`. No physical deletion is claimed or performed in this phase.

- [ ] **Step 4: Implement the approved wardrobe/search/recycle UI**

Use screenshot 01–03 and 07 patterns: real wardrobe selector, truthful item/draft/watching/idle counts, category/style folder strip, accessory chips, three-column private-image grid, idle and search header actions, and add FAB. Do not display monthly wear days or wear counts. Search is debounced, cancels stale requests, and shows a truthful result count. Recycle bin shows remaining days and restore status.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test tests/unit/items tests/integration/items/item-query.test.ts tests/integration/items/item-lifecycle-routes.test.ts && pnpm typecheck && pnpm lint`

```bash
git add src/features/items src/app tests/unit/items tests/integration/items
git commit -m "feat: add wardrobe browsing and garment lifecycle"
```

---

### Task 8: Implement Idle Settings, Watch, Disposal, and Statistics

**Files:**
- Create: `src/features/idle/idle-repository.ts`
- Create: `src/features/idle/idle-service.ts`
- Create: `src/features/idle/idle-routes.ts`
- Create: `src/features/idle/idle-settings-service.ts`
- Create: `src/server/db/drizzle-idle-repository.ts`
- Create: `src/server/idle.ts`
- Create: `src/app/api/idle/route.ts`
- Create: `src/app/api/items/[itemId]/watch/route.ts`
- Create: `src/app/api/items/[itemId]/disposal/route.ts`
- Create: `src/app/api/settings/idle/route.ts`
- Test: `tests/unit/idle/idle-service.test.ts`
- Test: `tests/integration/idle/idle-routes.test.ts`
- Test: `tests/integration/idle/disposal-transactions.test.ts`
- Test: `tests/integration/idle/idle-settings.test.ts`

**Interfaces:**
- Produces `readIdleDashboard`, `startWatching`, `cancelWatching`, `disposeItem`, and `updateIdleSettings`.
- Produces six disposal methods: sold, gifted, donated, recycled, upcycled, discarded.

- [ ] **Step 1: Write failing watch/disposal transaction tests**

```ts
test("starts a fixed watch window only for a currently idle active item", async () => {
  await service.startWatching(userA, idleItemId, "2026-10-19");
  expect(await repo.itemState(userA, idleItemId)).toMatchObject({ status: "watching", watchDueOn: "2026-11-18" });
});

test("creates one sold record and changes the item in the same transaction", async () => {
  await service.disposeItem(userA, itemId, { method: "sold", saleAmountMinor: 18000, currency: "CNY", platform: "闲鱼", disposedOn: "2026-10-19" });
  expect(await repo.disposalCount(userA, itemId)).toBe(1);
  expect(await repo.itemState(userA, itemId)).toMatchObject({ status: "disposed", watchStartedOn: null, watchDueOn: null });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/unit/idle tests/integration/idle`

Expected: FAIL because the services and routes are missing.

- [ ] **Step 3: Implement strict state and field rules**

Start watch only when the pure policy says the active item is idle. Persist `watchDueOn` using the setting at start; later setting changes do not move existing deadlines. Editing a manual last-worn date to a date on/after watch start restores active and clears watch dates. Watch expiry only sets derived `isWatchOverdue`.

Disposal requires a non-deleted active/watching item and one owned transaction. `sold` accepts integer minor amount, currency, and platform; `gifted` accepts recipient; other methods reject those fields. Reject future disposal dates and notes over 500 code points. A unique item disposal constraint makes retry idempotent and prevents duplicate revenue.

Settings accept finite integers `idleDays: 1..3650`, `watchDays: 1..365`, IANA time zone, and nullable season override. Dashboard uses the shared policy and returns counts, rates, method totals, sold income, and public item projections.

- [ ] **Step 4: Verify transactions and stable HTTP errors**

Run: `pnpm test tests/unit/idle tests/integration/idle && pnpm typecheck && pnpm lint`

Expected: concurrent watch/dispose produces one legal final state; repository failure rolls back state and record; foreign IDs are 404.

- [ ] **Step 5: Commit**

```bash
git add src/features/idle src/server/idle.ts src/server/db/drizzle-idle-repository.ts src/app/api/idle src/app/api/items src/app/api/settings tests/unit/idle tests/integration/idle
git commit -m "feat: add idle watch and disposal domain"
```

---

### Task 9: Build Idle, Disposal, Settings, and Profile UI

**Files:**
- Create: `src/features/idle/idle-client.ts`
- Create: `src/features/idle/idle-dashboard.tsx`
- Create: `src/features/idle/idle-dashboard.module.css`
- Create: `src/features/idle/disposal-sheet.tsx`
- Create: `src/features/idle/idle-settings-form.tsx`
- Create: `src/app/(app)/app/idle/page.tsx`
- Create: `src/app/(app)/app/settings/idle/page.tsx`
- Modify: `src/app/(app)/app/profile/page.tsx`
- Modify: `src/app/(app)/app/wardrobe/page.tsx`
- Test: `tests/unit/idle/idle-dashboard.test.tsx`
- Test: `tests/unit/idle/disposal-sheet.test.tsx`
- Test: `tests/unit/idle/idle-settings-form.test.tsx`
- Test: `tests/unit/profile/profile-summary.test.tsx`

**Interfaces:**
- Produces screenshot-inspired `/app/idle` with idle, watching, and disposed segments.
- Produces user-editable idle/watch settings and truthful profile inventory summary.

- [ ] **Step 1: Write failing interaction tests**

```tsx
test("shows method-specific sold fields and retains input after a failed submit", async () => {
  render(<DisposalSheet item={item} submit={rejectOnce} />);
  await userEvent.click(screen.getByRole("radio", { name: "二手卖出" }));
  await userEvent.type(screen.getByLabelText("售价"), "180");
  await userEvent.click(screen.getByRole("button", { name: "确认：二手卖出" }));
  expect(screen.getByLabelText("售价")).toHaveValue(180);
  expect(screen.getByText("没有保存，请重试")).toBeVisible();
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/unit/idle tests/unit/profile`

Expected: FAIL because the pages and forms do not exist.

- [ ] **Step 3: Implement the reference UI with truthful copy**

Follow screenshots 08–10: rose and sage rate cards, segmented idle/watching/disposed counts, remaining/overdue watch text, six disposal cards, sold/gift fields, date, notes, income summary, and method distribution. Subtitle is `根据手动填写的最后穿着日期与入库时间计算`; explain grace period and season exclusion. Use accessible radios, dialog focus management, pending guards, and live result announcements.

Profile shows real item, wardrobe, zone, draft, idle, watching, and disposed counts plus links to wardrobes, idle settings, recycle bin, and idle dashboard. Continue to show honest empty states for inspiration/outfits; do not add AI usage or monthly report placeholders.

- [ ] **Step 4: Verify responsive and accessible UI**

Run: `pnpm test tests/unit/idle tests/unit/profile && pnpm typecheck && pnpm lint`

Expected: 320–480px pages have no horizontal document overflow; all sheet controls are keyboard usable and at least 44px.

- [ ] **Step 5: Commit**

```bash
git add src/features/idle src/app/'(app)'/app/idle src/app/'(app)'/app/settings src/app/'(app)'/app/profile src/app/'(app)'/app/wardrobe tests/unit/idle tests/unit/profile
git commit -m "feat: add idle disposal experience"
```

---

### Task 10: Prove the Full Manual-Wardrobe Journey and Hand Off Phase 2

**Files:**
- Create: `tests/e2e/wardrobe-inventory.spec.ts`
- Create: `tests/e2e/idle-disposal.spec.ts`
- Create: `tests/e2e/helpers/inventory.ts`
- Modify: `playwright.config.ts`
- Modify: `scripts/reset-e2e-db.ts`
- Create: `docs/development/phase-2-verification.md`
- Modify: `README.md`
- Modify: `docs/development/local-setup.md`
- Modify: `tests/build/upload-tracing.test.mjs`

**Interfaces:**
- Proves real registration → wardrobes/zones → private photo draft → activation → search/move/delete/restore → idle/watch/disposal.
- Proves a second user cannot read or mutate any wardrobe, item, image, watch, or disposal resource.

- [ ] **Step 1: Write the failing E2E journey**

```ts
test("manages a private garment from entry through disposal", async ({ page }) => {
  await registerAndOnboard(page, seededInvite, account);
  await createZone(page, { wardrobe: "主卧衣柜", name: "长挂区", kind: "hang" });
  await addGarment(page, { name: "焦糖风衣", fixture: "coat.jpg", category: "外套", zone: "长挂区", lastWornOn: "2025-01-01" });
  await expect(page.getByRole("img", { name: "焦糖风衣" })).toBeVisible();
  await moveGarment(page, "焦糖风衣", "次卧衣柜", "挂衣区");
  await placeIdleItemOnWatch(page, "焦糖风衣");
  await disposeItem(page, "焦糖风衣", { method: "二手卖出", price: "180", platform: "闲鱼" });
  await expect(page.getByText("¥180.00")).toBeVisible();
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test:e2e tests/e2e/wardrobe-inventory.spec.ts tests/e2e/idle-disposal.spec.ts`

Expected: FAIL until E2E fixtures, seeding, and final UI behavior are wired.

- [ ] **Step 3: Add isolated fixtures and authorization probes**

Use generated JPEG/PNG fixtures containing no personal media. Control old dates through test database fixtures before the server starts; do not add a production clock/date backdoor. Add direct second-user HTTP requests for wardrobe, zone, item, asset content, upload attachment, watch, and disposal IDs and assert uniform 404. Update Playwright `testMatch`, invitation environment allowlists, and reset validation together.

- [ ] **Step 4: Run complete phase verification**

Run all commands freshly with Node 22:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
node --test tests/build/upload-tracing.test.mjs
pnpm test:e2e
E2E_PRODUCTION=1 pnpm test:e2e
git diff --check
git status --short
```

Expected: unit/integration, types, lint, build, deployment traces, development E2E, and production PWA checks exit 0. Browser screenshots at 320, 390, and 480 pixels show no horizontal overflow, 44px controls, visible focus, and no bottom tab on detail pages.

- [ ] **Step 5: Document delivered and deferred behavior**

`phase-2-verification.md` explains manual last-worn semantics, idle thresholds, watch/disposal formulas, private images, recycle-bin limitation, local storage backup, and exact verification commands. State explicitly that AI recognition, cutout, wear logs, offline photo persistence, permanent purge automation, live S3 CORS, and physical iPhone/Android photo tests remain unverified or deferred.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e tests/build playwright.config.ts scripts/reset-e2e-db.ts docs/development README.md
git commit -m "test: verify manual wardrobe and disposal flow"
```

---

## Phase 2 Completion Gate

- Existing Phase 1 users upgrade without data loss and receive a usable default zone.
- A user can create, rename, reorder, and safely delete wardrobes/zones with required relocation.
- A user can select a real JPEG/PNG/WebP, see an immediate preview, save a draft, activate it, reload, and view the same private photo.
- Active garments always have an owned wardrobe/zone; another user cannot access metadata or image bytes.
- Wardrobe browsing, category/style grouping, and basic text search use real data and no fabricated wear counts.
- Move, soft delete, and restore preserve state and assets; no UI claims automatic permanent purge exists.
- Idle, watch, overdue, settings, disposal, income, idle rate, and disposal rate all consume the shared policy and exact formulas.
- Disposed, draft, and deleted items are excluded from active/idle candidate sets as defined.
- Full tests, typecheck, lint, build, route tracing, browser E2E, and production PWA checks exit 0 on Node 22.
- AI, inspiration, outfits, wear logs, offline mutation queues, export, and device/cloud deployment remain explicitly outside this phase.
