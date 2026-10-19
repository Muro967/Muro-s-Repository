import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { userSettings, users, wardrobes } from "@/server/db/schema";
import type { AppDatabase, PgliteAppDatabase } from "@/server/db/types";
import type { SessionUser } from "@/features/auth/auth-types";
import { onboardingSchema, type OnboardingInput } from "./onboarding-types";

export async function completeOnboarding(database: AppDatabase, userId: string, input: OnboardingInput, now: Date): Promise<SessionUser> {
  const values = onboardingSchema.parse(input);
  const db = database as PgliteAppDatabase;
  try {
    return await db.transaction(async (tx) => {
      // The guarded update locks this user's row and makes retries harmless.
      const [user] = await tx.update(users).set({ name: values.name, onboardingComplete: true, updatedAt: now })
        .where(and(eq(users.id, userId), eq(users.onboardingComplete, false)))
        .returning({ id: users.id, email: users.email, name: users.name, onboardingComplete: users.onboardingComplete });
      if (!user) {
        const [existing] = await tx.select({ id: users.id, email: users.email, name: users.name, onboardingComplete: users.onboardingComplete }).from(users).where(eq(users.id, userId));
        if (!existing) throw new Error("User unavailable");
        return existing;
      }
      const settings = await tx.update(userSettings).set({ city: values.city, hairLength: values.hairLength, hairTexture: values.hairTexture }).where(eq(userSettings.userId, userId)).returning({ id: userSettings.userId });
      const [wardrobe] = await tx.select({ id: wardrobes.id }).from(wardrobes).where(eq(wardrobes.userId, userId)).orderBy(asc(wardrobes.sortOrder), asc(wardrobes.id)).limit(1);
      if (settings.length !== 1 || !wardrobe) throw new Error("Profile unavailable");
      await tx.update(wardrobes).set({ name: values.wardrobeName }).where(and(eq(wardrobes.id, wardrobe.id), eq(wardrobes.userId, userId)));
      return user;
    });
  } catch {
    throw new Error("Onboarding persistence failed");
  }
}

export async function readProfileSettings(database: AppDatabase, userId: string) {
  try {
    const [settings] = await (database as PgliteAppDatabase).select({ city: userSettings.city, hairLength: userSettings.hairLength, hairTexture: userSettings.hairTexture }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (!settings) throw new Error("Profile unavailable");
    return settings;
  } catch {
    throw new Error("Profile lookup failed");
  }
}
