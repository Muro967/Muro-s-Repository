// @vitest-environment node
import { mkdtemp, mkdir, rm, symlink, writeFile, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetE2eDirectory } from "../../../scripts/e2e-directory";

test("resets only the exact canonical e2e directory and keeps neighboring data", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "wardrobe-reset-")));
  try {
    await mkdir(join(root, ".data/e2e"), { recursive: true });
    await writeFile(join(root, ".data/owner.txt"), "owner-data");
    await writeFile(join(root, ".data/e2e/stale.txt"), "test-data");
    await expect(resetE2eDirectory(root, join(root, ".data"))).rejects.toThrow(/exact/);
    await expect(resetE2eDirectory(root, join(root, ".data/pglite"))).rejects.toThrow(/exact/);
    await resetE2eDirectory(root, join(root, ".data/e2e"));
    expect(await readFile(join(root, ".data/owner.txt"), "utf8")).toBe("owner-data");
    await expect(readFile(join(root, ".data/e2e/stale.txt"))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test.each([".data", ".data/e2e"])("refuses a symbolic link at %s without touching its target", async (relative) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "wardrobe-reset-link-")));
  const outside = await mkdtemp(join(tmpdir(), "wardrobe-reset-owner-"));
  try {
    await writeFile(join(outside, "owner.txt"), "keep");
    if (relative === ".data/e2e") await mkdir(join(root, ".data"));
    await symlink(outside, join(root, relative));
    await expect(resetE2eDirectory(root, join(root, ".data/e2e"))).rejects.toThrow(/symbolic/);
    expect(await readFile(join(outside, "owner.txt"), "utf8")).toBe("keep");
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
