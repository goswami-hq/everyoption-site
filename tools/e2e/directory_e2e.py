#!/usr/bin/env python3
"""Job 27: find a doctor by name, and the profiles. Local server with the accounts stand-ins (made-up people only).
Desktop 1280 px and phone 390 px.

  node tools/dev-server.mjs 8798 --accounts &
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/directory_e2e.py OUT_DIR
"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = os.environ.get("BASE", "http://localhost:8798")
R = {"checks": []}
ANN, EMAIL = "1999000015", "agoswami.assistant+eo21-dir27@gmail.com"   # made-up doctor; the local outbox only
EXTRA = [{"n": "Ana-María Núñez", "c": "Testville", "s": "IL", "p": "/doctors/ana-maria-nunez-1000000011/", "l": "ufe"},
         {"n": "Zoë D’Othee-Smith", "c": "Testville", "s": "IL", "p": "/doctors/zoe-dothee-smith-1000000029/"}]


def check(name, ok, detail=""):
    R["checks"].append({"check": name, "ok": bool(ok), "detail": str(detail)[:400]})
    print(("OK   " if ok else "FAIL ") + name + ("" if ok else f" ({detail})"))


def api(pg, method, path, body=None):
    r = pg.request.fetch(BASE + "/api/account/" + path, method=method, headers={"Origin": BASE, "Content-Type": "application/json"},
                         data=json.dumps(body or {}) if method != "GET" else None)
    return r.status, (r.json() if r.text() else None)


def make_confirmed(pg):
    s, b = api(pg, "POST", "signup", {"specialty": "ir", "npi": ANN, "email": EMAIL, "agree": True, "procedures": ["ufe"]})
    assert s == 202, b
    out = json.loads(pg.request.get(BASE + "/__outbox").text())
    code = re.search(r"code is (\d{6})\.", [m for m in out if m["to"] == EMAIL][-1]["text"]).group(1)
    assert api(pg, "POST", "code", {"challenge": b["challenge"], "code": code})[0] == 200
    s, b = api(pg, "PUT", "profile", {"offices": [{"practice": "Lakeside IR", "street": "100 Test Plaza", "city": "Chicago", "state": "IL",
                                                   "zip": "60611", "phone": "3125550100"}]})
    assert s == 200, b
    assert json.loads(pg.request.get(BASE + f"/__test/promote?npi={ANN}").text())["promoted"] == 1


def results(pg, q):
    pg.fill("#dir-q", q)
    pg.wait_for_timeout(150)
    return pg.evaluate("() => ({ status: document.getElementById('dir-status').textContent, rows: [...document.querySelectorAll('#dir-results li a')].map(a => [a.textContent, a.getAttribute('href')]) })")


def run_size(b, w, tag, data):
    ctx = b.new_context(viewport={"width": w, "height": 900})
    pg = ctx.new_page()
    sent = []
    pg.on("request", lambda r: sent.append(r.url))
    def extra(route):
        r = route.fetch(); d = r.json(); d["people"] += EXTRA
        route.fulfill(response=r, body=json.dumps(d))
    pg.route("**/data/directory.json", extra)
    pg.goto(BASE + "/doctors/")
    check(f"{tag}: no sideways scroll", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    first, last = data["likely"]["n"].split(" ")[0], data["likely"]["n"].split(" ")[-1]
    for label, q, want in [("first name", first, data["likely"]["n"]), ("last name", last, data["likely"]["n"]),
                           ("partial name", last[:4].lower(), data["likely"]["n"]),
                           ("apostrophe typed", "O'Connor", "Paul O'Connor"), ("apostrophe left out", "oconnor", "Paul O'Connor"),
                           ("curly apostrophe", "o’connor", "Paul O'Connor"),
                           ("accents typed", "Núñez", "Ana-María Núñez"), ("accents left out", "ana maria nunez", "Ana-María Núñez"),
                           ("hyphen typed", "D'Othee-Smith", "Zoë D’Othee-Smith"), ("hyphen as space", "dothee smith", "Zoë D’Othee-Smith"),
                           ("new account doctor from the overlay", "testone", "Ann Testone")]:
        v = results(pg, q)
        check(f"{tag}: search by {label} ({q})", any(n == want for n, _ in v["rows"]), v)
    v = results(pg, "zzqqxx")
    check(f"{tag}: no match says so", "No doctor by that name" in v["status"], v)
    typed = [u for u in sent if any(t in u.lower() for t in ("testone", "oconnor", "nunez", "zzqqxx", "connor"))]
    check(f"{tag}: no request carries the search text", not typed, typed)
    for g in ("likely", "nearby", "confirmed"):
        pg.goto(BASE + data[g]["p"])
        h1 = pg.inner_text("h1")
        check(f"{tag}: open the {g} profile", h1 == data[g]["n"], h1)
        check(f"{tag}: {g} profile fits the screen", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.screenshot(path=os.path.join(OUT, f"profile-{g}-{w}.png"), full_page=True)
    ctx.close()


def main():
    os.makedirs(OUT, exist_ok=True)
    d = json.load(open(os.path.join(os.path.dirname(__file__), "..", "..", "site", "data", "directory.json")))
    likely = next(p for p in d["people"] if p.get("l") and " " not in p["n"].strip().split(" ", 1)[1])
    nearby = next(p for p in d["people"] if not p.get("l"))
    data = {"likely": likely, "nearby": nearby, "confirmed": {"n": "Ann Testone", "p": f"/doctors/ann-testone-{ANN}/"}}
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        make_confirmed(pg)
        # Page readable without script, and the profile carries the finder's wording.
        nojs = b.new_context(java_script_enabled=False).new_page()
        nojs.goto(BASE + likely["p"])
        txt = nojs.inner_text("main")
        check("no script: profile shows name, procedure, office line, report link",
              likely["n"] in txt and "Likely performs this procedure." in txt and "Confirm this office before you go." in txt and "Report an error" in txt, txt[:300])
        nojs.goto(BASE + "/doctors/")
        check("no script: A to Z links on the search page", nojs.locator("nav.az a").count() >= 20)
        nojs.goto(BASE + "/doctors/a/")
        links = nojs.locator(".dir-list a").count()
        check("no script: letter page lists profiles", links > 50, links)
        nojs.goto(BASE + data["confirmed"]["p"])
        txt = nojs.inner_text("main")
        check("confirmed profile: tag, no confirm-office line, no Is this you?",
              "Confirmed by physician" in txt and "Confirm this office" not in txt and "Is this you?" not in txt, txt[:300])
        nojs.goto(BASE + nearby["p"])
        check("nearby profile: the nearby wording", "We don't yet know which procedures this doctor performs. Call and ask about:" in nojs.inner_text("main"))
        # Identical qualifiers within each group.
        for g, people in (("likely", [p for p in d["people"] if p.get("l") == "ufe"][:6]), ("nearby", [p for p in d["people"] if not p.get("l")][:6])):
            seen = set()
            for x in people:
                nojs.goto(BASE + x["p"])
                seen.add(nojs.evaluate("() => [...document.querySelectorAll('.dir-procs strong, .confirm-office')].map(e => e.textContent).join('|')"))
            check(f"identical qualifiers within {g}", len(seen) == 1, seen)
        # Finder cards: the name opens the profile; no link for anyone outside the three groups (test listing has none).
        pg.goto(BASE + "/fibroids/?zip=60605&r=25")
        pg.wait_for_selector("#results li.card")
        cards = pg.evaluate("() => [...document.querySelectorAll('#results li.card')].map(c => ({ name: c.querySelector('h3').textContent, href: (c.querySelector('h3 a') || {}).getAttribute ? c.querySelector('h3 a').getAttribute('href') : null }))")
        members = {x["p"] for x in d["people"]} | {data["confirmed"]["p"]}
        bad = [c for c in cards if c["href"] and c["href"] not in members]
        check("finder: every card name links to a profile in the directory", cards and not bad and all(c["href"] or "test listing" in c["name"] for c in cards), bad or cards[:3])
        check("finder: test listing has no profile link", all(not c["href"] for c in cards if "test listing" in c["name"]))
        href = next(c["href"] for c in cards if c["href"])
        pg.click(f"#results h3 a[href='{href}']")
        pg.wait_for_load_state()
        check("finder: clicking the name opens the profile", pg.url.endswith(href), pg.url)
        pg.goto(BASE + "/")
        check("footer: Find a doctor by name", pg.locator("footer a[href='/doctors/']").count() == 1)
        for w, tag in ((1280, "desktop"), (390, "phone")):
            run_size(b, w, tag, data)
        b.close()
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    json.dump(R, open(os.path.join(OUT, "directory-e2e.json"), "w"), indent=1)
    print(f"{R['passed']}/{R['total']}")
    sys.exit(0 if R["passed"] == R["total"] else 1)


if __name__ == "__main__":
    main()
