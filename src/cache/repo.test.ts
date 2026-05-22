import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { openDbAt } from "./db.ts";
import {
  upsertResource, linkRuleComponent, recordVariableSet, recordTrigger,
  findRulesSettingVariable, listRules, refsToDataElement, triggerHistogram, grepCode, setMeta, getMeta,
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

test("grepCode finds resources via FTS", () => {
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
