#!/usr/bin/env python3
"""Job platform-web-design-0008: finder results in a real browser. On the fibroid, prostate and knee finders (ZIP 60611,
25 miles), every card's name link must equal the "path" the build wrote for that doctor (tools/directory.py
stamp_paths), and a sample of those links must open a profile (200). Local server only.

  node tools/dev-server.mjs 8799 &
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/profile_links_e2e.py
Exit 0 when every check passes."""
import json, os, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("EO_BASE", "http://localhost:8799")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "site", "data")
PAGES = {"ufe": "/fibroids/", "pae": "/enlarged-prostate/", "gae": "/knee-arthritis/"}
path_of = {}
for f in ["ufe", "pae", "gae", "pelvic", "ir-roster"]:
    for p in json.load(open(os.path.join(DATA, f + ".json")))["people"]:
        if p.get("path"):
            path_of[p["npi"]] = p["path"]
fails, seen = [], 0
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for proc, page in PAGES.items():
        pg = b.new_page(viewport={"width": 390, "height": 844})
        pg.goto(BASE + page, wait_until="networkidle")
        pg.fill("#zip", "60611"); pg.select_option("#radius", "25"); pg.click("#zip-form button")
        pg.wait_for_selector(".card h3", timeout=15000)
        links = pg.eval_on_selector_all(".card h3 a", "as => as.map(a => a.getAttribute('href'))")
        if not links:
            fails.append(f"{proc}: no card name links")
        for i, href in enumerate(links):
            seen += 1
            npi = href[-11:-1]
            if path_of.get(npi) != href:
                fails.append(f"{proc}: {href} is not the data's {path_of.get(npi)}")
            if i % 5 == 0:
                req = urllib.request.Request(BASE + href, method="GET")
                class NoRedirect(urllib.request.HTTPRedirectHandler):
                    def redirect_request(self, *a, **k):
                        return None
                try:
                    code = urllib.request.build_opener(NoRedirect).open(req, timeout=20).status
                except urllib.error.HTTPError as e:
                    code = e.code
                if code != 200:
                    fails.append(f"{proc}: {href} answered {code}")
        print(proc, len(links), "cards")
        pg.close()
    b.close()
print("checked", seen, "card links;", "FAIL" if fails else "PASS")
for f in fails:
    print(" ", f)
sys.exit(1 if fails else 0)
