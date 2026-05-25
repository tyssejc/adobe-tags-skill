# Cadmium Noun-Verb CLI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the `cadmium` CLI from its ad-hoc verb-first MVP surface (`sync`, `ls rules`, `sets-variable`, `triggers`, `unpublished`, `refs`, `grep`) into a consistent gcloud-style `cadmium <noun> <verb>` surface, with property context (`property use`) so the alias doesn't have to be passed on every invocation, and with semantically-accurate `getters`/`setters` distinctions for data-element references.

**Architecture:** Two-level command dispatch (`<noun> <verb>`); a new `~/.config/adobe-tags/state.toml` file persists the default property alias; a `--property`/`-p` flag overrides it per-invocation; the scanner gains `_satellite.setVar()` tracking so `des refs --setters` returns real data instead of an empty list; the `data_element_refs` cache table gains a `kind` column (`getter`|`setter`) to distinguish directions; Adobe-Analytics-specific commands live under their own `analytics` namespace because the extension is not universal.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, `bun test`, `smol-toml`. No new dependencies.

**Pre-alpha context:** This breaks the entire command surface. No backward-compat aliases. The user (sole consumer) is on board.

**Reference:** Conversation thread that produced this plan establishes the noun-verb structure, context model, `getters`/`setters` semantics, and `analytics` namespacing.

---

## Final Command Surface

```
# Context
cadmium property init                                  # interactive setup (only no-property command)
cadmium property use      <alias>                      # set default property
cadmium property show                                  # show current default
cadmium property list                                  # list configured aliases

# Property-scoped (uses default or -p <alias>)
cadmium property sync       [-p <alias>] [--full]
cadmium property status     [-p <alias>]
cadmium property overview   [-p <alias>]
cadmium property dirty      [-p <alias>]

# Generic Launch resources
cadmium rules    list      [-p <alias>] [--disabled] [--untouched-since <date>]
cadmium rules    triggers  [-p <alias>]
cadmium des      list      [-p <alias>] [--unused] [--type <ddi>]
cadmium des      refs      <name> [-p <alias>] [--getters] [--setters]
cadmium libs     list      [-p <alias>] [--name <pattern>] [--state <state>] [--published-since <date>]
cadmium code     search    <pattern> [-p <alias>]

# Adobe Analytics extension
cadmium analytics setters  <var> [-p <alias>]

# Global flags (every command)
--json
-p, --property <alias>     # overrides state default
```

Long-form aliases supported: `data-elements` → `des`, `libraries` → `libs`, `variables` → `vars` (not used in canonical surface but accepted if typed).

---

## File Structure

```
src/
  cli.ts                          # REWRITTEN: <noun> <verb> dispatch
  command.ts                      # unchanged: Cmd type
  paths.ts                        # MODIFIED: add statePath()
  output.ts                       # unchanged
  config/
    config.ts                     # unchanged
    state.ts                      # NEW: load/save default property
    state.test.ts                 # NEW
  auth/token.ts                   # unchanged
  reactor/                        # unchanged
  cache/
    schema.ts                     # MODIFIED: add kind column, bump SCHEMA_VERSION → 5
    repo.ts                       # MODIFIED: getter/setter split, listRefs API
    repo.test.ts                  # MODIFIED
    db.ts                         # unchanged
  sync/
    classify.ts                   # MODIFIED: extract setVar refs, return kind
    classify.test.ts              # MODIFIED
    sync.ts                       # MODIFIED: pass kind to recorder
  commands/
    _shared.ts                    # MODIFIED: resolveAlias helper
    _shared.test.ts               # NEW
    property.ts                   # NEW: init/use/show/list/sync/status/overview/dirty
    rules.ts                      # NEW: list/triggers
    des.ts                        # NEW: list/refs
    libs.ts                       # NEW: list
    code.ts                       # NEW: search
    analytics.ts                  # NEW: setters
    init.ts                       # DELETED
    sync.ts                       # DELETED
    status.ts                     # DELETED
    overview.ts                   # DELETED
    ls.ts                         # DELETED
    refs.ts                       # DELETED
    setsVariable.ts               # DELETED
    grep.ts                       # DELETED
    triggers.ts                   # DELETED
    unpublished.ts                # DELETED
  util/fs.ts                      # unchanged
skill/SKILL.md                    # MODIFIED: new command examples
README.md                         # MODIFIED: new command examples
```

Rationale for file split: one file per noun keeps related verbs together (you reason about "everything you can do to rules" by reading one file). The `commands/` directory grows from 10 verb-files to 6 noun-files.

---

## Task 1: State file infrastructure

**Files:**
- Create: `src/config/state.ts`
- Create: `src/config/state.test.ts`
- Modify: `src/paths.ts`

State lives at `~/.config/adobe-tags/state.toml` (or `$XDG_CONFIG_HOME/adobe-tags/state.toml`). Separate from `config.toml` because state is machine-written and `config.toml` is hand-edited.

- [ ] **Step 1: Write the failing test**

