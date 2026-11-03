import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { themeBootstrap } from "../src/lib/theme.ts";

function boot(saved, systemDark = false, storageBlocked = false) {
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(themeBootstrap, {
    document,
    localStorage: {
      getItem() {
        if (storageBlocked) throw new Error("Blocked");
        return saved;
      },
    },
    window: { matchMedia: () => ({ matches: systemDark }) },
  });
  return document.documentElement.dataset.theme;
}

test("first visit keeps the light theme even on a dark system", () =>
  assert.equal(boot(null, true), "light"));
test("saved dark theme applies before hydration", () =>
  assert.equal(boot("dark"), "dark"));
test("saved light theme overrides a dark system", () =>
  assert.equal(boot("light", true), "light"));
test("system preference resolves both operating system themes", () => {
  assert.equal(boot("system", true), "dark");
  assert.equal(boot("system", false), "light");
});
test("corrupt storage falls back to light", () =>
  assert.equal(boot("unknown", true), "light"));
test("blocked storage still renders the default theme", () =>
  assert.equal(boot(null, true, true), "light"));
