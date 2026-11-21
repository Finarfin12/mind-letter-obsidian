import { isoWeek } from "@mind-letter/core";

/**
 * Decide whether the weekly letter is due. Pure, so it can be tested without timers.
 * Due when: automatic writing is on, nothing was written for the current ISO week yet, and the chosen weekday + hour
 * of the current week have passed ("once Obsidian is open after the chosen time").
 */
export function isWeeklyDue(opts: { enabled: boolean; now: number; weekday: number; hour: number; lastWeek: string }): boolean {
	if (!opts.enabled) return false;
	if (opts.lastWeek === isoWeek(opts.now)) return false;
	const d = new Date(opts.now);
	// Position inside the ISO week, Monday = 0 ... Sunday = 6, for the day and for the chosen weekday
	const pos = (day: number): number => (day + 6) % 7;
	const today = pos(d.getDay());
	const target = pos(opts.weekday);
	if (today !== target) return today > target;
	return d.getHours() >= opts.hour;
}
