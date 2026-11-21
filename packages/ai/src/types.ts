/** Types of the provider layer. No Obsidian imports: the plugin and the local newsletter app both use this package. */

export type CliTool = "claude" | "codex" | "gemini" | "agy";
export type LocalKind = "ollama" | "lmstudio";
export type ApiKind = "openai" | "anthropic" | "gemini";
export type ProviderMode = "off" | "cli" | "local" | "api";

export interface AiSettings {
	provider: ProviderMode;
	cli: CliTool;
	local: LocalKind;
	localUrl: string;
	api: ApiKind;
	apiUrl: string;
	apiKey: string;
	/** Model id (never a list: models always come from the provider itself). */
	model: string;
	/** The provider "slot" the user approved; any other slot needs a new approval. */
	approvedSlot: string;
	timeoutSec: number;
	maxContextChars: number;
}

export const DEFAULT_AI: AiSettings = {
	provider: "off",
	cli: "claude",
	local: "ollama",
	localUrl: "",
	api: "openai",
	apiUrl: "",
	apiKey: "",
	model: "",
	approvedSlot: "",
	timeoutSec: 90,
	maxContextChars: 6000,
};

export interface HttpResponse {
	status: number;
	text: string;
}

export interface HttpClient {
	get(url: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse>;
	post(url: string, body: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse>;
}

export interface RunOptions {
	stdin: string;
	cwd: string;
	env?: Record<string, string | undefined>;
	signal: AbortSignal;
	maxOutputBytes?: number;
}

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

export interface ProcessRunner {
	run(file: string, args: string[], opts: RunOptions): Promise<RunResult>;
}

/**
 * Read-only file access for model detection (CLI config files in the user's home folder). It never writes and is only
 * ever pointed at model-config files, never at login/token files.
 */
export interface DiscoveryIo {
	homeDir(): string;
	env(name: string): string | undefined;
	/** UTF-8 text of a file (max 1 MB), or null when it is missing/unreadable. */
	readText(file: string): Promise<string | null>;
	/** Cache key of a file (path + size + mtime), or null when it does not exist. */
	fileKey(file: string): Promise<string | null>;
	/** Scan a big file (an executable) in chunks for matches of `pattern` without loading it whole. null = cannot open. */
	scanFile(file: string, pattern: RegExp): Promise<string[] | null>;
}

export interface AiPrompt {
	system: string;
	user: string;
}

export interface AiProvider {
	/** Where the data goes, for the consent text: e.g. "Claude Code (claude)", "Ollama", "api.openai.com". */
	readonly label: string;
	/** true = the text leaves this computer. */
	readonly cloud: boolean;
	complete(prompt: AiPrompt, opts: { signal: AbortSignal }): Promise<string>;
}

export interface ProviderDeps {
	runner: ProcessRunner;
	findExe: (name: string) => Promise<string | null>;
	makeSandbox: () => Promise<{ dir: string; cleanup: () => Promise<void> }>;
	http: HttpClient | null;
	/** false on mobile (no Node): CLI providers are unavailable. */
	canSpawn: boolean;
	io: DiscoveryIo | null;
}

/** The identity of the selected provider; changing it revokes an earlier approval. */
export function providerSlot(ai: AiSettings): string {
	if (ai.provider === "cli") return `cli:${ai.cli}`;
	if (ai.provider === "local") return `local:${ai.local}:${ai.localUrl.trim()}`;
	if (ai.provider === "api") return `api:${ai.api}:${ai.apiUrl.trim()}`;
	return "off";
}
