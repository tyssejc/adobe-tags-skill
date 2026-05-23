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

// Rule components hang off rules, not properties (per Reactor — verified 2026-05).
// Sample components across the first few rules to see the DDI taxonomy and a set-variables shape.
console.log("\n--- sampling rule_components across first 5 rules ---");
const ddis = new Set<string>();
let setVarsSettings: string | null = null;
for (const r of rules.slice(0, 5)) {
  const cs = await client.listAll(`/rules/${r.id}/rule_components`);
  for (const c of cs) {
    const a = c.attributes as any;
    if (a.delegate_descriptor_id) ddis.add(a.delegate_descriptor_id);
    if (!setVarsSettings && String(a.delegate_descriptor_id ?? "").includes("set-variables")) {
      setVarsSettings = a.settings ?? null;
    }
  }
}
console.log("rule_component delegate_descriptor_ids seen:");
for (const id of [...ddis].sort()) console.log("  " + id);
if (setVarsSettings) dump("sample set-variables settings (verify eVars/events/props shape)", setVarsSettings);
else console.log("(no set-variables action found in first 5 rules)");

// Confirm the other property-scoped endpoints exist.
console.log("\n--- probing other property-scoped endpoints ---");
for (const sub of ["data_elements", "extensions", "libraries", "environments"]) {
  try {
    const items = await client.listAll(`/properties/${rp.propertyId}/${sub}`);
    console.log(`/properties/{id}/${sub}: OK, ${items.length} items`);
  } catch (e) {
    console.log(`/properties/{id}/${sub}: FAILED — ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}

const environments = await client.listAll(`/properties/${rp.propertyId}/environments`);
console.log("\nenvironments (stage -> active library relationship):");
for (const e of environments) {
  const a = e.attributes as any;
  dump(`environment ${a.stage}`, { id: e.id, stage: a.stage, name: a.name, relationships: e.relationships });
}
