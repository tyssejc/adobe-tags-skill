import { configPath } from "../paths.ts";
import { parseConfig, resolveProperty } from "../config/config.ts";
import { getAccessToken } from "../auth/token.ts";
import { ReactorClient } from "../reactor/client.ts";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Cmd } from "../command.ts";

function prompt(q: string): Promise<string> {
  process.stdout.write(q);
  return new Promise((resolve) => {
    const reader = Bun.stdin.stream().getReader();
    reader.read().then(({ value }) => {
      reader.releaseLock();
      resolve(new TextDecoder().decode(value).trim());
    });
  });
}

export const cmdInit: Cmd = async () => {
  const orgAlias = await prompt("Org alias (e.g. acme): ");
  const imsOrg = await prompt("IMS Org ID (xxx@AdobeOrg): ");
  const clientId = await prompt("Client ID: ");
  const clientSecret = await prompt("Client secret: ");
  const scope = await prompt("Scope (paste from Dev Console S2S credential): ");
  const propAlias = await prompt(`Property alias (e.g. ${orgAlias}/web): `);
  const propertyId = await prompt("Property ID (PRxxxxxxxx): ");

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
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, toml);
  await Bun.$`chmod 600 ${path}`.quiet();
  console.log(`\nValidated and wrote ${path}. Try: cadmium sync ${propAlias}`);
  return 0;
};
