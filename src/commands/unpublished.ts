import { unpublishedResources } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdUnpublished: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const db = await openSynced(alias);
  const rows = unpublishedResources(db);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "updated_at", "id"] }));
  return 0;
};
