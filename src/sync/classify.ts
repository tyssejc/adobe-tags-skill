export const ANALYTICS_SET_VARS_DDI = "adobe-analytics::actions::set-variables";
export const CUSTOM_CODE_DDIS = ["core::actions::custom-code", "core::conditions::custom-code", "core::data-elements::custom-code"];

const DE_TOKEN_RE = /%([^%]+)%/g;

function safeParse(settings: string | null): any {
  if (!settings) return null;
  try { return JSON.parse(settings); } catch { return null; }
}

const ANALYTICS_VAR_RE = /\b(eVar\d+|event\d+|prop\d+)\b/g;

export function extractVariables(settings: string | null): string[] {
  if (!settings) return [];
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  ANALYTICS_VAR_RE.lastIndex = 0;
  while ((m = ANALYTICS_VAR_RE.exec(settings)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

export function extractDataElementRefs(settings: string | null): string[] {
  if (!settings) return [];
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  DE_TOKEN_RE.lastIndex = 0;
  while ((m = DE_TOKEN_RE.exec(settings)) !== null) {
    if (m[1] && !m[1].includes("{") && m[1].length < 200) names.add(m[1]);
  }
  return [...names];
}

export function extractCode(settings: string | null): string | null {
  const obj = safeParse(settings);
  const src = obj?.source;
  return typeof src === "string" ? src : null;
}

export function buildSearchText(name: string, settings: string | null): string {
  const code = extractCode(settings);
  return [name, settings ?? "", code ?? ""].join("\n");
}
