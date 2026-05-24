import { configPath } from "../paths.ts";
import { parseConfig, resolveProperty } from "../config/config.ts";
import { getAccessToken } from "../auth/token.ts";
import { ReactorClient } from "../reactor/client.ts";
import { ensureDirFor } from "../util/fs.ts";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Cmd } from "../command.ts";

export const cmdInit: Cmd = async () => {
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
    console.log(`\nValidated and wrote ${path}. Try: cadmium sync ${propAlias}`);
    return 0;
  } finally {
    rl.close();
  }
};
