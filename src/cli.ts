import { parseArgs } from "node:util";
import type { Cmd } from "./command.ts";
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
      "published-since": { type: "string" },
      type: { type: "string" },
      env: { type: "string", default: "production" },
      org: { type: "string" },
      name: { type: "string" },
      state: { type: "string" },
    },
  });
  return fn(positionals, values);
}
