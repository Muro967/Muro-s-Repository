import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { CategoryId } from "@/features/items/item-types";
import {
  RecreationError,
  type RecreationInputs,
  type RecreationRepository,
} from "@/features/recreation/recreation-repository";
import type {
  Recreation,
  RecreationCandidate,
  RecreationDraft,
} from "@/features/recreation/recreation-types";

import {
  inspirationRecreationItems,
  inspirationRecreations,
  inspirations,
  itemAssets,
  items,
  styleProfiles,
  styleRules,
} from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

type Transaction = Parameters<Parameters<PgliteAppDatabase["transaction"]>[0]>[0];

const sortedVersions = (versions: Array<{ itemId: string; updatedAt: string }>) =>
  versions.slice().sort((a, b) => a.itemId.localeCompare(b.itemId));

function sameVersions(left: Array<{ itemId: string; updatedAt: string }>, right: Array<{ itemId: string; updatedAt: string }>) {
  return JSON.stringify(sortedVersions(left)) === JSON.stringify(sortedVersions(right));
}

const ruleKeys = (rules: Array<{ type: string; value: string }>) =>
  rules.map(({ type, value }) => `${type}\u0000${value}`).sort();

function candidate(row: typeof items.$inferSelect): RecreationCandidate | null {
  if (!row.categoryId) return null;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    categoryId: row.categoryId,
    accessoryId: row.accessoryId,
    colorNames: row.colorNames,
    styleIds: row.styleIds,
    material: row.material,
    fit: row.fit,
    length: row.length,
    formality: row.formality,
    status: row.status,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleRecreationRepository implements RecreationRepository {
  private readonly db: PgliteAppDatabase;

  constructor(database: AppDatabase) {
    this.db = database as PgliteAppDatabase;
  }

  private activeCandidates(database: PgliteAppDatabase | Transaction, userId: string) {
    return database.select().from(items).where(and(
      eq(items.userId, userId),
      eq(items.status, "active"),
      isNull(items.deletedAt),
    )).orderBy(asc(items.id));
  }

  async readInputs(userId: string, inspirationId: string): Promise<RecreationInputs | null> {
    try {
      const [sourceRows, profileRows, rules, candidateRows] = await Promise.all([
        this.db.select().from(inspirations).where(and(
          eq(inspirations.userId, userId),
          eq(inspirations.id, inspirationId),
          isNull(inspirations.deletedAt),
        )),
        this.db.select().from(styleProfiles).where(eq(styleProfiles.userId, userId)),
        this.db.select().from(styleRules).where(and(eq(styleRules.userId, userId), eq(styleRules.enabled, true))).orderBy(asc(styleRules.id)),
        this.activeCandidates(this.db, userId),
      ]);
      const source = sourceRows[0];
      if (!source) return null;
      const profile = profileRows[0];
      return {
        inspiration: {
          id: source.id,
          version: source.version,
          styleTags: source.styleTags,
          colorNames: source.colorNames,
          silhouettes: source.silhouettes,
          keyItems: source.keyItems,
          combinations: source.combinations,
          formality: source.formality,
        },
        styleProfile: profile ? {
          preferredColors: profile.preferredColors,
          preferredSilhouettes: profile.preferredSilhouettes,
          commonCombinations: profile.commonCombinations,
          formalityTendency: profile.formalityTendency,
          likedExamples: profile.likedExamples,
          inputVersion: profile.inputVersion,
        } : null,
        rules: rules.map((rule) => ({
          id: rule.id,
          type: rule.type,
          value: rule.value,
          enabled: rule.enabled,
          updatedAt: rule.updatedAt.toISOString(),
        })),
        candidates: candidateRows.map(candidate).filter((value): value is RecreationCandidate => value !== null),
      };
    } catch {
      throw new Error("Recreation input lookup failed");
    }
  }

  async save(userId: string, inspirationId: string, draft: RecreationDraft): Promise<Recreation | "CANDIDATES_CHANGED"> {
    try {
      return await this.db.transaction(async (transaction) => {
        const [source] = await transaction.select({ id: inspirations.id, version: inspirations.version })
          .from(inspirations).where(and(
            eq(inspirations.userId, userId),
            eq(inspirations.id, inspirationId),
            isNull(inspirations.deletedAt),
          )).for("update");
        if (!source) throw new RecreationError("NOT_FOUND");

        const [candidateRows, ruleRows] = await Promise.all([
          this.activeCandidates(transaction, userId),
          transaction.select({ type: styleRules.type, value: styleRules.value }).from(styleRules)
            .where(and(eq(styleRules.userId, userId), eq(styleRules.enabled, true))).orderBy(asc(styleRules.id)),
        ]);
        const candidates = candidateRows.map(candidate).filter((value): value is RecreationCandidate => value !== null);
        const snapshot = draft.inputSnapshot;
        if (source.version !== snapshot.inspiration.version ||
          !sameVersions(candidates.map(({ id, updatedAt }) => ({ itemId: id, updatedAt })), snapshot.candidateVersions) ||
          JSON.stringify(ruleKeys(ruleRows)) !== JSON.stringify(ruleKeys(snapshot.enabledRules))) {
          return "CANDIDATES_CHANGED";
        }
        const candidateMap = new Map(candidates.map((entry) => [entry.id, entry]));
        if (draft.items.some((entry) => !candidateMap.has(entry.itemId))) return "CANDIDATES_CHANGED";

        const [created] = await transaction.insert(inspirationRecreations).values({
          userId,
          inspirationId,
          mode: draft.mode,
          similarities: draft.similarities,
          missing: draft.missing,
          inputSnapshot: snapshot,
        }).returning();
        if (!created) throw new Error("Recreation insert failed");
        if (draft.items.length > 0) {
          await transaction.insert(inspirationRecreationItems).values(draft.items.map((entry, sortOrder) => ({
            userId,
            recreationId: created.id,
            itemId: entry.itemId,
            slot: entry.slot,
            sortOrder,
          })));
        }
        const assetRows = draft.items.length === 0 ? [] : await transaction.select({
          itemId: itemAssets.itemId,
          assetId: itemAssets.id,
        }).from(itemAssets).where(and(eq(itemAssets.userId, userId), inArray(itemAssets.itemId, draft.items.map(({ itemId }) => itemId))));
        const assets = new Map(assetRows.map((entry) => [entry.itemId, entry.assetId]));
        return {
          id: created.id,
          inspirationId,
          mode: created.mode,
          items: draft.items.map((entry) => {
            const item = candidateMap.get(entry.itemId)!;
            const assetId = assets.get(item.id);
            return {
              itemId: item.id,
              slot: entry.slot,
              name: item.name,
              categoryId: item.categoryId,
              colorNames: item.colorNames,
              imageUrl: assetId ? `/api/items/${item.id}/assets/${assetId}/content` : null,
            };
          }),
          similarities: created.similarities,
          missing: created.missing,
          createdAt: created.createdAt.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof RecreationError) throw error;
      throw new Error("Recreation save failed");
    }
  }

  async find(userId: string, recreationId: string): Promise<Recreation | null> {
    try {
      const [records, itemRows] = await Promise.all([
        this.db.select().from(inspirationRecreations).where(and(
          eq(inspirationRecreations.userId, userId),
          eq(inspirationRecreations.id, recreationId),
        )),
        this.db.select({
          itemId: items.id,
          slot: inspirationRecreationItems.slot,
          sortOrder: inspirationRecreationItems.sortOrder,
          name: items.name,
          categoryId: items.categoryId,
          colorNames: items.colorNames,
          assetId: itemAssets.id,
        }).from(inspirationRecreationItems)
          .innerJoin(items, and(
            eq(items.id, inspirationRecreationItems.itemId),
            eq(items.userId, inspirationRecreationItems.userId),
          ))
          .leftJoin(itemAssets, and(eq(itemAssets.itemId, items.id), eq(itemAssets.userId, items.userId)))
          .where(and(
            eq(inspirationRecreationItems.userId, userId),
            eq(inspirationRecreationItems.recreationId, recreationId),
            eq(items.status, "active"),
            isNull(items.deletedAt),
          )).orderBy(asc(inspirationRecreationItems.sortOrder)),
      ]);
      const record = records[0];
      if (!record) return null;
      return {
        id: record.id,
        inspirationId: record.inspirationId,
        mode: record.mode,
        items: itemRows.filter((entry): entry is typeof entry & { categoryId: CategoryId } => entry.categoryId !== null).map((entry) => ({
          itemId: entry.itemId,
          slot: entry.slot,
          name: entry.name,
          categoryId: entry.categoryId,
          colorNames: entry.colorNames,
          imageUrl: entry.assetId ? `/api/items/${entry.itemId}/assets/${entry.assetId}/content` : null,
        })),
        similarities: record.similarities,
        missing: record.missing,
        createdAt: record.createdAt.toISOString(),
      };
    } catch {
      throw new Error("Recreation lookup failed");
    }
  }
}
