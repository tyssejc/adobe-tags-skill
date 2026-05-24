import { listRules, listDataElements, listLibraries } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdLs: Cmd = async (positionals, flags) => {
  const [object, alias] = positionals;
  if (!object || !alias) throw new Error("usage: cadmium ls <rules|data-elements|libraries> <alias>");
  const db = await openSynced(alias);
  if (object === "rules") {
    const rows = listRules(db, {
      disabledOnly: !!flags.disabled,
      untouchedSince: flags["untouched-since"] as string | undefined,
    }).map((r) => ({ name: r.name, enabled: r.enabled, updated_at: r.updated_at, id: r.id }));
    console.log(format(rows, { json: !!flags.json, columns: ["name", "enabled", "updated_at", "id"] }));
    return 0;
  }
  if (object === "data-elements") {
    const rows = listDataElements(db, { unusedOnly: !!flags.unused, type: flags.type as string | undefined })
      .map((r) => ({ name: r.name, type: r.delegate_descriptor_id, id: r.id }));
    console.log(format(rows, { json: !!flags.json, columns: ["name", "type", "id"] }));
    return 0;
  }
  if (object === "libraries") {
    const rows = listLibraries(db, {
      namePattern: flags.name as string | undefined,
      state: flags.state as string | undefined,
      publishedSince: flags["published-since"] as string | undefined,
    }).map((l) => ({
      name: l.name,
      state: l.state,
      published_at: l.published_at,
      created_by_email: l.created_by_email,
      id: l.id,
    }));
    console.log(format(rows, {
      json: !!flags.json,
      columns: ["name", "state", "published_at", "created_by_email", "id"],
    }));
    return 0;
  }
  throw new Error(`Unknown ls object '${object}' (expected: rules, data-elements, libraries)`);
};
