import { test, expect } from "bun:test";
import { needsRefresh, buildTokenRequest, parseTokenResponse } from "./token.ts";

test("buildTokenRequest posts client_credentials form", () => {
  const req = buildTokenRequest({
    ims_org_id: "ABC@AdobeOrg",
    client_id: "cid",
    client_secret: "sec",
    scope: "openid,AdobeID",
  });
  expect(req.url).toBe("https://ims-na1.adobelogin.com/ims/token/v3");
  expect(req.body.get("grant_type")).toBe("client_credentials");
  expect(req.body.get("client_id")).toBe("cid");
  expect(req.body.get("scope")).toBe("openid,AdobeID");
});

test("parseTokenResponse computes absolute expiry", () => {
  const now = 1_000_000;
  const tok = parseTokenResponse({ access_token: "tk", expires_in: 86400 }, now);
  expect(tok.access_token).toBe("tk");
  expect(tok.expires_at).toBe(now + 86400 * 1000);
});

test("needsRefresh returns true within 5-min skew window", () => {
  const now = 1_000_000;
  expect(needsRefresh({ access_token: "x", expires_at: now + 4 * 60 * 1000 }, now)).toBe(true);
  expect(needsRefresh({ access_token: "x", expires_at: now + 10 * 60 * 1000 }, now)).toBe(false);
});
