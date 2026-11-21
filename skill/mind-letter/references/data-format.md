# Memory format (shared with the Mind Letter plugin and newsletter)

Store as JSON or as Markdown tables in one "Mind Letter Memory" note/page.

## claims
`{ id, source: "obsidian"|"notion"|"<other>", ref: "<path or url>", quote: "<≤ 200 chars, exact>", theme, date: "YYYY-MM-DD", kind: "rule"|"opinion"|"plan"|"question" }`

## themes (per week)
`{ week: "YYYY-Www", themes: [{ name, weight: 0..1, status: "new"|"recurring"|"done", claimIds: [] }] }`

## feedback
`{ week, item: 1..5, useful: true|false, note? }`

## settings
`{ saveTo, excluded: [paths or pages], language, warmupDone: true|false }`