Create `src/config/state.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadState, saveState } from "./state.ts";

function tmp(): string { return mkdtempSync(join(tmpdir(), "cadmium-state-test-")); }

test("loadState returns null default_property when file missing", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    expect(await loadState(path)).toEqual({ default_property: null });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("loadState reads default_property from existing file", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    writeFileSync(path, 'default_property = "vcs/web"\n');
    expect(await loadState(path)).toEqual({ default_property: "vcs/web" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("saveState writes default_property and is round-trippable", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    await saveState(path, { default_property: "acme/mobile" });
    expect(await loadState(path)).toEqual({ default_property: "acme/mobile" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("saveState clears default_property when null", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    await saveState(path, { default_property: "vcs/web" });
    await saveState(path, { default_property: null });
    expect(await loadState(path)).toEqual({ default_property: null });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/config/state.test.ts`
Expected: module not found error for `./state.ts`.

- [ ] **Step 3: Implement state.ts**

Create `src/config/state.ts`:

```ts
import { parse as parseToml } from "smol-toml";
import { ensureDirFor } from "../util/fs.ts";

export interface State {
  default_property: string | null;
}

export async function loadState(path: string): Promise<State> {
  const file = Bun.file(path);
  if (!(await file.exists())) return { default_property: null };
  const text = await file.text();
  const raw = parseToml(text) as { default_property?: unknown };
  const dp = typeof raw.default_property === "string" && raw.default_property.length > 0
    ? raw.default_property : null;
  return { default_property: dp };
}

export async function saveState(path: string, state: State): Promise<void> {
  await ensureDirFor(path);
  const lines: string[] = [];
  if (state.default_property) lines.push(`default_property = "${state.default_property}"`);
  await Bun.write(path, lines.join("\n") + (lines.length ? "\n" : ""));
}
```

- [ ] **Step 4: Add statePath() to paths.ts**

Modify `src/paths.ts` — add this export alongside `configPath()`:

```ts
export function statePath(env: Env = process.env): string {
  return `${base(env, "XDG_CONFIG_HOME", ".config")}/adobe-tags/state.toml`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/config/state.test.ts`
Expected: 4 pass, 0 fail.

Then: `bun test src/`
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/config/state.ts src/config/state.test.ts src/paths.ts
git commit -m "$(cat <<'EOF'
feat: add state.toml for persisting CLI defaults (e.g. default property)

Separate file from config.toml so machine-written state doesn't risk
mangling user-edited credential blocks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Scanner — extract `_satellite.setVar` refs and label getters vs setters

**Files:**
- Modify: `src/sync/classify.ts`
- Modify: `src/sync/classify.test.ts`

Today `extractDataElementRefs` returns flat string names. After this task it returns `{ name, kind }` pairs where `kind` is `'getter'` (from `%name%` tokens or `_satellite.getVar(...)`) or `'setter'` (from `_satellite.setVar(...)`).

- [ ] **Step 1: Write the failing test**

Modify `src/sync/classify.test.ts` — add these tests after the existing `extractDataElementRefs` tests:

```ts
test("extractDataElementRefs labels setters from _satellite.setVar() calls", () => {
  const settings = JSON.stringify({
    source: "_satellite.setVar('cartTotal', 42);\n" +
            "var x = _satellite.getVar('cartTotal');",
  });
  const refs = extractDataElementRefs(settings);
  expect(refs).toEqual(expect.arrayContaining([
    { name: "cartTotal", kind: "setter" },
    { name: "cartTotal", kind: "getter" },
  ]));
  expect(refs.length).toBe(2);
});

test("extractDataElementRefs labels %name% tokens as getters", () => {
  const settings = JSON.stringify({ value: "%cartId%" });
  expect(extractDataElementRefs(settings)).toEqual([{ name: "cartId", kind: "getter" }]);
});

test("extractDataElementRefs deduplicates within the same (name, kind) pair", () => {
  const settings = JSON.stringify({
    source: "_satellite.getVar('x'); _satellite.getVar('x');",
    value: "%x%",
  });
  expect(extractDataElementRefs(settings)).toEqual([{ name: "x", kind: "getter" }]);
});
```

Also update the existing `extractDataElementRefs` tests to expect `{ name, kind }` objects instead of strings. The existing assertions:
- `expect(extractDataElementRefs(settings).sort()).toEqual(["cartId", "userType"])` becomes
- `expect(extractDataElementRefs(settings).sort((a, b) => a.name.localeCompare(b.name))).toEqual([{ name: "cartId", kind: "getter" }, { name: "userType", kind: "getter" }])`

