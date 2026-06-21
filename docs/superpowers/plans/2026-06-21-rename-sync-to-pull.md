# Rename `sync` → `pull` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename cadmium's read-transfer verb from `sync` to `pull` — public verb, internal module/function/type names, the `openSynced` helper, and the persisted `last_synced_at` metadata key — with no behavior change and no backward-compatibility alias.

**Architecture:** A pure rename in three independently-green slices: (1) the pull module + its function/type + production caller, (2) the persisted metadata key across writer/readers/fixtures, (3) the public verb + helper + user-facing docs strings. Each slice leaves `bun test` green and the CLI loadable.

**Tech Stack:** Bun (TypeScript), `bun:sqlite`, `bun test`.

## Global Constraints

- Pure rename: **no behavior change, no new features, no `sync` compatibility alias**.
- Target symmetry with sibling tool `gallium` (gtm-skill): module `pull/`, function `pullProperty`, metadata key `last_pulled_at`.
- The cache-key change needs **no migration code** — an existing cache holding `last_synced_at` simply reads as "never pulled" and triggers one harmless re-pull.
- DO NOT touch JS standard-library `*Sync` calls (`existsSync`, `writeFileSync`, `mkdirSync`, `readFileSync`, `statSync`, etc.) in `src/skill/install.ts`, `src/util/fs.ts`, `src/config/state.ts`, `src/auth/token.ts`, `src/config/config.ts` — those are unrelated to the domain verb.
- Verification gate per task: `bun test` passes, the CLI loads (`bun run bin/cadmium.ts --help`), and a targeted `grep` for the just-renamed identifiers returns zero hits. (`bunx tsc --noEmit` is NOT a clean gate — it has 2 pre-existing errors about `src/skill/assets.ts` importing `.md` files; ignore those, they are unrelated to this rename.)

---

## File Structure (rename map)

- `src/sync/` → `src/pull/` (directory). `classify.ts` / `classify.test.ts` keep their names inside it.
- `src/sync/sync.ts` → `src/pull/pull.ts`: `SyncOpts`→`PullOpts`, `syncProperty`→`pullProperty`, writer key `last_synced_at`→`last_pulled_at`.
- `src/sync/sync.test.ts` → `src/pull/pull.test.ts`: import + symbol + key references.
- `src/commands/property.ts`: import path + `pullProperty` call; `cmdPropertySync`→`cmdPropertyPull`; comment, help text, `synced:`→`pulled:`, `last_synced_at`→`last_pulled_at` readers/fields.
- `src/commands/_shared.ts`: `openSynced`→`openPulled`, its `last_synced_at` read, and the error message.
- `src/commands/{rules,des,libs,code,analytics}.ts`: `openSynced`→`openPulled` (import + calls).
- `src/cli.ts`: `cmdPropertySync`→`cmdPropertyPull` import; verb `sync`→`pull`.
- `src/cache/repo.test.ts`, `src/commands/commands.test.ts`: fixture `last_synced_at`→`last_pulled_at`.
- `src/cache/db.ts`: one comment.
- `skill/SKILL.md`, `README.md`: user-facing command references.

---

## Task 1: Rename the pull module (`src/sync/` → `src/pull/`, `syncProperty` → `pullProperty`)

**Files:**
- Move: `src/sync/` → `src/pull/`; `src/sync/sync.ts` → `src/pull/pull.ts`; `src/sync/sync.test.ts` → `src/pull/pull.test.ts`
- Modify: `src/pull/pull.ts`, `src/pull/pull.test.ts`, `src/commands/property.ts`

**Interfaces:**
- Produces: `export async function pullProperty(db: Database, client: ReactorClient, propertyId: string, _opts: PullOpts = {}): Promise<void>` in `src/pull/pull.ts`; `interface PullOpts { full?: boolean }`.
- Note: the `setMeta(db, "last_synced_at", …)` line stays UNCHANGED in this task (renamed in Task 2), so writer and readers still agree — tests stay green.

