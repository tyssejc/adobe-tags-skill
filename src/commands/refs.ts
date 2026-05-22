import { refsToDataElement } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdRefs: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const name = positionals[1];
  if (!name) throw new Error("usage: cadmium refs <alias> <data-element-name>");
  const db = await openSynced(alias);
  const rows = refsToDataElement(db, name);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "id"] }));
  return 0;
};
