import { applyRefinement, buildRefinePrompt, parseRefinement, type Lang, type LetterPoint } from "@mind-letter/core";
import { createProvider } from "./providers";
import type { AiProvider, AiSettings, ProviderDeps } from "./types";
import { providerSlot } from "./types";

export type RefineStatus = "off" | "not-approved" | "unavailable" | "error" | "unusable" | "ok";

export interface AiRefineOutcome {
	status: RefineStatus;
	points: LetterPoint[];
	/** Where the text was sent, for the letter's frontmatter. */
	provider?: string;
	accepted: number[];
	rejected: Array<{ number: number; reason: string }>;
	/** Short reason for the failure statuses (never contains note text or a key). */
	detail?: string;
}

/**
 * Reword the rule-based letter with the selected provider. Nothing is sent unless AI is on AND the user approved this
 * exact provider slot. Whatever the model returns is validated (links, quotes, length): rejected parts keep the
 * rule-based text, and any failure leaves the whole letter exactly as the rules wrote it.
 */
export async function refineWithAi(ai: AiSettings, deps: ProviderDeps, points: LetterPoint[], lang: Lang, provider?: AiProvider | null): Promise<AiRefineOutcome> {
	const unchanged = (status: RefineStatus, detail?: string): AiRefineOutcome => ({ status, points, accepted: [], rejected: [], ...(detail ? { detail } : {}) });
	if (ai.provider === "off") return unchanged("off");
	if (ai.approvedSlot === "" || ai.approvedSlot !== providerSlot(ai)) return unchanged("not-approved");
	const p = provider ?? createProvider(ai, deps);
	if (!p) return unchanged("unavailable", "this provider cannot run letters (detect-only, no model, no key or not allowed here)");

	const prompt = buildRefinePrompt(points, lang, ai.maxContextChars);
	const ac = new AbortController();
	const timer = window.setTimeout(() => ac.abort(), ai.timeoutSec * 1000);
	try {
		const reply = await p.complete(prompt, { signal: ac.signal });
		const parsed = parseRefinement(reply);
		if (!parsed) return { ...unchanged("unusable", "the reply was not the expected JSON"), provider: p.label };
		const result = applyRefinement(points, parsed);
		if (result.accepted.length === 0) return { ...unchanged("unusable", "no part of the reply passed validation"), provider: p.label, rejected: result.rejected };
		return { status: "ok", points: result.points, provider: p.label, accepted: result.accepted, rejected: result.rejected };
	} catch (e) {
		ac.abort();
		return { ...unchanged("error", e instanceof Error ? e.message.slice(0, 160) : "request failed"), provider: p.label };
	} finally {
		window.clearTimeout(timer);
	}
}
