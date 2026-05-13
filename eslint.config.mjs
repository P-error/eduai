import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Переопределяем default ignores из eslint-config-next.
  globalIgnores([
    // Default ignores из eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Локальные архивы, audit-снапшоты и результаты прогонов не являются рабочим исходным кодом.
    "artifacts/**",
    "eduai-clean/**",
    "audit_review_package/**",
    "review_pack/**",
    "outputs/**",
    "repo_structure_snapshot/**",
    "test-results/**",
    "**/.venv/**",
  ]),
]);

export default eslintConfig;
