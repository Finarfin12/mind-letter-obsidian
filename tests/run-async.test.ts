import { describe, expect, it, vi } from "vitest";
import { runAsync } from "../src/run-async";

const tick = () => new Promise<void>(r => setTimeout(r, 0));

describe("runAsync", () => {
	it("runs the function and does not call onError on success", async () => {
		const fn = vi.fn(async () => {});
		const onError = vi.fn();
		runAsync(fn, onError);
		await tick();
		expect(fn).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
	});

	it("returns void immediately (nothing for the caller to await)", () => {
		const r = runAsync(async () => {}, () => {});
		expect(r).toBeUndefined();
	});

	it("a rejected promise goes to onError and never throws", async () => {
		const err = new Error("boom");
		const onError = vi.fn();
		expect(() => runAsync(async () => { throw err; }, onError)).not.toThrow();
		await tick();
		expect(onError).toHaveBeenCalledWith(err);
	});

	it("a synchronous throw also goes to onError", () => {
		const onError = vi.fn();
		const fn = (() => { throw new Error("sync"); }) as () => Promise<void>;
		expect(() => runAsync(fn, onError)).not.toThrow();
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("a failing onError does not become an unhandled rejection", async () => {
		const seen: unknown[] = [];
		const handler = (e: unknown) => seen.push(e);
		process.on("unhandledRejection", handler);
		runAsync(async () => { throw new Error("x"); }, () => { throw new Error("handler failed"); });
		await tick();
		await tick();
		process.off("unhandledRejection", handler);
		expect(seen).toEqual([]);
	});
});
