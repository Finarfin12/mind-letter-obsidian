import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";
export default defineConfig([
  globalIgnores(["node_modules", "**/node_modules", "dist", "**/dist", "build", "test-vault", "qa", "docs", "scripts", "tests", "**/tests", "main.js", "esbuild.config.mjs", "version-bump.mjs", "**/*.config.*", "extension/build*", "**/*.test.ts", "packages/core/tests"]),
  ...obsidianmd.configs.recommended,
  { rules: { "preserve-caught-error": "error", "obsidianmd/settings-tab/prefer-setting-definitions": "error" } },
  { files: ["src/**/*.ts", "packages/**/*.ts"], plugins: { "@typescript-eslint": tseslint.plugin }, rules: { "@typescript-eslint/no-misused-promises": "error", "@typescript-eslint/no-floating-promises": "error" } },
  { languageOptions: { parserOptions: { projectService: { allowDefaultProject: ["eslint.config.*"] }, tsconfigRootDir: import.meta.dirname } } },
]);
