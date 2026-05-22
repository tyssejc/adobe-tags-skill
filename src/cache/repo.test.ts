import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { openDbAt } from "./db.ts";
import {
  upsertResource, linkRuleComponent, recordVariableSet, recordTrigger,
  findRulesSettingVariable, listRules, refsToDataElement, triggerHistogram, grepCode, setMeta, getMeta,
  countByType, resetDerivedTables, recordLibrary, recordEnvironment, recordLibraryRevision, unpublishedResources,
} from "./repo.ts";

function db(): Database { return openDbAt(":memory:"); }

test("findRulesSettingVariable joins component -> rule", () => {
  const d = db();
  upsertResource(d, { id: "r1", type: "rule", name: "Cart Add", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 3, head_settings_json: null, updated_at: "2026-01-01", search_text: "Cart Add" });
  upsertResource(d, { id: "rc1", type: "rule_component", name: "Set Vars", enabled: true, deleted: false, delegate_descriptor_id: "adobe-analytics::actions::set-variables", head_revision_number: 3, head_settings_json: "{}", updated_at: "2026-01-01", search_text: "" });
  linkRuleComponent(d, "r1", "rc1");
  recordVariableSet(d, "rc1", "eVar20");
  const rules = findRulesSettingVariable(d, "eVar20");
  expect(rules).toEqual([{ id: "r1", name: "Cart Add" }]);
});

test("triggerHistogram counts events", () => {
  const d = db();
  recordTrigger(d, "r1", "core::events::dom-ready");
  recordTrigger(d, "r2", "core::events::dom-ready");
  recordTrigger(d, "r3", "core::events::window-loaded");
  expect(triggerHistogram(d)).toEqual([
    { event_delegate_id: "core::events::dom-ready", count: 2 },
    { event_delegate_id: "core::events::window-loaded", count: 1 },
  ]);
});

test("grepCode finds resources via search_text", () => {
  const d = db();
  upsertResource(d, { id: "rc9", type: "rule_component", name: "Custom", enabled: true, deleted: false, delegate_descriptor_id: "core::actions::custom-code", head_revision_number: 1, head_settings_json: "{}", updated_at: "2026-01-01", search_text: "window.digitalData.foo = 1" });
  const hits = grepCode(d, "digitalData.foo");
  expect(hits.map((h) => h.id)).toContain("rc9");
});

test("meta round-trips", () => {
  const d = db();
  setMeta(d, "last_synced_at", "2026-05-22T10:00:00Z");
  expect(getMeta(d, "last_synced_at")).toBe("2026-05-22T10:00:00Z");
});

test("grepCode treats underscore as literal, not a wildcard", () => {
  const d = db();
  upsertResource(d, { id: "a", type: "rule_component", name: "A", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "page_name = 1" });
  upsertResource(d, { id: "b", type: "rule_component", name: "B", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "pageXname = 1" });
  const ids = grepCode(d, "page_name").map((h) => h.id);
  expect(ids).toContain("a");
  expect(ids).not.toContain("b");
});

test("countByType counts non-deleted resources by type", () => {
  const d = db();
  upsertResource(d, { id: "r1", type: "rule", name: "R", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "R" });
  upsertResource(d, { id: "d1", type: "data_element", name: "D1", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "D1" });
  upsertResource(d, { id: "d2", type: "data_element", name: "D2", enabled: true, deleted: true, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "D2" });
  expect(countByType(d)).toEqual({ rule: 1, data_element: 1 });
});

test("resetDerivedTables clears derived rows", () => {
  const d = db();
  recordTrigger(d, "r1", "core::events::dom-ready");
  recordVariableSet(d, "rc1", "eVar1");
  resetDerivedTables(d);
  expect(triggerHistogram(d)).toEqual([]);
});

test("unpublishedResources lists head revisions ahead of production library", () => {
  const d = db();
  upsertResource(d, { id: "r1", type: "rule", name: "Cart", enabled: true, deleted: false, delegate_descriptor_id: null, head_revision_number: 5, head_settings_json: null, updated_at: "2026-01-01", search_text: "Cart" });
  recordEnvironment(d, { id: "env-prod", name: "Production", stage: "production", active_library_id: "lib1" });
  recordLibrary(d, { id: "lib1", name: "Main", state: "published", built_at: "2026-01-01", environment_id: "env-prod" });
  recordLibraryRevision(d, "lib1", "r1", 3);
  const rows = unpublishedResources(d, "production");
  expect(rows).toEqual([{ id: "r1", name: "Cart", type: "rule", head_revision_number: 5, published_revision_number: 3 }]);
});

test("unpublishedResources throws when the stage has no environment", () => {
  const d = db();
  expect(() => unpublishedResources(d, "production")).toThrow(/production/);
});

test("resetDerivedTables clears library_revisions", () => {
  const d = db();
  recordLibraryRevision(d, "lib1", "r1", 3);
  resetDerivedTables(d);
  expect(d.query("SELECT COUNT(*) AS n FROM library_revisions").get()).toEqual({ n: 0 });
});
