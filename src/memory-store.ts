import {
	emptyMemory,
	mergeFeedback,
	parseClaims,
	parseFeedback,
	parseFeedbackFromLetter,
	parseThemes,
	serialize,
	type MemoryState,
} from "@mind-letter/core";

/** File access inside the vault (an adapter in Obsidian, a Map in tests). Paths are vault-relative with forward slashes. */
export interface FilePort {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string | null>;
	write(path: string, text: string): Promise<void>;
	ensureFolder(path: string): Promise<void>;
	/** File names (not paths) directly inside a folder. */
	listFiles(folder: string): Promise<string[]>;
}

export interface MemoryMeta {
	/** The 8-week warm-up has been done. */
	warmedUp: boolean;
	/** Last week label a letter was written for (used by the weekly timer). */
	lastWeek: string;
}

export const memoryFolder = (letterFolder: string): string => `${letterFolder}/.memory`;
const file = (letterFolder: string, name: string): string => `${memoryFolder(letterFolder)}/${name}.json`;

const LETTER_FILE = /^\d{4}-W\d{2}(?: \(\d+\))?\.md$/;

export async function loadMemory(port: FilePort, letterFolder: string): Promise<{ memory: MemoryState; meta: MemoryMeta }> {
	const [claims, themes, feedback, meta] = await Promise.all(
		["claims", "themes", "feedback", "meta"].map(n => port.read(file(letterFolder, n))),
	);
	let parsedMeta: MemoryMeta = { warmedUp: false, lastWeek: "" };
	if (meta) {
		try {
			const m = JSON.parse(meta) as Partial<MemoryMeta>;
			parsedMeta = { warmedUp: m.warmedUp === true, lastWeek: typeof m.lastWeek === "string" ? m.lastWeek : "" };
		} catch {
			/* a damaged meta file only means "not warmed up yet" */
		}
	}
	return {
		memory: { ...emptyMemory(), claims: claims ? parseClaims(claims) : [], themes: themes ? parseThemes(themes) : [], feedback: feedback ? parseFeedback(feedback) : [] },
		meta: parsedMeta,
	};
}

export async function saveMemory(port: FilePort, letterFolder: string, memory: MemoryState, meta: MemoryMeta): Promise<void> {
	await port.ensureFolder(letterFolder);
	await port.ensureFolder(memoryFolder(letterFolder));
	await port.write(file(letterFolder, "claims"), serialize(memory.claims));
	await port.write(file(letterFolder, "themes"), serialize(memory.themes));
	await port.write(file(letterFolder, "feedback"), serialize(memory.feedback));
	await port.write(file(letterFolder, "meta"), serialize(meta));
}

/** Read the checkboxes the user ticked in earlier letters and fold them into the feedback memory. */
export async function collectFeedback(port: FilePort, letterFolder: string, memory: MemoryState): Promise<MemoryState> {
	const names = (await port.listFiles(letterFolder)).filter(n => LETTER_FILE.test(n)).sort();
	let feedback = memory.feedback;
	for (const name of names) {
		const text = await port.read(`${letterFolder}/${name}`);
		if (!text) continue;
		const items = parseFeedbackFromLetter(text);
		if (items.length > 0) feedback = mergeFeedback(feedback, items);
	}
	return { ...memory, feedback };
}

/** `2026-W47.md`, or `2026-W47 (2).md` when that already exists (an existing letter is never overwritten). */
export async function freeLetterPath(port: FilePort, letterFolder: string, week: string): Promise<string> {
	let path = `${letterFolder}/${week}.md`;
	for (let n = 2; await port.exists(path); n++) path = `${letterFolder}/${week} (${n}).md`;
	return path;
}
