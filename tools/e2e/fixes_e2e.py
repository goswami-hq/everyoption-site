#!/usr/bin/env python3
"""Job 20 list fixes, kept as tests. node tools/dev-server.mjs 8791 & then python3 tools/e2e/fixes_e2e.py"""
import sys
from playwright.sync_api import sync_playwright
B = "http://localhost:8791"; n = f = 0
def check(name, ok, d=""):
    global n, f
    n += 1
    if not ok: f += 1; print("FAIL", name, d)
def go(pg, z, r):
    pg.goto(f"{B}/fibroids/?zip={z}&r={r}"); pg.wait_for_selector("#results section, #results .referral", timeout=15000); pg.wait_for_timeout(300)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 390, "height": 844})
    go(pg, "62711", 50); near = pg.locator("section.tier-c li.card").count()
    go(pg, "62711", 100)
    check("62711 at 100 miles still shows the closer IRs", pg.locator("section.tier-c li.card").count() >= near, near)
    check("and the Likely group", pg.locator("section.tier-b li.card").count() > 0)
    go(pg, "60605", 50); check("a well-served ZIP has no IRs nearby group", pg.locator("section.tier-c").count() == 0)
    go(pg, "99723", 25); check("a remote ZIP says why", "No doctors within 250 miles of 99723" in pg.locator("body").inner_text())
    pg.goto(B + "/no-such-page"); t = pg.locator("main").inner_text()
    check("404 uses condition names", "Fibroids" in t and "Enlarged prostate" in t and "UFE" not in t, t[:200])
    pg.goto(B + "/fibroids/"); check("group name in sentence case", pg.locator("details.featured-group > summary").inner_text().strip().startswith("Less invasive treatments"))
    check("font sizes follow browser text size", pg.evaluate("""(() => { document.documentElement.style.fontSize = '32px'; const v = parseFloat(getComputedStyle(document.body).fontSize); document.documentElement.style.fontSize = ''; return v; })()""") == 36)
    b.close()
print(f"{n - f} of {n} fix checks"); sys.exit(1 if f else 0)
