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
  db.exec(DDL);
  const row = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null;
  if (!row) {
    db.query("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
  }
  return db;
}
