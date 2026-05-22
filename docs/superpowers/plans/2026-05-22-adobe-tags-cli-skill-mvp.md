# Adobe Tags CLI + Skill (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `cadmium` CLI (Bun + TypeScript) plus an `adobe-tags` Claude skill that lets a developer answer read-only synthesis questions about an Adobe Tags property without using the Adobe UI.

**Architecture:** A self-contained Bun CLI authenticates to the Adobe Reactor API via OAuth Server-to-Server, syncs a property's resource graph into a per-property SQLite cache (with FTS5 over custom code), and answers analysis questions by querying that cache. A thin `adobe-tags` skill is the playbook that tells Claude which `cadmium` command to run for a given question.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, `bun test`, `smol-toml` (config parsing), native `fetch`. No web framework, no ORM, no arg-parsing dependency (uses `util.parseArgs`).

**Scope (MVP):** Commands `init`, `sync`, `status`, `overview`, `ls rules`, `ls data-elements`, `refs`, `sets-variable`, `grep`, `triggers`, `unpublished`. Deferred to v1.1: `orgs ls`, `properties ls`, `ls extensions`, `ls libraries`, `show`, `unused`, `diff`.

**Reference:** Design spec at `docs/superpowers/specs/2026-05-21-adobe-tags-cli-skill-design.md`.

---

## File Structure

```
bin/cadmium.ts              # executable entry (shebang), delegates to src/cli.ts
src/
  cli.ts                    # command dispatch + global flag parsing
  paths.ts                  # config/cache path resolution (XDG-aware)
  output.ts                 # --json vs pretty formatting helper
  config/
    config.ts               # load + resolve config.toml, ${env:} substitution
    config.test.ts
  auth/
    token.ts                # OAuth S2S token exchange + on-disk token cache
    token.test.ts
  reactor/
    types.ts                # Reactor JSON:API resource shapes
    client.ts               # HTTP client: auth headers, pagination, filtering
    client.test.ts
  cache/
    schema.ts               # SQLite DDL (tables + FTS5)
    db.ts                   # open db for an alias, run migrations
    repo.ts                 # all read/write query functions
    repo.test.ts
  sync/
    classify.ts             # parse settings JSON: variables set, triggers, code, refs
    classify.test.ts
    sync.ts                 # full + incremental sync engine
    sync.test.ts
  commands/
    init.ts
    sync.ts
    status.ts
    overview.ts
    ls.ts
    refs.ts
    setsVariable.ts
    grep.ts
    triggers.ts
    unpublished.ts
skill/
  SKILL.md                  # source for the adobe-tags skill
  references/reactor-concepts.md
test/fixtures/              # recorded JSON:API responses for tests
package.json
tsconfig.json
.gitignore
```

Responsibility boundaries: `reactor/` knows the API but nothing about SQLite. `cache/` knows SQLite but nothing about HTTP. `sync/` orchestrates the two. `commands/` only call `cache/repo.ts` (analysis) or `sync/` (the sync command) and `output.ts`. `classify.ts` is pure functions over settings JSON, independently testable.

---

## Milestone 0: Project scaffold

### Task 0: Initialize Bun project

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `bin/cadmium.ts`, `src/cli.ts`

- [ ] **Step 1: Initialize Bun and add dependency**

```bash
bun init -y
bun add smol-toml
```

- [ ] **Step 2: Overwrite `package.json`**

```json
{
  "name": "cadmium",
  "version": "0.1.0",
  "type": "module",
  "bin": { "cadmium": "./bin/cadmium.ts" },
  "scripts": {
    "test": "bun test",
    "cadmium": "bun run bin/cadmium.ts"
  },
  "dependencies": {
    "smol-toml": "^1.3.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
*.db
*.db-*
.DS_Store
dist/
```

- [ ] **Step 5: Write `bin/cadmium.ts`**

```typescript
#!/usr/bin/env bun
import { run } from "../src/cli.ts";
run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
```

- [ ] **Step 6: Write minimal `src/cli.ts`**

```typescript
export async function run(argv: string[]): Promise<number> {
  const [command] = argv;
  if (!command || command === "--help") {
    console.log("cadmium <command> [args]\nCommands: init, sync, status, overview, ls, refs, sets-variable, grep, triggers, unpublished");
    return 0;
  }
  console.error(`Unknown command: ${command}`);
  return 1;
}
```

- [ ] **Step 7: Verify it runs**

Run: `bun run bin/cadmium.ts --help`
Expected: prints the usage line, exits 0.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore bin/cadmium.ts src/cli.ts bun.lockb
git commit -m "chore: scaffold cadmium Bun project"
```

---

## Milestone 1: Paths & config

### Task 1: Path resolution

**Files:**
- Create: `src/paths.ts`, `src/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun:test";
import { configPath, cacheDbPath } from "./paths.ts";

test("configPath honors XDG_CONFIG_HOME", () => {
  const p = configPath({ XDG_CONFIG_HOME: "/x/cfg", HOME: "/h" });
  expect(p).toBe("/x/cfg/adobe-tags/config.toml");
});

test("configPath falls back to HOME/.config", () => {
  const p = configPath({ HOME: "/h" });
  expect(p).toBe("/h/.config/adobe-tags/config.toml");
});

