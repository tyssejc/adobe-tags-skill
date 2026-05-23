import type { Database } from "bun:sqlite";
import type { ReactorClient } from "../reactor/client.ts";
import {
  upsertResource, linkRuleComponent, recordVariableSet, recordDataElementRef, recordTrigger, setMeta, resetDerivedTables,
  recordLibrary, recordEnvironment,
} from "../cache/repo.ts";
import {
  extractVariables, extractDataElementRefs, buildSearchText,
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
      dirty: !!a.dirty,
      delegate_descriptor_id: null, head_revision_number: a.revision_number ?? null,
      head_settings_json: null, updated_at: a.updated_at ?? null, search_text: a.name ?? "",
    });
  }

  // Rule components hang off rules, not properties. N+1 by design — Reactor has no
  // property-wide rule_components endpoint.
  for (const r of rules) {
    const components = await client.listAll(`/rules/${r.id}/rule_components`);
    for (const c of components) {
      const a = c.attributes as any;
      const ddi: string = a.delegate_descriptor_id ?? "";
      const settings: string | null = a.settings ?? null;
      upsertResource(db, {
        id: c.id, type: "rule_component", name: a.name ?? "", enabled: true, deleted: false, dirty: false,
        delegate_descriptor_id: ddi, head_revision_number: a.revision_number ?? null,
        head_settings_json: settings, updated_at: a.updated_at ?? null,
        search_text: buildSearchText(a.name ?? "", settings),
      });
      linkRuleComponent(db, r.id, c.id);
      if (ddi.includes("::events::")) recordTrigger(db, r.id, ddi);
      if (ddi.includes("::actions::")) {
        for (const v of extractVariables(settings)) recordVariableSet(db, c.id, v);
      }
      for (const ref of extractDataElementRefs(settings)) recordDataElementRef(db, c.id, ref);
    }
  }

  const dataElements = await client.listAll(`/properties/${propertyId}/data_elements`);
  for (const d of dataElements) {
    const a = d.attributes as any;
    const settings: string | null = a.settings ?? null;
    upsertResource(db, {
      id: d.id, type: "data_element", name: a.name ?? "", enabled: !!a.enabled, deleted: !!a.deleted_at,
      dirty: !!a.dirty,
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
      dirty: !!a.dirty,
      delegate_descriptor_id: a.delegate_descriptor_id ?? null, head_revision_number: null,
      head_settings_json: a.settings ?? null, updated_at: a.updated_at ?? null,
      search_text: buildSearchText(a.name ?? "", a.settings ?? null),
    });
    for (const v of extractVariables(a.settings ?? null)) recordVariableSet(db, e.id, v);
  }

  const environments = await client.listAll(`/properties/${propertyId}/environments`);
  for (const e of environments) {
    const a = e.attributes as any;
    const activeLib = e.relationships?.library?.data && !Array.isArray(e.relationships.library.data)
      ? e.relationships.library.data.id : null;
    recordEnvironment(db, { id: e.id, name: a.name ?? "", stage: a.stage ?? "", active_library_id: activeLib });
  }

  const libraries = await client.listAll(`/properties/${propertyId}/libraries`);
  for (const lib of libraries) {
    const a = lib.attributes as any;
    const envId = lib.relationships?.environment?.data && !Array.isArray(lib.relationships.environment.data)
      ? lib.relationships.environment.data.id : null;
    recordLibrary(db, { id: lib.id, name: a.name ?? "", state: a.state ?? "", built_at: a.built_at ?? null, environment_id: envId });
  }

  setMeta(db, "last_synced_at", new Date().toISOString());
}
