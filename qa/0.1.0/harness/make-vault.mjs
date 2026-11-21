// Builds the SYNTHETIC QA vault (all text invented, see tests/fixtures.ts) with the notes' modification times set.
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { dirname, join } from "node:path";
import { syntheticVault } from "../../../tests/fixtures.ts";

export function makeVault(root) {
	for (const n of syntheticVault()) {
		if (n.path === "Kosong.md") {
			mkdirSync(dirname(join(root, n.path)), { recursive: true });
			writeFileSync(join(root, n.path), "");
			continue;
		}
		const fm = { ...(n.frontmatter ?? {}) };
		if (n.tags.length) fm.tags = n.tags;
		let head = "";
		const keys = Object.keys(fm);
		if (keys.length) head = "---\n" + keys.map((k) => (Array.isArray(fm[k]) ? `${k}: [${fm[k].join(", ")}]` : `${k}: ${fm[k]}`)).join("\n") + "\n---\n";
		const links = n.links.map((l) => `[[${l}]]`).join(" ");
		const file = join(root, n.path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, head + n.body + (links ? "\n\n" + links : "") + "\n");
		utimesSync(file, new Date(n.modified), new Date(n.modified));
	}
}
