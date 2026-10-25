import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import {
  StyleError,
  type StyleProfile,
  type StyleRepository,
} from "@/features/style/style-repository";
import type {
  StyleInspiration,
  StyleProfileDraft,
  StyleRule,
  StyleRuleInput,
  StyleSuggestion,
} from "@/features/style/style-types";

import {
  inspirations,
  styleProfiles,
  styleRules,
  uploads,
  users,
} from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

type Transaction = Parameters<Parameters<PgliteAppDatabase["transaction"]>[0]>[0];
type ProfileRow = typeof styleProfiles.$inferSelect;
type RuleRow = typeof styleRules.$inferSelect;

function profile(row: ProfileRow): StyleProfile {
  return {
    preferredColors: row.preferredColors,
    preferredSilhouettes: row.preferredSilhouettes,
    commonCombinations: row.commonCombinations,
    formalityTendency: row.formalityTendency,
    likedExamples: row.likedExamples,
    source: row.source,
    inputVersion: row.inputVersion,
    manuallyEdited: row.manuallyEdited,
    pendingSuggestion: row.pendingSuggestion as StyleSuggestion | null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rule(row: RuleRow): StyleRule {
  return {
    id: row.id,
    type: row.type,
    value: row.value,
    enabled: row.enabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function nextTimestamp(previous: Date) {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

export class DrizzleStyleRepository implements StyleRepository {
  private readonly db: PgliteAppDatabase;

  constructor(database: AppDatabase) {
    this.db = database as PgliteAppDatabase;
  }

  private async write<T>(userId: string, action: (transaction: Transaction) => Promise<T>) {
    try {
      return await this.db.transaction(async (transaction) => {
        const [user] = await transaction.select({ id: users.id }).from(users)
          .where(eq(users.id, userId)).for("update");
        if (!user) throw new StyleError("NOT_FOUND");
        return action(transaction);
      });
    } catch (error) {
      if (error instanceof StyleError) throw error;
      throw new Error("Style persistence failed");
    }
  }

  async readInspirations(userId: string): Promise<StyleInspiration[]> {
    try {
      const rows = await this.db.select({
        id: inspirations.id,
        version: inspirations.version,
        styleTags: inspirations.styleTags,
        colorNames: inspirations.colorNames,
        silhouettes: inspirations.silhouettes,
        keyItems: inspirations.keyItems,
        combinations: inspirations.combinations,
        formality: inspirations.formality,
        confirmedFields: inspirations.confirmedFields,
        updatedAt: inspirations.updatedAt,
      }).from(inspirations).innerJoin(uploads, and(
        eq(uploads.id, inspirations.uploadId),
        eq(uploads.userId, inspirations.userId),
      )).where(and(
        eq(inspirations.userId, userId),
        isNull(inspirations.deletedAt),
        eq(uploads.kind, "inspiration"),
        eq(uploads.status, "completed"),
      ));
      return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
    } catch {
      throw new Error("Style inspiration lookup failed");
    }
  }

  async readProfile(userId: string) {
    try {
      const [row] = await this.db.select().from(styleProfiles)
        .where(eq(styleProfiles.userId, userId));
      return row ? profile(row) : null;
    } catch {
      throw new Error("Style profile lookup failed");
    }
  }

  async listRules(userId: string) {
    try {
      const rows = await this.db.select().from(styleRules)
        .where(eq(styleRules.userId, userId))
        .orderBy(asc(styleRules.createdAt), asc(styleRules.id));
      return rows.map(rule);
    } catch {
      throw new Error("Style rule lookup failed");
    }
  }

  saveSuggestion(userId: string, suggestion: StyleSuggestion) {
    return this.write(userId, async (transaction) => {
      const [existing] = await transaction.select().from(styleProfiles)
        .where(eq(styleProfiles.userId, userId)).for("update");
      const updatedAt = existing ? nextTimestamp(existing.updatedAt) : new Date();
      if (existing?.manuallyEdited) {
        const [updated] = await transaction.update(styleProfiles)
          .set({ pendingSuggestion: suggestion, updatedAt })
          .where(eq(styleProfiles.userId, userId)).returning();
        return profile(updated!);
      }
      const values = {
        userId,
        ...suggestion,
        manuallyEdited: false,
        pendingSuggestion: null,
        updatedAt,
      };
      const [updated] = await transaction.insert(styleProfiles).values(values)
        .onConflictDoUpdate({
          target: styleProfiles.userId,
          set: { ...suggestion, manuallyEdited: false, pendingSuggestion: null, updatedAt },
        }).returning();
      return profile(updated!);
    });
  }

  updateProfile(
    userId: string,
    expectedUpdatedAt: string,
    draft: StyleProfileDraft,
  ) {
    return this.write(userId, async (transaction) => {
      const [existing] = await transaction.select().from(styleProfiles)
        .where(eq(styleProfiles.userId, userId)).for("update");
      if (!existing) throw new StyleError("NOT_FOUND");
      if (existing.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new StyleError("VERSION_CONFLICT");
      }
      const [updated] = await transaction.update(styleProfiles).set({
        ...draft,
        manuallyEdited: true,
        pendingSuggestion: null,
        updatedAt: nextTimestamp(existing.updatedAt),
      }).where(eq(styleProfiles.userId, userId)).returning();
      return profile(updated!);
    });
  }

  acceptSuggestion(userId: string, expectedUpdatedAt: string) {
    return this.write(userId, async (transaction) => {
      const [existing] = await transaction.select().from(styleProfiles)
        .where(eq(styleProfiles.userId, userId)).for("update");
      if (!existing) throw new StyleError("NOT_FOUND");
      if (existing.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new StyleError("VERSION_CONFLICT");
      }
      const suggestion = existing.pendingSuggestion as StyleSuggestion | null;
      if (!suggestion) throw new StyleError("INVALID_INPUT");
      const [updated] = await transaction.update(styleProfiles).set({
        ...suggestion,
        manuallyEdited: true,
        pendingSuggestion: null,
        updatedAt: nextTimestamp(existing.updatedAt),
      }).where(eq(styleProfiles.userId, userId)).returning();
      return profile(updated!);
    });
  }

  createRule(userId: string, input: StyleRuleInput) {
    return this.write(userId, async (transaction) => {
      const [created] = await transaction.insert(styleRules)
        .values({ userId, ...input }).returning();
      return rule(created!);
    });
  }

  updateRule(
    userId: string,
    id: string,
    expectedUpdatedAt: string,
    input: Partial<StyleRuleInput>,
  ) {
    return this.write(userId, async (transaction) => {
      const [existing] = await transaction.select().from(styleRules)
        .where(and(eq(styleRules.userId, userId), eq(styleRules.id, id))).for("update");
      if (!existing) throw new StyleError("NOT_FOUND");
      if (existing.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new StyleError("VERSION_CONFLICT");
      }
      const [updated] = await transaction.update(styleRules)
        .set({ ...input, updatedAt: nextTimestamp(existing.updatedAt) })
        .where(and(eq(styleRules.userId, userId), eq(styleRules.id, id))).returning();
      return rule(updated!);
    });
  }

  deleteRule(userId: string, id: string, expectedUpdatedAt: string) {
    return this.write(userId, async (transaction) => {
      const [existing] = await transaction.select().from(styleRules)
        .where(and(eq(styleRules.userId, userId), eq(styleRules.id, id))).for("update");
      if (!existing) throw new StyleError("NOT_FOUND");
      if (existing.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new StyleError("VERSION_CONFLICT");
      }
      await transaction.delete(styleRules)
        .where(and(eq(styleRules.userId, userId), eq(styleRules.id, id)));
    });
  }
}
