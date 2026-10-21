import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const tracedStorageModules = new Set([
  "src/features/storage/local-storage-provider.ts",
  "src/features/storage/private-image-routes.ts",
  "src/features/storage/s3-storage-provider.ts",
  "src/features/storage/storage-provider.ts",
  "src/features/storage/storage-repository.ts",
  "src/features/storage/storage-service.ts",
  "src/features/storage/upload-routes.ts",
]);

for (const route of ["uploads", "uploads/[uploadId]/content", "uploads/[uploadId]/complete", "items/[itemId]/original", "items/[itemId]/assets/[assetId]/content"]) {
  test(`${route} deployment trace excludes project source, tests, reference assets and private data`, () => {
    const manifest = resolve(projectRoot, `.next/server/app/api/${route}/route.js.nft.json`);
    const { files } = JSON.parse(readFileSync(manifest, "utf8"));
    const projectAssets = files
      .map((file) => relative(projectRoot, resolve(dirname(manifest), file)))
      .filter((file) => /^(docs|tests|output|test-results|\.data|\.superpowers|\.playwright-cli)\//.test(file)
        || (file.startsWith("src/") && !tracedStorageModules.has(file))
        || /^(\.env(?:\.|$)|\.gitignore$|next\.config\.|tsconfig\.json$|package\.json$|pnpm-lock\.yaml$)/.test(file));

    assert.equal(projectAssets.length, 0, `Unexpected deployment assets: ${projectAssets.slice(0, 5).join(", ")}`);
  });
}
