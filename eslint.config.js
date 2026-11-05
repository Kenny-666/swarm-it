import globals from "globals";
import js from "@eslint/js";

export default [
  { ignores: ["tests/out/**", "node_modules/**", "dist/**"] },
  js.configs.recommended,
  {
    files: ["extension/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser, chrome: "readonly" } },
    rules: { "no-empty": ["error", { allowEmptyCatch: true }], "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }] },
  },
  {
    files: ["tests/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node, ...globals.browser, chrome: "readonly" } },
  },
];