Apply this rewrite to the three pre-existing tests: `%name% tokens`, `_satellite.getVar('name') calls in custom code`, and `combines %token% and getVar() references without duplicates`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/sync/classify.test.ts`
Expected: existing tests fail (return type mismatch), new tests fail (no setter support).

- [ ] **Step 3: Implement the change**

Modify `src/sync/classify.ts`. Replace the `extractDataElementRefs` function and add the setVar regex:

```ts
const DE_TOKEN_RE = /%([^%]+)%/g;
// _satellite.getVar('name') / _satellite.getVar("name") — string literals only.
const DE_GETVAR_RE = /_satellite\.getVar\s*\(\s*(['"])(.*?)\1\s*\)/g;
// _satellite.setVar('name', value) — only the name (first arg) is tracked.
const DE_SETVAR_RE = /_satellite\.setVar\s*\(\s*(['"])(.*?)\1\s*\)/g;

export interface DataElementRef {
  name: string;
  kind: "getter" | "setter";
}

export function extractDataElementRefs(settings: string | null): DataElementRef[] {
  if (!settings) return [];
  const seen = new Set<string>();   // dedupe key: name + "::" + kind
  const out: DataElementRef[] = [];
  const push = (name: string, kind: "getter" | "setter") => {
    if (!name || name.length >= 200) return;
    const key = name + "::" + kind;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, kind });
  };
  let m: RegExpExecArray | null;
  DE_TOKEN_RE.lastIndex = 0;
  while ((m = DE_TOKEN_RE.exec(settings)) !== null) {
    if (m[1] && !m[1].includes("{")) push(m[1], "getter");
  }
  const code = extractCode(settings);
  if (code) {
    DE_GETVAR_RE.lastIndex = 0;
    while ((m = DE_GETVAR_RE.exec(code)) !== null) push(m[2], "getter");
    DE_SETVAR_RE.lastIndex = 0;
    while ((m = DE_SETVAR_RE.exec(code)) !== null) push(m[2], "setter");
  }
  return out;
}
```

Note: this requires `extractCode` to be defined before `extractDataElementRefs`. The file already has it that way after a previous patch — verify by reading `src/sync/classify.ts` before editing.

- [ ] **Step 4: Run test to verify they pass**

Run: `bun test src/sync/classify.test.ts`
Expected: all classify tests pass.

- [ ] **Step 5: Update the sync caller (will fail to compile until Task 3, that's OK — we'll commit together)**

Modify `src/sync/sync.ts` lines 47 and 61 (the two `for (const ref of extractDataElementRefs(...))` loops). Don't change behavior yet — pass `ref.name` to keep the existing call signature working:

```ts
for (const ref of extractDataElementRefs(settings)) recordDataElementRef(db, c.id, ref.name, ref.kind);
// (line 47)
for (const ref of extractDataElementRefs(settings)) recordDataElementRef(db, d.id, ref.name, ref.kind);
// (line 61)
```

The third argument is new — `recordDataElementRef` gets a `kind` parameter in Task 3. Anticipate the breakage: the next test run will fail to typecheck. Hold the commit until Task 3.

- [ ] **Step 6: Skip commit — wait for Task 3**

---

## Task 3: Cache schema — add `kind` column and update repo functions

**Files:**
- Modify: `src/cache/schema.ts`
- Modify: `src/cache/repo.ts`
- Modify: `src/cache/repo.test.ts`

- [ ] **Step 1: Bump schema and add column**

Modify `src/cache/schema.ts`. Change `SCHEMA_VERSION` from 4 to 5 and update the `data_element_refs` DDL:

```ts
export const SCHEMA_VERSION = 5;
```

And in the DDL string:

```sql
CREATE TABLE IF NOT EXISTS data_element_refs (
  source_id TEXT NOT NULL,
  data_element_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'getter'   -- 'getter' | 'setter'
);
CREATE INDEX IF NOT EXISTS idx_de_refs_name ON data_element_refs(data_element_name);
CREATE INDEX IF NOT EXISTS idx_de_refs_name_kind ON data_element_refs(data_element_name, kind);
```

The DEFAULT clause is defensive — production callers always pass `kind`, but `DEFAULT` lets older code paths keep working until they get updated.

- [ ] **Step 2: Write the failing repo tests**

Modify `src/cache/repo.test.ts`. Add a new test for kind-aware listing:

```ts
test("refsToDataElement splits getters and setters", () => {
  const d = db();
  upsertResource(d, { id: "rc1", type: "rule_component", name: "Reader", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 0, head_settings_json: null, updated_at: "x", search_text: "" });
  upsertResource(d, { id: "rc2", type: "rule_component", name: "Writer", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 0, head_settings_json: null, updated_at: "x", search_text: "" });
  recordDataElementRef(d, "rc1", "cartTotal", "getter");
  recordDataElementRef(d, "rc2", "cartTotal", "setter");
  // Default: both directions
  expect(refsToDataElement(d, "cartTotal").map((r) => `${r.kind}:${r.name}`).sort())
    .toEqual(["getter:Reader", "setter:Writer"]);
  // Filter to getters
  expect(refsToDataElement(d, "cartTotal", { kind: "getter" }).map((r) => r.name)).toEqual(["Reader"]);
  // Filter to setters
  expect(refsToDataElement(d, "cartTotal", { kind: "setter" }).map((r) => r.name)).toEqual(["Writer"]);
});
```

You also need to update the import line:

```ts
import {
  // ...existing imports...
  recordDataElementRef,
} from "./repo.ts";
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/cache/repo.test.ts`
Expected: TypeScript error — `recordDataElementRef` signature mismatch (only takes 3 args today; tests pass 4), `refsToDataElement` doesn't accept options.

- [ ] **Step 4: Update repo.ts function signatures**

Modify `src/cache/repo.ts`. Replace:

```ts
export function recordDataElementRef(db: Database, sourceId: string, name: string): void {
  db.query("INSERT INTO data_element_refs (source_id, data_element_name) VALUES (?, ?)").run(sourceId, name);
}
```

with:

```ts
export function recordDataElementRef(
  db: Database,
  sourceId: string,
  name: string,
  kind: "getter" | "setter",
): void {
  db.query("INSERT INTO data_element_refs (source_id, data_element_name, kind) VALUES (?, ?, ?)")
    .run(sourceId, name, kind);
}
```

Replace the existing `refsToDataElement`:

```ts
export function refsToDataElement(db: Database, name: string): { id: string; name: string; type: string }[] {
  return db.query(`SELECT r.id AS id, r.name AS name, r.type AS type
    FROM data_element_refs dr JOIN resources r ON r.id = dr.source_id
    WHERE dr.data_element_name = ? AND r.deleted = 0 ORDER BY r.type, r.name`).all(name) as { id: string; name: string; type: string }[];
}
```

with:

```ts
export interface DataElementRefRow {
  id: string;
  name: string;
  type: string;
  kind: "getter" | "setter";
}

export function refsToDataElement(
  db: Database,
  name: string,
  opts: { kind?: "getter" | "setter" } = {},
): DataElementRefRow[] {
  let sql = `SELECT r.id AS id, r.name AS name, r.type AS type, dr.kind AS kind
    FROM data_element_refs dr JOIN resources r ON r.id = dr.source_id
    WHERE dr.data_element_name = $name AND r.deleted = 0`;
  const params: Record<string, string> = { $name: name };
  if (opts.kind) { sql += " AND dr.kind = $kind"; params.$kind = opts.kind; }
  sql += " ORDER BY dr.kind, r.type, r.name";
  return db.query(sql).all(params) as DataElementRefRow[];
}
```

Also update the "unused" subquery in `listDataElements` (line ~83). It currently treats any entry in `data_element_refs` as "used". After this change, a data element with only a setter and no readers is still considered "used" (something writes to it). That matches the conversation conclusion — a setter IS a real reference. No SQL change needed; the existing `NOT IN (SELECT DISTINCT data_element_name FROM data_element_refs)` continues to work correctly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/`
Expected: all tests pass, including the new `refsToDataElement splits getters and setters` test.

- [ ] **Step 6: Commit Tasks 2 and 3 together**

```bash
git add src/sync/classify.ts src/sync/classify.test.ts src/sync/sync.ts \
        src/cache/schema.ts src/cache/repo.ts src/cache/repo.test.ts
git commit -m "$(cat <<'EOF'
feat: scanner tracks _satellite.setVar; data_element_refs gains kind column

Data elements have two access directions: getters (%name% tokens and
_satellite.getVar) and setters (_satellite.setVar). The MVP only tracked
getters, so 'who writes this DE' was invisible. This commit makes the
scanner emit { name, kind } refs and stores kind on each row, so a
future 'des refs --setters' query can return real data.

Bumps SCHEMA_VERSION to 5 to force cache rebuild on next sync.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `resolveAlias` helper in `_shared.ts`

**Files:**
- Modify: `src/commands/_shared.ts`
- Create: `src/commands/_shared.test.ts`

Every property-scoped command needs to figure out which alias to use. Precedence: `--property/-p` flag > positional alias (only for `property use` etc. where it's the subject, not the context) > state default. If none → error with helpful message.

- [ ] **Step 1: Write the failing test**

Create `src/commands/_shared.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveAlias } from "./_shared.ts";

function tmpStatePath(content?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cadmium-resolve-"));
  const path = join(dir, "state.toml");
  if (content) writeFileSync(path, content);
  return path;
}

test("resolveAlias prefers -p flag over state default", async () => {
  const sp = tmpStatePath('default_property = "vcs/web"\n');
  expect(await resolveAlias({ property: "acme/mobile" }, sp)).toBe("acme/mobile");
});

test("resolveAlias falls back to state default when no flag given", async () => {
  const sp = tmpStatePath('default_property = "vcs/web"\n');
  expect(await resolveAlias({}, sp)).toBe("vcs/web");
});

test("resolveAlias throws helpful error when no source provides an alias", async () => {
  const sp = tmpStatePath();
  await expect(resolveAlias({}, sp)).rejects.toThrow(/No property selected/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/commands/_shared.test.ts`
Expected: `resolveAlias` not exported.

- [ ] **Step 3: Implement `resolveAlias`**

Modify `src/commands/_shared.ts`. Add at the bottom:

```ts
import { loadState } from "../config/state.ts";
import { statePath } from "../paths.ts";

/**
 * Decide which property alias a command should operate on.
 * Precedence: -p/--property flag > saved state default.
 * Throws if neither source provides an alias.
 */
export async function resolveAlias(
  flags: Record<string, unknown>,
  stateFilePath: string = statePath(),
): Promise<string> {
  const fromFlag = flags.property;
  if (typeof fromFlag === "string" && fromFlag.length > 0) return fromFlag;
  const state = await loadState(stateFilePath);
  if (state.default_property) return state.default_property;
  throw new Error(
    "No property selected. Pass -p <alias>, or set a default with: cadmium property use <alias>",
  );
}
```

`requireAlias(positionals)` stays in the file untouched — `property use <alias>` and similar commands that take the alias as a subject still need it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/commands/_shared.test.ts`
Expected: 3 pass, 0 fail.

Also: `bun test src/`
Expected: all tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/_shared.ts src/commands/_shared.test.ts
git commit -m "$(cat <<'EOF'
feat: resolveAlias helper picks property from -p flag or state default

Foundation for the noun-verb CLI refactor. Lets commands operate on
the user's currently-selected property without re-typing the alias.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `property` noun module

**Files:**
- Create: `src/commands/property.ts`
- Delete (defer to Task 10): `src/commands/{init,sync,status,overview,unpublished}.ts`

This task creates the `property` noun's verbs but does not yet wire them into the dispatcher. The dispatcher rewrite (Task 10) is the swap point.

- [ ] **Step 1: Create `src/commands/property.ts`**

```ts
import { openDb } from "../cache/db.ts";
import { loadConfig, parseConfig, resolveProperty } from "../config/config.ts";
import { configPath, statePath } from "../paths.ts";
import { loadState, saveState } from "../config/state.ts";
import { getAccessToken } from "../auth/token.ts";
import { ReactorClient } from "../reactor/client.ts";
import { syncProperty } from "../sync/sync.ts";
import { countByType, getMeta, unpublishedResources } from "../cache/repo.ts";
import { ensureDirFor } from "../util/fs.ts";
import { format } from "../output.ts";
import { resolveAlias, openSynced } from "./_shared.ts";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Cmd } from "../command.ts";

// `cadmium property init` — interactive credential + property setup.
// Body lifted verbatim from the previous src/commands/init.ts.
export const cmdPropertyInit: Cmd = async () => {
  const rl = createInterface({ input, output });
  try {
    const ask = (q: string) => rl.question(q).then((s) => s.trim());
    const orgAlias = await ask("Org alias (e.g. acme): ");
    const imsOrg = await ask("IMS Org ID (xxx@AdobeOrg): ");
    const clientId = await ask("Client ID: ");
    const clientSecret = await ask("Client secret: ");
    const scope = await ask("Scope (paste from Dev Console S2S credential): ");
    const propAlias = await ask(`Property alias (e.g. ${orgAlias}/web): `);
    const propertyId = await ask("Property ID (PRxxxxxxxx): ");

    if (!/^[A-Za-z0-9_-]+$/.test(orgAlias)) {
      throw new Error("Org alias must contain only letters, numbers, dashes, or underscores.");
    }
    for (const [label, v] of [["IMS Org ID", imsOrg], ["Client ID", clientId], ["Client secret", clientSecret], ["Scope", scope], ["Property alias", propAlias], ["Property ID", propertyId]] as const) {
      if (/["\n\r]/.test(v)) throw new Error(`${label} contains an invalid character (double-quote or newline).`);
    }
    const toml = `[orgs.${orgAlias}]
ims_org_id = "${imsOrg}"
client_id = "${clientId}"
client_secret = "${clientSecret}"
scope = "${scope}"

[properties."${propAlias}"]
org = "${orgAlias}"
property_id = "${propertyId}"
`;
    const cfg = parseConfig(toml, process.env);
    const rp = resolveProperty(cfg, propAlias);
    const token = await getAccessToken(orgAlias, rp.org);
    const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });
    await client.get(`/properties/${propertyId}`);
    const path = configPath();
    await ensureDirFor(path);
    await Bun.write(path, toml);
    await Bun.$`chmod 600 ${path}`.quiet();
    console.log(`\nValidated and wrote ${path}. Try: cadmium property use ${propAlias} && cadmium property sync`);
    return 0;
  } finally { rl.close(); }
};

// `cadmium property use <alias>` — set default property in state.toml.
export const cmdPropertyUse: Cmd = async (positionals) => {
  const alias = positionals[0];
  if (!alias) throw new Error("usage: cadmium property use <alias>");
  // Validate the alias is configured before saving.
  const cfg = await loadConfig(configPath());
  resolveProperty(cfg, alias); // throws if unknown
  await saveState(statePath(), { default_property: alias });
  console.log(`Default property set to '${alias}'.`);
  return 0;
};

// `cadmium property show` — show current default.
export const cmdPropertyShow: Cmd = async (_pos, flags) => {
  const state = await loadState(statePath());
  console.log(format({ default_property: state.default_property }, { json: !!flags.json }));
  return 0;
};

// `cadmium property list` — list configured aliases from config.toml.
export const cmdPropertyList: Cmd = async (_pos, flags) => {
  const cfg = await loadConfig(configPath());
  const state = await loadState(statePath());
  const rows = Object.entries(cfg.properties).map(([alias, p]) => ({
    alias,
    org: p.org,
    property_id: p.property_id,
    default: alias === state.default_property,
  }));
  console.log(format(rows, { json: !!flags.json, columns: ["alias", "org", "property_id", "default"] }));
  return 0;
};

// `cadmium property sync` — pull latest from Reactor.
export const cmdPropertySync: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const cfg = await loadConfig(configPath());
  const rp = resolveProperty(cfg, alias);
  const orgName = cfg.properties[alias]!.org;
  const token = await getAccessToken(orgName, rp.org);
  const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });
  const db = await openDb(alias);
  const started = Date.now();
  await syncProperty(db, client, rp.propertyId, { full: !!flags.full });
  const counts = countByType(db);
  console.log(format({ alias, synced: true, counts, elapsed_ms: Date.now() - started }, { json: !!flags.json }));
  return 0;
};

// `cadmium property status` — cache freshness.
export const cmdPropertyStatus: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openDb(alias);
  const synced = getMeta(db, "last_synced_at");
  const counts = countByType(db);
  console.log(format({ alias, last_synced_at: synced ?? null, counts }, { json: !!flags.json }));
  return 0;
};

// `cadmium property overview` — high-level resource counts.
export const cmdPropertyOverview: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const counts = countByType(db);
  console.log(format({
    alias,
    last_synced_at: getMeta(db, "last_synced_at"),
    rules: counts.rule ?? 0,
    data_elements: counts.data_element ?? 0,
    rule_components: counts.rule_component ?? 0,
    extensions: counts.extension ?? 0,
  }, { json: !!flags.json }));
  return 0;
};

// `cadmium property dirty` — unpublished resources (dirty flag).
export const cmdPropertyDirty: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = unpublishedResources(db);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "updated_at", "id"] }));
  return 0;
};
```

- [ ] **Step 2: Spot-verify the imports compile**

Run: `bunx tsc --noEmit` to typecheck the whole project.
Expected: no type errors. The new file is unreferenced (dispatcher hasn't been touched yet) but should still compile cleanly. If `tsc` isn't on the path, try `bun build --no-bundle src/commands/property.ts` as a partial check.

- [ ] **Step 3: Skip commit — wait for the dispatcher swap (Task 10)**

This file is dead code until Task 10 wires it in.

---

## Task 6: `rules` noun module

**Files:**
- Create: `src/commands/rules.ts`

- [ ] **Step 1: Create `src/commands/rules.ts`**

```ts
import { listRules, triggerHistogram } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced } from "./_shared.ts";
import { resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium rules list [--disabled] [--untouched-since DATE]`
export const cmdRulesList: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = listRules(db, {
    disabledOnly: !!flags.disabled,
    untouchedSince: flags["untouched-since"] as string | undefined,
  }).map((r) => ({ name: r.name, enabled: r.enabled, updated_at: r.updated_at, id: r.id }));
  console.log(format(rows, { json: !!flags.json, columns: ["name", "enabled", "updated_at", "id"] }));
  return 0;
};

// `cadmium rules triggers` — histogram of event delegate ids across all rules.
export const cmdRulesTriggers: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = triggerHistogram(db);
  console.log(format(rows, { json: !!flags.json, columns: ["event_delegate_id", "count"] }));
  return 0;
};
```

- [ ] **Step 2: Skip commit — wait for Task 10**

---

## Task 7: `des` noun module (with `--getters`/`--setters`)

**Files:**
- Create: `src/commands/des.ts`

- [ ] **Step 1: Create `src/commands/des.ts`**

```ts
import { listDataElements, refsToDataElement } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium des list [--unused] [--type DDI]`
export const cmdDesList: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = listDataElements(db, {
    unusedOnly: !!flags.unused,
    type: flags.type as string | undefined,
  }).map((r) => ({ name: r.name, type: r.delegate_descriptor_id, id: r.id }));
  console.log(format(rows, { json: !!flags.json, columns: ["name", "type", "id"] }));
  return 0;
};

// `cadmium des refs <name> [--getters | --setters]`
// Default = both. Passing both --getters and --setters is also "both".
export const cmdDesRefs: Cmd = async (positionals, flags) => {
  const name = positionals[0];
  if (!name) throw new Error("usage: cadmium des refs <data-element-name>");
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const wantGetters = !!flags.getters;
  const wantSetters = !!flags.setters;
  // Default (neither flag) = both. Both flags = both.
  const kindFilter = wantGetters && !wantSetters
    ? { kind: "getter" as const }
    : !wantGetters && wantSetters
      ? { kind: "setter" as const }
      : {};
  const rows = refsToDataElement(db, name, kindFilter);
  console.log(format(rows, { json: !!flags.json, columns: ["kind", "type", "name", "id"] }));
  return 0;
};
```

- [ ] **Step 2: Skip commit — wait for Task 10**

---

## Task 8: `libs` and `code` noun modules

**Files:**
- Create: `src/commands/libs.ts`
- Create: `src/commands/code.ts`

- [ ] **Step 1: Create `src/commands/libs.ts`**

```ts
import { listLibraries } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium libs list [--name PAT] [--state STATE] [--published-since DATE]`
export const cmdLibsList: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = listLibraries(db, {
    namePattern: flags.name as string | undefined,
    state: flags.state as string | undefined,
    publishedSince: flags["published-since"] as string | undefined,
  }).map((l) => ({
    name: l.name,
    state: l.state,
    published_at: l.published_at,
    created_by_email: l.created_by_email,
    id: l.id,
  }));
  console.log(format(rows, {
    json: !!flags.json,
    columns: ["name", "state", "published_at", "created_by_email", "id"],
  }));
  return 0;
};
```

- [ ] **Step 2: Create `src/commands/code.ts`**

```ts
import { grepCode } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium code search <pattern>` — substring search across custom code.
export const cmdCodeSearch: Cmd = async (positionals, flags) => {
  const pattern = positionals[0];
  if (!pattern) throw new Error("usage: cadmium code search <pattern>");
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = grepCode(db, pattern);
  console.log(format(rows, { json: !!flags.json, columns: ["name", "id"] }));
  return 0;
};
```

- [ ] **Step 3: Skip commit — wait for Task 10**

---

## Task 9: `analytics` noun module

**Files:**
- Create: `src/commands/analytics.ts`

- [ ] **Step 1: Create `src/commands/analytics.ts`**

```ts
import { findResourcesSettingVariable } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium analytics setters <var>` — list resources that set the named
// Adobe Analytics variable (e.g. eVar20, event5, prop3).
export const cmdAnalyticsSetters: Cmd = async (positionals, flags) => {
  const variable = positionals[0];
  if (!variable) throw new Error("usage: cadmium analytics setters <eVarNN|eventNN|propNN>");
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = findResourcesSettingVariable(db, variable);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "id"] }));
  return 0;
};
```

- [ ] **Step 2: Skip commit — wait for Task 10**

---

## Task 10: Dispatcher rewrite — the swap

**Files:**
- Rewrite: `src/cli.ts`
- Delete: `src/commands/{init,sync,status,overview,ls,refs,setsVariable,grep,triggers,unpublished}.ts`

This is the moment the old commands die and the new ones come alive. After this task the CLI is fully on the new surface.

- [ ] **Step 1: Rewrite `src/cli.ts`**

```ts
import { parseArgs } from "node:util";
import type { Cmd } from "./command.ts";
import {
  cmdPropertyInit, cmdPropertyUse, cmdPropertyShow, cmdPropertyList,
  cmdPropertySync, cmdPropertyStatus, cmdPropertyOverview, cmdPropertyDirty,
} from "./commands/property.ts";
import { cmdRulesList, cmdRulesTriggers } from "./commands/rules.ts";
import { cmdDesList, cmdDesRefs } from "./commands/des.ts";
import { cmdLibsList } from "./commands/libs.ts";
import { cmdCodeSearch } from "./commands/code.ts";
import { cmdAnalyticsSetters } from "./commands/analytics.ts";

