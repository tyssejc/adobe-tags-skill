# cadmium Homebrew Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `cadmium` as a `brew install`-able CLI whose compiled binary carries the `adobe-tags` skill and installs it on demand.

**Architecture:** Add a `version` command (sourced from `package.json`) and a `skill` noun whose `install`/`path` verbs materialize skill files embedded into the binary as text assets. Wrap the existing `bun build --compile` output in a build-from-source Homebrew formula distributed via the personal tap `tyssejc/tap`.

**Tech Stack:** Bun 1.3.11 (TypeScript), `bun:sqlite`, `smol-toml`, Homebrew (Ruby formula).

## Global Constraints

- Runtime: the compiled binary requires **nothing** on PATH — no Bun, no Node. Bun is a **build-only** dependency.
- Verified mechanisms (do not re-litigate): `import x from "./f.md" with { type: "text" }` and `import pkg from "../package.json"` both survive `bun build --compile`.
- `package.json` `version` is the single source of truth for the CLI version and the formula tag.
- Skill install target: `~/.claude/skills/adobe-tags/`, relocatable via `CLAUDE_CONFIG_DIR`.
- Follow the existing noun-verb pattern: handlers are `Cmd = (rest: string[], flags: Record<string, unknown>) => Promise<number>`, registered in `src/cli.ts`'s `COMMANDS` map. Tests use `bun test` (`import { test, expect } from "bun:test"`).
- Tap: `tyssejc/tap` (repo `homebrew-tap`), installed as `brew install tyssejc/tap/cadmium`. Local-only until green.

---

## File Structure

- Create `src/version.ts` — exports `VERSION` from `package.json`.
- Create `src/skill/assets.ts` — embedded skill files as an in-memory manifest.
- Create `src/skill/install.ts` — pure writer: materialize a manifest into a target dir (testable, no I/O assumptions about home).
- Create `src/skill/install.test.ts` — unit tests for the writer.
- Create `src/commands/skill.ts` — `skill install` / `skill path` handlers.
- Modify `src/paths.ts` — add `skillInstallDir(env)`.
- Modify `src/paths.test.ts` — test `skillInstallDir`.
- Modify `src/cli.ts` — register `skill` noun, add `--force` flag, handle `version` / `--version` / `-v`.
- Create `Formula/cadmium.rb` — build-from-source formula.
- Modify `README.md` — brew install instructions.

---

## Task 1: `version` command

**Files:**
- Create: `src/version.ts`
- Modify: `src/cli.ts`
- Test: `src/version.test.ts`

**Interfaces:**
- Produces: `export const VERSION: string` (from `src/version.ts`).
- Produces: `cadmium version`, `cadmium --version`, `cadmium -v` all print `VERSION` and exit 0.

- [ ] **Step 1: Write the failing test**

Create `src/version.test.ts`:

```ts
import { test, expect } from "bun:test";
import { VERSION } from "./version.ts";
import pkg from "../package.json";

test("VERSION matches package.json", () => {
  expect(VERSION).toBe(pkg.version);
  expect(VERSION.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/version.test.ts`
Expected: FAIL — cannot resolve `./version.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/version.ts`:

```ts
import pkg from "../package.json";

export const VERSION: string = pkg.version;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/version.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire version into the CLI**

In `src/cli.ts`, replace the early `--help` short-circuit in `run()`. Add the import at the top (after the existing imports):

```ts
import { VERSION } from "./version.ts";
```

Then change the start of `run()` from:

```ts
  const [rawNoun, verb, ...rest] = argv;
  if (!rawNoun || rawNoun === "--help" || rawNoun === "-h") {
    console.log(helpText());
    return 0;
  }
```

to:

```ts
  const [rawNoun, verb, ...rest] = argv;
  if (rawNoun === "--version" || rawNoun === "-v" || (rawNoun === "version" && !verb)) {
    console.log(VERSION);
    return 0;
  }
  if (!rawNoun || rawNoun === "--help" || rawNoun === "-h") {
    console.log(helpText());
    return 0;
  }
```

- [ ] **Step 6: Verify the CLI prints the version**

Run: `bun run bin/cadmium.ts version && bun run bin/cadmium.ts --version && bun run bin/cadmium.ts -v`
Expected: `0.1.0` printed three times.

- [ ] **Step 7: Commit**

```bash
git add src/version.ts src/version.test.ts src/cli.ts
git commit -m "feat: add cadmium version command sourced from package.json"
```

---

## Task 2: Embedded skill asset manifest

**Files:**
- Create: `src/skill/assets.ts`
- Test: `src/skill/assets.test.ts`

**Interfaces:**
- Produces: `export interface SkillAsset { relativePath: string; contents: string }`
- Produces: `export const SKILL_ASSETS: SkillAsset[]` — one entry per skill file, `relativePath` relative to the skill root (e.g. `"SKILL.md"`, `"references/reactor-concepts.md"`), `contents` the embedded text.

- [ ] **Step 1: Write the failing test**

Create `src/skill/assets.test.ts`:

```ts
import { test, expect } from "bun:test";
import { SKILL_ASSETS } from "./assets.ts";

