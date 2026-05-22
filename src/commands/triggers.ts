import { triggerHistogram } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdTriggers: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const db = await openSynced(alias);
  const rows = triggerHistogram(db);
  console.log(format(rows, { json: !!flags.json, columns: ["event_delegate_id", "count"] }));
  return 0;
};