// noun -> verb -> handler
const COMMANDS: Record<string, Record<string, Cmd>> = {
  property: {
    init: cmdPropertyInit,
    use: cmdPropertyUse,
    show: cmdPropertyShow,
    list: cmdPropertyList,
    sync: cmdPropertySync,
    status: cmdPropertyStatus,
    overview: cmdPropertyOverview,
    dirty: cmdPropertyDirty,
  },
  rules: {
    list: cmdRulesList,
    triggers: cmdRulesTriggers,
  },
  des: {
    list: cmdDesList,
    refs: cmdDesRefs,
  },
  libs: {
    list: cmdLibsList,
  },
  code: {
    search: cmdCodeSearch,
  },
  analytics: {
    setters: cmdAnalyticsSetters,
  },
};

// Long-form noun aliases.
const NOUN_ALIASES: Record<string, string> = {
  "data-elements": "des",
  libraries: "libs",
  variables: "analytics",   // typed for symmetry; reserve for now
};

function helpText(): string {
  const lines = ["cadmium <noun> <verb> [args] [--json] [-p <alias>]\n"];
  for (const noun of Object.keys(COMMANDS)) {
    lines.push(`  ${noun}: ${Object.keys(COMMANDS[noun]!).join(", ")}`);
  }
  return lines.join("\n");
}

