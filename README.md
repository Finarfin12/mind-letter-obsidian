# Mind Letter

*Bahasa Indonesia: [README.id.md](README.id.md)*

Once a week, Mind Letter reads **your own notes** and writes you a short letter, as a normal note in your vault. It looks for the things that are easy to miss when you are the one writing:

1. **Across notes**: a topic that keeps coming back in different folders, and whether it ever became a finished piece.
2. **Contradiction**: two things you wrote that pull against each other, quoted exactly, with links.
3. **Loose threads**: duplicate titles, related notes that are not linked, a review that is overdue.
4. **Hoarding**: how much you saved (clippings, books, PDF stubs) compared with how much you wrote, and one thing worth reading first.
5. **One question** to think about, not to answer here.

Every point links to the notes behind it. At most 5 points. If there is nothing real to say, the letter says less instead of inventing something. If you wrote fewer than 3 notes that week you get a short letter.

**It works fully without AI.** The rules above find everything. AI is an optional extra that only rewords the result.

## Install

Mind Letter is not in the community directory yet. Install it by hand:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/Finarfin12/mind-letter-obsidian/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/mind-letter/`.
3. In Obsidian: Settings → Community plugins → enable **Mind Letter**.

Needs Obsidian 1.8.7 or newer. Works on desktop and mobile (CLI providers are desktop only).

## Use

- Command palette → **Write this week's letter** (or the mail icon in the ribbon). The letter is saved as `Mind Letter/2026-W47.md` and opened. A letter that already exists is never overwritten: you get `2026-W47 (2).md`.
- **Open the latest letter** and **Build the theme map from the past 8 weeks (warm-up)** are also commands. The first letter does the warm-up by itself, so theme history (new / recurring) is not empty on day one.
- **Weekly schedule** (Settings → *Write a letter every week*): off by default. When on, the letter is written once Obsidian is open after the day and hour you chose, at most once per week.
- **Feedback**: each letter ends with a checklist. Tick the points that were useful. Unticked boxes count as "not useful" only when you ticked at least one box (a letter you never rated teaches nothing). A kind of point you rate not useful in your last two rated letters is left out of the next letter. The closing question is never left out.

Settings: language of the letter (automatic follows your notes; Indonesian and English), the folder for letters, folders to ignore, schedule, AI.

## Where things are stored

- Letters: `Mind Letter/YYYY-Www.md` (the folder is configurable).
- Memory: `Mind Letter/.memory/` as plain JSON: `claims.json` (short exact quotes of rules, opinions and plans from your notes, used to find contradictions), `themes.json` (themes per week), `feedback.json`, `meta.json`. Delete the folder to start over.
- Settings: the plugin's `data.json`.

## Privacy and what runs on your computer

**With AI off (the default) the plugin makes no network request and starts no program.** It reads your notes through Obsidian's API and writes the letter and the memory files in your vault. Notes in the Mind Letter folder itself and in folders you chose to ignore are never read.

When you turn AI on, **nothing is sent until you approve that provider** in a dialog. Approval belongs to one provider: changing the provider or address asks again. The AI never sees whole notes: only the short quotes, titles and links that are already in the rule-based letter (up to 6000 characters by default). Whatever it returns is checked: every link must be one the rules already found, every quote must be an exact copy, no URLs, HTML or code, and length limits. Anything that fails keeps the rule-based wording. If the AI fails, you get the rule-based letter.

AI providers, in the order of the settings:

| Provider | What happens | Runs letters? |
| --- | --- | --- |
| **Claude Code** (installed CLI) | The plugin **runs the `claude` program on your computer** with all tools turned off (`--tools ""`), permission prompts refused, no session saved, safe mode, no MCP, in an empty temporary folder, no shell. The text goes through stdin. To list models it runs `claude --help`, reads the model name in `~/.claude/settings.json` and scans the program file for model names. It never opens login or token files. | Yes |
| **Codex, Gemini CLI, Antigravity (`agy`)** | Detected only: the settings can list their models (Codex: `~/.codex/config.toml` and `models_cache.json`; `agy`: runs `agy models`; Gemini: `~/.gemini/settings.json`). They **never receive note text**, because no verified way to switch all their tools off exists (in real tests `agy` still wrote files and read files outside its workspace). | No |
| **Ollama / LM Studio** (local model) | Text goes only to a server on this computer (`localhost`). | Yes |
| **Cloud API** (OpenAI, Anthropic, Google Gemini) | The text goes to that provider over `https`. You must enter an API key; it is stored **in plain text in the plugin's `data.json`** and is synced if you sync your vault. The key is only sent to the configured address. | Yes |

Model lists come from the provider itself (`--help`, the CLI's own files, `agy models`, `/api/tags`, `/models`). There is no built-in model list, and no model name is hard-coded. A cloud provider with no key makes no request at all.

## Agent skill (letters across sources)

The plugin reads the open vault only, by design. For a letter across several sources (Obsidian, Notion, other note apps you connected), use the **`mind-letter` agent skill** in [`skill/mind-letter/`](skill/mind-letter/). It follows the same rules and memory format as the plugin and runs in an AI agent that can read your notes.

- **Claude Code:** copy `skill/mind-letter` to `~/.claude/skills/mind-letter`, then ask: "write this week's mind letter from my vault".
- **Other agents with skill support** (e.g. Codex): copy the folder into that agent's skills folder.
- The skill only reads sources your agent can already reach (folder access or connectors). It asks once where to save the letter.

## Limits

- The plugin reads the vault that is open, by design. For other vaults and Notion, use the agent skill above.
- Contradictions need an exact quote plus a second quote or a measured count. If the rules cannot back it up, that section is simply missing.
- Counts of "saved vs own" are estimates from folders, size and front matter; the letter says so.

## Development

```
npm ci
npm test       # core rules, AI layer, plugin logic (vitest)
npm run lint
npm run build  # type check + bundle main.js
```

The logic is in two packages without any Obsidian import, so other front ends can reuse them: `packages/core` (`@mind-letter/core`: classify, claims, themes, insights, compose, memory, refinement checks) and `packages/ai` (`@mind-letter/ai`: provider detection, safety flags, providers). The plugin in `src/` is a thin layer over them.

## License

MIT
