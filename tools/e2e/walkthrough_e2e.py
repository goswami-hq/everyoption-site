#!/usr/bin/env python3
"""Job 20 walkthrough: defects a person hit on the site, kept as tests so they stay fixed. Local servers only.

  node tools/dev-server.mjs 8791 &
  node tools/dev-server.mjs 8792 --accounts --doximity &
  python3 tools/e2e/walkthrough_e2e.py

- Changing "Within" after a search reruns it, so the list matches the box (it used to keep the old list).
- Tapping a reference number (or How it works) and pressing Back stays on the page with the results (Back used to leave the page).
- An office with a bad ZIP or state marks that field and moves focus to it (the message said "highlighted" and nothing was).
"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8791")
ACCT = os.environ.get("ACCT", "http://localhost:8792")
fails = n = 0


def check(name, ok, detail=""):
    global fails, n
    n += 1
    if not ok:
        fails += 1; print("FAIL", name, detail)


def search(pg, zipc):
    pg.locator("#zip").fill(zipc); pg.locator("#zip-form button").click()
    pg.wait_for_function("document.getElementById('status').innerText.includes('miles')")


with sync_playwright() as p:
    b = p.chromium.launch()
    for path in ("/fibroids/", "/enlarged-prostate/", "/knee-arthritis/"):
        ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page()
        pg.goto(BASE + path); search(pg, "60611")
        pg.locator("#radius").select_option("25")
        pg.wait_for_function("document.getElementById('status').innerText.includes('within 25 miles')", timeout=5000)
        check(f"{path}: changing the distance reruns the search", "within 25 miles" in pg.locator("#status").inner_text())
        # reference, then Back
        # a reference number where the page has them (PAE and GAE have none yet), else "How it works"
        ref = pg.locator("sup.ref a").first if pg.locator("sup.ref a").count() else pg.get_by_role("link", name="How it works")
        ref.scroll_into_view_if_needed(); y0 = pg.evaluate("scrollY"); ref.click(); pg.wait_for_timeout(300)
        check(f"{path}: an in-page link adds a history entry", pg.evaluate("location.hash") == ref.get_attribute("href"))
        pg.go_back(); pg.wait_for_timeout(500)
        check(f"{path}: Back after a reference stays on the page", path in pg.url and pg.locator("#results a[href^='tel:']").count() > 0, pg.url)
        check(f"{path}: Back returns near where the reader was", abs(pg.evaluate("scrollY") - y0) < 200, (y0, pg.evaluate("scrollY")))
        ctx.close()

    # office fields (job 22: partial access may set offices): sign up a made-up doctor, then save a bad office
    ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page()
    pg.goto(ACCT + "/account/?npi=1999000072&procedure=gae"); pg.wait_for_selector("#s-who")
    pg.locator("#s-ir-yes").check(); pg.locator("#s-email").fill("walkthrough.job20@example.test"); pg.locator("#s-agree").check()
    pg.get_by_role("button", name="Email me a code").click(); pg.wait_for_selector("#c-code")
    box = json.loads(pg.request.get(ACCT + "/__outbox").text())
    code = next(re.search(r"\b(\d{6})\b", json.dumps(m)).group(1) for m in reversed(box) if "walkthrough.job20" in json.dumps(m))
    pg.locator("#c-code").fill(code); pg.get_by_role("button", name="Confirm").click(); pg.wait_for_selector("#office-form")
    pg.locator("#o0-practice").fill("Walkthrough Test IR"); pg.locator("#o0-street").fill("1 Test Way")
    pg.locator("#o0-city").fill("Chicago"); pg.locator("#o0-zip").fill("6061")
    pg.get_by_role("button", name="Save offices").click(); pg.wait_for_timeout(500)
    msg = pg.locator("#msg-offices").inner_text()   # job platform-directory-0037: the message sits under Save offices
    check("bad office: plain message without a field key", msg == "Please check the highlighted details.", msg)
    check("bad office: ZIP marked", pg.locator("#o0-zip").get_attribute("aria-invalid") == "true")
    check("bad office: state marked", pg.locator("#o0-state").get_attribute("aria-invalid") == "true")
    check("bad office: focus on the first bad field", pg.evaluate("document.activeElement.id") == "o0-state")
    pg.locator("#o0-state").select_option("IL"); pg.locator("#o0-zip").fill("60611")
    pg.get_by_role("button", name="Save offices").click(); pg.wait_for_timeout(800)
    check("fixed office saves", pg.locator("#msg-offices").inner_text().startswith("Saved"), pg.locator("#msg-offices").inner_text())
    check("fixed office: marks cleared", pg.locator("[aria-invalid=true]").count() == 0)
    ctx.close(); b.close()
print(f"{n - fails} of {n} walkthrough checks")
sys.exit(1 if fails else 0)
