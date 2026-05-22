import { test, expect } from "bun:test";
import { openDbAt } from "../cache/db.ts";
import { syncProperty } from "./sync.ts";
import { findRulesSettingVariable, triggerHistogram, refsToDataElement, getMeta } from "../cache/repo.ts";

const fakeClient = {
  async listAll(path: string) {
    if (path.endsWith("/rules")) return [{ id: "r1", type: "rules", attributes: { name: "Cart", enabled: true, updated_at: "2026-01-01", revision_number: 2 }, relationships: {} }];
    if (path.endsWith("/rule_components")) return [{
      id: "rc1", type: "rule_components",
      attributes: { name: "SetVars", updated_at: "2026-01-01", revision_number: 2, delegate_descriptor_id: "adobe-analytics::actions::set-variables", settings: JSON.stringify({ trackerProperties: { eVars: [{ name: "eVar20", value: "%cartId%" }] } }) },
      relationships: { rule: { data: { id: "r1", type: "rules" } } },
    }, {
      id: "rc2", type: "rule_components",
      attributes: { name: "Trigger", updated_at: "2026-01-01", revision_number: 2, delegate_descriptor_id: "core::events::dom-ready", settings: null },
      relationships: { rule: { data: { id: "r1", type: "rules" } } },
    }];
    if (path.endsWith("/data_elements")) return [{ id: "de1", type: "data_elements", attributes: { name: "cartId", enabled: true, updated_at: "2026-01-01", revision_number: 1, delegate_descriptor_id: "core::data-elements::javascript-variable", settings: null } }];
    if (path.endsWith("/extensions")) return [];
    if (path.endsWith("/libraries")) return [];
    if (path.endsWith("/environments")) return [];
    return [];
  },
};

test("syncProperty populates variables, triggers, refs, and meta", async () => {
  const db = openDbAt(":memory:");
  await syncProperty(db, fakeClient as any, "PR1", { full: true });
  expect(findRulesSettingVariable(db, "eVar20")).toEqual([{ id: "r1", name: "Cart" }]);
  expect(triggerHistogram(db)).toEqual([{ event_delegate_id: "core::events::dom-ready", count: 1 }]);
  expect(refsToDataElement(db, "cartId").map((x) => x.id)).toContain("rc1");
  expect(getMeta(db, "last_synced_at")).not.toBeNull();
});

test("syncProperty is idempotent across repeated runs (no double-count)", async () => {
  const db = openDbAt(":memory:");
  await syncProperty(db, fakeClient as any, "PR1", { full: true });
  await syncProperty(db, fakeClient as any, "PR1", { full: true });
  expect(triggerHistogram(db)).toEqual([{ event_delegate_id: "core::events::dom-ready", count: 1 }]);
  expect(findRulesSettingVariable(db, "eVar20")).toEqual([{ id: "r1", name: "Cart" }]);
});
