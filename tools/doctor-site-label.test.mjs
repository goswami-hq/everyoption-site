// The doctor's-own-site button is written in three places (browser finder, city pages, profile pages).
// This test keeps the three labels the same (his words 2026-11-09 21:42 CT: "Doctor's website").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = ["src-assets/finder.js", "lib/cities.mjs", "lib/directory.mjs"];
test("doctor's own site button has one label everywhere", () => {
  for (const f of files) {
    const s = readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.ok(!s.includes("Doctor's page"), `${f} still says Doctor's page`);
    assert.ok(s.includes("Doctor's website"), `${f} lacks Doctor's website`);
    assert.ok(s.includes("Doctor's website, opens in a new tab"), `${f} lacks the screen-reader label`);
  }
});
