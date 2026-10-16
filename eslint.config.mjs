import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import noServerRuntimeInClient from "./eslint-rules/no-server-runtime-in-client.mjs";

const architecturePlugin = {
  rules: {
    "no-server-runtime-in-client": noServerRuntimeInClient,
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
      "architecture/no-server-runtime-in-client": "error",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
