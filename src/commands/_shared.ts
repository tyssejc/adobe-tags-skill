import type { Database } from "bun:sqlite";
import { openDb } from "../cache/db.ts";
import { getMeta } from "../cache/repo.ts";
import { loadState } from "../config/state.ts";
import { statePath } from "../paths.ts";

export async function openSynced(alias: string): Promise<Database> {
  const db = await openDb(alias);
  if (!getMeta(db, "last_pulled_at")) {
    throw new Error(`Property '${alias}' has never been synced. Run: cadmium sync ${alias}`);
  }
  return db;
}

export function requireAlias(positionals: string[]): string {
  const alias = positionals[0];
  if (!alias) throw new Error("Missing <alias> argument");
  return alias;
}

/**
 * Decide which property alias a command should operate on.
 * Precedence: -p/--property flag > saved state default.
 * Throws if neither source provides an alias.
 */
export async function resolveAlias(
  flags: Record<string, unknown>,
  stateFilePath: string = statePath(),
): Promise<string> {
  const fromFlag = flags.property;
  if (typeof fromFlag === "string" && fromFlag.length > 0) return fromFlag;
  const state = await loadState(stateFilePath);
  if (state.default_property) return state.default_property;
  throw new Error(
    "No property selected. Pass -p <alias>, or set a default with: cadmium property use <alias>",
  );
}
