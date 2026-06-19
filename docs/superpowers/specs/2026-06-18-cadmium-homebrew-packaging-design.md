# cadmium — Homebrew packaging design

**Date:** 2026-06-18
**Status:** Approved (design phase)

## Goal

Package the `cadmium` CLI (a Bun + TypeScript read-only Adobe Tags analyzer) for
distribution as a Homebrew formula, so it can be installed with `brew install`
and the companion `adobe-tags` Claude Code skill comes along for the ride. The
immediate milestone is **install and exercise it locally** via a local tap; a
public tap with pre-built binaries is a deliberate follow-up.

## Constraints / context

- Source: Bun CLI, entry `bin/cadmium.ts` (`#!/usr/bin/env bun`), dispatching
  through `src/cli.ts` (gcloud-style noun-verb surface).
- One external runtime dependency: `smol-toml`. SQLite is `bun:sqlite` (built
  into Bun). No native modules.
- `bun build ./bin/cadmium.ts --compile` already produces a working 58 MB
  self-contained binary that runs with nothing else on PATH (verified
  2026-06-18, Bun 1.3.11).
- The skill lives in `skill/` (`SKILL.md` + `references/reactor-concepts.md`)
  and must end up at `~/.claude/skills/adobe-tags/` — a user-home path Homebrew
  formulae should not write to directly.

## Decisions

| Question | Decision |
|---|---|
| How users get the binary | **Compiled standalone binary** via `bun build --compile`. No Bun/Node required at runtime. |
| How the skill is installed | **Embedded into the binary** as text assets, written out by a new `cadmium skill install` command. The binary owns the exact skill version it shipped with. |
| Formula style | **Build-from-source now** (`depends_on "bun" => :build`), pre-built per-platform binaries **later**. |
| Versioning | Add an embedded `version` string + `cadmium version`. The formula and CLI agree on one source of truth. |

## Architecture

Two artifacts, one source of truth (this repo):

1. **The binary** — `bun build ./bin/cadmium.ts --compile --outfile cadmium`.
   Embeds the Bun runtime, `smol-toml`, `bun:sqlite`, and the skill text assets.
2. **The skill** — not shipped separately. Its files are imported as embedded
   text assets and `cadmium skill install` materializes them into
   `~/.claude/skills/adobe-tags/`.

```
brew install <tap>/cadmium
        │
        ├─ (build-time) depends_on bun  ─►  bun build --compile  ─►  bin/cadmium
        │
   user runs ─►  cadmium skill install  ─►  ~/.claude/skills/adobe-tags/{SKILL.md,references/…}
```

## Components

### 1. Skill embedding

- A small module (e.g. `src/skill/assets.ts`) imports the skill files as text:
  ```ts
  import skillMd from "../../skill/SKILL.md" with { type: "text" };
  import reactorConcepts from "../../skill/references/reactor-concepts.md" with { type: "text" };
  ```
  Bun's `--compile` bakes imported text assets into the executable, so the
  module exports an in-memory manifest: a list of `{ relativePath, contents }`.
- The manifest is the single place that knows the skill's file layout. Adding a
  reference file = add one import + one manifest entry.

### 2. `skill` noun module (`src/commands/skill.ts`)

Follows the existing `Cmd` pattern (`(positionals, flags) => Promise<number>`),
registered in `src/cli.ts`'s `COMMANDS` map under noun `skill`.

- `cadmium skill install [--force]`
  - Target dir: `~/.claude/skills/adobe-tags/` (respect `CLAUDE_CONFIG_DIR` /
    standard home resolution already used in `src/paths.ts` where applicable).
  - Writes every manifest entry, creating parent dirs.
  - If the target dir already exists and `--force` is not set: refuse, print the
    path, exit non-zero with a hint to pass `--force`.
  - On success: print the install path.
- `cadmium skill path`
  - Print the target dir and exit 0 (lets users inspect or symlink manually).

`--force` is added to the `parseArgs` options in `src/cli.ts`.

### 3. Version (`cadmium version`)

- **`package.json` is the single source of truth.** `src/version.ts` does
  `import pkg from "../package.json"` and exports `pkg.version` as `VERSION`.
  Bun's `--compile` bakes the JSON import into the binary, so no codegen or
  manual sync is needed; bumping `package.json` bumps the CLI and the formula
  reads the same tag.
- `cadmium version` prints it; `--version` / `-v` at the top level also prints
  it (handled alongside the existing `--help` short-circuit in `run()`).

### 4. Homebrew formula (`Formula/cadmium.rb`)

Distributed via the personal tap **`tyssejc/tap`** (GitHub repo `homebrew-tap`),
installed as `brew install tyssejc/tap/cadmium`. Local-only during development.

- `depends_on "bun" => :build` — build-only; the runtime is embedded.
- Stable release path: `url` → GitHub release source tarball + `sha256`.
- `head do` block → this git repo, so local iteration can build from HEAD.
- `install` block:
  ```ruby
  system "bun", "install", "--frozen-lockfile"
  system "bun", "build", "./bin/cadmium.ts", "--compile", "--outfile", "cadmium"
  bin.install "cadmium"
  ```
- `test do` block: `assert_match version.to_s, shell_output("#{bin}/cadmium version")`
  and `system bin/"cadmium", "--help"`.
- Caveat: tell the user to run `cadmium skill install` to enable the Claude Code
  skill.

### 5. Release script stub (`scripts/release.ts`) — future, not built now

Documented shape only: compile arm64 + x64 (`--target=bun-darwin-arm64` /
`bun-darwin-x64`), tar each, compute sha256, and emit the per-platform formula
fragment (`on_macos` / `on_arm` / `on_intel` blocks). Built only when moving to
a public binary tap.

## Local testing workflow (the "use it locally" milestone)

1. Add the `skill` + `version` commands, confirm `bun test` passes and a fresh
   `bun build --compile` binary runs `cadmium version` / `cadmium skill install`.
2. Create a local tap: `brew tap-new tyssejc/tap` (one-time). The repo is named
   `homebrew-tap`; the `homebrew-` prefix is implied in all `brew` commands. It
   stays local-only until cadmium installs green, then gets pushed to GitHub.
3. Drop `cadmium.rb` into the tap (or install the formula file directly).
4. `brew install --HEAD tyssejc/tap/cadmium` — builds from current git HEAD
   (so iterating means committing), exercising the real formula install path.
5. `brew audit --strict --new cadmium` — formula linter; must pass.
5. Run `cadmium skill install`, then drive cadmium from Claude Code to confirm
   the skill resolves and the binary works end-to-end, as a new user would
   experience it.

## Error handling

- `skill install` without `--force` over an existing dir → clear refusal + path
  + hint, non-zero exit.
- Missing `~/.claude` parent → created as part of the write (mkdir recursive,
  matching the EEXIST-swallowing pattern already in the codebase).
- Formula `test do` failing version assertion catches version-string drift.

## Testing

- Unit: `skill install` writes the manifest to a temp dir; `--force` semantics;
  `skill path` output. Manifest is non-empty and contains `SKILL.md`.
- Unit: `version` returns the `package.json` version.
- Manual / formula: `brew install --HEAD`, `brew test cadmium`, then a live
  Claude Code session using the installed skill.

## Out of scope (YAGNI)

- Linux builds, CI bottle automation, auto-update.
- Pre-built binary release pipeline (stubbed shape only).
- `skill uninstall` (`--force` reinstall covers iteration).
- Publishing to homebrew-core (personal tap only for the foreseeable future).
