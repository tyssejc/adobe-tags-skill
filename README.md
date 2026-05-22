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
