import { test, expect } from "bun:test";
import { parseConfig, resolveProperty } from "./config.ts";

const TOML = `
[orgs.acme]
ims_org_id = "ABC@AdobeOrg"
client_id = "cid"
client_secret = "\${env:ACME_SECRET}"
scope = "openid,AdobeID,read_organizations"

[properties."acme/web"]
org = "acme"
property_id = "PR123"
`;

test("parseConfig substitutes ${env:VAR}", () => {
  const cfg = parseConfig(TOML, { ACME_SECRET: "shh" });
  expect(cfg.orgs.acme.client_secret).toBe("shh");
});

test("parseConfig throws on missing env var", () => {
  expect(() => parseConfig(TOML, {})).toThrow(/ACME_SECRET/);
});

test("resolveProperty links property to its org", () => {
  const cfg = parseConfig(TOML, { ACME_SECRET: "shh" });
  const r = resolveProperty(cfg, "acme/web");
  expect(r.propertyId).toBe("PR123");
  expect(r.org.ims_org_id).toBe("ABC@AdobeOrg");
});

test("resolveProperty throws with available aliases on unknown alias", () => {
  const cfg = parseConfig(TOML, { ACME_SECRET: "shh" });
  expect(() => resolveProperty(cfg, "nope")).toThrow(/acme\/web/);
});
