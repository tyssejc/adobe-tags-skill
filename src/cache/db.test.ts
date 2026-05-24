import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDbAt } from "./db.ts";
import { SCHEMA_VERSION } from "./schema.ts";

test("openDbAt drops and rebuilds when stored schema_version doesn't match", () => {
  const dir = mkdtempSync(join(tmpdir(), "cadmium-db-test-"));
  const path = join(dir, "test.db");
  try {
    const oldDb = new Database(path, { create: true });
    oldDb.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);");
    oldDb.exec("INSERT INTO meta (key, value) VALUES ('schema_version', '0');");
    oldDb.exec("CREATE TABLE variable_sets (rule_component_id TEXT, variable TEXT);");
    oldDb.close();

    const db = openDbAt(path);
    const cols = db.query("PRAGMA table_info(variable_sets)").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("source_id");
    expect(names).not.toContain("rule_component_id");
    const ver = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null;
    expect(ver?.value).toBe(String(SCHEMA_VERSION));
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
