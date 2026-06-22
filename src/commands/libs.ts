import { listLibraries } from "../cache/repo.ts";
import { format } from "../output.ts";
import { openPulled, resolveAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

// `cadmium libs list [--name PAT] [--state STATE] [--published-since DATE]`
export const cmdLibsList: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openPulled(alias);
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
};
