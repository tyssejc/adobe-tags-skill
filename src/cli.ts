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
