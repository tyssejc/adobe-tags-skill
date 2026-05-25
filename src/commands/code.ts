import { grepCode } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium code search <pattern>` — substring search across custom code.
export const cmdCodeSearch: Cmd = async (positionals, flags) => {
  const pattern = positionals[0];
  if (!pattern) throw new Error("usage: cadmium code search <pattern>");
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = grepCode(db, pattern);
  console.log(format(rows, { json: !!flags.json, columns: ["name", "id"] }));
  return 0;
};
