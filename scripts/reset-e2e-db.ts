import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateDatabase } from "../src/server/db/migrate";
import { schema } from "../src/server/db/schema";
import { createInvite } from "../tests/e2e/helpers/create-invite";
import { resetE2eDirectory } from "./e2e-directory";
import { seedIdleInventory } from "../tests/e2e/helpers/inventory-seed";

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const target = join(root, ".data", "e2e");
if (process.env.E2E_RUN !== "1" || process.argv.length !== 2 || process.env.DATABASE_URL?.trim() ||
    resolve(root, process.env.PGLITE_DATA_DIR ?? "") !== join(target, "database") ||
    resolve(root, process.env.LOCAL_STORAGE_DIR ?? "") !== join(target, "uploads") ||
    process.env.INVITE_PEPPER !== "isolated-e2e-pepper-never-use-for-real-accounts") {
  throw new Error("Refusing reset outside the isolated Playwright environment");
}
// Validate all seeds before deleting anything. No .env files are loaded here.
const names = ["auth", "mobile-320", "mobile-390", "mobile-480", "inventory", "intruder", "inspiration"];
const { inviteCodeFor } = await import("../tests/e2e/helpers/create-invite");
for (const name of names) inviteCodeFor(name);
await resetE2eDirectory(root, target);
const client = new PGlite(join(target, "database"));
try {
  const database = drizzle({ client, schema });
  await migrateDatabase(database);
  for (const name of names) await createInvite(database, name);
  await seedIdleInventory(database, join(target, "uploads"));
} finally { await client.close(); }