export async function run(argv: string[]): Promise<number> {
  const [rawNoun, verb, ...rest] = argv;
  if (!rawNoun || rawNoun === "--help" || rawNoun === "-h") {
    console.log(helpText());
    return 0;
  }
  const noun = NOUN_ALIASES[rawNoun] ?? rawNoun;
  const verbs = COMMANDS[noun];
  if (!verbs) { console.error(`Unknown noun: ${rawNoun}\n\n${helpText()}`); return 1; }
  if (!verb) {
    console.error(`Missing verb for '${rawNoun}'. Available: ${Object.keys(verbs).join(", ")}`);
    return 1;
  }
  const fn = verbs[verb];
  if (!fn) {
    console.error(`Unknown verb '${verb}' for '${rawNoun}'. Available: ${Object.keys(verbs).join(", ")}`);
    return 1;
  }
  const { values, positionals } = parseArgs({
    args: rest, allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      full: { type: "boolean", default: false },
      disabled: { type: "boolean", default: false },
      unused: { type: "boolean", default: false },
      getters: { type: "boolean", default: false },
      setters: { type: "boolean", default: false },
      "untouched-since": { type: "string" },
      "published-since": { type: "string" },
      type: { type: "string" },
      name: { type: "string" },
      state: { type: "string" },
      property: { type: "string", short: "p" },
    },
  });
  return fn(positionals, values);
}
```

- [ ] **Step 2: Delete old command files**

```bash
rm src/commands/init.ts src/commands/sync.ts src/commands/status.ts \
   src/commands/overview.ts src/commands/ls.ts src/commands/refs.ts \
   src/commands/setsVariable.ts src/commands/grep.ts src/commands/triggers.ts \
   src/commands/unpublished.ts
