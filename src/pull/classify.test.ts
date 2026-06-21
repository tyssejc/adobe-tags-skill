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
  expect(extractDataElementRefs(settings).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
    { name: "cartId", kind: "getter" },
    { name: "userType", kind: "getter" },
  ]);
});

test("extractDataElementRefs finds _satellite.getVar('name') calls in custom code", () => {
  const settings = JSON.stringify({
    source: "var a = _satellite.getVar('orderTotal');\n" +
            "var b = _satellite.getVar(\"orderTax\");\n" +
            "var c = _satellite.getVar( 'with spaces' );\n" +
            "var d = _satellite.getVar(dynamicName); // not statically resolvable",
  });
  expect(extractDataElementRefs(settings).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
    { name: "orderTax", kind: "getter" },
    { name: "orderTotal", kind: "getter" },
    { name: "with spaces", kind: "getter" },
  ]);
});

test("extractDataElementRefs combines %token% and getVar() references without duplicates", () => {
  const settings = JSON.stringify({
    source: "_satellite.getVar('cartId'); // also appears as %cartId% elsewhere",
    value: "%cartId%-%userType%",
  });
  expect(extractDataElementRefs(settings).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
    { name: "cartId", kind: "getter" },
    { name: "userType", kind: "getter" },
  ]);
});

test("extractDataElementRefs labels setters from _satellite.setVar() calls", () => {
  const settings = JSON.stringify({
    source: "_satellite.setVar('cartTotal', 42);\n" +
            "var x = _satellite.getVar('cartTotal');",
  });
  const refs = extractDataElementRefs(settings);
  expect(refs.sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
    { name: "cartTotal", kind: "getter" },
    { name: "cartTotal", kind: "setter" },
  ]);
});

test("extractDataElementRefs labels %name% tokens as getters", () => {
  const settings = JSON.stringify({ value: "%cartId%" });
  expect(extractDataElementRefs(settings)).toEqual([{ name: "cartId", kind: "getter" }]);
});

test("extractDataElementRefs deduplicates within the same (name, kind) pair", () => {
  const settings = JSON.stringify({
    source: "_satellite.getVar('x'); _satellite.getVar('x');",
    value: "%x%",
  });
  expect(extractDataElementRefs(settings)).toEqual([{ name: "x", kind: "getter" }]);
});

test("extractCode returns source from custom-code settings", () => {
  const settings = JSON.stringify({ source: "window.x = 1;" });
  expect(extractCode(settings)).toBe("window.x = 1;");
});

test("extractCode returns customSetup.source from Analytics set-variables settings", () => {
  const settings = JSON.stringify({
    customSetup: { source: "s.eVar1 = _satellite.getVar('foo');" },
    trackerProperties: { eVars: [] },
  });
  expect(extractCode(settings)).toBe("s.eVar1 = _satellite.getVar('foo');");
});

test("extractVariables tolerates null and malformed strings", () => {
  expect(extractVariables(null)).toEqual([]);
  expect(extractVariables("not json with eVar20 inside still picks it up")).toEqual(["eVar20"]);
});
