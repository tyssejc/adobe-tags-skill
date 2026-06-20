import { test, expect } from "bun:test";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSkillAssets } from "./install.ts";

const assets = [
  { relativePath: "SKILL.md", contents: "# skill\n" },
  { relativePath: "references/x.md", contents: "ref\n" },
];

test("writes every asset and returns the paths", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "cad-")), "adobe-tags");
  const written = await writeSkillAssets(dir, assets, { force: false });
  expect(written.length).toBe(2);
  expect(await readFile(join(dir, "SKILL.md"), "utf8")).toBe("# skill\n");
  expect(await readFile(join(dir, "references/x.md"), "utf8")).toBe("ref\n");
});

test("refuses to overwrite an existing dir without force", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "cad-")), "adobe-tags");
  await mkdir(dir, { recursive: true });
  await expect(writeSkillAssets(dir, assets, { force: false })).rejects.toThrow(/already exists/);
});

test("force overwrites an existing dir", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "cad-")), "adobe-tags");
  await mkdir(dir, { recursive: true });
  const written = await writeSkillAssets(dir, assets, { force: true });
  expect(written.length).toBe(2);
});
