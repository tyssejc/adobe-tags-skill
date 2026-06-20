import { test, expect } from "bun:test";
import { VERSION } from "./version.ts";
import pkg from "../package.json";

test("VERSION matches package.json", () => {
  expect(VERSION).toBe(pkg.version);
  expect(VERSION.length).toBeGreaterThan(0);
});