test("cacheDbPath splits org/property alias into nested dirs", () => {
  const p = cacheDbPath("acme/web", { HOME: "/h" });
  expect(p).toBe("/h/.cache/adobe-tags/acme/web.db");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/paths.test.ts`
Expected: FAIL — cannot find module `./paths.ts`.

- [ ] **Step 3: Implement `src/paths.ts`**

```typescript
type Env = Record<string, string | undefined>;

function base(env: Env, xdgVar: string, fallback: string): string {
  const xdg = env[xdgVar];
  if (xdg && xdg.length > 0) return xdg;
  const home = env.HOME ?? "";
  return `${home}/${fallback}`;
}

export function configPath(env: Env = process.env): string {
  return `${base(env, "XDG_CONFIG_HOME", ".config")}/adobe-tags/config.toml`;
}

export function cacheDir(env: Env = process.env): string {
  return `${base(env, "XDG_CACHE_HOME", ".cache")}/adobe-tags`;
}

export function cacheDbPath(alias: string, env: Env = process.env): string {
  return `${cacheDir(env)}/${alias}.db`;
}

export function tokenCachePath(org: string, env: Env = process.env): string {
  return `${cacheDir(env)}/.tokens/${org}.json`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/paths.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/paths.ts src/paths.test.ts
git commit -m "feat: add config/cache path resolution"
```

### Task 2: Config loading & alias resolution

**Files:**
- Create: `src/config/config.ts`, `src/config/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun:test";
import { parseConfig, resolveProperty } from "./config.ts";

const TOML = `
[orgs.acme]
ims_org_id = "ABC@AdobeOrg"
client_id = "cid"
client_secret = "\${env:ACME_SECRET}"
scope = "openid,AdobeID,read_organizations"

[properties."acme/web"]
org = "acme"
property_id = "PR123"
`;

test("parseConfig substitutes ${env:VAR}", () => {
  const cfg = parseConfig(TOML, { ACME_SECRET: "shh" });
  expect(cfg.orgs.acme.client_secret).toBe("shh");
});

test("parseConfig throws on missing env var", () => {
  expect(() => parseConfig(TOML, {})).toThrow(/ACME_SECRET/);
});

test("resolveProperty links property to its org", () => {
  const cfg = parseConfig(TOML, { ACME_SECRET: "shh" });
  const r = resolveProperty(cfg, "acme/web");
  expect(r.propertyId).toBe("PR123");
  expect(r.org.ims_org_id).toBe("ABC@AdobeOrg");
});

test("resolveProperty throws with available aliases on unknown alias", () => {
  const cfg = parseConfig(TOML, { ACME_SECRET: "shh" });
  expect(() => resolveProperty(cfg, "nope")).toThrow(/acme\/web/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/config/config.test.ts`
Expected: FAIL — cannot find module `./config.ts`.

- [ ] **Step 3: Implement `src/config/config.ts`**

```typescript
import { parse as parseToml } from "smol-toml";

export interface OrgConfig {
  ims_org_id: string;
  client_id: string;
  client_secret: string;
  scope: string;
}

export interface PropertyConfig {
  org: string;
  property_id: string;
}

export interface Config {
  orgs: Record<string, OrgConfig>;
  properties: Record<string, PropertyConfig>;
}

export interface ResolvedProperty {
  alias: string;
  propertyId: string;
  org: OrgConfig;
}

const ENV_RE = /\$\{env:([A-Z0-9_]+)\}/g;

function substitute(value: string, env: Record<string, string | undefined>): string {
  return value.replace(ENV_RE, (_m, name: string) => {
    const v = env[name];
    if (v === undefined) throw new Error(`Config references missing env var: ${name}`);
    return v;
  });
}

export function parseConfig(
  toml: string,
  env: Record<string, string | undefined> = process.env,
): Config {
  const raw = parseToml(toml) as any;
  const orgs: Record<string, OrgConfig> = {};
  for (const [name, o] of Object.entries(raw.orgs ?? {})) {
    const org = o as any;
    orgs[name] = {
      ims_org_id: org.ims_org_id,
      client_id: org.client_id,
      client_secret: substitute(org.client_secret, env),
      scope: org.scope ?? DEFAULT_SCOPE,
    };
  }
  const properties: Record<string, PropertyConfig> = {};
  for (const [alias, p] of Object.entries(raw.properties ?? {})) {
    const prop = p as any;
    properties[alias] = { org: prop.org, property_id: prop.property_id };
  }
  return { orgs, properties };
}

// Default scope; users override per-org with the string shown in their
// Adobe Developer Console S2S credential.
export const DEFAULT_SCOPE = "openid,AdobeID,read_organizations,additional_info.projectedProductContext";

export function resolveProperty(cfg: Config, alias: string): ResolvedProperty {
  const prop = cfg.properties[alias];
  if (!prop) {
    const available = Object.keys(cfg.properties).join(", ") || "(none configured)";
    throw new Error(`Unknown property alias '${alias}'. Available: ${available}`);
  }
  const org = cfg.orgs[prop.org];
  if (!org) throw new Error(`Property '${alias}' references undefined org '${prop.org}'`);
  return { alias, propertyId: prop.property_id, org };
}

export async function loadConfig(
  path: string,
  env: Record<string, string | undefined> = process.env,
): Promise<Config> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`No config at ${path}. Run 'cadmium init' to create one.`);
  }
  return parseConfig(await file.text(), env);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/config/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/
git commit -m "feat: config loading with env substitution and alias resolution"
```

---

## Milestone 2: Auth

### Task 3: OAuth S2S token client with disk cache

**Files:**
- Create: `src/auth/token.ts`, `src/auth/token.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun:test";
import { needsRefresh, buildTokenRequest, parseTokenResponse } from "./token.ts";

test("buildTokenRequest posts client_credentials form", () => {
  const req = buildTokenRequest({
    ims_org_id: "ABC@AdobeOrg",
    client_id: "cid",
    client_secret: "sec",
    scope: "openid,AdobeID",
  });
  expect(req.url).toBe("https://ims-na1.adobelogin.com/ims/token/v3");
  expect(req.body.get("grant_type")).toBe("client_credentials");
  expect(req.body.get("client_id")).toBe("cid");
  expect(req.body.get("scope")).toBe("openid,AdobeID");
});

test("parseTokenResponse computes absolute expiry", () => {
  const now = 1_000_000;
  const tok = parseTokenResponse({ access_token: "tk", expires_in: 86400 }, now);
  expect(tok.access_token).toBe("tk");
  expect(tok.expires_at).toBe(now + 86400 * 1000);
});

test("needsRefresh returns true within 5-min skew window", () => {
  const now = 1_000_000;
  expect(needsRefresh({ access_token: "x", expires_at: now + 4 * 60 * 1000 }, now)).toBe(true);
  expect(needsRefresh({ access_token: "x", expires_at: now + 10 * 60 * 1000 }, now)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/auth/token.test.ts`
Expected: FAIL — cannot find module `./token.ts`.

- [ ] **Step 3: Implement `src/auth/token.ts`**

```typescript
import type { OrgConfig } from "../config/config.ts";
import { tokenCachePath } from "../paths.ts";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const IMS_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";
const SKEW_MS = 5 * 60 * 1000;

export interface CachedToken {
  access_token: string;
  expires_at: number; // epoch ms
}

export function buildTokenRequest(org: OrgConfig): { url: string; body: URLSearchParams } {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", org.client_id);
  body.set("client_secret", org.client_secret);
  body.set("scope", org.scope);
  return { url: IMS_TOKEN_URL, body };
}

export function parseTokenResponse(json: { access_token: string; expires_in: number }, now = Date.now()): CachedToken {
  return { access_token: json.access_token, expires_at: now + json.expires_in * 1000 };
}

export function needsRefresh(tok: CachedToken, now = Date.now()): boolean {
  return tok.expires_at - now <= SKEW_MS;
}

async function readCache(org: string): Promise<CachedToken | null> {
  const file = Bun.file(tokenCachePath(org));
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as CachedToken;
  } catch {
    return null;
  }
}

async function writeCache(org: string, tok: CachedToken): Promise<void> {
  const path = tokenCachePath(org);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(tok));
  await Bun.$`chmod 600 ${path}`.quiet();
}

export async function getAccessToken(orgName: string, org: OrgConfig, fetchFn = fetch): Promise<string> {
  const cached = await readCache(orgName);
  if (cached && !needsRefresh(cached)) return cached.access_token;

  const { url, body } = buildTokenRequest(org);
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  const tok = parseTokenResponse(await res.json());
  await writeCache(orgName, tok);
  return tok.access_token;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/auth/token.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/
git commit -m "feat: OAuth S2S token client with disk cache"
```

---

## Milestone 3: Reactor API client

### Task 4: Reactor types & client with pagination

**Files:**
- Create: `src/reactor/types.ts`, `src/reactor/client.ts`, `src/reactor/client.test.ts`

- [ ] **Step 1: Write `src/reactor/types.ts`** (no test; pure types)

```typescript
export interface Resource<A = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: A;
  relationships?: Record<string, { data: { id: string; type: string } | { id: string; type: string }[] | null }>;
  meta?: Record<string, unknown>;
}

export interface ListResponse<A = Record<string, unknown>> {
  data: Resource<A>[];
  meta?: { pagination?: { current_page: number; total_pages: number } };
  links?: { next?: string };
}

export interface RuleAttrs { name: string; enabled: boolean; updated_at: string; revision_number: number; deleted_at?: string | null; }
export interface DataElementAttrs { name: string; enabled: boolean; updated_at: string; revision_number: number; settings: string | null; delegate_descriptor_id: string; deleted_at?: string | null; }
export interface RuleComponentAttrs { name: string; updated_at: string; revision_number: number; settings: string | null; delegate_descriptor_id: string; }
export interface ExtensionAttrs { name: string; enabled: boolean; updated_at: string; settings: string | null; delegate_descriptor_id: string; }
export interface LibraryAttrs { name: string; state: string; built_at: string | null; }
export interface EnvironmentAttrs { name: string; stage: string; }
```

- [ ] **Step 2: Write the failing test for the client**

```typescript
import { test, expect } from "bun:test";
import { ReactorClient } from "./client.ts";

function fakeFetch(pages: any[]) {
  let i = 0;
  return async (_url: string, _init?: any) => {
    const body = pages[Math.min(i, pages.length - 1)];
    i++;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/vnd.api+json" } });
  };
}

test("listAll follows links.next until exhausted", async () => {
  const fetchFn = fakeFetch([
    { data: [{ id: "1", type: "rules", attributes: {} }], links: { next: "https://reactor.adobe.io/next" } },
    { data: [{ id: "2", type: "rules", attributes: {} }], links: {} },
  ]);
  const client = new ReactorClient({ token: "tk", clientId: "cid", imsOrg: "ABC@AdobeOrg" }, fetchFn as any);
  const all = await client.listAll("/properties/PR1/rules");
  expect(all.map((r) => r.id)).toEqual(["1", "2"]);
});

test("sends required Adobe headers", async () => {
  let seen: any;
  const fetchFn = async (_url: string, init: any) => {
    seen = init.headers;
    return new Response(JSON.stringify({ data: [], links: {} }), { status: 200 });
  };
  const client = new ReactorClient({ token: "tk", clientId: "cid", imsOrg: "ABC@AdobeOrg" }, fetchFn as any);
  await client.listAll("/properties/PR1/rules");
  expect(seen.Authorization).toBe("Bearer tk");
  expect(seen["x-api-key"]).toBe("cid");
  expect(seen["x-gw-ims-org-id"]).toBe("ABC@AdobeOrg");
  expect(seen.Accept).toBe("application/vnd.api+json");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/reactor/client.test.ts`
Expected: FAIL — cannot find module `./client.ts`.

- [ ] **Step 4: Implement `src/reactor/client.ts`**

```typescript
import type { ListResponse, Resource } from "./types.ts";

const BASE = "https://reactor.adobe.io";

export interface ClientAuth { token: string; clientId: string; imsOrg: string; }

export class ReactorClient {
  constructor(private auth: ClientAuth, private fetchFn: typeof fetch = fetch) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.auth.token}`,
      "x-api-key": this.auth.clientId,
      "x-gw-ims-org-id": this.auth.imsOrg,
      Accept: "application/vnd.api+json",
    };
  }

  async get<A = Record<string, unknown>>(path: string): Promise<{ data: Resource<A> }> {
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Reactor GET ${path} failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as { data: Resource<A> };
  }

  async listAll<A = Record<string, unknown>>(path: string, query: Record<string, string> = {}): Promise<Resource<A>[]> {
    const params = new URLSearchParams({ "page[size]": "100", ...query });
    let url: string | undefined = path.startsWith("http") ? path : `${BASE}${path}?${params}`;
    const out: Resource<A>[] = [];
    while (url) {
      const res = await this.fetchFn(url, { headers: this.headers() });
      if (!res.ok) throw new Error(`Reactor GET ${url} failed (${res.status}): ${await res.text()}`);
      const body = (await res.json()) as ListResponse<A>;
      out.push(...body.data);
      url = body.links?.next;
    }
    return out;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/reactor/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/reactor/
git commit -m "feat: Reactor API client with pagination and auth headers"
```

### Task 5: Live smoke test (manual, with real credentials)

**Files:**
- Create: `scripts/smoke.ts`

This task verifies the spec's open items against the live API using the user's real S2S credentials — ground truth for endpoints, scopes, and `delegate_descriptor_id` values.

- [ ] **Step 1: Write `scripts/smoke.ts`**

```typescript
#!/usr/bin/env bun
import { loadConfig, resolveProperty } from "../src/config/config.ts";
import { configPath } from "../src/paths.ts";
import { getAccessToken } from "../src/auth/token.ts";
import { ReactorClient } from "../src/reactor/client.ts";

const alias = process.argv[2];
if (!alias) throw new Error("usage: bun scripts/smoke.ts <alias>");

const cfg = await loadConfig(configPath());
const rp = resolveProperty(cfg, alias);
const orgName = cfg.properties[alias]!.org;
const token = await getAccessToken(orgName, rp.org);
const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });

const rules = await client.listAll(`/properties/${rp.propertyId}/rules`);
console.log(`rules: ${rules.length}`);
const components = await client.listAll(`/properties/${rp.propertyId}/rule_components`);
const ids = new Set(components.map((c) => (c.attributes as any).delegate_descriptor_id));
console.log("rule_component delegate_descriptor_ids seen:");
for (const id of [...ids].sort()) console.log("  " + id);
```

- [ ] **Step 2: Create a real config**

Manually create `~/.config/adobe-tags/config.toml` with one real org + property (copy the `scope` string from the Adobe Developer Console S2S credential). Set `0600` perms.

- [ ] **Step 3: Run the smoke test**

Run: `bun scripts/smoke.ts <your-alias>`
Expected: prints a rule count and a list of `delegate_descriptor_id` values.

- [ ] **Step 4: Record findings**

In `skill/references/reactor-concepts.md` (created later in Task 16), note the actual `delegate_descriptor_id` for the Adobe Analytics "set variables" action and the custom-code action. Update `src/sync/classify.ts` constants in Task 8 if they differ from the assumed values below.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke.ts
git commit -m "chore: add live Reactor smoke test script"
```

---

## Milestone 4: Cache

### Task 6: SQLite schema & db opener

**Files:**
- Create: `src/cache/schema.ts`, `src/cache/db.ts`

- [ ] **Step 1: Write `src/cache/schema.ts`**

```typescript
export const SCHEMA_VERSION = 1;

export const DDL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                 -- rule | rule_component | data_element | extension
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  delegate_descriptor_id TEXT,
  head_revision_number INTEGER,
  head_settings_json TEXT,
  updated_at TEXT,
  search_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);

CREATE TABLE IF NOT EXISTS rule_components_ix (
  rule_id TEXT NOT NULL,
  rule_component_id TEXT NOT NULL,
  PRIMARY KEY (rule_id, rule_component_id)
);

CREATE TABLE IF NOT EXISTS variable_sets (
  rule_component_id TEXT NOT NULL,
  variable TEXT NOT NULL              -- e.g. eVar20, event5, prop3
);
CREATE INDEX IF NOT EXISTS idx_variable_sets_var ON variable_sets(variable);

CREATE TABLE IF NOT EXISTS data_element_refs (
  source_id TEXT NOT NULL,            -- resource referencing the data element
  data_element_name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_de_refs_name ON data_element_refs(data_element_name);

CREATE TABLE IF NOT EXISTS rule_triggers (
  rule_id TEXT NOT NULL,
  event_delegate_id TEXT NOT NULL     -- e.g. core::events::dom-ready
);

CREATE TABLE IF NOT EXISTS libraries (
  id TEXT PRIMARY KEY, name TEXT, state TEXT, built_at TEXT, environment_id TEXT
);
CREATE TABLE IF NOT EXISTS library_revisions (
  library_id TEXT NOT NULL, resource_id TEXT NOT NULL, revision_number INTEGER
);
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY, name TEXT, stage TEXT, active_library_id TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS resource_fts USING fts5(
  id UNINDEXED, name, search_text, content=''
);
`;
```

- [ ] **Step 2: Write `src/cache/db.ts`**

```typescript
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { cacheDbPath } from "../paths.ts";
import { DDL, SCHEMA_VERSION } from "./schema.ts";

export async function openDb(alias: string): Promise<Database> {
  const path = cacheDbPath(alias);
  await mkdir(dirname(path), { recursive: true });
  return openDbAt(path);
}

export function openDbAt(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(DDL);
  const row = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null;
  if (!row) {
    db.query("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
  }
  return db;
}
```

- [ ] **Step 3: Smoke-check the schema compiles**

Run: `bun -e 'import {openDbAt} from "./src/cache/db.ts"; const db=openDbAt(":memory:"); console.log("ok"); db.close();'`
Expected: prints `ok` (FTS5 + all tables create without error).

- [ ] **Step 4: Commit**

```bash
git add src/cache/schema.ts src/cache/db.ts
git commit -m "feat: SQLite cache schema and db opener"
```

### Task 7: Repository query functions

**Files:**
- Create: `src/cache/repo.ts`, `src/cache/repo.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { openDbAt } from "./db.ts";
import {
  upsertResource, linkRuleComponent, recordVariableSet, recordTrigger,
  findRulesSettingVariable, listRules, refsToDataElement, triggerHistogram, grepCode, setMeta, getMeta,
} from "./repo.ts";

function db(): Database { return openDbAt(":memory:"); }

test("findRulesSettingVariable joins component -> rule", () => {
  const d = db();
  upsertResource(d, { id: "r1", type: "rule", name: "Cart Add", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 3, head_settings_json: null, updated_at: "2026-01-01", search_text: "Cart Add" });
  upsertResource(d, { id: "rc1", type: "rule_component", name: "Set Vars", enabled: true, deleted: false, delegate_descriptor_id: "adobe-analytics::actions::set-variables", head_revision_number: 3, head_settings_json: "{}", updated_at: "2026-01-01", search_text: "" });
  linkRuleComponent(d, "r1", "rc1");
  recordVariableSet(d, "rc1", "eVar20");
  const rules = findRulesSettingVariable(d, "eVar20");
  expect(rules).toEqual([{ id: "r1", name: "Cart Add" }]);
});

test("triggerHistogram counts events", () => {
  const d = db();
  recordTrigger(d, "r1", "core::events::dom-ready");
  recordTrigger(d, "r2", "core::events::dom-ready");
  recordTrigger(d, "r3", "core::events::window-loaded");
  expect(triggerHistogram(d)).toEqual([
    { event_delegate_id: "core::events::dom-ready", count: 2 },
    { event_delegate_id: "core::events::window-loaded", count: 1 },
  ]);
});

test("grepCode finds resources via FTS", () => {
  const d = db();
  upsertResource(d, { id: "rc9", type: "rule_component", name: "Custom", enabled: true, deleted: false, delegate_descriptor_id: "core::actions::custom-code", head_revision_number: 1, head_settings_json: "{}", updated_at: "2026-01-01", search_text: "window.digitalData.foo = 1" });
  const hits = grepCode(d, "digitalData.foo");
  expect(hits.map((h) => h.id)).toContain("rc9");
});

test("meta round-trips", () => {
  const d = db();
  setMeta(d, "last_synced_at", "2026-05-22T10:00:00Z");
  expect(getMeta(d, "last_synced_at")).toBe("2026-05-22T10:00:00Z");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/cache/repo.test.ts`
Expected: FAIL — cannot find module `./repo.ts`.

- [ ] **Step 3: Implement `src/cache/repo.ts`**

```typescript
import type { Database } from "bun:sqlite";

export interface ResourceRow {
  id: string;
  type: "rule" | "rule_component" | "data_element" | "extension";
  name: string;
  enabled: boolean;
  deleted: boolean;
  delegate_descriptor_id: string | null;
  head_revision_number: number | null;
  head_settings_json: string | null;
  updated_at: string | null;
  search_text: string;
}

export function upsertResource(db: Database, r: ResourceRow): void {
  db.query(`INSERT INTO resources (id, type, name, enabled, deleted, delegate_descriptor_id, head_revision_number, head_settings_json, updated_at, search_text)
    VALUES ($id, $type, $name, $enabled, $deleted, $ddi, $rev, $settings, $updated, $search)
    ON CONFLICT(id) DO UPDATE SET name=$name, enabled=$enabled, deleted=$deleted, delegate_descriptor_id=$ddi,
      head_revision_number=$rev, head_settings_json=$settings, updated_at=$updated, search_text=$search`).run({
    $id: r.id, $type: r.type, $name: r.name, $enabled: r.enabled ? 1 : 0, $deleted: r.deleted ? 1 : 0,
    $ddi: r.delegate_descriptor_id, $rev: r.head_revision_number, $settings: r.head_settings_json,
    $updated: r.updated_at, $search: r.search_text,
  });
  db.query("DELETE FROM resource_fts WHERE id = ?").run(r.id);
  db.query("INSERT INTO resource_fts (id, name, search_text) VALUES (?, ?, ?)").run(r.id, r.name, r.search_text);
}

export function linkRuleComponent(db: Database, ruleId: string, rcId: string): void {
  db.query("INSERT OR IGNORE INTO rule_components_ix (rule_id, rule_component_id) VALUES (?, ?)").run(ruleId, rcId);
}

export function recordVariableSet(db: Database, rcId: string, variable: string): void {
  db.query("INSERT INTO variable_sets (rule_component_id, variable) VALUES (?, ?)").run(rcId, variable);
}

export function recordDataElementRef(db: Database, sourceId: string, name: string): void {
  db.query("INSERT INTO data_element_refs (source_id, data_element_name) VALUES (?, ?)").run(sourceId, name);
}

export function recordTrigger(db: Database, ruleId: string, eventDelegateId: string): void {
  db.query("INSERT INTO rule_triggers (rule_id, event_delegate_id) VALUES (?, ?)").run(ruleId, eventDelegateId);
}

export function findRulesSettingVariable(db: Database, variable: string): { id: string; name: string }[] {
  return db.query(`SELECT DISTINCT r.id AS id, r.name AS name
    FROM variable_sets vs
    JOIN rule_components_ix ix ON ix.rule_component_id = vs.rule_component_id
    JOIN resources r ON r.id = ix.rule_id
    WHERE vs.variable = ? AND r.deleted = 0
    ORDER BY r.name`).all(variable) as { id: string; name: string }[];
}

export interface ListRulesFilter { disabledOnly?: boolean; untouchedSince?: string; }

export function listRules(db: Database, f: ListRulesFilter = {}): ResourceRow[] {
  let sql = "SELECT * FROM resources WHERE type = 'rule' AND deleted = 0";
  const params: Record<string, unknown> = {};
  if (f.disabledOnly) sql += " AND enabled = 0";
  if (f.untouchedSince) { sql += " AND updated_at < $since"; params.$since = f.untouchedSince; }
  sql += " ORDER BY name";
  return db.query(sql).all(params) as ResourceRow[];
}

export function listDataElements(db: Database, opts: { unusedOnly?: boolean; type?: string } = {}): ResourceRow[] {
  let sql = "SELECT * FROM resources WHERE type = 'data_element' AND deleted = 0";
  const params: Record<string, unknown> = {};
  if (opts.type) { sql += " AND delegate_descriptor_id = $type"; params.$type = opts.type; }
  if (opts.unusedOnly) {
    sql += " AND name NOT IN (SELECT DISTINCT data_element_name FROM data_element_refs)";
  }
  sql += " ORDER BY name";
  return db.query(sql).all(params) as ResourceRow[];
}

export function refsToDataElement(db: Database, name: string): { id: string; name: string; type: string }[] {
  return db.query(`SELECT r.id AS id, r.name AS name, r.type AS type
    FROM data_element_refs dr JOIN resources r ON r.id = dr.source_id
    WHERE dr.data_element_name = ? AND r.deleted = 0 ORDER BY r.type, r.name`).all(name) as { id: string; name: string; type: string }[];
}

export function triggerHistogram(db: Database): { event_delegate_id: string; count: number }[] {
  return db.query(`SELECT event_delegate_id, COUNT(*) AS count FROM rule_triggers
    GROUP BY event_delegate_id ORDER BY count DESC, event_delegate_id`).all() as { event_delegate_id: string; count: number }[];
}

export function grepCode(db: Database, pattern: string): { id: string; name: string }[] {
  return db.query(`SELECT r.id AS id, r.name AS name FROM resource_fts f
    JOIN resources r ON r.id = f.id
    WHERE resource_fts MATCH $q AND r.deleted = 0 ORDER BY r.name`).all({ $q: `"${pattern}"` }) as { id: string; name: string }[];
}

export function setMeta(db: Database, key: string, value: string): void {
  db.query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function countByType(db: Database): Record<string, number> {
  const rows = db.query("SELECT type, COUNT(*) AS n FROM resources WHERE deleted = 0 GROUP BY type").all() as { type: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.type, r.n]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/cache/repo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cache/repo.ts src/cache/repo.test.ts
git commit -m "feat: cache repository query functions"
```

---

## Milestone 5: Classification & sync

### Task 8: Settings classifier (pure functions)

**Files:**
- Create: `src/sync/classify.ts`, `src/sync/classify.test.ts`

NOTE: The `delegate_descriptor_id` constants below are the assumed Adobe Analytics values. If the Task 5 smoke test reveals different IDs, update these constants.

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun:test";
import { extractVariables, extractDataElementRefs, extractCode } from "./classify.ts";

test("extractVariables pulls eVar/event/prop keys from set-variables settings", () => {
  const settings = JSON.stringify({ trackerProperties: { eVars: [{ name: "eVar20", value: "%cartId%" }], events: [{ name: "event5" }], props: [{ name: "prop3", value: "x" }] } });
  expect(extractVariables(settings).sort()).toEqual(["eVar20", "event5", "prop3"]);
});

test("extractDataElementRefs finds %name% tokens", () => {
  const settings = JSON.stringify({ value: "%cartId%-%userType%" });
  expect(extractDataElementRefs(settings).sort()).toEqual(["cartId", "userType"]);
});

test("extractCode returns source from custom-code settings", () => {
  const settings = JSON.stringify({ source: "window.x = 1;" });
  expect(extractCode(settings)).toBe("window.x = 1;");
});

test("extractVariables tolerates malformed JSON", () => {
  expect(extractVariables("not json")).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/sync/classify.test.ts`
Expected: FAIL — cannot find module `./classify.ts`.

- [ ] **Step 3: Implement `src/sync/classify.ts`**

```typescript
export const ANALYTICS_SET_VARS_DDI = "adobe-analytics::actions::set-variables";
export const CUSTOM_CODE_DDIS = ["core::actions::custom-code", "core::conditions::custom-code", "core::data-elements::custom-code"];

const DE_TOKEN_RE = /%([^%]+)%/g;

function safeParse(settings: string | null): any {
  if (!settings) return null;
  try { return JSON.parse(settings); } catch { return null; }
}

export function extractVariables(settings: string | null): string[] {
  const obj = safeParse(settings);
  if (!obj) return [];
  const tp = obj.trackerProperties ?? obj;
  const out: string[] = [];
  for (const group of ["eVars", "events", "props"]) {
    const arr = tp?.[group];
    if (Array.isArray(arr)) {
      for (const item of arr) if (item?.name) out.push(String(item.name));
    }
  }
  return out;
}

export function extractDataElementRefs(settings: string | null): string[] {
  if (!settings) return [];
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  DE_TOKEN_RE.lastIndex = 0;
  while ((m = DE_TOKEN_RE.exec(settings)) !== null) {
    if (m[1] && !m[1].includes("{") && m[1].length < 200) names.add(m[1]);
  }
  return [...names];
}

export function extractCode(settings: string | null): string | null {
  const obj = safeParse(settings);
  const src = obj?.source;
  return typeof src === "string" ? src : null;
}

export function buildSearchText(name: string, settings: string | null): string {
  const code = extractCode(settings);
  return [name, settings ?? "", code ?? ""].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/sync/classify.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/
git commit -m "feat: settings classifier for variables, refs, and code"
```

### Task 9: Sync engine

**Files:**
- Create: `src/sync/sync.ts`, `src/sync/sync.test.ts`

- [ ] **Step 1: Write the failing test** (drives sync against a fake client interface)

```typescript
import { test, expect } from "bun:test";
import { openDbAt } from "../cache/db.ts";
import { syncProperty } from "./sync.ts";
import { findRulesSettingVariable, triggerHistogram, refsToDataElement, getMeta } from "../cache/repo.ts";

const fakeClient = {
  async listAll(path: string) {
    if (path.endsWith("/rules")) return [{ id: "r1", type: "rules", attributes: { name: "Cart", enabled: true, updated_at: "2026-01-01", revision_number: 2 }, relationships: {} }];
    if (path.endsWith("/rule_components")) return [{
      id: "rc1", type: "rule_components",
      attributes: { name: "SetVars", updated_at: "2026-01-01", revision_number: 2, delegate_descriptor_id: "adobe-analytics::actions::set-variables", settings: JSON.stringify({ trackerProperties: { eVars: [{ name: "eVar20", value: "%cartId%" }] } }) },
      relationships: { rule: { data: { id: "r1", type: "rules" } } },
    }, {
      id: "rc2", type: "rule_components",
      attributes: { name: "Trigger", updated_at: "2026-01-01", revision_number: 2, delegate_descriptor_id: "core::events::dom-ready", settings: null },
      relationships: { rule: { data: { id: "r1", type: "rules" } } },
    }];
    if (path.endsWith("/data_elements")) return [{ id: "de1", type: "data_elements", attributes: { name: "cartId", enabled: true, updated_at: "2026-01-01", revision_number: 1, delegate_descriptor_id: "core::data-elements::javascript-variable", settings: null } }];
    if (path.endsWith("/extensions")) return [];
    if (path.endsWith("/libraries")) return [];
    if (path.endsWith("/environments")) return [];
    return [];
  },
};

test("syncProperty populates variables, triggers, refs, and meta", async () => {
  const db = openDbAt(":memory:");
  await syncProperty(db, fakeClient as any, "PR1", { full: true });
  expect(findRulesSettingVariable(db, "eVar20")).toEqual([{ id: "r1", name: "Cart" }]);
  expect(triggerHistogram(db)).toEqual([{ event_delegate_id: "core::events::dom-ready", count: 1 }]);
  expect(refsToDataElement(db, "cartId").map((x) => x.id)).toContain("rc1");
  expect(getMeta(db, "last_synced_at")).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/sync/sync.test.ts`
Expected: FAIL — cannot find module `./sync.ts`.

- [ ] **Step 3: Implement `src/sync/sync.ts`**

```typescript
import type { Database } from "bun:sqlite";
import type { ReactorClient } from "../reactor/client.ts";
import {
  upsertResource, linkRuleComponent, recordVariableSet, recordDataElementRef, recordTrigger, setMeta,
} from "../cache/repo.ts";
import {
  extractVariables, extractDataElementRefs, buildSearchText, ANALYTICS_SET_VARS_DDI,
} from "./classify.ts";

interface SyncOpts { full?: boolean; }

export async function syncProperty(db: Database, client: ReactorClient, propertyId: string, _opts: SyncOpts = {}): Promise<void> {
  const rules = await client.listAll(`/properties/${propertyId}/rules`);
  for (const r of rules) {
    const a = r.attributes as any;
    upsertResource(db, {
      id: r.id, type: "rule", name: a.name, enabled: !!a.enabled, deleted: !!a.deleted_at,
      delegate_descriptor_id: null, head_revision_number: a.revision_number ?? null,
      head_settings_json: null, updated_at: a.updated_at ?? null, search_text: a.name,
    });
  }

  const components = await client.listAll(`/properties/${propertyId}/rule_components`);
  for (const c of components) {
    const a = c.attributes as any;
    const ddi: string = a.delegate_descriptor_id ?? "";
    const settings: string | null = a.settings ?? null;
    upsertResource(db, {
      id: c.id, type: "rule_component", name: a.name, enabled: true, deleted: false,
      delegate_descriptor_id: ddi, head_revision_number: a.revision_number ?? null,
      head_settings_json: settings, updated_at: a.updated_at ?? null,
      search_text: buildSearchText(a.name, settings),
    });
    const ruleId = c.relationships?.rule?.data && !Array.isArray(c.relationships.rule.data)
      ? c.relationships.rule.data.id : undefined;
    if (ruleId) {
      linkRuleComponent(db, ruleId, c.id);
      if (ddi.includes("::events::")) recordTrigger(db, ruleId, ddi);
    }
    if (ddi === ANALYTICS_SET_VARS_DDI) {
      for (const v of extractVariables(settings)) recordVariableSet(db, c.id, v);
    }
    for (const ref of extractDataElementRefs(settings)) recordDataElementRef(db, c.id, ref);
  }

  const dataElements = await client.listAll(`/properties/${propertyId}/data_elements`);
  for (const d of dataElements) {
    const a = d.attributes as any;
    const settings: string | null = a.settings ?? null;
    upsertResource(db, {
      id: d.id, type: "data_element", name: a.name, enabled: !!a.enabled, deleted: !!a.deleted_at,
      delegate_descriptor_id: a.delegate_descriptor_id ?? null, head_revision_number: a.revision_number ?? null,
      head_settings_json: settings, updated_at: a.updated_at ?? null, search_text: buildSearchText(a.name, settings),
    });
    for (const ref of extractDataElementRefs(settings)) recordDataElementRef(db, d.id, ref);
  }

  const extensions = await client.listAll(`/properties/${propertyId}/extensions`);
  for (const e of extensions) {
    const a = e.attributes as any;
    upsertResource(db, {
      id: e.id, type: "extension", name: a.name, enabled: !!a.enabled, deleted: false,
      delegate_descriptor_id: a.delegate_descriptor_id ?? null, head_revision_number: null,
      head_settings_json: a.settings ?? null, updated_at: a.updated_at ?? null,
      search_text: buildSearchText(a.name, a.settings ?? null),
    });
  }

  setMeta(db, "last_synced_at", new Date().toISOString());
}
```

NOTE: incremental sync (the `filter[updated_at][GT]` path) is deferred — `syncProperty` currently does a full pull every time. The `--full` flag is therefore a no-op for now and the `sync` command always rebuilds. Incremental is a v1.1 task; full sync is correct and sufficient for MVP. (This is the one intentional simplification vs. the spec; flagged in the handoff.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/sync/sync.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/sync/sync.ts src/sync/sync.test.ts
git commit -m "feat: full-pull sync engine"
```

---

## Milestone 6: Output helper & CLI wiring

### Task 10: Output formatter

**Files:**
- Create: `src/output.ts`, `src/output.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun:test";
import { format } from "./output.ts";

test("format json emits stable JSON", () => {
  expect(format({ a: 1 }, { json: true })).toBe('{\n  "a": 1\n}');
});

test("format pretty renders rows as a table-ish list", () => {
  const out = format([{ name: "X", id: "1" }], { json: false, columns: ["name", "id"] });
  expect(out).toContain("X");
  expect(out).toContain("1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/output.test.ts`
Expected: FAIL — cannot find module `./output.ts`.

- [ ] **Step 3: Implement `src/output.ts`**

```typescript
export interface FormatOpts { json: boolean; columns?: string[]; }

export function format(data: unknown, opts: FormatOpts): string {
  if (opts.json) return JSON.stringify(data, null, 2);
  if (Array.isArray(data)) {
    if (data.length === 0) return "(no results)";
    const cols = opts.columns ?? Object.keys(data[0] as object);
    const header = cols.join("\t");
    const rows = data.map((row) => cols.map((c) => String((row as any)[c] ?? "")).join("\t"));
    return [header, ...rows].join("\n");
  }
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/output.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/output.ts src/output.test.ts
git commit -m "feat: output formatter (json + pretty)"
```

### Task 11: CLI dispatch with global flags

**Files:**
- Modify: `src/cli.ts` (replace the stub from Task 0)

- [ ] **Step 1: Replace `src/cli.ts`**

```typescript
import { parseArgs } from "node:util";
import { cmdInit } from "./commands/init.ts";
import { cmdSync } from "./commands/sync.ts";
import { cmdStatus } from "./commands/status.ts";
import { cmdOverview } from "./commands/overview.ts";
import { cmdLs } from "./commands/ls.ts";
import { cmdRefs } from "./commands/refs.ts";
import { cmdSetsVariable } from "./commands/setsVariable.ts";
import { cmdGrep } from "./commands/grep.ts";
import { cmdTriggers } from "./commands/triggers.ts";
import { cmdUnpublished } from "./commands/unpublished.ts";

export type Cmd = (rest: string[], flags: Record<string, unknown>) => Promise<number>;

const COMMANDS: Record<string, Cmd> = {
  init: cmdInit, sync: cmdSync, status: cmdStatus, overview: cmdOverview,
  ls: cmdLs, refs: cmdRefs, "sets-variable": cmdSetsVariable, grep: cmdGrep,
  triggers: cmdTriggers, unpublished: cmdUnpublished,
};

export async function run(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help") {
    console.log("cadmium <command> [args] [--json]\nCommands: " + Object.keys(COMMANDS).join(", "));
    return 0;
  }
  const fn = COMMANDS[command];
  if (!fn) { console.error(`Unknown command: ${command}`); return 1; }
  const { values, positionals } = parseArgs({
    args: rest, allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      full: { type: "boolean", default: false },
      disabled: { type: "boolean", default: false },
      unused: { type: "boolean", default: false },
      "group-by-action": { type: "boolean", default: false },
      "untouched-since": { type: "string" },
      type: { type: "string" },
      env: { type: "string", default: "production" },
      org: { type: "string" },
    },
  });
  return fn(positionals, values);
}
```

- [ ] **Step 2: Commit** (commands implemented next; this will not run until they exist)

```bash
git add src/cli.ts
git commit -m "feat: CLI dispatch with global flag parsing"
```

---

## Milestone 7: Commands

Shared helper used by analysis commands: each opens the cache db for an alias and checks it has been synced. Define it inline in the first command and import thereafter.

### Task 12: Analysis commands — status, overview, ls, refs, sets-variable, grep, triggers

**Files:**
- Create: `src/commands/_shared.ts`, `src/commands/status.ts`, `src/commands/overview.ts`, `src/commands/ls.ts`, `src/commands/refs.ts`, `src/commands/setsVariable.ts`, `src/commands/grep.ts`, `src/commands/triggers.ts`

- [ ] **Step 1: Write `src/commands/_shared.ts`**

```typescript
import type { Database } from "bun:sqlite";
import { openDb } from "../cache/db.ts";
import { getMeta } from "../cache/repo.ts";

export async function openSynced(alias: string): Promise<Database> {
  const db = await openDb(alias);
  if (!getMeta(db, "last_synced_at")) {
    throw new Error(`Property '${alias}' has never been synced. Run: cadmium sync ${alias}`);
  }
  return db;
}

export function requireAlias(positionals: string[]): string {
  const alias = positionals[0];
  if (!alias) throw new Error("Missing <alias> argument");
  return alias;
}
```

- [ ] **Step 2: Write the command files**

`src/commands/status.ts`:
```typescript
import { openDb } from "../cache/db.ts";
import { getMeta, countByType } from "../cache/repo.ts";
import { format } from "../output.ts";
import { requireAlias } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdStatus: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const db = await openDb(alias);
  const synced = getMeta(db, "last_synced_at");
  const counts = countByType(db);
  console.log(format({ alias, last_synced_at: synced ?? null, counts }, { json: !!flags.json }));
  return 0;
};
```

`src/commands/overview.ts`:
```typescript
import { getMeta, countByType } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdOverview: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const db = await openSynced(alias);
  const counts = countByType(db);
  const summary = {
    alias,
    last_synced_at: getMeta(db, "last_synced_at"),
    rules: counts.rule ?? 0,
    data_elements: counts.data_element ?? 0,
    rule_components: counts.rule_component ?? 0,
    extensions: counts.extension ?? 0,
  };
  console.log(format(summary, { json: !!flags.json }));
  return 0;
};
```

`src/commands/ls.ts`:
```typescript
import { listRules, listDataElements } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdLs: Cmd = async (positionals, flags) => {
  const [object, alias] = positionals;
  if (!object || !alias) throw new Error("usage: cadmium ls <rules|data-elements> <alias>");
  const db = await openSynced(alias);
  if (object === "rules") {
    const rows = listRules(db, {
      disabledOnly: !!flags.disabled,
      untouchedSince: flags["untouched-since"] as string | undefined,
    }).map((r) => ({ name: r.name, enabled: r.enabled, updated_at: r.updated_at, id: r.id }));
    console.log(format(rows, { json: !!flags.json, columns: ["name", "enabled", "updated_at", "id"] }));
    return 0;
  }
  if (object === "data-elements") {
    const rows = listDataElements(db, { unusedOnly: !!flags.unused, type: flags.type as string | undefined })
      .map((r) => ({ name: r.name, type: r.delegate_descriptor_id, id: r.id }));
    console.log(format(rows, { json: !!flags.json, columns: ["name", "type", "id"] }));
    return 0;
  }
  throw new Error(`Unknown ls object '${object}' (expected: rules, data-elements)`);
};
```

`src/commands/refs.ts`:
```typescript
import { refsToDataElement } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdRefs: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const name = positionals[1];
  if (!name) throw new Error("usage: cadmium refs <alias> <data-element-name>");
  const db = await openSynced(alias);
  const rows = refsToDataElement(db, name);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "id"] }));
  return 0;
};
```

`src/commands/setsVariable.ts`:
```typescript
import { findRulesSettingVariable } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdSetsVariable: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const variable = positionals[1];
  if (!variable) throw new Error("usage: cadmium sets-variable <alias> <eVarNN|eventNN|propNN>");
  const db = await openSynced(alias);
  const rows = findRulesSettingVariable(db, variable);
  console.log(format(rows, { json: !!flags.json, columns: ["name", "id"] }));
  return 0;
};
```

`src/commands/grep.ts`:
```typescript
import { grepCode } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdGrep: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const pattern = positionals[1];
  if (!pattern) throw new Error("usage: cadmium grep <alias> <pattern>");
  const db = await openSynced(alias);
  const rows = grepCode(db, pattern);
  console.log(format(rows, { json: !!flags.json, columns: ["name", "id"] }));
  return 0;
};
```

`src/commands/triggers.ts`:
```typescript
import { triggerHistogram } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdTriggers: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const db = await openSynced(alias);
  const rows = triggerHistogram(db);
  console.log(format(rows, { json: !!flags.json, columns: ["event_delegate_id", "count"] }));
  return 0;
};
```

- [ ] **Step 3: Add an end-to-end command test**

Create `src/commands/commands.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { openDbAt } from "../cache/db.ts";
import { upsertResource, linkRuleComponent, recordVariableSet, setMeta } from "../cache/repo.ts";
import { findRulesSettingVariable } from "../cache/repo.ts";

test("seeded db answers sets-variable query through repo", () => {
  const db = openDbAt(":memory:");
  setMeta(db, "last_synced_at", "2026-05-22T00:00:00Z");
  upsertResource(db, { id: "r1", type: "rule", name: "Cart", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "2026-01-01", search_text: "Cart" });
  upsertResource(db, { id: "rc1", type: "rule_component", name: "SetVars", enabled: true, deleted: false, delegate_descriptor_id: "adobe-analytics::actions::set-variables", head_revision_number: 1, head_settings_json: "{}", updated_at: "2026-01-01", search_text: "" });
  linkRuleComponent(db, "r1", "rc1");
  recordVariableSet(db, "rc1", "event5");
  expect(findRulesSettingVariable(db, "event5")).toEqual([{ id: "r1", name: "Cart" }]);
});
```

Run: `bun test src/commands/commands.test.ts`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add src/commands/
git commit -m "feat: status, overview, ls, refs, sets-variable, grep, triggers commands"
```

### Task 13: `sync` command

**Files:**
- Create: `src/commands/sync.ts`

- [ ] **Step 1: Write `src/commands/sync.ts`**

```typescript
import { openDb } from "../cache/db.ts";
import { loadConfig, resolveProperty } from "../config/config.ts";
import { configPath } from "../paths.ts";
import { getAccessToken } from "../auth/token.ts";
import { ReactorClient } from "../reactor/client.ts";
import { syncProperty } from "../sync/sync.ts";
import { countByType } from "../cache/repo.ts";
import { format } from "../output.ts";
import { requireAlias } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdSync: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
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
```

- [ ] **Step 2: Type-check the whole project**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the CLI help lists all commands**

Run: `bun run bin/cadmium.ts --help`
Expected: prints `Commands: init, sync, status, overview, ls, refs, sets-variable, grep, triggers, unpublished`.

- [ ] **Step 4: Commit**

```bash
git add src/commands/sync.ts
git commit -m "feat: sync command"
```

### Task 14: `unpublished` command + library/environment sync

**Files:**
- Modify: `src/sync/sync.ts` (add libraries, environments, library_revisions population)
- Modify: `src/cache/repo.ts` (add `unpublishedResources`)
- Create: `src/commands/unpublished.ts`
- Modify: `src/cache/repo.test.ts` (add a test for `unpublishedResources`)

- [ ] **Step 1: Write the failing repo test**

Add to `src/cache/repo.test.ts`:
```typescript
import { recordLibrary, recordEnvironment, recordLibraryRevision, unpublishedResources } from "./repo.ts";

test("unpublishedResources lists head revisions ahead of production library", () => {
  const d = db();
  upsertResource(d, { id: "r1", type: "rule", name: "Cart", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 5, head_settings_json: null, updated_at: "2026-01-01", search_text: "Cart" });
  recordEnvironment(d, { id: "env-prod", name: "Production", stage: "production", active_library_id: "lib1" });
  recordLibrary(d, { id: "lib1", name: "Main", state: "published", built_at: "2026-01-01", environment_id: "env-prod" });
  recordLibraryRevision(d, "lib1", "r1", 3); // prod has rev 3, head is 5 -> unpublished
  const rows = unpublishedResources(d, "production");
  expect(rows).toEqual([{ id: "r1", name: "Cart", type: "rule", head_revision_number: 5, published_revision_number: 3 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/cache/repo.test.ts`
Expected: FAIL — `recordLibrary`/`unpublishedResources` not exported.

- [ ] **Step 3: Add repo functions to `src/cache/repo.ts`**

```typescript
export function recordLibrary(db: Database, lib: { id: string; name: string; state: string; built_at: string | null; environment_id: string | null }): void {
  db.query("INSERT OR REPLACE INTO libraries (id, name, state, built_at, environment_id) VALUES (?, ?, ?, ?, ?)")
    .run(lib.id, lib.name, lib.state, lib.built_at, lib.environment_id);
}

export function recordEnvironment(db: Database, env: { id: string; name: string; stage: string; active_library_id: string | null }): void {
  db.query("INSERT OR REPLACE INTO environments (id, name, stage, active_library_id) VALUES (?, ?, ?, ?)")
    .run(env.id, env.name, env.stage, env.active_library_id);
}

export function recordLibraryRevision(db: Database, libraryId: string, resourceId: string, revisionNumber: number): void {
  db.query("INSERT INTO library_revisions (library_id, resource_id, revision_number) VALUES (?, ?, ?)")
    .run(libraryId, resourceId, revisionNumber);
}

export interface UnpublishedRow { id: string; name: string; type: string; head_revision_number: number; published_revision_number: number | null; }

export function unpublishedResources(db: Database, stage: string): UnpublishedRow[] {
  return db.query(`
    SELECT r.id AS id, r.name AS name, r.type AS type,
           r.head_revision_number AS head_revision_number,
           lr.revision_number AS published_revision_number
    FROM resources r
    LEFT JOIN environments e ON e.stage = $stage
    LEFT JOIN library_revisions lr ON lr.library_id = e.active_library_id AND lr.resource_id = r.id
    WHERE r.deleted = 0 AND r.head_revision_number IS NOT NULL
      AND (lr.revision_number IS NULL OR r.head_revision_number > lr.revision_number)
      AND r.type IN ('rule','data_element')
    ORDER BY r.type, r.name`).all({ $stage: stage }) as UnpublishedRow[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/cache/repo.test.ts`
Expected: PASS (all repo tests, including the new one).

- [ ] **Step 5: Add library/environment population to `syncProperty`**

Append before the final `setMeta` call in `src/sync/sync.ts`, and add the imports `recordLibrary, recordEnvironment, recordLibraryRevision` to the existing repo import:

```typescript
  const environments = await client.listAll(`/properties/${propertyId}/environments`);
  for (const e of environments) {
    const a = e.attributes as any;
    const activeLib = e.relationships?.library?.data && !Array.isArray(e.relationships.library.data)
      ? e.relationships.library.data.id : null;
    recordEnvironment(db, { id: e.id, name: a.name, stage: a.stage, active_library_id: activeLib });
  }

  const libraries = await client.listAll(`/properties/${propertyId}/libraries`);
  for (const lib of libraries) {
    const a = lib.attributes as any;
    const envId = lib.relationships?.environment?.data && !Array.isArray(lib.relationships.environment.data)
      ? lib.relationships.environment.data.id : null;
    recordLibrary(db, { id: lib.id, name: a.name, state: a.state, built_at: a.built_at ?? null, environment_id: envId });
    const revs = await client.listAll(`/libraries/${lib.id}/revisions`);
    for (const rev of revs) {
      const ra = rev.attributes as any;
      recordLibraryRevision(db, lib.id, rev.id, ra.revision_number ?? 0);
    }
  }
```

NOTE: `library_revisions.resource_id` stores the revision's own resource id. The smoke test (Task 5) should confirm whether `/libraries/{id}/revisions` returns resource revisions keyed by their base resource id; if the base-resource id differs from the revision id, adjust the mapping here. For MVP this is the documented relationship.

- [ ] **Step 6: Write `src/commands/unpublished.ts`**

```typescript
import { unpublishedResources } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../cli.ts";

export const cmdUnpublished: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const db = await openSynced(alias);
  const stage = (flags.env as string) || "production";
  const rows = unpublishedResources(db, stage);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "head_revision_number", "published_revision_number", "id"] }));
  return 0;
};
```

- [ ] **Step 7: Run the full test suite + type-check**

Run: `bun test && bunx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/sync/sync.ts src/cache/repo.ts src/cache/repo.test.ts src/commands/unpublished.ts
git commit -m "feat: unpublished-changes detection and library/env sync"
```

### Task 15: `init` command

**Files:**
- Create: `src/commands/init.ts`

- [ ] **Step 1: Write `src/commands/init.ts`**

```typescript
import { configPath } from "../paths.ts";
import { parseConfig, resolveProperty } from "../config/config.ts";
import { getAccessToken } from "../auth/token.ts";
import { ReactorClient } from "../reactor/client.ts";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Cmd } from "../cli.ts";

function prompt(q: string): Promise<string> {
  process.stdout.write(q);
  return new Promise((resolve) => {
    const reader = Bun.stdin.stream().getReader();
    reader.read().then(({ value }) => {
      reader.releaseLock();
      resolve(new TextDecoder().decode(value).trim());
    });
  });
}

export const cmdInit: Cmd = async () => {
  const orgAlias = await prompt("Org alias (e.g. acme): ");
  const imsOrg = await prompt("IMS Org ID (xxx@AdobeOrg): ");
  const clientId = await prompt("Client ID: ");
  const clientSecret = await prompt("Client secret: ");
  const scope = await prompt("Scope (paste from Dev Console S2S credential): ");
  const propAlias = await prompt(`Property alias (e.g. ${orgAlias}/web): `);
  const propertyId = await prompt("Property ID (PRxxxxxxxx): ");

  const toml = `[orgs.${orgAlias}]
ims_org_id = "${imsOrg}"
client_id = "${clientId}"
client_secret = "${clientSecret}"
scope = "${scope}"

[properties."${propAlias}"]
org = "${orgAlias}"
property_id = "${propertyId}"
`;

  // Validate before writing.
  const cfg = parseConfig(toml, process.env);
  const rp = resolveProperty(cfg, propAlias);
  const token = await getAccessToken(orgAlias, rp.org);
  const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });
  await client.get(`/properties/${propertyId}`);

  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, toml);
  await Bun.$`chmod 600 ${path}`.quiet();
  console.log(`\nValidated and wrote ${path}. Try: cadmium sync ${propAlias}`);
  return 0;
};
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat: interactive init command"
```

---

## Milestone 8: The skill

### Task 16: Author the `adobe-tags` skill

**Files:**
- Create: `skill/SKILL.md`, `skill/references/reactor-concepts.md`

- [ ] **Step 1: Write `skill/SKILL.md`**

```markdown
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
| Anything unpublished in production? | `cadmium unpublished <alias> --env production --json` |
| Summarize the property | `cadmium overview <alias> --json` |

## Interpreting results

- All commands accept `--json`; always pass it and parse the JSON.
- Lead your answer with the conclusion (e.g. "3 rules set eVar20: …"), not the raw list.
- `unpublished` rows mean a resource's head revision is ahead of what's live — flag these as risk, since they may be forgotten in-progress edits.
- See `references/reactor-concepts.md` for how revisions, libraries, and environments relate, and for the `delegate_descriptor_id` taxonomy.
```

- [ ] **Step 2: Write `skill/references/reactor-concepts.md`**

```markdown
# Reactor concepts (reference)

## Resource hierarchy
- **Property** contains rules, data elements, extensions.
- **Rule** has **rule_components**: events (triggers), conditions, actions.
- **Rule component** has a `delegate_descriptor_id` (e.g. `core::events::dom-ready`) and a `settings` JSON string.
- **Data element** is a named value referenced elsewhere as `%name%`.

## Revisions, libraries, environments
- Each resource has revisions; the **head** revision is the editable working copy (highest `revision_number`).
- A **library** bundles specific revisions and builds to an **environment** (development / staging / production).
- "Unpublished change" = head revision number is greater than the revision of that resource in the production environment's active library.

## delegate_descriptor_id taxonomy (confirm against live data — see smoke test)
- Triggers: `core::events::dom-ready`, `core::events::window-loaded`, `core::events::direct-call`, `core::events::data-element-change`, etc.
- Adobe Analytics set-variables action: `adobe-analytics::actions::set-variables`
- Custom code: `core::actions::custom-code`, `core::data-elements::custom-code`

(Update this list with the actual IDs printed by `scripts/smoke.ts`.)
```

- [ ] **Step 3: Commit**

```bash
git add skill/
git commit -m "feat: adobe-tags skill (SKILL.md + reactor reference)"
```

### Task 17: Install instructions & README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# cadmium + adobe-tags

Read-only analysis of Adobe Tags (Launch) properties from the command line and from Claude Code.

## Install

```bash
bun install
bun link            # makes `cadmium` available on PATH
```

Install the skill so Claude Code can drive the CLI:

```bash
cp -r skill ~/.claude/skills/adobe-tags
```

## Setup

```bash
cadmium init        # prompts for org + property, validates against Reactor
cadmium sync acme/web
cadmium overview acme/web
```

Config lives at `~/.config/adobe-tags/config.toml`; cache at `~/.cache/adobe-tags/<org>/<property>.db`.

## Commands

`init`, `sync`, `status`, `overview`, `ls rules`, `ls data-elements`, `refs`, `sets-variable`, `grep`, `triggers`, `unpublished`. Pass `--json` for machine-readable output.
````

- [ ] **Step 2: Final full verification**

Run: `bun test && bunx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 3: Manual end-to-end with real data**

Run against a real alias:
```bash
cadmium sync <alias>
cadmium overview <alias>
cadmium sets-variable <alias> eVar1
cadmium unpublished <alias>
```
Expected: real results; spot-check `sets-variable` and `unpublished` against the Adobe UI for one known case.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with install and usage"
```

---

## Self-Review Notes

- **Spec coverage:** init/sync/status/overview/ls(rules,data-elements)/refs/sets-variable/grep/triggers/unpublished all have tasks. Deferred per the MVP cut: `orgs ls`, `properties ls`, `ls extensions`, `ls libraries`, `show`, `unused`, `diff`. Incremental sync deferred (full pull only) — flagged in Task 9.
- **Type consistency:** `Cmd` type defined in `cli.ts` and imported by all commands. Repo function names (`findRulesSettingVariable`, `triggerHistogram`, `refsToDataElement`, `grepCode`, `unpublishedResources`, `recordLibrary/Environment/LibraryRevision`) are used consistently across sync, commands, and tests.
- **Open verification (Task 5 smoke test):** exact `delegate_descriptor_id` strings and the `/libraries/{id}/revisions` mapping must be confirmed against live data; constants in `classify.ts` and the mapping in `sync.ts` updated if they differ.
