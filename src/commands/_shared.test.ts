import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveAlias } from "./_shared.ts";

function tmpStatePath(content?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cadmium-resolve-"));
  const path = join(dir, "state.toml");
  if (content) writeFileSync(path, content);
  return path;
}

test("resolveAlias prefers -p flag over state default", async () => {
  const sp = tmpStatePath('default_property = "vcs/web"\n');
  expect(await resolveAlias({ property: "acme/mobile" }, sp)).toBe("acme/mobile");
});

test("resolveAlias falls back to state default when no flag given", async () => {
  const sp = tmpStatePath('default_property = "vcs/web"\n');
  expect(await resolveAlias({}, sp)).toBe("vcs/web");
});

test("resolveAlias throws helpful error when no source provides an alias", async () => {
  const sp = tmpStatePath();
  await expect(resolveAlias({}, sp)).rejects.toThrow(/No property selected/);
});
