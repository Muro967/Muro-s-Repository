// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashInviteCode } from "@/features/auth/crypto";
import { migrateDatabase } from "@/server/db/migrate";
import { schema } from "@/server/db/schema";
import { drizzle } from "drizzle-orm/pglite";

const projectRoot = process.cwd();

function runDocumentedCommand(directory: string, arguments_: string[]) {
  const pnpmCli = process.env.PNPM_CLI;
  return spawnSync(
    pnpmCli ? process.execPath : "pnpm",
    [...(pnpmCli ? [pnpmCli] : []), "invite:create", ...arguments_],
    {
      cwd: directory,
      encoding: "utf8",
      env: isolatedEnvironment(),
      timeout: 15_000,
    },
  );
}

function isolatedEnvironment() {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
  };
  delete environment.DATABASE_URL;
  delete environment.PGLITE_DATA_DIR;
  delete environment.INVITE_PEPPER;
  environment.pnpm_config_verify_deps_before_run = "warn";
  return environment;
}

async function writeIsolatedPackage(directory: string) {
  await mkdir(join(directory, "node_modules", ".bin"), { recursive: true });
  await symlink(
    join(projectRoot, "node_modules", ".bin", "tsx"),
    join(directory, "node_modules", ".bin", "tsx"),
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "isolated-invite-cli-test",
      private: true,
      scripts: {
        "invite:create": `tsx ${join(projectRoot, "scripts/create-invite.ts")}`,
      },
    }),
  );
}

async function createIsolatedProject() {
  const directory = await mkdtemp(join(tmpdir(), "ai-wardrobe-invite-cli-"));
  const databaseDirectory = join(directory, "database");
  const client = new PGlite(databaseDirectory);
  await migrateDatabase(drizzle({ client, schema }));
  await client.close();

  await writeIsolatedPackage(directory);

  return { directory, databaseDirectory };
}

test("pnpm invite:create loads .env.local and persists the HMAC in configured PGlite", async () => {
  const { directory, databaseDirectory } = await createIsolatedProject();
  const pepper = "cli-pepper-value-with-at-least-32-characters";
  await writeFile(
    join(directory, ".env.local"),
    `PGLITE_DATA_DIR=${databaseDirectory}\nINVITE_PEPPER=${pepper}\n`,
  );

  try {
    const result = runDocumentedCommand(directory, ["--uses", "2", "--days", "5"]);

    expect(
      result.status,
      `${result.stderr}\n${result.stdout}\n${result.error ?? ""}`,
    ).toBe(0);
    const rawInvite = result.stdout.match(/^Invite code: ([A-Za-z0-9_-]+)$/m)?.[1];
    expect(rawInvite).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(result.stdout.match(new RegExp(rawInvite!, "g"))).toHaveLength(1);

    const verificationClient = new PGlite(databaseDirectory);
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

test("pnpm invite:create refuses to print a code without durable database configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-wardrobe-invite-no-db-"));
  const pepper = "cli-pepper-value-with-at-least-32-characters";
  await writeIsolatedPackage(directory);
  await writeFile(join(directory, ".env.local"), `INVITE_PEPPER=${pepper}\n`);

  try {
    const result = runDocumentedCommand(directory, ["--uses", "1", "--days", "30"]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toMatch(/^Invite code: /m);
    expect(result.stderr).toMatch(/durable database/i);
    expect(`${result.stdout}${result.stderr}`).not.toContain(pepper);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
