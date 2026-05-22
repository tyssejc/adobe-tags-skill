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

const rules = await client.listAll(`/properties/${rp.propertyId}/rules`);
console.log(`rules: ${rules.length}`);
const components = await client.listAll(`/properties/${rp.propertyId}/rule_components`);
const ids = new Set(components.map((c) => (c.attributes as any).delegate_descriptor_id));
console.log("rule_component delegate_descriptor_ids seen:");
for (const id of [...ids].sort()) console.log("  " + id);
