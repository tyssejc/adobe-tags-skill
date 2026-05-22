# Adobe Tags CLI + Skill — Design

**Date:** 2026-05-21
**Status:** Approved design, pre-implementation

## Purpose

Let a developer answer hard-to-get questions about an Adobe Tags (formerly Adobe
Launch) property from a Claude Code session, without trudging through the Adobe
Tags UI. v1 is **read-only synthesis** — no edits to properties. Authoring
(create/edit rules, data elements, etc.) is a deferred v2.

The recurring questions that motivate this:

- Which rules set a given Analytics variable (`eVar20` / `event5` / `prop3`)?
- What trigger patterns do rules use (DOM Ready vs. Window Loaded vs. data-layer
  push), especially for third-party tag loaders?
- Inventory / orphans: unused data elements, disabled rules, resources untouched
  for months.
- Cross-references: which rules reference data element X; what custom code
  mentions `digitalData.foo`.
- Naming and convention patterns across the property.
- Diffs between libraries or environments.
- Custom-code surface: search across all embedded JS.
- Extension footprint: installed vs. actually referenced.
- **Unpublished `latest` revisions:** resources whose head revision is ahead of
  what is live in production. (High operational value — silent unpublished
  changes cause accidental breaking pushes months later.)

## Architecture

Three layers, only the first two built in v1:

1. **`cadmium` CLI** (Bun + TypeScript) — does all real work: auth, sync, the
   SQLite cache, and query commands. Self-contained, installable, scriptable
   outside Claude. Name plays off the Reactor API (cadmium control rods).
2. **`adobe-tags` skill** (`~/.claude/skills/adobe-tags/`) — the playbook telling
   Claude when and how to invoke `cadmium`, what output to expect, and how to
   summarize results for the user.
3. **MCP wrapper** — deferred. ~50 lines of glue around the CLI if cross-host
   portability (Cursor, Claude Desktop, etc.) is ever wanted.

Rationale for CLI+skill over an MCP server in v1: the hard work is the engine
underneath, not the surface. A CLI is the right primitive (pipeable, scriptable,
usable outside Claude); a skill loads into context only when invoked, whereas MCP
tool definitions are loaded eagerly every session. Building the CLI first keeps
the MCP option open at low cost; the reverse is messier.

**Runtime:** Bun + TypeScript, official patterns, `bun:sqlite` (no native compile
step, fast cold start).

## Auth & config

Adobe **OAuth Server-to-Server** (post-JWT). Each Adobe Developer Console project
yields a `client_id` + `client_secret` scoped to one IMS org. Token exchange at
`https://ims-na1.adobelogin.com/ims/token/v3`; access token (~24h) cached on disk
and refreshed when expired.

Config at `~/.config/adobe-tags/config.toml`:

```toml
[orgs.acme]
ims_org_id    = "ABC123@AdobeOrg"
client_id     = "..."
client_secret = "${env:ACME_CLIENT_SECRET}"   # ${env:...} substitution supported

[orgs.beta-corp]
ims_org_id    = "DEF456@AdobeOrg"
client_id     = "..."
client_secret = "..."

[properties."acme/web"]
org         = "acme"
property_id = "PR1234567890abcdef"

[properties."acme/mobile"]
org         = "acme"
property_id = "PR9876543210fedcba"

[properties."beta-corp/main"]
org         = "beta-corp"
property_id = "PR..."
```

Decisions:

- **TOML** — human-edited, comments matter, Bun reads it natively.
- **Flat property aliases** (`acme/web`) — easy to pass as a CLI arg and read in
  error messages.
- **Secrets:** plaintext file at `0600` by default; `${env:VAR}` substitution as
  the escape hatch. OS keychain deferred.
- **Onboarding:** `cadmium init` walks through adding an org + first property,
  validating against `GET /properties/{id}`. Manual file editing always works.

Precursor (confirmed satisfied for this user, ≥2 orgs): each org needs a Dev
Console project with the Launch API enabled and an OAuth S2S credential with
read scope on the property.

## Cache & sync

Per-property SQLite at `~/.cache/adobe-tags/<org>/<property>.db`.

**Synced per property:** property record; rules + rule_components; data elements;
extensions; libraries + the revisions each references; environments and their
active library. Only **head revisions plus library-referenced revisions** are
stored — not full revision history. (Full history is out of scope for v1; the
Reactor `audit_events` endpoint is a better fit for true history-walking and can
be added later.)

**Schema sketch** (anchor, not final):

```
resources          (id, type, name, enabled, deleted, head_revision_number,
                    head_settings_json, updated_at, search_text)
                   -- type ∈ {rule, rule_component, data_element, extension}
                   -- search_text indexed via FTS5 (name + settings + parsed code)
revisions          (id, resource_id, revision_number, settings_json, created_at)
rule_components_ix (rule_id → rule_component_id)   -- denormalized for fast joins
libraries          (id, name, state, built_at, environment_id)
library_revisions  (library_id, resource_id, revision_id, revision_number)
environments       (id, name, stage, active_library_id)
                   -- stage ∈ {development, staging, production}
sync_state         (resource_type, last_synced_at, version)
```

FTS5 over `search_text` answers custom-code grep in milliseconds instead of
JSON-walking hundreds of components per query.

