#!/usr/bin/env bun
// Quick connectivity diagnostic: confirms the credential can see the property,
// lists companies/properties the credential CAN see, and prints token exchange
// errors with the body.
import { loadConfig, resolveProperty } from "../src/config/config.ts";
import { configPath } from "../src/paths.ts";
import { getAccessToken } from "../src/auth/token.ts";
import { ReactorClient } from "../src/reactor/client.ts";

const alias = process.argv[2];
if (!alias) throw new Error("usage: bun scripts/diag.ts <alias>");

const cfg = await loadConfig(configPath());
const rp = resolveProperty(cfg, alias);
const orgName = cfg.properties[alias]!.org;

console.log(`alias:       ${alias}`);
console.log(`org alias:   ${orgName}`);
console.log(`ims_org_id:  ${rp.org.ims_org_id}`);
console.log(`property_id: ${rp.propertyId}`);

const token = await getAccessToken(orgName, rp.org);
console.log(`token:       got one (${token.length} chars)`);

const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });

console.log("\n--- direct GET /properties/{id} ---");
try {
  const got = await client.get(`/properties/${rp.propertyId}`);
  console.log("OK:", { id: got.data.id, type: got.data.type, name: (got.data.attributes as any).name });
} catch (e) {
  console.log("FAILED:", e instanceof Error ? e.message : String(e));
}

console.log("\n--- GET /companies (what this credential can see) ---");
try {
  const companies = await client.listAll("/companies");
  console.log(`found ${companies.length} companies:`);
  for (const c of companies) {
    const a = c.attributes as any;
    console.log(`  ${c.id}  name="${a.name ?? ""}"  org_id="${a.org_id ?? ""}"`);
    const props = await client.listAll(`/companies/${c.id}/properties`);
    console.log(`    ${props.length} properties:`);
    for (const p of props.slice(0, 10)) {
      const pa = p.attributes as any;
      console.log(`      ${p.id}  name="${pa.name ?? ""}"  platform="${pa.platform ?? ""}"`);
    }
    if (props.length > 10) console.log(`      ... (${props.length - 10} more)`);
  }
} catch (e) {
  console.log("FAILED:", e instanceof Error ? e.message : String(e));
}
