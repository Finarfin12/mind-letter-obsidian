import type { DiscoveryIo, ProcessRunner, RunOptions, RunResult } from "./types";

/**
 * Node implementations of the process runner and the read-only file access. Node modules are loaded lazily through the
 * `nodeRequire` function the host passes in: the Obsidian plugin passes its own `require` (desktop only), the local
 * newsletter app passes `createRequire(...)`. On mobile nothing here is ever called.
 *
 * The Node types are declared here on purpose: the Obsidian review bot type-checks `src/` WITHOUT @types/node, so
 * `typeof import("fs")` would become an error type and trigger no-unsafe-* findings.
 */
interface Readable {
	setEncoding(enc: "utf8"): void;
	on(event: "data", cb: (chunk: string) => void): void;
}
interface Writable {
	on(event: "error", cb: () => void): void;
	end(data: string, enc: "utf8"): void;
}
interface ChildLike {
	pid?: number;
	stdout: Readable;
	stderr: Readable;
	stdin: Writable;
	kill(signal: string): void;
	on(event: "error", cb: (e: Error) => void): void;
	on(event: "close", cb: (code: number | null) => void): void;
}
interface ChildProcessModule {
	spawn(
		file: string,
		args: string[],
		opts: { cwd?: string; env?: Record<string, string | undefined>; shell: false; windowsHide: boolean; stdio: string | string[] },
	): ChildLike;
}
interface Stats {
	isFile(): boolean;
	size: number;
	mtimeMs: number;
}
interface FileHandle {
	read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
	close(): Promise<void>;
}
interface FsModule {
	statSync(p: string): Stats;
	mkdtempSync(prefix: string): string;
	rmSync(p: string, opts: { recursive: boolean; force: boolean }): void;
	existsSync(p: string): boolean;
	promises: {
		stat(p: string): Promise<Stats>;
		readFile(p: string, opts: { encoding: "utf8" }): Promise<string>;
		open(p: string, flags: "r"): Promise<FileHandle>;
	};
}
interface PathModule {
	join(...parts: string[]): string;
}
interface OsModule {
	tmpdir(): string;
	homedir(): string;
}
interface ProcessLike {
	env: Record<string, string | undefined>;
	platform: string;
}

export type NodeRequire = (id: string) => unknown;

const DEFAULT_MAX_OUTPUT = 256 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const SCAN_CHUNK = 4 * 1024 * 1024;
const SCAN_OVERLAP = 128;
const SCAN_MAX_BYTES = 1024 * 1024 * 1024;
/** 1 byte = 1 character. (For ASCII model names, "latin1" in TextDecoder is identical.) */
const LATIN1 = new TextDecoder("latin1");

export interface NodeEnv {
	runner: ProcessRunner;
	findExe(name: string): Promise<string | null>;
	makeSandbox(): Promise<{ dir: string; cleanup: () => Promise<void> }>;
	io: DiscoveryIo;
}

