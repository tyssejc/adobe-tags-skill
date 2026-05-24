export const SCHEMA_VERSION = 3;

export const DDL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                 -- rule | rule_component | data_element | extension
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 0,
  delegate_descriptor_id TEXT,
  head_revision_number INTEGER,
  head_settings_json TEXT,
  updated_at TEXT,
  search_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);

CREATE TABLE IF NOT EXISTS rule_components_ix (
  rule_id TEXT NOT NULL,
  rule_component_id TEXT NOT NULL,
  PRIMARY KEY (rule_id, rule_component_id)
);

CREATE TABLE IF NOT EXISTS variable_sets (
  source_id TEXT NOT NULL,
  variable TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_variable_sets_var ON variable_sets(variable);

CREATE TABLE IF NOT EXISTS data_element_refs (
  source_id TEXT NOT NULL,
  data_element_name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_de_refs_name ON data_element_refs(data_element_name);

CREATE TABLE IF NOT EXISTS rule_triggers (
  rule_id TEXT NOT NULL,
  event_delegate_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS libraries (
  id TEXT PRIMARY KEY, name TEXT, state TEXT, built_at TEXT, environment_id TEXT
);
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY, name TEXT, stage TEXT, active_library_id TEXT
);
`;
