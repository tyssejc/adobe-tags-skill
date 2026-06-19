import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SkillAsset } from "./assets.ts";

export async function writeSkillAssets(
  targetDir: string,
  assets: SkillAsset[],
  opts: { force: boolean },
): Promise<string[]> {
  if (existsSync(targetDir) && !opts.force) {
    throw new Error(`${targetDir} already exists; pass --force to overwrite`);
  }
  const written: string[] = [];
  for (const asset of assets) {
    const dest = join(targetDir, asset.relativePath);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, asset.contents);
    written.push(dest);
  }
  return written;
}
