import type { Database } from "bun:sqlite";

type NamedParams = Record<string, string | number | bigint | boolean | null>;

export interface ResourceRow {
  id: string;
  type: "rule" | "rule_component" | "data_element" | "extension";
  name: string;
  enabled: boolean;
  deleted: boolean;
  delegate_descriptor_id: string | null;
  head_revision_number: number | null;
  head_settings_json: string | null;
  updated_at: string | null;
  search_text: string;
}

export function upsertResource(db: Database, r: ResourceRow): void {
  db.query(`INSERT INTO resources (id, type, name, enabled, deleted, delegate_descriptor_id, head_revision_number, head_settings_json, updated_at, search_text)
    VALUES ($id, $type, $name, $enabled, $deleted, $ddi, $rev, $settings, $updated, $search)
    ON CONFLICT(id) DO UPDATE SET name=$name, enabled=$enabled, deleted=$deleted, delegate_descriptor_id=$ddi,
      head_revision_number=$rev, head_settings_json=$settings, updated_at=$updated, search_text=$search`).run({
    $id: r.id, $type: r.type, $name: r.name, $enabled: r.enabled ? 1 : 0, $deleted: r.deleted ? 1 : 0,
    $ddi: r.delegate_descriptor_id, $rev: r.head_revision_number, $settings: r.head_settings_json,
    $updated: r.updated_at, $search: r.search_text,
  });
}

export function linkRuleComponent(db: Database, ruleId: string, rcId: string): void {
  db.query("INSERT OR IGNORE INTO rule_components_ix (rule_id, rule_component_id) VALUES (?, ?)").run(ruleId, rcId);
}

export function recordVariableSet(db: Database, rcId: string, variable: string): void {
  db.query("INSERT INTO variable_sets (rule_component_id, variable) VALUES (?, ?)").run(rcId, variable);
}

export function recordDataElementRef(db: Database, sourceId: string, name: string): void {
  db.query("INSERT INTO data_element_refs (source_id, data_element_name) VALUES (?, ?)").run(sourceId, name);
}

export function recordTrigger(db: Database, ruleId: string, eventDelegateId: string): void {
  db.query("INSERT INTO rule_triggers (rule_id, event_delegate_id) VALUES (?, ?)").run(ruleId, eventDelegateId);
}

export function findRulesSettingVariable(db: Database, variable: string): { id: string; name: string }[] {
  return db.query(`SELECT DISTINCT r.id AS id, r.name AS name
    FROM variable_sets vs
    JOIN rule_components_ix ix ON ix.rule_component_id = vs.rule_component_id
    JOIN resources r ON r.id = ix.rule_id
    WHERE vs.variable = ? AND r.deleted = 0
    ORDER BY r.name`).all(variable) as { id: string; name: string }[];
}

export interface ListRulesFilter { disabledOnly?: boolean; untouchedSince?: string; }

export function listRules(db: Database, f: ListRulesFilter = {}): ResourceRow[] {
  let sql = "SELECT * FROM resources WHERE type = 'rule' AND deleted = 0";
  const params: NamedParams = {};
  if (f.disabledOnly) sql += " AND enabled = 0";
  if (f.untouchedSince) { sql += " AND updated_at < $since"; params.$since = f.untouchedSince; }
  sql += " ORDER BY name";
  return db.query(sql).all(params) as ResourceRow[];
}

export function listDataElements(db: Database, opts: { unusedOnly?: boolean; type?: string } = {}): ResourceRow[] {
  let sql = "SELECT * FROM resources WHERE type = 'data_element' AND deleted = 0";
  const params: NamedParams = {};
  if (opts.type) { sql += " AND delegate_descriptor_id = $type"; params.$type = opts.type; }
  if (opts.unusedOnly) {
    sql += " AND name NOT IN (SELECT DISTINCT data_element_name FROM data_element_refs)";
  }
  sql += " ORDER BY name";
  return db.query(sql).all(params) as ResourceRow[];
}

