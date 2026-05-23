import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { cacheDbPath } from "../paths.ts";
import { DDL, SCHEMA_VERSION } from "./schema.ts";

export async function openDb(alias: string): Promise<Database> {
  const path = cacheDbPath(alias);
  await mkdir(dirname(path), { recursive: true });
  return openDbAt(path);
}

export function openDbAt(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  // Need meta to exist before we can read the stored schema version.
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);");
  const row = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null;
  const stored = row?.value ?? null;
  if (stored !== null && stored !== String(SCHEMA_VERSION)) {
    // Stale cache from a previous schema. Full-pull sync rebuilds everything, so
    // drop all tables and start fresh rather than carry incompatible columns.
    const tables = db.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ).all() as { name: string }[];
    for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t.name};`);
    db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);");
  }
  db.exec(DDL);
  if (stored !== String(SCHEMA_VERSION)) {
    db.query(
      "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(String(SCHEMA_VERSION));
  }
  return db;
}
