---
name: adobe-tags
description: Use when answering questions about an Adobe Tags (Adobe Launch / Reactor) property — which rules set an Analytics variable (eVar/event/prop), what triggers rules use, whether resources have unpublished changes in production, which rules reference a data element, or searching custom code. Drives the `cadmium` CLI.
---

# Adobe Tags property analysis

Use the `cadmium` CLI to answer read-only questions about an Adobe Tags property. The user refers to properties by alias (e.g. `acme/web`).

## Preflight (always)

1. Run `cadmium property status --json` (with `-p <alias>` if the property isn't the current default) to check freshness.
2. If `last_synced_at` is null → run `cadmium property sync` first.
3. If `last_synced_at` is older than ~1 hour, or the question implies recent edits ("did someone just change…"), suggest `cadmium property sync` before answering.
4. If the command errors with "No property selected" → ask the user which alias to use, or suggest `cadmium property use <alias>` to set a persistent default.
5. If the user mentions a property by alias for the first time, suggest `cadmium property use <alias>` so subsequent commands don't need `-p`.

## Question → command

| User asks | Command |
|---|---|
| Which rules set eVar20 / event5 / prop3? | `cadmium analytics setters eVar20 --json` |
| What triggers do rules use? | `cadmium rules triggers --json` |
| Who reads data element X? | `cadmium des refs X --getters --json` |
| Who writes data element X? | `cadmium des refs X --setters --json` |
| Any references to data element X? | `cadmium des refs X --json` |
| Find custom code touching `digitalData.foo` | `cadmium code search 'digitalData.foo' --json` |
| List rules / disabled rules / stale rules | `cadmium rules list [--disabled] [--untouched-since 2025-01-01] --json` |
| List data elements / unused ones | `cadmium des list [--unused] --json` |
| Browse publish history | `cadmium libs list [--name 'Remove'] [--state published] [--published-since 2024-01-01] --json` |
| Any resources with unpublished changes? | `cadmium property dirty --json` |
| Summarize the property | `cadmium property overview --json` |
| What properties am I configured for? | `cadmium property list --json` |

## Interpreting results

- All commands accept `--json`; always pass it and parse the JSON.
- Lead your answer with the conclusion (e.g. "3 rules set eVar20: …"), not the raw list.
- `analytics setters` returns both rules (variables set in any action component) and extensions (variables set in extension config, e.g. Adobe Analytics `doPlugins`). The `type` column distinguishes them.
- `property dirty` lists resources whose head has been edited since the last library build (the `dirty` flag) — these are forgotten in-progress edits that aren't yet deployable.
- `property dirty` rows mean a resource's head revision is ahead of what's live — flag these as risk, since they may be forgotten in-progress edits.
- `libs list` is sorted newest-published first, then unpublished/draft libraries (sorted by created_at). Useful when an orphaned data element looks deletable but you want to find the "Remove X" library that explains it.
- `des refs` returns both directions by default. The `kind` column distinguishes `getter` (read via `%name%` or `_satellite.getVar`) from `setter` (write via `_satellite.setVar`).
- See `references/reactor-concepts.md` for how revisions, libraries, and environments relate, and for the `delegate_descriptor_id` taxonomy.
