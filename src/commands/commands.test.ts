import { test, expect } from "bun:test";
import { openDbAt } from "../cache/db.ts";
import { upsertResource, linkRuleComponent, recordVariableSet, setMeta, findResourcesSettingVariable } from "../cache/repo.ts";

test("seeded db answers sets-variable query through repo", () => {
  const db = openDbAt(":memory:");
  setMeta(db, "last_synced_at", "2026-05-22T00:00:00Z");
  upsertResource(db, { id: "r1", type: "rule", name: "Cart", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: null, head_revision_number: 1, head_settings_json: null, updated_at: "2026-01-01", search_text: "Cart" });
  upsertResource(db, { id: "rc1", type: "rule_component", name: "SetVars", enabled: true, deleted: false, dirty: false, delegate_descriptor_id: "adobe-analytics::actions::set-variables", head_revision_number: 1, head_settings_json: "{}", updated_at: "2026-01-01", search_text: "" });
  linkRuleComponent(db, "r1", "rc1");
  recordVariableSet(db, "rc1", "event5");
  expect(findResourcesSettingVariable(db, "event5")).toEqual([{ id: "r1", name: "Cart", type: "rule" }]);
});
