import { getMeta, countByType } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

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
