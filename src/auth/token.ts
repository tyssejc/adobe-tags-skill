import type { OrgConfig } from "../config/config.ts";
import { tokenCachePath } from "../paths.ts";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const IMS_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";
const SKEW_MS = 5 * 60 * 1000;

export interface CachedToken {
  access_token: string;
  expires_at: number; // epoch ms
}

export function buildTokenRequest(org: OrgConfig): { url: string; body: URLSearchParams } {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", org.client_id);
  body.set("client_secret", org.client_secret);
  body.set("scope", org.scope);
  return { url: IMS_TOKEN_URL, body };
}

export function parseTokenResponse(json: { access_token: string; expires_in: number }, now = Date.now()): CachedToken {
  return { access_token: json.access_token, expires_at: now + json.expires_in * 1000 };
}

export function needsRefresh(tok: CachedToken, now = Date.now()): boolean {
  return tok.expires_at - now <= SKEW_MS;
}

async function readCache(org: string): Promise<CachedToken | null> {
  const file = Bun.file(tokenCachePath(org));
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as CachedToken;
  } catch {
    return null;
  }
}

async function writeCache(org: string, tok: CachedToken): Promise<void> {
  const path = tokenCachePath(org);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(tok));
  await Bun.$`chmod 600 ${path}`.quiet();
}

export async function getAccessToken(orgName: string, org: OrgConfig, fetchFn = fetch): Promise<string> {
  const cached = await readCache(orgName);
  if (cached && !needsRefresh(cached)) return cached.access_token;

  const { url, body } = buildTokenRequest(org);
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  const tok = parseTokenResponse(await res.json());
  await writeCache(orgName, tok);
  return tok.access_token;
}
