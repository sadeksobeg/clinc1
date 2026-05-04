import js from "@eslint/js";
import clinicOs from "./eslint-plugin-clinic-os/index.js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts", "*.config.*", "postcss.config.mjs"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "clinic-os": clinicOs,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Incremental discipline: warnings until codebase is migrated; tighten to "error" in CI later.
      "clinic-os/no-non-cg-spacing": "warn",
      "clinic-os/no-non-ds-typography": "warn",
      "clinic-os/no-raw-palette-colors": "warn",
    },
  },
);
