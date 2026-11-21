const DAY_MS = 86400000;

const pad = (n: number): string => (n < 10 ? "0" : "") + String(n);

/** `YYYY-MM-DD` in local time. */
export function formatDay(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO 8601 week label `YYYY-Www` (weeks start on Monday; week 1 contains January 4th), local time. */
export function isoWeek(ms: number): string {
	const d = new Date(ms);
	const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	const dayNum = (target.getUTCDay() + 6) % 7; // Monday = 0
	target.setUTCDate(target.getUTCDate() - dayNum + 3); // Thursday of this week
	const isoYear = target.getUTCFullYear();
	const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
	const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
	firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
	const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
	return `${isoYear}-W${pad(week)}`;
}

/** Number part of a week label, e.g. 47 for `2026-W47`. */
export function weekNumber(label: string): number {
	return Number(label.slice(label.indexOf("W") + 1));
}

/** Label of the week `n` weeks before the week that contains `ms`. */
export function weeksBefore(ms: number, n: number): string {
	return isoWeek(ms - n * 7 * DAY_MS);
}

export interface Period {
	/** Inclusive start, epoch ms (local midnight of the first day). */
	from: number;
	/** Exclusive end, epoch ms (local midnight after the last day). */
	to: number;
	week: string;
	/** `YYYY-MM-DD` of the first and last included day. */
	firstDay: string;
	lastDay: string;
}

/** The 7 calendar days ending on the day of `now` (today included). The week label is the ISO week of `now`. */
export function lastSevenDays(now: number): Period {
	const d = new Date(now);
	const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
	const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6).getTime();
	return { from, to, week: isoWeek(now), firstDay: formatDay(from), lastDay: formatDay(to - 1) };
}

/** Same shape for the 7 days that end `n` weeks before the day of `now`. */
export function periodWeeksBefore(now: number, n: number): Period {
	return lastSevenDays(now - n * 7 * DAY_MS);
}

export function inPeriod(ms: number, period: Pick<Period, "from" | "to">): boolean {
	return ms >= period.from && ms < period.to;
}

/** Parse `YYYY-MM-DD` (or a longer ISO string starting with it) to local midnight, or null when invalid. */
export function parseDay(value: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	const day = Number(m[3]);
	const t = new Date(y, mo - 1, day);
	if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== day) return null;
	return t.getTime();
}
