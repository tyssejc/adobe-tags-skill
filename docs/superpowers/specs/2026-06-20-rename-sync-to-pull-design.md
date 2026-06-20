# cadmium — rename `sync` → `pull` design

**Date:** 2026-06-20
**Status:** Approved (design phase). Implementation deferred until `feat/homebrew-packaging` merges.

## Goal

Rename cadmium's `sync` verb to `pull`. `sync` implies bidirectional transfer;
cadmium v1 is strictly read-only, so `pull` is the honest verb. `push` is
reserved for the future write layer. This also keeps cadmium symmetric with its
sibling tool `gallium` (gtm-skill), which already uses a `pull/` module and a
`last_pulled_at` metadata key.

## Origin

This is the documented follow-up from the gtm-skill design spec
(`../gtm-skill/docs/superpowers/specs/2026-06-19-gtm-skill-design.md`, line 49):
> the v1 read transfer is `pull` (not `sync`) — `sync` implies bidirectionality,
> but v1 is strictly read-only. The complementary `push` (write back) arrives
> with the v2 authoring layer. (Follow-up, out of scope here: rename `cadmium`'s
> `sync` → `pull` for the same reason, to keep the two tools symmetric.)

## Scope — full rename map

Decision: **full rename** (public verb + internal names + persisted metadata
key), for symmetry with gallium. No backward-compatibility alias.

### Public surface
- `src/cli.ts` — `COMMANDS.property.sync` → `COMMANDS.property.pull`; update the
  import of `cmdPropertySync` → `cmdPropertyPull`.
- `src/commands/property.ts`:
  - `cmdPropertySync` → `cmdPropertyPull` (export name).
  - `// cadmium property sync` comment → `// cadmium property pull`.
  - Help text at `property.ts:59` (`… && cadmium property sync`) → `… && cadmium property pull`.
  - JSON output field `synced: true` → `pulled: true` (in the pull handler).
  - `status`/`overview` JSON field `last_synced_at` → `last_pulled_at`.
- `src/commands/_shared.ts:10` — error message
  `Property '…' has never been synced. Run: cadmium sync ${alias}` →
  `Property '…' has never been pulled. Run: cadmium property pull ${alias}`
  (also fixes the existing bug: the message omits the `property` noun).
- `skill/SKILL.md` — both `cadmium property sync` references → `cadmium property pull`;
  both `last_synced_at` references → `last_pulled_at`.
- `README.md` — usage line `cadmium property sync` and the verb list
  (`init | use | show | list | sync | …` → `… | pull | …`).

### Internals (for gallium symmetry)
- Directory `src/sync/` → `src/pull/`; `sync.ts` → `pull.ts`; `sync.test.ts` → `pull.test.ts`.
- `syncProperty` → `pullProperty`; `SyncOpts` → `PullOpts`.
- `openSynced` helper in `_shared.ts` → `openPulled` (update its callers in
  `rules.ts`, `des.ts`, `libs.ts`, `code.ts`, `analytics.ts`, `property.ts`).
- Persisted metadata key `last_synced_at` → `last_pulled_at` (written in
  `pull.ts`, read in `property.ts` and `_shared.ts`).
- The `// Full-pull sync rebuilds everything` comment in `cache/db.ts` →
  `// Full pull rebuilds everything` (cosmetic, keeps wording consistent).

### Test fixtures
- `src/sync/sync.test.ts` (→ `pull.test.ts`): `syncProperty` → `pullProperty`,
  assertions on `last_pulled_at`.
- `src/cache/repo.test.ts` and `src/commands/commands.test.ts`: the seeded
  `setMeta(db, "last_synced_at", …)` / `getMeta(…, "last_synced_at")` calls →
  `last_pulled_at`.

## Cache-key migration

`last_synced_at` is a key in the SQLite cache `meta` table. After the rename,
existing caches still hold `last_synced_at`; new code reads `last_pulled_at`,
finds nothing, and treats the property as "never pulled" — prompting one
re-pull. This is harmless: caches are disposable and `cache/db.ts` already
rebuilds on schema drift. **No migration code is written; a re-pull is the
migration.**

## No backward-compatibility alias

cadmium has no shipped users yet (the in-flight Homebrew work is the first
packaging), and a hidden `sync` alias is exactly the dual-surface complexity
worth avoiding. Clean break: `sync` is gone, `pull` is the only verb. `push`
remains unimplemented, reserved for the future write layer.

## Testing

No behavior changes — this is a pure rename. The gate is a full `bun test`
pass with every symbol/key renamed consistently, plus a manual
`cadmium property pull` smoke run against a real property. A `grep -rn "sync"`
(excluding JS `*Sync` APIs and the word "asynchronous") over `src/`, `skill/`,
and `README.md` must return zero domain-level hits when done.

## Sequencing

- Spec committed now to `main` (independent of `feat/homebrew-packaging`).
- Implementation plan + execution **deferred** until `feat/homebrew-packaging`
  is merged, then performed off a clean `main` to avoid conflicts in the files
  both touch (`cli.ts`, `README.md`, `skill/SKILL.md`).

## Out of scope (YAGNI)

- `push` / any write-back command.
- A `sync` → `pull` compatibility alias.
- Cache migration code.
