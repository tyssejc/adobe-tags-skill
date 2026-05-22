import { test, expect } from "bun:test";
import { configPath, cacheDbPath } from "./paths.ts";

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
