import { unpublishedResources } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openSynced, requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdUnpublished: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const db = await openSynced(alias);
  const stage = typeof flags.env === "string" ? flags.env : "production";
  const rows = unpublishedResources(db, stage);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "head_revision_number", "published_revision_number", "id"] }));
  return 0;
};
