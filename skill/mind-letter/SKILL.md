---
name: mind-letter
description: Write a weekly "Mind Letter" (Surat Otak) from the user's own notes — not a summary, but connections, contradictions, direction, and hoarding patterns across Obsidian, Notion, and other note sources, ending with one question. Use when the user says "mind letter", "surat otak", "ringkasan otak mingguan", "weekly mind letter", "what did I think about this week", or asks for a weekly reflection on their notes.
---

# Mind Letter (Surat Otak)

A weekly letter that answers: **"What did you think about this week, and what did you miss?"**
It is not a summary. It shows only level 3–5 insights: connections, contradictions, direction. Summaries and counts go in one small stats line.

Write in the user's language (default: the language most of their own notes use).

## 1. Scope the week
- Default period: the last 7 days ending today. Accept a custom range.
- Ask once which sources to use if not obvious. Use only connectors/folders actually available. Never invent content from a source you could not read.
- Respect excluded folders/pages the user names (e.g. private journals). If a memory file lists exclusions, apply them.

## 2. Collect
For each source, list items created or modified in the period:
- **Obsidian (folder access or local MCP):** `.md` files by modified time; skip `.obsidian/`, `.trash/`.
- **Notion (official connector):** pages created/edited in the period.
- **Other personal sources** the user connected (e.g. a digital-garden MCP): notes published/edited in the period.

## 3. Classify each item
Only **own** writing feeds claims and insights. The rest counts as *saved material* for the hoarding section.

| kind | rule of thumb |
|---|---|
| own | written by the user; not in clipping/library folders; has the user's own sentences |
| clipping | folders like `Clippings/`, web-clipper frontmatter (`source`, `url`) |
| book | library folders or very large files (> ~200 KB) |
| pdf-stub | note body is only an embedded PDF / link, no own sentence |
| template / empty | `Templates/`, 0-byte or frontmatter-only notes |

Read own notes fully. For saved material, read titles only unless needed.

## 4. Update the memory
Keep a memory file the user chooses (default: `Mind Letter Memory` next to the letters). Format: see `references/data-format.md`.
- Extract **claims** from own notes: rules ("one topic per week"), opinions, plans, questions — short exact quotes with source.
- Update the **theme map** for this week: theme, weight, status (new / recurring / done), claim ids.
- First run: also skim the previous 8 weeks of own notes to seed the map ("warm-up").

## 5. Find insights (only level 3–5)
See `references/insight-rules.md`. In short:
1. **Cross-source** (top section): an idea that is mature in one place but missing in another — e.g. researched in Notion, thought in Obsidian, never published/written.
2. **Contradiction:** a user's own rule or claim vs. their measurable behaviour this week, or vs. another claim. **Quote both sides and link both.** If you cannot quote both, drop it.
3. **Loose threads:** own notes that clearly relate but are not linked; duplicate notes; ideas with an overdue review.
4. **Hoarding:** saved vs. written ratio; pdf-stubs with no own sentence; suggest **one** item to read, the one closest to this week's dominant theme.
5. **One question** for next week that the user must think through themselves. Do not answer it.

Never fabricate a quote, a link, a count, or a contradiction. Mark estimates as estimates.

## 6. Compose
Use `references/template.md`. Rules:
- At most 5 points outside the stats line; readable in ≤ 3 minutes.
- Every point links to its source notes.
- If fewer than 3 own notes this week: write the **short version** (one old thread + one reading + one question).
- Tone: a thoughtful friend, not a judge. Point to the user's own words.
- End with the feedback checklist (useful / not useful per point).

## 7. Save
Ask where to save (once; remember the answer in the memory file): a file in the vault (`Mind Letter/YYYY-Www.md`), a Notion page, or another personal source the user connected.
If the workspace has rules for logging writes (e.g. a change log page), follow them after saving.

## 8. Next week
Read last week's feedback checklist before writing. Keep the kinds of points marked useful; drop or sharpen those marked not useful.

## References
- `references/insight-rules.md` — insight levels, good/bad examples, anti-hallucination rules
- `references/template.md` — letter template and short version
- `references/data-format.md` — claims and theme map format
- `references/example-letter.md` — a synthetic example letter
