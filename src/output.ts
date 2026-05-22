export interface FormatOpts { json: boolean; columns?: string[]; }

export function format(data: unknown, opts: FormatOpts): string {
  if (opts.json) return JSON.stringify(data, null, 2);
  if (Array.isArray(data)) {
    if (data.length === 0) return "(no results)";
    const cols = opts.columns ?? Object.keys(data[0] as object);
    const header = cols.join("\t");
    const rows = data.map((row) => cols.map((c) => String((row as any)[c] ?? "")).join("\t"));
    return [header, ...rows].join("\n");
  }
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}