export function refsToDataElement(db: Database, name: string): { id: string; name: string; type: string }[] {
  return db.query(`SELECT r.id AS id, r.name AS name, r.type AS type
    FROM data_element_refs dr JOIN resources r ON r.id = dr.source_id
    WHERE dr.data_element_name = ? AND r.deleted = 0 ORDER BY r.type, r.name`).all(name) as { id: string; name: string; type: string }[];
}

export function triggerHistogram(db: Database): { event_delegate_id: string; count: number }[] {
  return db.query(`SELECT event_delegate_id, COUNT(*) AS count FROM rule_triggers
    GROUP BY event_delegate_id ORDER BY count DESC, event_delegate_id`).all() as { event_delegate_id: string; count: number }[];
}

export function grepCode(db: Database, pattern: string): { id: string; name: string }[] {
  const escaped = pattern.replace(/[\\%_]/g, "\\$&");
  return db.query(`SELECT id, name FROM resources
    WHERE (search_text LIKE $q ESCAPE '\\' OR name LIKE $q ESCAPE '\\') AND deleted = 0 ORDER BY name`)
    .all({ $q: `%${escaped}%` }) as { id: string; name: string }[];
}

export function setMeta(db: Database, key: string, value: string): void {
  db.query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function countByType(db: Database): Record<string, number> {
  const rows = db.query("SELECT type, COUNT(*) AS n FROM resources WHERE deleted = 0 GROUP BY type").all() as { type: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.type, r.n]));
}

export function resetDerivedTables(db: Database): void {
  db.query("DELETE FROM variable_sets").run();
  db.query("DELETE FROM rule_triggers").run();
  db.query("DELETE FROM data_element_refs").run();
  db.query("DELETE FROM rule_components_ix").run();
  db.query("DELETE FROM library_revisions").run();
}

export function recordLibrary(db: Database, lib: { id: string; name: string; state: string; built_at: string | null; environment_id: string | null }): void {
  db.query("INSERT OR REPLACE INTO libraries (id, name, state, built_at, environment_id) VALUES (?, ?, ?, ?, ?)")
    .run(lib.id, lib.name, lib.state, lib.built_at, lib.environment_id);
}

export function recordEnvironment(db: Database, env: { id: string; name: string; stage: string; active_library_id: string | null }): void {
  db.query("INSERT OR REPLACE INTO environments (id, name, stage, active_library_id) VALUES (?, ?, ?, ?)")
    .run(env.id, env.name, env.stage, env.active_library_id);
}

export function recordLibraryRevision(db: Database, libraryId: string, resourceId: string, revisionNumber: number): void {
  db.query("INSERT OR REPLACE INTO library_revisions (library_id, resource_id, revision_number) VALUES (?, ?, ?)")
    .run(libraryId, resourceId, revisionNumber);
}

export interface UnpublishedRow { id: string; name: string; type: string; head_revision_number: number; published_revision_number: number | null; }

export function unpublishedResources(db: Database, stage: string): UnpublishedRow[] {
  const env = db.query("SELECT active_library_id FROM environments WHERE stage = ?").get(stage) as { active_library_id: string | null } | null;
  if (!env) {
    throw new Error(`No '${stage}' environment found in the cache. Check the stage (development/staging/production) and that the property has been synced.`);
  }
  return db.query(`
    SELECT r.id AS id, r.name AS name, r.type AS type,
           r.head_revision_number AS head_revision_number,
           lr.revision_number AS published_revision_number
    FROM resources r
    LEFT JOIN library_revisions lr ON lr.library_id = $lib AND lr.resource_id = r.id
    WHERE r.deleted = 0 AND r.head_revision_number IS NOT NULL
      AND (lr.revision_number IS NULL OR r.head_revision_number > lr.revision_number)
      AND r.type IN ('rule','data_element')
    ORDER BY r.type, r.name`).all({ $lib: env.active_library_id }) as UnpublishedRow[];
}
