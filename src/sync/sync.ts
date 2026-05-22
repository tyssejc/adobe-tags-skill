import type { Database } from "bun:sqlite";
import type { ReactorClient } from "../reactor/client.ts";
import {
  upsertResource, linkRuleComponent, recordVariableSet, recordDataElementRef, recordTrigger, setMeta, resetDerivedTables,
} from "../cache/repo.ts";
import {
  extractVariables, extractDataElementRefs, buildSearchText, ANALYTICS_SET_VARS_DDI,
} from "./classify.ts";

interface SyncOpts { full?: boolean; }

export async function syncProperty(db: Database, client: ReactorClient, propertyId: string, _opts: SyncOpts = {}): Promise<void> {
  // Always a full pull for now; `_opts.full` is reserved for a future incremental mode.
  resetDerivedTables(db);

  const rules = await client.listAll(`/properties/${propertyId}/rules`);
  for (const r of rules) {
    const a = r.attributes as any;
    upsertResource(db, {
      id: r.id, type: "rule", name: a.name ?? "", enabled: !!a.enabled, deleted: !!a.deleted_at,
      delegate_descriptor_id: null, head_revision_number: a.revision_number ?? null,
      head_settings_json: null, updated_at: a.updated_at ?? null, search_text: a.name ?? "",
    });
  }

  const components = await client.listAll(`/properties/${propertyId}/rule_components`);
  for (const c of components) {
    const a = c.attributes as any;
    const ddi: string = a.delegate_descriptor_id ?? "";
    const settings: string | null = a.settings ?? null;
    upsertResource(db, {
      id: c.id, type: "rule_component", name: a.name ?? "", enabled: true, deleted: false,
      delegate_descriptor_id: ddi, head_revision_number: a.revision_number ?? null,
      head_settings_json: settings, updated_at: a.updated_at ?? null,
      search_text: buildSearchText(a.name ?? "", settings),
    });
    const ruleId = c.relationships?.rule?.data && !Array.isArray(c.relationships.rule.data)
      ? c.relationships.rule.data.id : undefined;
    if (ruleId) {
      linkRuleComponent(db, ruleId, c.id);
      if (ddi.includes("::events::")) recordTrigger(db, ruleId, ddi);
    }
    if (ddi === ANALYTICS_SET_VARS_DDI) {
      for (const v of extractVariables(settings)) recordVariableSet(db, c.id, v);
    }
    for (const ref of extractDataElementRefs(settings)) recordDataElementRef(db, c.id, ref);
  }

  const dataElements = await client.listAll(`/properties/${propertyId}/data_elements`);
  for (const d of dataElements) {
    const a = d.attributes as any;
    const settings: string | null = a.settings ?? null;
    upsertResource(db, {
      id: d.id, type: "data_element", name: a.name ?? "", enabled: !!a.enabled, deleted: !!a.deleted_at,
      delegate_descriptor_id: a.delegate_descriptor_id ?? null, head_revision_number: a.revision_number ?? null,
      head_settings_json: settings, updated_at: a.updated_at ?? null, search_text: buildSearchText(a.name ?? "", settings),
    });
    for (const ref of extractDataElementRefs(settings)) recordDataElementRef(db, d.id, ref);
  }

  const extensions = await client.listAll(`/properties/${propertyId}/extensions`);
  for (const e of extensions) {
    const a = e.attributes as any;
    upsertResource(db, {
      id: e.id, type: "extension", name: a.name ?? "", enabled: !!a.enabled, deleted: !!a.deleted_at,
      delegate_descriptor_id: a.delegate_descriptor_id ?? null, head_revision_number: null,
      head_settings_json: a.settings ?? null, updated_at: a.updated_at ?? null,
      search_text: buildSearchText(a.name ?? "", a.settings ?? null),
    });
  }

  setMeta(db, "last_synced_at", new Date().toISOString());
}
