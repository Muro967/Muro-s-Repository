// @vitest-environment node

import { ESLint } from "eslint";

const boundaryRule = "architecture/no-server-runtime-import";

async function lintClientImport(filePath: string, importPath: string) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    `
      "use client";
      import { getDb } from "${importPath}";
      export function Fixture() {
        void getDb;
        return null;
      }
    `,
    { filePath },
  );

  return result?.messages ?? [];
}

test.each([
  ["src/components/runtime-alias.fixture.tsx", "@/server/runtime/db"],
  ["src/app/runtime-relative.fixture.tsx", "../server/runtime/db"],
  [
    "src/components/nested/runtime-relative.fixture.tsx",
    "../../server/runtime/env",
  ],
])("rejects direct server-runtime imports from client modules", async (filePath, importPath) => {
  const messages = await lintClientImport(filePath, importPath);

  expect(messages.map(({ ruleId }) => ruleId)).toContain(boundaryRule);
});

test("rejects a runtime import hidden in a transitive client helper", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    `
      import { getDb } from "@/server/runtime/db";
      export const loadWardrobe = getDb;
    `,
    { filePath: "src/components/client-runtime-helper.fixture.ts" },
  );

  expect(result?.messages.map(({ ruleId }) => ruleId)).toContain(boundaryRule);
});

test("allows the same runtime import from a trusted Node script", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    `
      import { getDb } from "@/server/runtime/db";
      void getDb;
    `,
    { filePath: "scripts/runtime.fixture.ts" },
  );

  expect(result?.messages.map(({ ruleId }) => ruleId)).not.toContain(
    boundaryRule,
  );
});
