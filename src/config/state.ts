import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { ensureDirFor } from "../util/fs.ts";

export interface State {
  default_property: string | null;
}

export async function loadState(path: string): Promise<State> {
  const file = Bun.file(path);
  if (!(await file.exists())) return { default_property: null };
  const text = await file.text();
  const raw = parseToml(text) as { default_property?: unknown };
  const dp = typeof raw.default_property === "string" && raw.default_property.length > 0
    ? raw.default_property : null;
  return { default_property: dp };
}

export async function saveState(path: string, state: State): Promise<void> {
  await ensureDirFor(path);
  const tomlObj: Record<string, string> = {};
  if (state.default_property) {
    tomlObj.default_property = state.default_property;
  }
  const content = stringifyToml(tomlObj);
  await Bun.write(path, content + (content.length ? "\n" : ""));
}