export function createNodeEnv(nodeRequire: NodeRequire): NodeEnv {
	const proc = (): ProcessLike => nodeRequire("process") as ProcessLike;
	const fs = (): FsModule => nodeRequire("fs") as FsModule;
	const path = (): PathModule => nodeRequire("path") as PathModule;
	const os = (): OsModule => nodeRequire("os") as OsModule;

	/**
	 * Run a program without a shell; note text only via stdin; killed (with its children) on abort; output size capped.
	 */
	const runner: ProcessRunner = {
		run(file: string, args: string[], opts: RunOptions): Promise<RunResult> {
			const cp = nodeRequire("child_process") as ChildProcessModule;
			return new Promise<RunResult>((resolve, reject) => {
				if (opts.signal.aborted) return reject(new Error("aborted"));
				const max = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
				let settled = false;
				let out = "";
				let err = "";
				const child = cp.spawn(file, args, {
					cwd: opts.cwd,
					env: opts.env ?? proc().env,
					shell: false, // REQUIRED: no shell
					windowsHide: true,
					stdio: ["pipe", "pipe", "pipe"],
				});
				const killTree = () => {
					try {
						if (proc().platform === "win32" && child.pid) {
							// taskkill also stops child processes; no shell
							cp.spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
						} else {
							child.kill("SIGKILL");
						}
					} catch {
						/* the process has already ended */
					}
				};
				const finish = (fn: () => void) => {
					if (settled) return;
					settled = true;
					opts.signal.removeEventListener("abort", onAbort);
					fn();
				};
				const onAbort = () => {
					killTree();
					finish(() => reject(new Error("aborted (timeout/cancel): process killed")));
				};
				opts.signal.addEventListener("abort", onAbort, { once: true });

				child.stdout.setEncoding("utf8");
				child.stderr.setEncoding("utf8");
				child.stdout.on("data", (d: string) => {
					out += d;
					if (out.length > max) {
						killTree();
						finish(() => reject(new Error("output too large: process killed")));
					}
				});
				child.stderr.on("data", (d: string) => {
					if (err.length < max) err += d;
				});
				child.on("error", (e: Error) => finish(() => reject(e)));
				child.on("close", (code: number | null) => finish(() => resolve({ code, stdout: out, stderr: err })));
				child.stdin.on("error", () => {
					/* the process may close stdin early */
				});
				child.stdin.end(opts.stdin, "utf8");
			});
		},
	};

	/** Find an executable on PATH without a shell. Windows: only .exe (shims need a shell, so they are not supported). */
	const findExe = (name: string): Promise<string | null> => {
		const isWin = proc().platform === "win32";
		const exts = isWin ? [".exe"] : [""];
		for (const dir of (proc().env.PATH ?? "").split(isWin ? ";" : ":")) {
			if (!dir) continue;
			for (const ext of exts) {
				const full = path().join(dir, name + ext);
				try {
					if (fs().statSync(full).isFile()) return Promise.resolve(full);
				} catch {
					/* keep looking */
				}
			}
		}
		return Promise.resolve(null);
	};

	/** An EMPTY temp folder to use as the CLI's working directory, and the function that removes it. */
	const makeSandbox = (): Promise<{ dir: string; cleanup: () => Promise<void> }> => {
		const dir = fs().mkdtempSync(path().join(os().tmpdir(), "mind-letter-ai-"));
		return Promise.resolve({
			dir,
			// Windows may hold the working directory for a moment after a kill: retry until it is gone.
			cleanup: async () => {
				for (let i = 0; i < 30; i++) {
					try {
						fs().rmSync(dir, { recursive: true, force: true });
					} catch {
						/* locked; try again */
					}
					if (!fs().existsSync(dir)) return;
					await new Promise<void>((r) => window.setTimeout(r, 100));
				}
			},
		});
	};

	const io: DiscoveryIo = {
		homeDir: () => os().homedir(),
		env: (name) => proc().env[name],
		async readText(file) {
			try {
				const st = await fs().promises.stat(file);
				if (!st.isFile() || st.size > MAX_TEXT_BYTES) return null;
				return await fs().promises.readFile(file, { encoding: "utf8" });
			} catch {
				return null;
			}
		},
		async fileKey(file) {
			try {
				const st = await fs().promises.stat(file);
				return st.isFile() ? `${file}|${st.size}|${Math.round(st.mtimeMs)}` : null;
			} catch {
				return null;
			}
		},
		async scanFile(file, pattern) {
			let handle: FileHandle;
			try {
				handle = await fs().promises.open(file, "r");
			} catch {
				return null;
			}
			const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
			const found = new Set<string>();
			try {
				const buf = new Uint8Array(SCAN_CHUNK);
				let pos = 0;
				let tail = "";
				while (pos < SCAN_MAX_BYTES) {
					const { bytesRead } = await handle.read(buf, 0, SCAN_CHUNK, pos);
					if (bytesRead <= 0) break;
					pos += bytesRead;
					const text = tail + LATIN1.decode(buf.subarray(0, bytesRead));
					const re = new RegExp(pattern.source, flags);
					let m: RegExpExecArray | null;
					while ((m = re.exec(text)) !== null) {
						found.add(m[0]);
						if (m[0].length === 0) re.lastIndex++;
					}
					tail = text.slice(-SCAN_OVERLAP);
					// let the UI breathe between chunks
					await new Promise<void>((r) => window.setTimeout(r, 0));
				}
			} catch {
				return found.size > 0 ? Array.from(found) : null;
			} finally {
				await handle.close().catch(() => undefined);
			}
			return Array.from(found);
		},
	};

	return { runner, findExe, makeSandbox, io };
}
