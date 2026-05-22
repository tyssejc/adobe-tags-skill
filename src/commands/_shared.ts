import type { Database } from "bun:sqlite";
import { openDb } from "../cache/db.ts";
import { getMeta } from "../cache/repo.ts";

export async function openSynced(alias: string): Promise<Database> {
  const db = await openDb(alias);
  if (!getMeta(db, "last_synced_at")) {
    throw new Error(`Property '${alias}' has never been synced. Run: cadmium sync ${alias}`);
  }
  return db;
}

export function requireAlias(positionals: string[]): string {
  const alias = positionals[0];
  if (!alias) throw new Error("Missing <alias> argument");
  return alias;
}