- [ ] **Step 1: Move the directory and files with git mv**

```bash
git mv src/sync src/pull
git mv src/pull/sync.ts src/pull/pull.ts
git mv src/pull/sync.test.ts src/pull/pull.test.ts
```

(`classify.ts` and `classify.test.ts` stay as-is inside `src/pull/`. The relative import `./classify.ts` inside `pull.ts` is unaffected by the directory move.)

- [ ] **Step 2: Update the test file to the new names (red)**

In `src/pull/pull.test.ts`, change the import and the symbol references. Replace line 3:

```ts
import { syncProperty } from "./sync.ts";
```
with:
```ts
import { pullProperty } from "./pull.ts";
```

Then replace every `syncProperty(` call and test-name occurrence with `pullProperty(`. The three call sites:
- Line 28: `await pullProperty(db, fakeClient as any, "PR1", { full: true });`
- Line 37: `await pullProperty(db, fakeClient as any, "PR1", { full: true });`
- Line 38: `await pullProperty(db, fakeClient as any, "PR1", { full: true });`

And the two test descriptions:
- Line 26: `test("pullProperty populates variables, triggers, refs, and meta", async () => {`
- Line 35: `test("pullProperty is idempotent across repeated runs (no double-count)", async () => {`

Leave line 32 (`getMeta(db, "last_synced_at")`) UNCHANGED — that key is Task 2.

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/pull/pull.test.ts`
Expected: FAIL — `pull.ts` still exports `syncProperty`, so importing `pullProperty` resolves to `undefined` and the call throws (or a resolution error). This proves the test now targets the new name.

- [ ] **Step 4: Rename the symbol and type in the implementation**

In `src/pull/pull.ts`, replace line 11:

```ts
interface SyncOpts { full?: boolean; }
```
with:
```ts
interface PullOpts { full?: boolean; }
```

And line 13:

```ts
export async function syncProperty(db: Database, client: ReactorClient, propertyId: string, _opts: SyncOpts = {}): Promise<void> {
```
with:
```ts
export async function pullProperty(db: Database, client: ReactorClient, propertyId: string, _opts: PullOpts = {}): Promise<void> {
```

(Leave line 106 `setMeta(db, "last_synced_at", new Date().toISOString());` unchanged — Task 2.)

- [ ] **Step 5: Update the production caller**

In `src/commands/property.ts`, replace line 7:

```ts
import { syncProperty } from "../sync/sync.ts";
```
with:
```ts
import { pullProperty } from "../pull/pull.ts";
```

And line 109:

```ts
  await syncProperty(db, client, rp.propertyId, { full: !!flags.full });
```
with:
```ts
  await pullProperty(db, client, rp.propertyId, { full: !!flags.full });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test src/pull/pull.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full suite + CLI smoke + completeness grep**

Run: `bun test`
Expected: all pass (58 tests).

Run: `bun run bin/cadmium.ts --help`
Expected: prints help (proves `property.ts` and all command modules still load with the new import).

Run: `grep -rn "syncProperty\|SyncOpts" src; grep -rn "sync/sync" src; ls src/sync 2>&1`
Expected: first two greps print NOTHING; `ls src/sync` reports "No such file or directory".

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: rename sync module to pull (syncProperty -> pullProperty)"
```

---

## Task 2: Rename the persisted metadata key `last_synced_at` → `last_pulled_at`

**Files:**
- Modify: `src/pull/pull.ts`, `src/commands/property.ts`, `src/commands/_shared.ts`, `src/pull/pull.test.ts`, `src/cache/repo.test.ts`, `src/commands/commands.test.ts`

**Interfaces:**
- Consumes: `pullProperty` (Task 1).
- Produces: the cache `meta` key is now `last_pulled_at`; the `status`/`overview` JSON output fields are now `last_pulled_at`.
- This is a cross-cutting rename of one string constant across its single writer and all readers/fixtures. They must change together to stay green.

- [ ] **Step 1: Update the test fixtures and assertions to the new key (red)**

In `src/pull/pull.test.ts`, line 32:
```ts
  expect(getMeta(db, "last_pulled_at")).not.toBeNull();
```

In `src/cache/repo.test.ts`, lines 57–58:
```ts
  setMeta(d, "last_pulled_at", "2026-05-22T10:00:00Z");
  expect(getMeta(d, "last_pulled_at")).toBe("2026-05-22T10:00:00Z");
```

In `src/commands/commands.test.ts`, line 7:
```ts
  setMeta(db, "last_pulled_at", "2026-05-22T00:00:00Z");
```

- [ ] **Step 2: Run the affected tests to verify the writer still uses the old key (red)**

Run: `bun test src/pull/pull.test.ts`
Expected: FAIL — `pull.ts` still writes `last_synced_at`, but the test now asserts `getMeta(db, "last_pulled_at")` is non-null, which is null. (`repo.test.ts` still passes since it sets and reads the same new key; `commands.test.ts` seeds meta but the assertion there is on a repo query, not the key — it will pass. The failing signal is `pull.test.ts`.)

- [ ] **Step 3: Rename the key in the writer**

In `src/pull/pull.ts`, line 106:
```ts
  setMeta(db, "last_pulled_at", new Date().toISOString());
```

- [ ] **Step 4: Rename the key in the readers**

In `src/commands/_shared.ts`, line 9 (inside `openSynced` — the helper itself is renamed in Task 3; only the key changes here):
```ts
  if (!getMeta(db, "last_pulled_at")) {
```

In `src/commands/property.ts`:
- Lines 119–121 (in `cmdPropertyStatus`):
```ts
  const pulled = getMeta(db, "last_pulled_at");
  const counts = countByType(db);
  console.log(format({ alias, last_pulled_at: pulled ?? null, counts }, { json: !!flags.json }));
```
- Line 132 (in `cmdPropertyOverview`):
```ts
    last_pulled_at: getMeta(db, "last_pulled_at"),
```

- [ ] **Step 5: Run the full suite to verify it passes**

Run: `bun test`
Expected: all pass (58 tests).

- [ ] **Step 6: Completeness grep**

Run: `grep -rn "last_synced_at" src`
Expected: NOTHING.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename last_synced_at meta key to last_pulled_at"
```

---

## Task 3: Rename the public verb, `openSynced` helper, and user-facing docs

**Files:**
- Modify: `src/cli.ts`, `src/commands/property.ts`, `src/commands/_shared.ts`, `src/commands/rules.ts`, `src/commands/des.ts`, `src/commands/libs.ts`, `src/commands/code.ts`, `src/commands/analytics.ts`, `src/cache/db.ts`, `skill/SKILL.md`, `README.md`

**Interfaces:**
- Consumes: `pullProperty` (Task 1), the `last_pulled_at` key (Task 2).
- Produces: CLI verb `cadmium property pull`; exported handler `cmdPropertyPull`; helper `openPulled(alias): Promise<Database>`.
- No unit test exists for `cli.ts`/docs, so this task's gate is the CLI smoke run (which loads `cli.ts` → every command module) plus `bun test` plus completeness `grep`.

- [ ] **Step 1: Rename the helper `openSynced` → `openPulled` and fix its error message**

In `src/commands/_shared.ts`, replace lines 7–13:

```ts
export async function openPulled(alias: string): Promise<Database> {
  const db = await openDb(alias);
  if (!getMeta(db, "last_pulled_at")) {
    throw new Error(`Property '${alias}' has never been pulled. Run: cadmium property pull ${alias}`);
  }
  return db;
}
```

(This corrects the old message's bug too — it previously said `cadmium sync ${alias}`, omitting the `property` noun.)

- [ ] **Step 2: Update all `openSynced` callers to `openPulled`**

In each of these files, change the import `openSynced`→`openPulled` and every `await openSynced(alias)`→`await openPulled(alias)`:

- `src/commands/rules.ts`: line 3 import; lines 9 and 21 calls.
- `src/commands/des.ts`: line 3 import; lines 9 and 24 calls.
- `src/commands/libs.ts`: line 3 import; line 9 call.
- `src/commands/code.ts`: line 3 import; line 11 call.
- `src/commands/analytics.ts`: line 3 import; line 12 call.
- `src/commands/property.ts`: line 11 import (`import { resolveAlias, openPulled } from "./_shared.ts";`); lines 128 and 144 calls.

- [ ] **Step 3: Rename the command handler and its verb registration**

In `src/commands/property.ts`:
- Line 99 comment:
```ts
// `cadmium property pull` — pull latest from Reactor.
```
- Line 100:
```ts
export const cmdPropertyPull: Cmd = async (_pos, flags) => {
```
- Line 111 (output field):
```ts
  console.log(format({ alias, pulled: true, counts, elapsed_ms: Date.now() - started }, { json: !!flags.json }));
```
- Line 59 (help text in `cmdPropertyInit`):
```ts
    console.log(`\nValidated and wrote ${path}. Try: cadmium property use ${propAlias} && cadmium property pull`);
```

In `src/cli.ts`:
- Line 5 — change `cmdPropertySync` to `cmdPropertyPull` in the import list from `./commands/property.ts`.
- Line 22 — change the verb entry:
```ts
    pull: cmdPropertyPull,
```

- [ ] **Step 4: Update the stale comment in db.ts**

In `src/cache/db.ts`, line 20:
```ts
    // Stale cache from a previous schema. Full pull rebuilds everything, so
```

- [ ] **Step 5: Update the skill and README**

In `skill/SKILL.md`, lines 13–14:
```markdown
2. If `last_pulled_at` is null → run `cadmium property pull` first.
3. If `last_pulled_at` is older than ~1 hour, or the question implies recent edits ("did someone just change…"), suggest `cadmium property pull` before answering.
```

In `README.md`:
- Line 24:
```markdown
cadmium property pull                    # pull latest from Reactor
```
- Line 33:
```markdown
cadmium property  init | use | show | list | pull | status | overview | dirty
```

- [ ] **Step 6: Run the full suite + CLI smoke + completeness grep**

Run: `bun test`
Expected: all pass (58 tests).

Run: `bun run bin/cadmium.ts --help`
Expected: the `property:` line lists `pull` (NOT `sync`) and all modules load without error.

Run: `bun run bin/cadmium.ts property pull`
Expected: it loads and exits with the expected runtime error for an unconfigured environment (e.g. `No property selected…` or a config-not-found message) — NOT a module-resolution/`Unknown verb` error. This confirms the verb is wired to `cmdPropertyPull`.

Run: `grep -rn "openSynced\|cmdPropertySync" src; grep -rn "property sync\|sync: cmd\|synced:" src; grep -rn "property sync\|last_synced_at" skill README.md`
Expected: all print NOTHING.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename property sync verb to pull (+ openPulled helper, docs)"
```

---

## Final verification (whole-rename gate)

After Task 3, confirm the domain verb is fully gone and nothing JS-`*Sync` was harmed:

- [ ] Run: `bun test` → 58 pass.
- [ ] Run: `grep -rniE "syncProperty|SyncOpts|openSynced|cmdPropertySync|last_synced_at|property sync" src skill README.md` → NOTHING.
- [ ] Run: `grep -rn "existsSync\|writeFileSync\|mkdirSync\|readFileSync" src | wc -l` → a NON-zero count (proves the JS `*Sync` calls were left intact).
- [ ] Run: `bun run bin/cadmium.ts --help` → shows `pull`, not `sync`.

## Out of scope (YAGNI)

- `push` / any write-back command.
- A `sync` → `pull` compatibility alias.
- Cache migration code (a re-pull is the migration).
- Fixing the pre-existing `tsc` `.md`-import errors in `src/skill/assets.ts` (unrelated to this rename).
