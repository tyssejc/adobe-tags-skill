# cadmium + adobe-tags

Read-only analysis of Adobe Tags (Launch) properties from the command line and from Claude Code.

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

## Setup

```bash
cadmium property init                    # prompts for org + property, validates against Reactor
cadmium property use acme/web            # set default so subsequent commands don't need -p
cadmium property sync                    # pull latest from Reactor
cadmium property overview                # high-level counts
```

Config lives at `~/.config/adobe-tags/config.toml`; cache at `~/.cache/adobe-tags/<org>/<property>.db`; default property in `~/.config/adobe-tags/state.toml`.

## Commands

```
cadmium property  init | use | show | list | sync | status | overview | dirty
cadmium rules     list | triggers
cadmium des       list | refs
cadmium libs      list
cadmium code      search
cadmium analytics setters
```

Pass `--json` for machine-readable output. Override the default property per-command with `-p <alias>`.
