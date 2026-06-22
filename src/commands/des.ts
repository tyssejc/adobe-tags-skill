import { listDataElements, refsToDataElement } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openPulled, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium des list [--unused] [--type DDI]`
export const cmdDesList: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openPulled(alias);
  const rows = listDataElements(db, {
    unusedOnly: !!flags.unused,
    type: flags.type as string | undefined,
  }).map((r) => ({ name: r.name, type: r.delegate_descriptor_id, id: r.id }));
  console.log(format(rows, { json: !!flags.json, columns: ["name", "type", "id"] }));
  return 0;
};

// `cadmium des refs <name> [--getters | --setters]`
// Default = both. Passing both --getters and --setters is also "both".
export const cmdDesRefs: Cmd = async (positionals, flags) => {
  const name = positionals[0];
  if (!name) throw new Error("usage: cadmium des refs <data-element-name>");
  const alias = await resolveAlias(flags);
  const db = await openPulled(alias);
  const wantGetters = !!flags.getters;
  const wantSetters = !!flags.setters;
  const kindFilter = wantGetters && !wantSetters
    ? { kind: "getter" as const }
    : !wantGetters && wantSetters
      ? { kind: "setter" as const }
      : {};
  const rows = refsToDataElement(db, name, kindFilter);
  console.log(format(rows, { json: !!flags.json, columns: ["kind", "type", "name", "id"] }));
  return 0;
};
