import { grepCode } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdGrep: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const pattern = positionals[1];
  if (!pattern) throw new Error("usage: cadmium grep <alias> <pattern>");
  const db = await openSynced(alias);
  const rows = grepCode(db, pattern);
  console.log(format(rows, { json: !!flags.json, columns: ["name", "id"] }));
  return 0;
};
