// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashInviteCode } from "@/features/auth/crypto";
import { migrateDatabase } from "@/server/db/migrate";
import { schema } from "@/server/db/schema";
import { drizzle } from "drizzle-orm/pglite";

test("the Node CLI stores only an invite HMAC and prints the raw code once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-wardrobe-invite-"));
  const pepper = "cli-pepper-value-with-at-least-32-characters";
  const client = new PGlite(directory);

  try {
    await migrateDatabase(drizzle({ client, schema }));
    await client.close();

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/create-invite.ts", "--uses", "2", "--days", "5"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: "",
          PGLITE_DATA_DIR: directory,
          INVITE_PEPPER: pepper,
        },
        timeout: 15_000,
      },
    );

    expect(result.status, result.stderr).toBe(0);
    const rawInvite = result.stdout.match(/^Invite code: ([A-Za-z0-9_-]+)$/m)?.[1];
    expect(rawInvite).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(result.stdout.match(new RegExp(rawInvite!, "g"))).toHaveLength(1);

    const verificationClient = new PGlite(directory);
    await verificationClient.waitReady;
    const stored = await verificationClient.query<{
      code_hash: string;
      max_uses: number;
    }>("select code_hash, max_uses from invite_codes");
    expect(stored.rows).toEqual([
      {
        code_hash: hashInviteCode(rawInvite!, pepper),
        max_uses: 2,
      },
    ]);
    expect(stored.rows[0]?.code_hash).not.toContain(rawInvite!);
    await verificationClient.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
