import { test, expect } from "bun:test";
import { format } from "./output.ts";

test("format json emits stable JSON", () => {
  expect(format({ a: 1 }, { json: true })).toBe('{\n  "a": 1\n}');
});

test("format pretty renders rows as a table-ish list", () => {
  const out = format([{ name: "X", id: "1" }], { json: false, columns: ["name", "id"] });
  expect(out).toContain("X");
  expect(out).toContain("1");
});
