import { test, expect } from "bun:test";
import { extractVariables, extractDataElementRefs, extractCode } from "./classify.ts";

test("extractVariables pulls eVar/event/prop keys from set-variables settings", () => {
  const settings = JSON.stringify({ trackerProperties: { eVars: [{ name: "eVar20", value: "%cartId%" }], events: [{ name: "event5" }], props: [{ name: "prop3", value: "x" }] } });
  expect(extractVariables(settings).sort()).toEqual(["eVar20", "event5", "prop3"]);
});

test("extractDataElementRefs finds %name% tokens", () => {
  const settings = JSON.stringify({ value: "%cartId%-%userType%" });
  expect(extractDataElementRefs(settings).sort()).toEqual(["cartId", "userType"]);
});

test("extractCode returns source from custom-code settings", () => {
  const settings = JSON.stringify({ source: "window.x = 1;" });
  expect(extractCode(settings)).toBe("window.x = 1;");
});

test("extractVariables tolerates malformed JSON", () => {
  expect(extractVariables("not json")).toEqual([]);
});
