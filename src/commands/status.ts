import { openDb } from "../cache/db.ts";
import { getMeta, countByType } from "../cache/repo.ts";
import { format } from "../output.ts";
import { requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdStatus: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const db = await openDb(alias);
  const synced = getMeta(db, "last_synced_at");
  const counts = countByType(db);
  console.log(format({ alias, last_synced_at: synced ?? null, counts }, { json: !!flags.json }));
  return 0;
};
