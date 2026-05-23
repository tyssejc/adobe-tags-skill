import { findResourcesSettingVariable } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdSetsVariable: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const variable = positionals[1];
  if (!variable) throw new Error("usage: cadmium sets-variable <alias> <eVarNN|eventNN|propNN>");
  const db = await openSynced(alias);
  const rows = findResourcesSettingVariable(db, variable);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "id"] }));
  return 0;
};
