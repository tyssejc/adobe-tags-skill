#!/usr/bin/env bun
import { loadConfig, resolveProperty } from "../src/config/config.ts";
import { configPath } from "../src/paths.ts";
import { getAccessToken } from "../src/auth/token.ts";
import { ReactorClient } from "../src/reactor/client.ts";

const alias = process.argv[2];
if (!alias) throw new Error("usage: bun scripts/smoke.ts <alias>");

const cfg = await loadConfig(configPath());
const rp = resolveProperty(cfg, alias);
const orgName = cfg.properties[alias]!.org;
const token = await getAccessToken(orgName, rp.org);
const client = new ReactorClient({ token, clientId: rp.org.client_id, imsOrg: rp.org.ims_org_id });

function dump(label: string, value: unknown): void {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
}

const rules = await client.listAll(`/properties/${rp.propertyId}/rules`);
console.log(`rules: ${rules.length}`);
if (rules[0]) dump("sample rule (note .id format and revision_number)", { id: rules[0].id, type: rules[0].type, attributes: rules[0].attributes });

const components = await client.listAll(`/properties/${rp.propertyId}/rule_components`);
const ids = new Set(components.map((c) => (c.attributes as any).delegate_descriptor_id));
console.log("\nrule_component delegate_descriptor_ids seen:");
for (const id of [...ids].sort()) console.log("  " + id);

// Verify the set-variables settings shape (drives extractVariables).
const setVars = components.find((c) => String((c.attributes as any).delegate_descriptor_id).includes("set-variables"));
if (setVars) dump("sample set-variables settings (verify eVars/events/props shape)", (setVars.attributes as any).settings);

// CRITICAL verification: how /libraries/{id}/revisions maps to base resource ids.
// The unpublished query joins library_revisions.resource_id = resources.id (head id).
// Confirm whether a revision object's .id equals the head resource id, or whether the
// base resource id lives under relationships (e.g. relationships.rule / .data_element / .revision).
const libraries = await client.listAll(`/properties/${rp.propertyId}/libraries`);
console.log(`\nlibraries: ${libraries.length}`);
const lib = libraries[0];
if (lib) {
  const revs = await client.listAll(`/libraries/${lib.id}/revisions`);
  console.log(`/libraries/${lib.id}/revisions returned ${revs.length} objects`);
  if (revs[0]) dump("sample library revision (compare .id vs head ids above; inspect relationships)", revs[0]);
}

const environments = await client.listAll(`/properties/${rp.propertyId}/environments`);
console.log("\nenvironments (stage -> active library relationship):");
for (const e of environments) {
  const a = e.attributes as any;
  dump(`environment ${a.stage}`, { id: e.id, stage: a.stage, name: a.name, relationships: e.relationships });
}
