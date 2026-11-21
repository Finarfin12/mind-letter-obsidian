import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(import.meta.dirname, "tests/obsidian-mock.ts"),
			"@mind-letter/core": resolve(import.meta.dirname, "packages/core/src/index.ts"),
			"@mind-letter/ai": resolve(import.meta.dirname, "packages/ai/src/index.ts"),
		},
	},
	test: {
		setupFiles: ["tests/setup-window.ts"],
		include: ["tests/**/*.test.ts", "packages/core/tests/**/*.test.ts"],
		// Tests that run real processes (kill, flood) can be slow on a busy machine.
		testTimeout: 30000,
		hookTimeout: 30000,
		exclude: ["node_modules/**"],
	},
});
