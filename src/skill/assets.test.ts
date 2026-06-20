import { test, expect } from "bun:test";
import { SKILL_ASSETS } from "./assets.ts";

test("manifest carries SKILL.md and the reactor-concepts reference", () => {
  const paths = SKILL_ASSETS.map((a) => a.relativePath);
  expect(paths).toContain("SKILL.md");
  expect(paths).toContain("references/reactor-concepts.md");
});

test("every asset has non-empty contents", () => {
  for (const a of SKILL_ASSETS) {
    expect(a.contents.length).toBeGreaterThan(0);
  }
});
