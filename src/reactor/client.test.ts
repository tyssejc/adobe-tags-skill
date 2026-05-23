import { test, expect } from "bun:test";
import { ReactorClient } from "./client.ts";

function fakeFetch(pages: any[]) {
  let i = 0;
  return async (_url: string, _init?: any) => {
    const body = pages[Math.min(i, pages.length - 1)];
    i++;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/vnd.api+json" } });
  };
}

test("listAll follows links.next until exhausted", async () => {
  const fetchFn = fakeFetch([
    { data: [{ id: "1", type: "rules", attributes: {} }], links: { next: "https://reactor.adobe.io/next" } },
    { data: [{ id: "2", type: "rules", attributes: {} }], links: {} },
  ]);
  const client = new ReactorClient({ token: "tk", clientId: "cid", imsOrg: "ABC@AdobeOrg" }, fetchFn as any);
  const all = await client.listAll("/properties/PR1/rules");
  expect(all.map((r) => r.id)).toEqual(["1", "2"]);
});

test("sends required Adobe headers", async () => {
  let seen: any;
  const fetchFn = async (_url: string, init: any) => {
    seen = init.headers;
    return new Response(JSON.stringify({ data: [], links: {} }), { status: 200 });
  };
  const client = new ReactorClient({ token: "tk", clientId: "cid", imsOrg: "ABC@AdobeOrg" }, fetchFn as any);
  await client.listAll("/properties/PR1/rules");
  expect(seen.Authorization).toBe("Bearer tk");
  expect(seen["x-api-key"]).toBe("cid");
  expect(seen["x-gw-ims-org-id"]).toBe("ABC@AdobeOrg");
  expect(seen.Accept).toBe("application/vnd.api+json;revision=1");
});
