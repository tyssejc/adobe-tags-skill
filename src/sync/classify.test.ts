import { test, expect } from "bun:test";
import { extractVariables, extractDataElementRefs, extractCode } from "./classify.ts";

test("extractVariables finds eVarN/eventN/propN anywhere in settings (declarative or in code)", () => {
  const settings = JSON.stringify({
    customSetup: { source: "s.eVar20 = 'x'; s.events = 'event5,event6'; s.prop3 = 1;" },
    trackerProperties: { events: [{ name: "event7" }, { name: "scAdd" }] },
  });
  expect(extractVariables(settings).sort()).toEqual(["eVar20", "event5", "event6", "event7", "prop3"]);
});

test("extractDataElementRefs finds %name% tokens", () => {
  const settings = JSON.stringify({ value: "%cartId%-%userType%" });
  expect(extractDataElementRefs(settings).sort()).toEqual(["cartId", "userType"]);
});

test("extractCode returns source from custom-code settings", () => {
  const settings = JSON.stringify({ source: "window.x = 1;" });
  expect(extractCode(settings)).toBe("window.x = 1;");
});

test("extractVariables tolerates null and malformed strings", () => {
  expect(extractVariables(null)).toEqual([]);
  expect(extractVariables("not json with eVar20 inside still picks it up")).toEqual(["eVar20"]);
});