test("manifest carries SKILL.md and the reactor-concepts reference", () => {
  const paths = SKILL_ASSETS.map((a) => a.relativePath);
  expect(paths).toContain("SKILL.md");
  expect(paths).toContain("references/reactor-concepts.md");
});

test("every asset has non-empty contents", () => {
  for (const a of SKILL_ASSETS) {
    expect(a.contents.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/skill/assets.test.ts`
Expected: FAIL — cannot resolve `./assets.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/skill/assets.ts`:

```ts
import skillMd from "../../skill/SKILL.md" with { type: "text" };
import reactorConcepts from "../../skill/references/reactor-concepts.md" with { type: "text" };

export interface SkillAsset {
  relativePath: string;
  contents: string;
}

// Embedded at build time; `bun build --compile` bakes these text imports into
// the binary so the skill version always matches the CLI that ships it.
export const SKILL_ASSETS: SkillAsset[] = [
  { relativePath: "SKILL.md", contents: skillMd },
  { relativePath: "references/reactor-concepts.md", contents: reactorConcepts },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/skill/assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/skill/assets.ts src/skill/assets.test.ts
git commit -m "feat: embed adobe-tags skill files as binary text assets"
```

---

## Task 3: Skill writer + install path

**Files:**
- Create: `src/skill/install.ts`
- Modify: `src/paths.ts`
- Test: `src/skill/install.test.ts`
- Test: `src/paths.test.ts`

**Interfaces:**
- Consumes: `SkillAsset` from `src/skill/assets.ts`.
- Produces: `export function skillInstallDir(env?: Record<string, string | undefined>): string` (from `src/paths.ts`) — returns `<CLAUDE_CONFIG_DIR or $HOME/.claude>/skills/adobe-tags`.
- Produces: `export async function writeSkillAssets(targetDir: string, assets: SkillAsset[], opts: { force: boolean }): Promise<string[]>` (from `src/skill/install.ts`) — writes each asset under `targetDir`, returns the list of absolute paths written. Throws `Error` with message containing `already exists` if `targetDir` exists and `opts.force` is false.

- [ ] **Step 1: Write the failing test for `skillInstallDir`**

Add to `src/paths.test.ts`:

```ts
import { skillInstallDir } from "./paths.ts";

test("skillInstallDir defaults to ~/.claude/skills/adobe-tags", () => {
  expect(skillInstallDir({ HOME: "/home/x" })).toBe("/home/x/.claude/skills/adobe-tags");
});

test("skillInstallDir honors CLAUDE_CONFIG_DIR", () => {
  expect(skillInstallDir({ HOME: "/home/x", CLAUDE_CONFIG_DIR: "/cfg" })).toBe("/cfg/skills/adobe-tags");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/paths.test.ts`
Expected: FAIL — `skillInstallDir` is not exported.

- [ ] **Step 3: Implement `skillInstallDir`**

Add to the end of `src/paths.ts`:

```ts
export function skillInstallDir(env: Env = process.env): string {
  const claudeDir = env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.length > 0
    ? env.CLAUDE_CONFIG_DIR
    : `${env.HOME ?? ""}/.claude`;
  return `${claudeDir}/skills/adobe-tags`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `writeSkillAssets`**

Create `src/skill/install.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSkillAssets } from "./install.ts";

const assets = [
  { relativePath: "SKILL.md", contents: "# skill\n" },
  { relativePath: "references/x.md", contents: "ref\n" },
];

test("writes every asset and returns the paths", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "cad-")), "adobe-tags");
  const written = await writeSkillAssets(dir, assets, { force: false });
  expect(written.length).toBe(2);
  expect(await readFile(join(dir, "SKILL.md"), "utf8")).toBe("# skill\n");
  expect(await readFile(join(dir, "references/x.md"), "utf8")).toBe("ref\n");
});

test("refuses to overwrite an existing dir without force", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "cad-")), "adobe-tags");
  await mkdir(dir, { recursive: true });
  await expect(writeSkillAssets(dir, assets, { force: false })).rejects.toThrow(/already exists/);
});

test("force overwrites an existing dir", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "cad-")), "adobe-tags");
  await mkdir(dir, { recursive: true });
  const written = await writeSkillAssets(dir, assets, { force: true });
  expect(written.length).toBe(2);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test src/skill/install.test.ts`
Expected: FAIL — cannot resolve `./install.ts`.

- [ ] **Step 7: Implement `writeSkillAssets`**

Create `src/skill/install.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SkillAsset } from "./assets.ts";

export async function writeSkillAssets(
  targetDir: string,
  assets: SkillAsset[],
  opts: { force: boolean },
): Promise<string[]> {
  if (existsSync(targetDir) && !opts.force) {
    throw new Error(`${targetDir} already exists; pass --force to overwrite`);
  }
  const written: string[] = [];
  for (const asset of assets) {
    const dest = join(targetDir, asset.relativePath);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, asset.contents);
    written.push(dest);
  }
  return written;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test src/skill/install.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add src/skill/install.ts src/skill/install.test.ts src/paths.ts src/paths.test.ts
git commit -m "feat: skill writer + install-path resolution"
```

---

## Task 4: `skill` noun (install / path commands)

**Files:**
- Create: `src/commands/skill.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `SKILL_ASSETS`, `writeSkillAssets`, `skillInstallDir`, `Cmd`.
- Produces: `cmdSkillInstall`, `cmdSkillPath` (both `Cmd`), registered under noun `skill` with verbs `install` and `path`.
- Produces: `--force` boolean flag in the `src/cli.ts` `parseArgs` options.

- [ ] **Step 1: Write the command module**

Create `src/commands/skill.ts`:

```ts
import { SKILL_ASSETS } from "../skill/assets.ts";
import { writeSkillAssets } from "../skill/install.ts";
import { skillInstallDir } from "../paths.ts";
import type { Cmd } from "../command.ts";

// `cadmium skill install [--force]`
export const cmdSkillInstall: Cmd = async (_rest, flags) => {
  const dir = skillInstallDir();
  const written = await writeSkillAssets(dir, SKILL_ASSETS, { force: !!flags.force });
  console.log(`Installed adobe-tags skill (${written.length} files) to ${dir}`);
  return 0;
};

// `cadmium skill path`
export const cmdSkillPath: Cmd = async () => {
  console.log(skillInstallDir());
  return 0;
};
```

- [ ] **Step 2: Register the noun and `--force` flag in the CLI**

In `src/cli.ts`, add the import alongside the other command imports:

```ts
import { cmdSkillInstall, cmdSkillPath } from "./commands/skill.ts";
```

Add to the `COMMANDS` map (after the `analytics` entry):

```ts
  skill: {
    install: cmdSkillInstall,
    path: cmdSkillPath,
  },
```

Add to the `parseArgs` `options` block (after `full`):

```ts
      force: { type: "boolean", default: false },
```

- [ ] **Step 3: Verify install works end to end (dev runtime)**

Run:
```bash
CLAUDE_CONFIG_DIR=/tmp/cadtest bun run bin/cadmium.ts skill install
CLAUDE_CONFIG_DIR=/tmp/cadtest bun run bin/cadmium.ts skill install   # second run: should refuse
CLAUDE_CONFIG_DIR=/tmp/cadtest bun run bin/cadmium.ts skill install --force
CLAUDE_CONFIG_DIR=/tmp/cadtest bun run bin/cadmium.ts skill path
ls -R /tmp/cadtest/skills/adobe-tags
```
Expected: first prints "Installed … 2 files"; second exits non-zero with "already exists; pass --force"; third re-installs; `skill path` prints `/tmp/cadtest/skills/adobe-tags`; `ls` shows `SKILL.md` and `references/reactor-concepts.md`.

- [ ] **Step 4: Clean up the scratch dir**

Run: `rm -rf /tmp/cadtest`

- [ ] **Step 5: Run the whole test suite**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/skill.ts src/cli.ts
git commit -m "feat: cadmium skill install/path commands"
```

---

## Task 5: Verify the compiled binary carries everything

**Files:** none (verification + commit of nothing). This task proves the embed survives `--compile`, which is the whole point of Tasks 2–4.

- [ ] **Step 1: Compile the binary**

Run: `bun build ./bin/cadmium.ts --compile --outfile /tmp/cadmium-bin`
Expected: exit 0, `bundle`/`compile` lines printed.

- [ ] **Step 2: Run version + skill install from the compiled binary, with no Bun assumptions**

Run:
```bash
/tmp/cadmium-bin version
CLAUDE_CONFIG_DIR=/tmp/cadtest2 /tmp/cadmium-bin skill install
ls -R /tmp/cadtest2/skills/adobe-tags
diff <(/tmp/cadmium-bin skill path) <(echo "$HOME/.claude/skills/adobe-tags")
```
Expected: prints `0.1.0`; installs 2 files; `ls` shows both skill files; `diff` is empty (skill path resolves to real home when `CLAUDE_CONFIG_DIR` unset).

- [ ] **Step 3: Clean up**

Run: `rm -rf /tmp/cadtest2 /tmp/cadmium-bin`

No commit — this task is a gate, not a change.

---

## Task 6: Homebrew formula + README

**Files:**
- Create: `Formula/cadmium.rb`
- Modify: `README.md`

**Interfaces:**
- Consumes: `cadmium version` (Task 1), `cadmium skill install` (Task 4).

- [ ] **Step 1: Write the formula**

Create `Formula/cadmium.rb` (replace `REPLACE_WITH_RELEASE_SHA256` and the `url` tag when the first real release tarball exists; the `head` block is what local testing uses):

```ruby
class Cadmium < Formula
  desc "Read-only analysis of Adobe Tags (Launch) properties from the CLI"
  homepage "https://github.com/tyssejc/adobe-tags-skill"
  license "MIT"
  head "https://github.com/tyssejc/adobe-tags-skill.git", branch: "main"

  # Stable release path — fill in when the first tagged tarball is published.
  url "https://github.com/tyssejc/adobe-tags-skill/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_RELEASE_SHA256"
  version "0.1.0"

  # Bun is in homebrew-core. If `brew install --HEAD` fails to resolve this at
  # build time, fall back to the tap form: "oven-sh/bun/bun".
  depends_on "bun" => :build

  def install
    system "bun", "install", "--frozen-lockfile"
    system "bun", "build", "./bin/cadmium.ts", "--compile", "--outfile", "cadmium"
    bin.install "cadmium"
  end

  def caveats
    <<~EOS
      To enable the adobe-tags skill in Claude Code, run:
        cadmium skill install
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cadmium version")
    system bin/"cadmium", "--help"
  end
end
```

- [ ] **Step 2: Update the README install section**

In `README.md`, replace the `## Install` section body (the `bun install` / `bun link` / `cp -r skill` block) with:

````markdown
## Install

```bash
brew install tyssejc/tap/cadmium
cadmium skill install      # copies the adobe-tags skill into ~/.claude/skills
```

### From source (development)

```bash
bun install
bun run bin/cadmium.ts --help
```
````

- [ ] **Step 3: Commit**

```bash
git add Formula/cadmium.rb README.md
git commit -m "feat: Homebrew formula + brew-based install docs"
```

---

## Task 7: Local tap install + audit (manual milestone)

**Files:** none in this repo — operates on the Homebrew tap.

This is the "use it locally" milestone. It is manual and not committed here; it validates the formula against real `brew`.

- [ ] **Step 1: Create the local tap (one-time)**

Run: `brew tap-new tyssejc/tap`
Expected: creates `$(brew --repository)/Library/Taps/tyssejc/homebrew-tap`.

- [ ] **Step 2: Copy the formula into the tap**

Run: `cp Formula/cadmium.rb "$(brew --repository)/Library/Taps/tyssejc/homebrew-tap/Formula/cadmium.rb"`

- [ ] **Step 3: Install from HEAD**

Run: `brew install --HEAD tyssejc/tap/cadmium`
Expected: Bun is fetched as a build dep, `bun build --compile` runs, `cadmium` lands in the Cellar and is linked. (Recall `--HEAD` builds the latest **commit** — ensure Task 6 is committed and pushed if the `head` url points at GitHub; for a purely local test, temporarily set `head` to `"file://#{ENV["HOME"]}/code/projects/adobe-tags-skill", using: :git`.)

- [ ] **Step 4: Smoke-test the installed binary**

Run:
```bash
cadmium version
cadmium --help
cadmium skill install
```
Expected: version prints; help prints; skill installs into `~/.claude/skills/adobe-tags`.

- [ ] **Step 5: Audit the formula**

Run: `brew audit --strict tyssejc/tap/cadmium`
Expected: no offenses. Fix any reported style issues in `Formula/cadmium.rb`, re-copy into the tap, and re-run until clean. Commit fixes with `git commit -m "fix: brew audit findings in cadmium formula"`.

- [ ] **Step 6: Drive it from Claude Code**

In a Claude Code session, confirm the `adobe-tags` skill resolves and a command (e.g. `cadmium property overview` against a synced property) works end to end. This closes the loop on the local milestone.

---

## Deferred (not in this plan — YAGNI)

- `scripts/release.ts`: per-platform (`bun-darwin-arm64` / `bun-darwin-x64`) compile, tarball, sha256, and `on_macos`/`on_arm`/`on_intel` formula fragments. Build only when moving to a public binary tap.
- Linux builds, CI bottle automation, auto-update, `skill uninstall`, homebrew-core submission.
