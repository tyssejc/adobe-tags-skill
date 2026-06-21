import { openDb } from "../cache/db.ts";
import { loadConfig, parseConfig, resolveProperty } from "../config/config.ts";
import { configPath, statePath } from "../paths.ts";
import { loadState, saveState } from "../config/state.ts";
import { getAccessToken } from "../auth/token.ts";
import { ReactorClient } from "../reactor/client.ts";
import { pullProperty } from "../pull/pull.ts";
import { countByType, getMeta, unpublishedResources } from "../cache/repo.ts";
import { ensureDirFor } from "../util/fs.ts";
import { format } from "../output.ts";
import { resolveAlias, openSynced } from "./_shared.ts";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Cmd } from "../command.ts";

// `cadmium property init` — interactive credential + property setup.
// Body lifted from the previous src/commands/init.ts.
export const cmdPropertyInit: Cmd = async () => {
  const rl = createInterface({ input, output });
  try {
    const ask = (q: string) => rl.question(q).then((s) => s.trim());
    const orgAlias = await ask("Org alias (e.g. acme): ");
    const imsOrg = await ask("IMS Org ID (xxx@AdobeOrg): ");
    const clientId = await ask("Client ID: ");
    const clientSecret = await ask("Client secret: ");
    const scope = await ask("Scope (paste from Dev Console S2S credential): ");
    const propAlias = await ask(`Property alias (e.g. ${orgAlias}/web): `);
    const propertyId = await ask("Property ID (PRxxxxxxxx): ");

    if (!/^[A-Za-z0-9_-]+$/.test(orgAlias)) {
      throw new Error("Org alias must contain only letters, numbers, dashes, or underscores.");
    }
    for (const [label, v] of [["IMS Org ID", imsOrg], ["Client ID", clientId], ["Client secret", clientSecret], ["Scope", scope], ["Property alias", propAlias], ["Property ID", propertyId]] as const) {
      if (/["\n\r]/.test(v)) throw new Error(`${label} contains an invalid character (double-quote or newline).`);
    }

    const toml = `[orgs.${orgAlias}]
ims_org_id = "${imsOrg}"
client_id = "${clientId}"
client_secret = "${clientSecret}"
scope = "${scope}"

[properties."${propAlias}"]
org = "${orgAlias}"
property_id = "${propertyId}"
`;

    // Validate before writing.
    const cfg = parseConfig(toml, process.env);
    const rp = resolveProperty(cfg, propAlias);
    const token = await getAccessToken(orgAlias, rp.org);
    const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });
    await client.get(`/properties/${propertyId}`);

    const path = configPath();
    await ensureDirFor(path);
    await Bun.write(path, toml);
    await Bun.$`chmod 600 ${path}`.quiet();
    console.log(`\nValidated and wrote ${path}. Try: cadmium property use ${propAlias} && cadmium property sync`);
    return 0;
  } finally {
    rl.close();
  }
};

// `cadmium property use <alias>` — set default property in state.toml.
export const cmdPropertyUse: Cmd = async (positionals) => {
  const alias = positionals[0];
  if (!alias) throw new Error("usage: cadmium property use <alias>");
  // Validate the alias is configured before saving.
  const cfg = await loadConfig(configPath());
  resolveProperty(cfg, alias); // throws if unknown
  await saveState(statePath(), { default_property: alias });
  console.log(`Default property set to '${alias}'.`);
  return 0;
};

// `cadmium property show` — show current default.
export const cmdPropertyShow: Cmd = async (_pos, flags) => {
  const state = await loadState(statePath());
  console.log(format({ default_property: state.default_property }, { json: !!flags.json }));
  return 0;
};

// `cadmium property list` — list configured aliases from config.toml.
export const cmdPropertyList: Cmd = async (_pos, flags) => {
  const cfg = await loadConfig(configPath());
  const state = await loadState(statePath());
  const rows = Object.entries(cfg.properties).map(([alias, p]) => ({
    alias,
    org: p.org,
    property_id: p.property_id,
    default: alias === state.default_property,
  }));
  console.log(format(rows, { json: !!flags.json, columns: ["alias", "org", "property_id", "default"] }));
  return 0;
};

// `cadmium property sync` — pull latest from Reactor.
export const cmdPropertySync: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const cfg = await loadConfig(configPath());
  const rp = resolveProperty(cfg, alias);
  const orgName = cfg.properties[alias]!.org;
  const token = await getAccessToken(orgName, rp.org);
  const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });
  const db = await openDb(alias);
  const started = Date.now();
  await pullProperty(db, client, rp.propertyId, { full: !!flags.full });
  const counts = countByType(db);
  console.log(format({ alias, synced: true, counts, elapsed_ms: Date.now() - started }, { json: !!flags.json }));
  return 0;
};

// `cadmium property status` — cache freshness.
export const cmdPropertyStatus: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openDb(alias);
  const pulled = getMeta(db, "last_pulled_at");
  const counts = countByType(db);
  console.log(format({ alias, last_pulled_at: pulled ?? null, counts }, { json: !!flags.json }));
  return 0;
};

// `cadmium property overview` — high-level resource counts.
export const cmdPropertyOverview: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const counts = countByType(db);
  console.log(format({
    alias,
    last_pulled_at: getMeta(db, "last_pulled_at"),
    rules: counts.rule ?? 0,
    data_elements: counts.data_element ?? 0,
    rule_components: counts.rule_component ?? 0,
    extensions: counts.extension ?? 0,
  }, { json: !!flags.json }));
  return 0;
};

// `cadmium property dirty` — unpublished resources (dirty flag).
export const cmdPropertyDirty: Cmd = async (_pos, flags) => {
  const alias = await resolveAlias(flags);
  const db = await openSynced(alias);
  const rows = unpublishedResources(db);
  console.log(format(rows, { json: !!flags.json, columns: ["type", "name", "updated_at", "id"] }));
  return 0;
};
