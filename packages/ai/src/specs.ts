import type { CliTool } from "./types";

/**
 * CLI specifications. Rule: a CLI may run a letter only if there is a VERIFIED way to (a) run non-interactively,
 * (b) switch off ALL tools / execution and (c) never ask for permission. Otherwise it is "detect only": its models are
 * listed in the settings, but it never receives any note text.
 */
export interface CliSpec {
	tool: CliTool;
	/** When set, the CLI is detect-only and this explains why. */
	detectOnly?: string;
	/** Program name on PATH (no extension). */
	exe: string;
	/** Complete arguments. The system prompt goes through an argument; note text NEVER does (stdin only). */
	buildArgs(opts: { system: string; model: string }): string[];
	/** Extract the model text from the CLI's stdout. Throws when the CLI reports an error. */
	parseOutput(stdout: string): string;
	/** Flags that MUST be present; each entry is the argument sequence that has to appear (checked again before spawn). */
	requiredGuards: string[][];
	/** Arguments that must never appear. */
	forbiddenArgs: string[];
}

/** Model names are restricted so they cannot smuggle a flag into the command line. */
export function isSafeModelName(model: string): boolean {
	return model === "" || /^[A-Za-z0-9][A-Za-z0-9._:\-/]{0,63}$/.test(model);
}

/**
 * Claude Code 2.1.316: flags verified with `claude --help` and real runs (same set as Seedbed 0.9.0):
 *  -p                        non-interactive (print)
 *  --tools ""                "Use \"\" to disable all tools"
 *  --permission-mode dontAsk + --permission-prompts none   anything that would ask for permission is refused
 *  --no-session-persistence  nothing is saved to disk
 *  --safe-mode               no hooks, plugins, MCP, CLAUDE.md, skills; login still works
 *  --strict-mcp-config       no MCP servers
 *  --disable-slash-commands
 *  --output-format json
 * NOT --bare: its help says bare refuses OAuth/keychain logins (a subscription would not work).
 */
const claude: CliSpec = {
	tool: "claude",
	exe: "claude",
	buildArgs: ({ system, model }) => {
		const args = [
			"-p",
			"--tools",
			"",
			"--permission-mode",
			"dontAsk",
			"--permission-prompts",
			"none",
			"--no-session-persistence",
			"--safe-mode",
			"--strict-mcp-config",
			"--disable-slash-commands",
			"--output-format",
			"json",
			"--system-prompt",
			system,
		];
		if (model) args.push("--model", model);
		return args;
	},
	parseOutput: (stdout) => {
		let obj: unknown;
		try {
			obj = JSON.parse(stdout.trim());
		} catch {
			throw new Error("claude: output is not JSON");
		}
		if (!obj || typeof obj !== "object") throw new Error("claude: unexpected output");
		const o = obj as Record<string, unknown>;
		if (o.is_error === true) throw new Error("claude reported an error");
		if (typeof o.result !== "string") throw new Error("claude: no result field");
		return o.result;
	},
	requiredGuards: [
		["-p"],
		["--tools", ""],
		["--permission-mode", "dontAsk"],
		["--permission-prompts", "none"],
		["--no-session-persistence"],
		["--safe-mode"],
		["--strict-mcp-config"],
	],
	forbiddenArgs: ["--bare", "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--allowedTools", "--allowed-tools", "--add-dir", "--continue", "--resume"],
};

const unsupported = (why: string) => (): never => {
	throw new Error(why);
};

/**
 * Codex CLI 0.167.2 (checked 2026-11-21): `exec`, `--sandbox read-only`, `--ephemeral` exist, but NO flag switches all
 * tools off: only per-feature `--disable`, a long list that changes between versions. A deny-list is not a guarantee.
 */
const CODEX_WHY = "Detect only: `codex exec --help` has no flag that disables ALL tools (only per-feature `--disable`, a list that changes between versions).";
const codex: CliSpec = {
	tool: "codex",
	detectOnly: CODEX_WHY,
	exe: "codex",
	buildArgs: unsupported(CODEX_WHY),
	parseOutput: unsupported(CODEX_WHY),
	requiredGuards: [],
	forbiddenArgs: ["--dangerously-bypass-approvals-and-sandbox", "--dangerously-bypass-hook-trust", "--full-auto", "--search", "--add-dir", "resume"],
};

/** Gemini CLI is not installed on the developer PC, so a tools-off flag cannot be verified. */
const GEMINI_WHY = "Detect only: Gemini CLI could not be checked for a verified way to disable all tools.";
const gemini: CliSpec = {
	tool: "gemini",
	detectOnly: GEMINI_WHY,
	exe: "gemini",
	buildArgs: unsupported(GEMINI_WHY),
	parseOutput: unsupported(GEMINI_WHY),
	requiredGuards: [],
	forbiddenArgs: ["--yolo", "-y", "--approval-mode=yolo", "--all-files"],
};

/**
 * Antigravity CLI (agy 1.5.14, checked 2026-11-21 with real runs): with `-p --output-format json --disable-slash-commands
 * --sandbox` the agent still wrote a file and ran a shell command; with `--settings {"toolPermission":"request-review",
 * "allowNonWorkspaceAccess":false}` it still wrote a file and read a file OUTSIDE its workspace. `--mode plan` has no effect
 * while slash commands are disabled. The required/forbidden lists below are the minimum for the day a tools-off setting is verified.
 */
const AGY_WHY = "Detect only: in real tests `agy` still wrote files and read files outside its workspace even with --sandbox and a restrictive --settings.";
const agy: CliSpec = {
	tool: "agy",
	detectOnly: AGY_WHY,
	exe: "agy",
	buildArgs: unsupported(AGY_WHY),
	parseOutput: unsupported(AGY_WHY),
	requiredGuards: [["-p"], ["--output-format", "json"], ["--disable-slash-commands"], ["--sandbox"]],
	forbiddenArgs: [
		"--dangerously-skip-permissions", "--continue", "-c", "--conversation", "--remote-control", "--remote-agent",
		"--prompt-interactive", "-i", "--add-dir", "--agent", "--project", "--new-project",
	],
};

export const CLI_SPECS: Record<CliTool, CliSpec> = { claude, codex, gemini, agy };

/** Every required flag present AND no forbidden argument (defense in depth; failure = do not spawn). */
export function assertGuards(spec: CliSpec, args: string[]): void {
	for (const bad of spec.forbiddenArgs) {
		if (args.includes(bad)) throw new Error(`forbidden argument: ${bad}`);
	}
	for (const guard of spec.requiredGuards) {
		const i = args.indexOf(guard[0] as string);
		const ok = i !== -1 && guard.every((g, k) => args[i + k] === g);
		if (!ok) throw new Error(`safety flag missing: ${guard.join(" ")}`);
	}
}
