export interface Resource<A = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: A;
  relationships?: Record<string, { data: { id: string; type: string } | { id: string; type: string }[] | null }>;
  meta?: Record<string, unknown>;
}

export interface ListResponse<A = Record<string, unknown>> {
  data: Resource<A>[];
  meta?: { pagination?: { current_page: number; total_pages: number } };
  links?: { next?: string };
}

export interface RuleAttrs { name: string; enabled: boolean; updated_at: string; revision_number: number; deleted_at?: string | null; }
export interface DataElementAttrs { name: string; enabled: boolean; updated_at: string; revision_number: number; settings: string | null; delegate_descriptor_id: string; deleted_at?: string | null; }
export interface RuleComponentAttrs { name: string; updated_at: string; revision_number: number; settings: string | null; delegate_descriptor_id: string; }
export interface ExtensionAttrs { name: string; enabled: boolean; updated_at: string; settings: string | null; delegate_descriptor_id: string; }
export interface LibraryAttrs {
  name: string;
  state: string;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  created_by_email: string | null;
  build_required: boolean;
}
export interface EnvironmentAttrs { name: string; stage: string; }
