import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { openDbAt } from "./db.ts";
import {
  upsertResource, linkRuleComponent, recordVariableSet, recordTrigger, recordDataElementRef,
  findResourcesSettingVariable, listRules, refsToDataElement, triggerHistogram, grepCode, setMeta, getMeta,
  countByType, resetDerivedTables, recordLibrary, recordEnvironment, unpublishedResources,
  listLibraries,
} from "./repo.ts";

function db(): Database { return openDbAt(":memory:"); }

test("findResourcesSettingVariable joins component -> rule", () => {
  const d = db();
  upsertResource(d, { id: "r1", type: "rule", name: "Cart Add", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 3, head_settings_json: null, updated_at: "2026-01-01", search_text: "Cart Add" });
  upsertResource(d, { id: "rc1", type: "rule_component", name: "Set Vars", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: "adobe-analytics::actions::set-variables", head_revision_number: 3, head_settings_json: "{}", updated_at: "2026-01-01", search_text: "" });
  linkRuleComponent(d, "r1", "rc1");
  recordVariableSet(d, "rc1", "eVar20");
  const rules = findResourcesSettingVariable(d, "eVar20");
  expect(rules).toEqual([{ id: "r1", name: "Cart Add", type: "rule" }]);
});

test("findResourcesSettingVariable also returns extension sources", () => {
  const d = db();
  upsertResource(d, { id: "ext1", type: "extension", name: "Adobe Analytics", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: "adobe-analytics", head_revision_number: null, head_settings_json: "{}", updated_at: "x", search_text: "" });
  recordVariableSet(d, "ext1", "event71");
  expect(findResourcesSettingVariable(d, "event71")).toEqual([{ id: "ext1", name: "Adobe Analytics", type: "extension" }]);
});

test("findResourcesSettingVariable also returns data_element sources", () => {
  const d = db();
  upsertResource(d, { id: "de1", type: "data_element", name: "funcLib_buildPS", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: "core::data-elements::custom-code", head_revision_number: null, head_settings_json: "{}", updated_at: "x", search_text: "" });
  recordVariableSet(d, "de1", "event74");
  expect(findResourcesSettingVariable(d, "event74")).toEqual([{ id: "de1", name: "funcLib_buildPS", type: "data_element" }]);
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
  upsertResource(d, { id: "rc9", type: "rule_component", name: "Custom", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: "core::actions::custom-code", head_revision_number: 1, head_settings_json: "{}", updated_at: "2026-01-01", search_text: "window.digitalData.foo = 1" });
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
  upsertResource(d, { id: "a", type: "rule_component", name: "A", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "page_name = 1" });
  upsertResource(d, { id: "b", type: "rule_component", name: "B", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "pageXname = 1" });
  const ids = grepCode(d, "page_name").map((h) => h.id);
  expect(ids).toContain("a");
  expect(ids).not.toContain("b");
});

test("countByType counts non-deleted resources by type", () => {
  const d = db();
  upsertResource(d, { id: "r1", type: "rule", name: "R", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "R" });
  upsertResource(d, { id: "d1", type: "data_element", name: "D1", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "D1" });
  upsertResource(d, { id: "d2", type: "data_element", name: "D2", enabled: true, deleted: true, dirty: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "x", search_text: "D2" });
  expect(countByType(d)).toEqual({ rule: 1, data_element: 1 });
});

test("resetDerivedTables clears derived rows", () => {
  const d = db();
  recordTrigger(d, "r1", "core::events::dom-ready");
  recordVariableSet(d, "rc1", "eVar1");
  resetDerivedTables(d);
  expect(triggerHistogram(d)).toEqual([]);
});

test("listLibraries sorts by published_at desc, filters by name and date", () => {
  const d = db();
  recordLibrary(d, { id: "LB1", name: "Remove Criteo and GA3", state: "published",
    created_at: "2024-03-19", updated_at: "2024-04-12", published_at: "2024-04-12",
    created_by_email: "bob@x.com", build_required: false, environment_id: null });
  recordLibrary(d, { id: "LB2", name: "Add Pinterest tag", state: "published",
    created_at: "2025-01-15", updated_at: "2025-01-16", published_at: "2025-01-16",
    created_by_email: "alice@x.com", build_required: false, environment_id: null });
  recordLibrary(d, { id: "LB3", name: "Remove Yotta trial", state: "draft",
    created_at: "2026-03-01", updated_at: "2026-03-01", published_at: null,
    created_by_email: "bob@x.com", build_required: true, environment_id: null });

  // Default sort: published first (newest), drafts last.
  expect(listLibraries(d).map((l) => l.id)).toEqual(["LB2", "LB1", "LB3"]);

  // Name filter is a case-insensitive substring match.
  expect(listLibraries(d, { namePattern: "remove" }).map((l) => l.id))
    .toEqual(["LB1", "LB3"]);

  // State filter.
  expect(listLibraries(d, { state: "draft" }).map((l) => l.id)).toEqual(["LB3"]);

  // publishedSince keeps only libraries with published_at >= the given date.
  expect(listLibraries(d, { publishedSince: "2025-01-01" }).map((l) => l.id))
    .toEqual(["LB2"]);
});

test("refsToDataElement splits getters and setters", () => {
  const d = db();
  upsertResource(d, { id: "rc1", type: "rule_component", name: "Reader", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 0, head_settings_json: null, updated_at: "x", search_text: "" });
  upsertResource(d, { id: "rc2", type: "rule_component", name: "Writer", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 0, head_settings_json: null, updated_at: "x", search_text: "" });
  recordDataElementRef(d, "rc1", "cartTotal", "getter");
  recordDataElementRef(d, "rc2", "cartTotal", "setter");
  expect(refsToDataElement(d, "cartTotal").map((r) => `${r.kind}:${r.name}`).sort())
    .toEqual(["getter:Reader", "setter:Writer"]);
  expect(refsToDataElement(d, "cartTotal", { kind: "getter" }).map((r) => r.name)).toEqual(["Reader"]);
  expect(refsToDataElement(d, "cartTotal", { kind: "setter" }).map((r) => r.name)).toEqual(["Writer"]);
});

test("unpublishedResources returns resources flagged dirty", () => {
  const d = db();
  upsertResource(d, { id: "r1", type: "rule", name: "Edited", enabled: true, deleted: false, dirty: true, delegate_descriptor_id: null, head_revision_number: 0, head_settings_json: null, updated_at: "2026-05-22", search_text: "Edited" });
  upsertResource(d, { id: "r2", type: "rule", name: "Clean", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 0, head_settings_json: null, updated_at: "2026-05-22", search_text: "Clean" });
  expect(unpublishedResources(d)).toEqual([{ id: "r1", name: "Edited", type: "rule", updated_at: "2026-05-22" }]);
});
