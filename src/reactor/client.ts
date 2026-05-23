import type { ListResponse, Resource } from "./types.ts";

const BASE = "https://reactor.adobe.io";

export interface ClientAuth { token: string; clientId: string; imsOrg: string; }

export class ReactorClient {
  constructor(private auth: ClientAuth, private fetchFn: typeof fetch = fetch) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.auth.token}`,
      "x-api-key": this.auth.clientId,
      "x-gw-ims-org-id": this.auth.imsOrg,
      Accept: "application/vnd.api+json;revision=1",
    };
  }

  async get<A = Record<string, unknown>>(path: string): Promise<{ data: Resource<A> }> {
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Reactor GET ${path} failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as { data: Resource<A> };
  }

  async listAll<A = Record<string, unknown>>(path: string, query: Record<string, string> = {}): Promise<Resource<A>[]> {
    const params = new URLSearchParams({ "page[size]": "100", ...query });
    let url: string | undefined = path.startsWith("http") ? path : `${BASE}${path}?${params}`;
    const out: Resource<A>[] = [];
    while (url) {
      const res = await this.fetchFn(url, { headers: this.headers() });
      if (!res.ok) throw new Error(`Reactor GET ${url} failed (${res.status}): ${await res.text()}`);
      const body = (await res.json()) as ListResponse<A>;
      out.push(...body.data);
      url = body.links?.next;
    }
    return out;
  }
}
