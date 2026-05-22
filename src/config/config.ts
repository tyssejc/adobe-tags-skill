import { parse as parseToml } from "smol-toml";

export interface OrgConfig {
  ims_org_id: string;
  client_id: string;
  client_secret: string;
  scope: string;
}

export interface PropertyConfig {
  org: string;
  property_id: string;
}

export interface Config {
  orgs: Record<string, OrgConfig>;
  properties: Record<string, PropertyConfig>;
}

export interface ResolvedProperty {
  alias: string;
  propertyId: string;
  org: OrgConfig;
}

const ENV_RE = /\$\{env:([A-Z0-9_]+)\}/g;

function substitute(value: string, env: Record<string, string | undefined>): string {
  return value.replace(ENV_RE, (_m, name: string) => {
    const v = env[name];
    if (v === undefined) throw new Error(`Config references missing env var: ${name}`);
    return v;
  });
}

export function parseConfig(
  toml: string,
  env: Record<string, string | undefined> = process.env,
): Config {
  const raw = parseToml(toml) as any;
  const orgs: Record<string, OrgConfig> = {};
  for (const [name, o] of Object.entries(raw.orgs ?? {})) {
    const org = o as any;
    orgs[name] = {
      ims_org_id: org.ims_org_id,
      client_id: org.client_id,
      client_secret: substitute(org.client_secret, env),
      scope: org.scope ?? DEFAULT_SCOPE,
    };
  }
  const properties: Record<string, PropertyConfig> = {};
  for (const [alias, p] of Object.entries(raw.properties ?? {})) {
    const prop = p as any;
    properties[alias] = { org: prop.org, property_id: prop.property_id };
  }
  return { orgs, properties };
}

// Default scope; users override per-org with the string shown in their
// Adobe Developer Console S2S credential.
export const DEFAULT_SCOPE = "openid,AdobeID,read_organizations,additional_info.projectedProductContext";

export function resolveProperty(cfg: Config, alias: string): ResolvedProperty {
  const prop = cfg.properties[alias];
  if (!prop) {
    const available = Object.keys(cfg.properties).join(", ") || "(none configured)";
    throw new Error(`Unknown property alias '${alias}'. Available: ${available}`);
  }
  const org = cfg.orgs[prop.org];
  if (!org) throw new Error(`Property '${alias}' references undefined org '${prop.org}'`);
  return { alias, propertyId: prop.property_id, org };
}

export async function loadConfig(
  path: string,
  env: Record<string, string | undefined> = process.env,
): Promise<Config> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`No config at ${path}. Run 'cadmium init' to create one.`);
  }
  return parseConfig(await file.text(), env);
}
