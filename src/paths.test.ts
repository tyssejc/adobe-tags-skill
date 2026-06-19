import { test, expect } from "bun:test";
import { configPath, cacheDbPath, tokenCachePath, skillInstallDir } from "./paths.ts";

test("configPath honors XDG_CONFIG_HOME", () => {
  const p = configPath({ XDG_CONFIG_HOME: "/x/cfg", HOME: "/h" });
  expect(p).toBe("/x/cfg/adobe-tags/config.toml");
});

test("configPath falls back to HOME/.config", () => {
  const p = configPath({ HOME: "/h" });
  expect(p).toBe("/h/.config/adobe-tags/config.toml");
});

test("cacheDbPath splits org/property alias into nested dirs", () => {
  const p = cacheDbPath("acme/web", { HOME: "/h" });
  expect(p).toBe("/h/.cache/adobe-tags/acme/web.db");
});

test("configPath falls back to HOME when XDG_CONFIG_HOME is empty", () => {
  const p = configPath({ XDG_CONFIG_HOME: "", HOME: "/h" });
  expect(p).toBe("/h/.config/adobe-tags/config.toml");
});

test("tokenCachePath nests under .tokens with org name", () => {
  const p = tokenCachePath("acme", { HOME: "/h" });
  expect(p).toBe("/h/.cache/adobe-tags/.tokens/acme.json");
});

test("skillInstallDir defaults to ~/.claude/skills/adobe-tags", () => {
  expect(skillInstallDir({ HOME: "/home/x" })).toBe("/home/x/.claude/skills/adobe-tags");
});

test("skillInstallDir honors CLAUDE_CONFIG_DIR", () => {
  expect(skillInstallDir({ HOME: "/home/x", CLAUDE_CONFIG_DIR: "/cfg" })).toBe("/cfg/skills/adobe-tags");
});
