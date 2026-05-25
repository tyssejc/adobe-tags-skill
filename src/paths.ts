type Env = Record<string, string | undefined>;

function base(env: Env, xdgVar: string, fallback: string): string {
  const xdg = env[xdgVar];
  if (xdg && xdg.length > 0) return xdg;
  const home = env.HOME ?? "";
  return `${home}/${fallback}`;
}

export function configPath(env: Env = process.env): string {
  return `${base(env, "XDG_CONFIG_HOME", ".config")}/adobe-tags/config.toml`;
}

export function statePath(env: Env = process.env): string {
  return `${base(env, "XDG_CONFIG_HOME", ".config")}/adobe-tags/state.toml`;
}

export function cacheDir(env: Env = process.env): string {
  return `${base(env, "XDG_CACHE_HOME", ".cache")}/adobe-tags`;
}

export function cacheDbPath(alias: string, env: Env = process.env): string {
  return `${cacheDir(env)}/${alias}.db`;
}

export function tokenCachePath(org: string, env: Env = process.env): string {
  return `${cacheDir(env)}/.tokens/${org}.json`;
}
