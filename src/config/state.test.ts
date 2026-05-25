import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadState, saveState } from "./state.ts";

function tmp(): string { return mkdtempSync(join(tmpdir(), "cadmium-state-test-")); }

test("loadState returns null default_property when file missing", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    expect(await loadState(path)).toEqual({ default_property: null });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("loadState reads default_property from existing file", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    writeFileSync(path, 'default_property = "vcs/web"\n');
    expect(await loadState(path)).toEqual({ default_property: "vcs/web" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("saveState writes default_property and is round-trippable", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    await saveState(path, { default_property: "acme/mobile" });
    expect(await loadState(path)).toEqual({ default_property: "acme/mobile" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("saveState clears default_property when null", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    await saveState(path, { default_property: "vcs/web" });
    await saveState(path, { default_property: null });
    expect(await loadState(path)).toEqual({ default_property: null });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("saveState handles values with backslashes and quotes (TOML-safe)", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "state.toml");
    // A user could plausibly type a path-like alias with a backslash on Windows,
    // or paste an alias that happens to contain a quote. Either should survive
    // a round trip without corrupting the file.
    const tricky = 'weird\\alias"with-quote';
    await saveState(path, { default_property: tricky });
    expect(await loadState(path)).toEqual({ default_property: tricky });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