**Sync semantics:** `cadmium sync <alias>` is a full pull on first run, then
incremental via Reactor's `filter[updated_at][GT]=<last_synced_at>`. Re-fetches
modified resources, removes deleted ones, leaves the rest. `--full` forces a
clean rebuild (escape hatch if `updated_at`-based incremental ever drifts).

**Freshness:** `cadmium status <alias>` surfaces `last_synced_at`, counts, and an
env/library snapshot. The skill calls `status` before any analysis and prompts a
`sync` when stale (>1h, or when the question implies recent changes).

Example sync output:

```
Syncing acme/web (last synced 2h ago)...
  Rules:           47    (44 unchanged, 2 updated, 1 new)
  Rule components: 198   (193 unchanged, 4 updated, 1 new)
  Data elements:   312   (310 unchanged, 2 updated)
  Extensions:      12    (no changes)
  Libraries:       8     (development: 4, submitted: 0, approved: 2, published: 2)
Cache: ~/.cache/adobe-tags/acme/web.db (4.3 MB)
Done in 6.2s.
```

## Command surface (v1)

Convention: `cadmium <verb> <object> <alias> [args]`. Pretty text by default;
`--json` for structured output (the skill always passes `--json`). One-shot
invocations, no REPL.

**Setup & lifecycle**
- `cadmium init` — interactive add org + first property; validates against Reactor
- `cadmium orgs ls`
- `cadmium properties ls [--org X] [--remote]` — `--remote` lists API properties
  to help add a new alias

**Sync & state**
- `cadmium sync <alias> [--full]`
- `cadmium status <alias>`
- `cadmium overview <alias>` — one-paragraph property summary; first-call entry
  point for the skill

**Inventory / list**
- `cadmium ls rules <alias> [--disabled] [--untouched-since DATE] [--action-type DELEGATE_ID]`
- `cadmium ls data-elements <alias> [--unused] [--type DELEGATE_ID]`
- `cadmium ls extensions <alias>`
- `cadmium ls libraries <alias> [--state STATE]`
- `cadmium show <alias> <name-or-id>` — full detail of one resource; resolves by
  name, errors with candidates on collision

**Cross-reference**
- `cadmium refs <alias> <data-element-name>` — what references this data element
- `cadmium sets-variable <alias> <var>` — rules/actions setting `eVar20` /
  `event5` / `prop3` (Analytics extension settings + custom code)
- `cadmium unused <alias>` — orphan data elements, unreferenced extensions

**Patterns**
- `cadmium triggers <alias> [--group-by-action]` — histogram of rule event types;
  `--group-by-action` answers "what triggers do 3P tag loaders use?"

**Operational**
- `cadmium unpublished <alias> [--env production]` — resources whose head revision
  is ahead of the named environment's current library (default: production)
- `cadmium diff <alias> <ref-a> <ref-b>` — compare two libraries or environments;
  refs: `library:NAME`, `env:dev|staging|production`, or `head`

**Search**
- `cadmium grep <alias> <pattern> [--type code]` — FTS over settings JSON and
  custom-code blocks; `--type code` restricts to embedded JS

Decisions:

- Binary name **`cadmium`**.
- **`--json` flag**, not TTY auto-detection — explicit over magical.
- **No REPL** — skill orchestrates multiple one-shot calls.
- **`show` resolves names**, not just IDs.

**MVP cut option** (if starting smaller): `init`, `sync`, `status`, `overview`,
`ls rules`, `ls data-elements`, `refs`, `sets-variable`, `grep`, `unpublished`,
`triggers`. Remaining commands (`orgs ls`, `properties ls`, `ls extensions`,
`ls libraries`, `show`, `unused`, `diff`) deferred to v1.1.

## The skill

`~/.claude/skills/adobe-tags/SKILL.md`:

- **Frontmatter** — `name: adobe-tags`; `description` triggers on Adobe
  Tags/Launch/Reactor questions, Analytics-variable usage, unpublished changes,
  data-layer triggers.
- **Preflight** — run `cadmium status <alias>` first; suggest `sync` if stale;
  point to `cadmium init` if the property isn't configured.
- **Question → command routing table**, e.g.:
  - "which rules set eVar20" → `cadmium sets-variable <alias> eVar20 --json`
  - "what triggers do 3P tags use" → `cadmium triggers <alias> --group-by-action --json`
  - "anything unpublished in prod?" → `cadmium unpublished <alias> --env production --json`
  - "is this data element used" → `cadmium refs <alias> <name> --json`
  - "code touching digitalData.foo" → `cadmium grep <alias> 'digitalData.foo' --type code --json`
- **Interpretation guidance** — read the JSON, drill in with `show` when needed,
  lead the user-facing answer with the conclusion not the raw list.
- **`references/reactor-concepts.md`** (loaded on demand) — revisions vs.
  libraries vs. environments, `delegate_descriptor_id` taxonomy, how Analytics
  variables map into component settings. Keeps SKILL.md lean.

## Out of scope (v1)

- Any write/edit to properties (deferred v2 — authoring).
- Full revision-history caching.
- OS keychain secret storage.
- MCP server surface.
- Cross-host (non-Claude-Code) usage of the skill.

## Open items for the implementation plan

- Verify exact Reactor endpoints, pagination params, and OAuth S2S scope strings
  against current Adobe docs before coding the client.
- Confirm the `delegate_descriptor_id` values for the Adobe Analytics
  "set variables" action and custom-code action used by `sets-variable`.
- Decide the `cadmium` install/distribution mechanism (compiled Bun binary vs.
  `bun link`).
