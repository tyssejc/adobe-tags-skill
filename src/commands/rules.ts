import { listRules, triggerHistogram } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openPulled, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium rules list [--disabled] [--untouched-since DATE]`
export const cmdRulesList: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openPulled(alias);
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
  const db = await openPulled(alias);
  const rows = triggerHistogram(db);
  console.log(format(rows, { json: !!flags.json, columns: ["event_delegate_id", "count"] }));
  return 0;
};
