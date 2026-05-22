import { openDb } from "../cache/db.ts";
import { loadConfig, resolveProperty } from "../config/config.ts";
import { configPath } from "../paths.ts";
import { getAccessToken } from "../auth/token.ts";
import { ReactorClient } from "../reactor/client.ts";
import { syncProperty } from "../sync/sync.ts";
import { countByType } from "../cache/repo.ts";
import { format } from "../output.ts";
import { requireAlias } from "./_shared.ts";
import type { Cmd } from "../command.ts";

export const cmdSync: Cmd = async (positionals, flags) => {
  const alias = requireAlias(positionals);
  const cfg = await loadConfig(configPath());
  const rp = resolveProperty(cfg, alias);
  const orgName = cfg.properties[alias]!.org;
  const token = await getAccessToken(orgName, rp.org);
  const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });
  const db = await openDb(alias);
  const started = Date.now();
  await syncProperty(db, client, rp.propertyId, { full: !!flags.full });
  const counts = countByType(db);
  console.log(format({ alias, synced: true, counts, elapsed_ms: Date.now() - started }, { json: !!flags.json }));
  return 0;
};
