import { findResourcesSettingVariable } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium analytics setters <var>` — list resources that set the named
// Adobe Analytics variable (e.g. eVar20, event5, prop3).
export const cmdAnalyticsSetters: Cmd = async (positionals, flags) => {
  const variable = positionals[0];
  if (!variable) throw new Error("usage: cadmium analytics setters <eVarNN|eventNN|propNN>");
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = findResourcesSettingVariable(db, variable);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "id"] }));
  return 0;
};
