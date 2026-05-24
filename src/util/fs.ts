import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// mkdir(recursive: true) should be a no-op when the directory already exists,
// but some sandboxes (e.g. agent-safehouse) surface EEXIST anyway. Swallow it.
export async function ensureDirFor(path: string): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
}
