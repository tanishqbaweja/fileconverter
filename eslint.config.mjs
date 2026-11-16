import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "dist/**",
    "out/**",
    "output/**",
    "outputs/**",
    "work/**",
    "build/**",
    "public/engines/**",
    // Exact byte-authenticated generated Emscripten fixture, not authored code.
    "fixtures/qualification-tools/within-test-mkv-header-core.mjs",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
