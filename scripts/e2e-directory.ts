import { lstat, mkdir, realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

// The caller supplies the project root, never a directory taken from an env file.
export async function resetE2eDirectory(projectRoot: string, target: string) {
  const root = await realpath(projectRoot);
  const expected = join(root, ".data", "e2e");
  if (resolve(target) !== expected) throw new Error("Reset requires the exact project .data/e2e directory");
  for (const path of [join(root, ".data"), expected]) {
    const entry = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (entry?.isSymbolicLink()) throw new Error("Reset refuses symbolic links");
    if (entry && !entry.isDirectory()) throw new Error("Reset requires a directory");
    if (entry && await realpath(path) !== path) throw new Error("Reset requires canonical paths");
  }
  await rm(expected, { recursive: true, force: true });
  await mkdir(expected, { recursive: true });
}
