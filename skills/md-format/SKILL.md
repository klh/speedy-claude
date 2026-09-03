---
name: md-format
description: Markdown output conventions and formatting — GitHub-flavored by default. Use when writing or reviewing .md files (READMEs, docs, SKILL.md, PR descriptions); formatting runs automatically via the md-format hook, this skill covers the judgment calls prettier can't make.
---

# Markdown Style (GFM-first)

Mechanical formatting is handled automatically: every Write/Edit to a `.md` file triggers `hooks/md-format.sh` → `prettier --write --prose-wrap preserve`. That aligns table pipes, normalizes list markers (`-` for bullets, `1.` ordered), code-fence style, and spacing. You write; the hook tidies.

Manual format (unformatted files, bulk):

```bash
prettier --write --prose-wrap preserve "docs/**/*.md"
```

## Judgment calls (prettier can't decide these)

- **GFM is the default** target: tables, task lists, strikethrough, autolinks, fenced code with language tags. Write for GitHub rendering.
- **Tables**: only when the data is genuinely tabular (2+ columns, comparable rows). One-liner pairs → a list. Wide tables (5+ cols) often read better as definition lists or headed sections — GitHub doesn't wrap table cells.
- **Column width**: keep header cells short; long cells in a column mean the table fights the formatter's alignment.
- **Code fences**: always tag the language (`bash, `ts). Untagged blocks lose highlighting.
- **Headings**: one H1 per file, no level skips (H1→H3 is broken anchoring). Headings are the anchor API — `#-Pattern` links depend on exact casing.
- **Lists**: `-` bullets; parallel capitalization; no trailing `.` on fragments, `.` on full sentences — pick one per list.
- **Emphasis**: `*italic*`, `**bold**`; underscores read as code in some renderers around words.
- **Line breaks**: single newline within a paragraph (GFM renders it as a space — don't rely on hard-wraps); blank line between blocks. Two trailing spaces for intentional `<br>` — rare.
- **Flavor exceptions**: Obsidian-targeted notes may use wikilinks/callouts; plain CommonMark when a renderer is unknown. Match the repo's existing flavor before defaulting to GFM.
- **Links**: reference-style for repeated URLs or >3 links in a paragraph; inline otherwise. Naked URLs fine (GFM autolinks).

## Verification

After bulk-formatting or flavor migrations: `prettier --check` for strays, and render-check tables (column count consistent per row — the formatter will not fix a table with mismatched cells, it will happily align a broken one).
