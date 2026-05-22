# Reactor concepts (reference)

## Resource hierarchy
- **Property** contains rules, data elements, extensions.
- **Rule** has **rule_components**: events (triggers), conditions, actions.
- **Rule component** has a `delegate_descriptor_id` (e.g. `core::events::dom-ready`) and a `settings` JSON string.
- **Data element** is a named value referenced elsewhere as `%name%`.

## Revisions, libraries, environments
- Each resource has revisions; the **head** revision is the editable working copy (highest `revision_number`).
- A **library** bundles specific revisions and builds to an **environment** (development / staging / production).
- "Unpublished change" = head revision number is greater than the revision of that resource in the production environment's active library.

## delegate_descriptor_id taxonomy (confirm against live data — see smoke test)
- Triggers: `core::events::dom-ready`, `core::events::window-loaded`, `core::events::direct-call`, `core::events::data-element-change`, etc.
- Adobe Analytics set-variables action: `adobe-analytics::actions::set-variables`
- Custom code: `core::actions::custom-code`, `core::data-elements::custom-code`

(Update this list with the actual IDs printed by `scripts/smoke.ts`.)
