---
name: adobe-tags
description: Use when answering questions about an Adobe Tags (Adobe Launch / Reactor) property — which rules set an Analytics variable (eVar/event/prop), what triggers rules use, whether resources have unpublished changes in production, which rules reference a data element, or searching custom code. Drives the `cadmium` CLI.
---

# Adobe Tags property analysis

Use the `cadmium` CLI to answer read-only questions about an Adobe Tags property. The user refers to properties by alias (e.g. `acme/web`).

## Preflight (always)

1. Run `cadmium status <alias> --json` to check freshness.
2. If `last_synced_at` is null → run `cadmium sync <alias>` first.
3. If `last_synced_at` is older than ~1 hour, or the question implies recent edits ("did someone just change…"), suggest `cadmium sync <alias>` before answering.
4. If the command errors that the alias is unknown → the property isn't configured; tell the user to run `cadmium init`.

## Question → command

| User asks | Command |
|---|---|
| Which rules set eVar20 / event5 / prop3? | `cadmium sets-variable <alias> eVar20 --json` |
| What triggers do rules use? | `cadmium triggers <alias> --json` |
| Is data element X used anywhere? | `cadmium refs <alias> X --json` |
| Find custom code touching `digitalData.foo` | `cadmium grep <alias> 'digitalData.foo' --json` |
| List rules / disabled rules / stale rules | `cadmium ls rules <alias> [--disabled] [--untouched-since 2025-01-01] --json` |
| List data elements / unused ones | `cadmium ls data-elements <alias> [--unused] --json` |
| Any resources with unpublished changes (dirty)? | `cadmium unpublished <alias> --json` |
| Summarize the property | `cadmium overview <alias> --json` |

## Interpreting results

- All commands accept `--json`; always pass it and parse the JSON.
- Lead your answer with the conclusion (e.g. "3 rules set eVar20: …"), not the raw list.
- `sets-variable` returns both rules (variables set in any action component) and extensions (variables set in extension config, e.g. Adobe Analytics `doPlugins`). The `type` column distinguishes them.
- `unpublished` lists resources whose head has been edited since the last library build (the `dirty` flag) — these are forgotten in-progress edits that aren't yet deployable.
- `unpublished` rows mean a resource's head revision is ahead of what's live — flag these as risk, since they may be forgotten in-progress edits.
- See `references/reactor-concepts.md` for how revisions, libraries, and environments relate, and for the `delegate_descriptor_id` taxonomy.
