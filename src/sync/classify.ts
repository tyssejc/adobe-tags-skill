export const ANALYTICS_SET_VARS_DDI = "adobe-analytics::actions::set-variables";
export const CUSTOM_CODE_DDIS = ["core::actions::custom-code", "core::conditions::custom-code", "core::data-elements::custom-code"];

const DE_TOKEN_RE = /%([^%]+)%/g;
// _satellite.getVar('name') / _satellite.getVar("name") — string literals only;
// dynamic names like _satellite.getVar(someVar) are unresolvable statically.
const DE_GETVAR_RE = /_satellite\.getVar\s*\(\s*(['"])(.*?)\1\s*\)/g;

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

export function extractCode(settings: string | null): string | null {
  const obj = safeParse(settings);
  // Custom-code rules/conditions/DEs put the body at top-level `source`.
  // Adobe Analytics extension + set-variables action put it at `customSetup.source`.
  const parts = [obj?.source, obj?.customSetup?.source].filter((s) => typeof s === "string");
  return parts.length > 0 ? parts.join("\n") : null;
}

export function extractDataElementRefs(settings: string | null): string[] {
  if (!settings) return [];
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  // %name% tokens — substituted at runtime in form-field settings (URLs, selectors, conditions).
  DE_TOKEN_RE.lastIndex = 0;
  while ((m = DE_TOKEN_RE.exec(settings)) !== null) {
    if (m[1] && !m[1].includes("{") && m[1].length < 200) names.add(m[1]);
  }
  // _satellite.getVar() calls — scan the decoded JS source, not the JSON-escaped settings string.
  const code = extractCode(settings);
  if (code) {
    DE_GETVAR_RE.lastIndex = 0;
    while ((m = DE_GETVAR_RE.exec(code)) !== null) {
      if (m[2] && m[2].length < 200) names.add(m[2]);
    }
  }
  return [...names];
}

export function buildSearchText(name: string, settings: string | null): string {
  const code = extractCode(settings);
  return [name, settings ?? "", code ?? ""].join("\n");
}
