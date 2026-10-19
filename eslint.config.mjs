import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import noServerRuntimeImport from "./eslint-rules/no-server-runtime-import.mjs";

const architecturePlugin = {
  rules: {
    "no-server-runtime-import": noServerRuntimeImport,
  },
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      architecture: architecturePlugin,
    },
    rules: {
      "architecture/no-server-runtime-import": "error",
    },
  },
  globalIgnores([".next/**", ".next-e2e/**", "output/playwright/**", "test-results/**", "playwright-report/**", "out/**", "build/**", "next-env.d.ts"]),
]);