```

- [ ] **Step 3: Run the test suite**

Run: `bun test src/`
Expected: all tests pass (none of them imported the deleted files — they tested through `cache/repo.ts` and `sync/classify.ts`).

If any test references a deleted module, fix the import — most likely it'll be a stale import in `src/cli.ts` itself, which the rewrite above already removed.

- [ ] **Step 4: Smoke test the new CLI manually**

Run each of these and verify output looks right:

```bash
cadmium --help
cadmium property list
cadmium property use vcs/web          # if vcs/web is configured
cadmium property show
cadmium property status
cadmium property sync                 # may take ~20s; rebuilds cache to schema v5
cadmium property overview
cadmium property dirty
cadmium rules list --disabled
cadmium rules triggers
cadmium des list --unused
cadmium des refs page_breadcrumb
cadmium des refs page_breadcrumb --getters
cadmium des refs page_breadcrumb --setters
cadmium libs list --name Remove --published-since 2024-01-01
cadmium code search 'digitalData.cart'
cadmium analytics setters eVar20
```

Expected: every command returns either real data or a graceful "(no results)" message. No crashes, no "Unknown command".

- [ ] **Step 5: Commit the swap**

```bash
git add src/cli.ts src/commands/
git commit -m "$(cat <<'EOF'
refactor: replace verb-first CLI with gcloud-style noun-verb surface

