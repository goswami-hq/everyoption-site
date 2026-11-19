// HQ chat 2026-11-19 10:23 CT: the owner name search (PR #11) was written into the built copy site/assets/account.js
// instead of src-assets/account.js, so the page kept its old cache tag and his phone showed the old box. Each built
// copy must equal its source, and each page's ?v= tag must be the copy's hash (tools/build.py).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const SRC = new URL("../src-assets/", import.meta.url), OUT = new URL("../site/assets/", import.meta.url);
const files = readdirSync(SRC).filter((f) => /\.(js|css)$/.test(f) && statSync(new URL(f, SRC)).isFile());

test("every src-assets file equals its built copy in site/assets (edit the source, then build)", () => {
  for (const f of files) {
    if (/%%[A-Z_]+%%/.test(readFileSync(new URL(f, SRC), "utf8"))) continue;   // templates the build fills in (directory.js)
    assert.ok(existsSync(new URL(f, OUT)), `site/assets/${f} missing: run tools/build.py`);
    assert.ok(readFileSync(new URL(f, SRC)).equals(readFileSync(new URL(f, OUT))), `site/assets/${f} differs from src-assets/${f}: edit the source, then run tools/build.py`);
  }
});

test("the account page's cache tag is the hash of the script it loads", () => {
  const html = readFileSync(new URL("../site/account/index.html", import.meta.url), "utf8");
  const tag = /\/assets\/account\.js\?v=([0-9a-f]{10})/.exec(html)[1];
  const hash = createHash("sha256").update(readFileSync(new URL("account.js", OUT))).digest("hex").slice(0, 10);
  assert.equal(tag, hash, "site/account/index.html links an old account.js: run tools/build.py");
});
