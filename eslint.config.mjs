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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Frozen, retired code — kept for reference, not maintained or linted.
    "docs/archive/**",
  ]),
  // scripts/ are diagnostic/pipeline glue over dynamic DB rows and untyped JSON;
  // explicit `any` is pragmatic there. Keep src/ strict (no override).
  {
    files: ["scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
]);

export default eslintConfig;
