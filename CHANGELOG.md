# Changelog

## 0.1.2

- The `mind-letter` agent skill moved to its own repository, [Finarfin12/mind-letter-skill](https://github.com/Finarfin12/mind-letter-skill); the `skill/` folder is removed from this repository.
- README (English and Indonesian): the "Agent skill" section now links to the skill repository.
- No change to the plugin code.

## 0.1.1

- Added the `mind-letter` agent skill in `skill/mind-letter/` (SKILL.md, insight rules, letter template, memory format, synthetic example) for letters across several sources (Obsidian, Notion, other connected note apps). Same rules and memory format as the plugin.
- README (English and Indonesian): new "Agent skill" section with install steps; the plugin reading only the open vault is now stated as a design choice.
- No change to the plugin code.

## 0.1.0

First release.

- Weekly letter written from your own notes: across notes, contradiction (exact quotes), loose threads, hoarding, one question. At most 5 points, every point links to its notes, short version when you wrote fewer than 3 notes.
- Works fully without AI. With AI off the plugin makes no network request and starts no program.
- Command, ribbon icon and an optional weekly schedule (off by default). Letters go to `Mind Letter/YYYY-Www.md`; an existing letter is never overwritten.
- Memory in `Mind Letter/.memory/` (claims, themes, feedback). First letter builds the theme map from the past 8 weeks.
- Feedback by checkbox in the letter; kinds rated not useful twice in a row are left out.
- Optional AI that only rewords the rule-based points, with output checks (links, exact quotes, no URLs/HTML/code, length). Providers: Claude Code CLI (all tools off), Ollama / LM Studio, cloud API (OpenAI, Anthropic, Google Gemini). Codex, Gemini CLI and Antigravity are detected for their model lists but never receive notes. Models come from the provider; none are hard-coded. Nothing is sent before you approve a provider.
- English and Indonesian letters and interface.
- Core logic in `@mind-letter/core` and provider layer in `@mind-letter/ai` (no Obsidian imports) so other front ends can reuse them.