Before: cadmium sync vcs/web, cadmium ls rules vcs/web,
        cadmium sets-variable vcs/web eVar20, cadmium unpublished vcs/web.
After:  cadmium property sync, cadmium rules list,
        cadmium analytics setters eVar20, cadmium property dirty.

A persisted default property (cadmium property use <alias>) means the
alias doesn't have to be on every invocation; -p/--property overrides
it. Adobe-Analytics-specific verbs (the only extension-specific
behavior we currently expose) get their own 'analytics' namespace.

`des refs` now defaults to returning both getters and setters,
narrowable with --getters or --setters thanks to the kind column
added in the previous commit.

Pre-alpha — no backward-compat aliases for the old command names.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update skill docs and README

**Files:**
- Modify: `skill/SKILL.md`
- Sync: `~/.claude/skills/adobe-tags/SKILL.md` (cp from repo)
- Modify: `README.md`

- [ ] **Step 1: Rewrite the skill's question→command table**

Edit `skill/SKILL.md`. Replace the `## Preflight` and `## Question → command` sections with:

```markdown
## Preflight (always)

1. Run `cadmium property status --json` (with `-p <alias>` if the property isn't the current default) to check freshness.
2. If `last_synced_at` is null → run `cadmium property sync` first.
3. If `last_synced_at` is older than ~1 hour, or the question implies recent edits ("did someone just change…"), suggest `cadmium property sync` before answering.
4. If the command errors that no property is selected → ask the user which alias to use or to run `cadmium property use <alias>`.
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
```

Then add this paragraph at the bottom of `## Interpreting results`:

```markdown
- `des refs` returns both directions by default. The `kind` column distinguishes `getter` (read via `%name%` or `_satellite.getVar`) from `setter` (write via `_satellite.setVar`).
```

- [ ] **Step 2: Sync the installed skill copy**

```bash
cp skill/SKILL.md /Users/ctysse/.claude/skills/adobe-tags/SKILL.md
diff skill/SKILL.md /Users/ctysse/.claude/skills/adobe-tags/SKILL.md && echo "synced"
```

Expected: no diff output, "synced" printed.

- [ ] **Step 3: Update README**

Edit `README.md` — replace any old-style command examples (e.g., `cadmium sync vcs/web`) with the new noun-verb forms. Keep changes minimal; if the README is sparse, just ensure the headline example matches the new shape.

Run: `grep -nE 'cadmium (sync|ls |refs |sets-variable|grep |triggers|unpublished)' README.md`
Expected: no matches after the edit.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md README.md
git commit -m "$(cat <<'EOF'
docs: update skill + README for noun-verb CLI

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Final integration check

**Files:** none modified

- [ ] **Step 1: Full test suite**

Run: `bun test src/`
Expected: all tests pass.

- [ ] **Step 2: End-to-end against vcs/web**

If a sync hasn't been done since Task 3's schema bump, run it now:

```bash
cadmium property sync -p vcs/web
```

Expected: completes in ~20s with a counts JSON.

Then verify the getters/setters split works on real data:

```bash
cadmium des refs page_breadcrumb --setters --json | jq 'length'
cadmium des refs page_breadcrumb --getters --json | jq 'length'
cadmium des refs page_breadcrumb --json | jq 'length'
```

Expected: setters + getters totals equal the unfiltered total. The `kind` field is present on each row in the unfiltered output.

- [ ] **Step 3: Spot-check one previously-orphaned DE**

Earlier we found that `gaOrderRevenue` calls `_satellite.getVar('orderPaymentTotal')`. After this refactor:

```bash
cadmium des refs orderPaymentTotal --setters --json
cadmium des refs orderPaymentTotal --getters --json
```

Expected: `--getters` includes `gaOrderRevenue` (and others); `--setters` shows whoever writes to it (or empty if it's only ever set by a `javascript-variable`-type DE, which doesn't write through setVar).

- [ ] **Step 4: No commit; report findings to user**

Tell the user the refactor is shipped and verified end-to-end. Mention any surprises from Step 3 (e.g., if `orderPaymentTotal --setters` is empty, that's notable — means the value is set by data-layer JS the scanner can't see, not by a rule).
