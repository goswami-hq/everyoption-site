#!/usr/bin/env python3
"""Job 25 browser test: a doctor's saved change shows in a patient search; a removed procedure leaves the list; the
finder still works when the overlay is down or slow. Local servers only (made-up people, local stand-ins).

  node tools/dev-server.mjs 8795 --accounts &                       # normal
  node tools/dev-server.mjs 8796 --accounts --listings-down &       # database down
  node tools/dev-server.mjs 8797 --accounts --listings-slow=6000 &  # database slower than the finder waits
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/live_e2e.py OUT_DIR
Ann Testone (made up) is injected into the static UFE file in Chicago, as if a public page listed her, so removal is
tested over a public listing. Writes results.json and PNGs to OUT_DIR.
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
NORMAL, DOWN, SLOW = "http://localhost:8795", "http://localhost:8796", "http://localhost:8797"
ANN = "1999000015"
R = {"checks": [], "console_errors": [], "overlay_requests": []}
OFFICE = {"practice": "Lakeside Test IR", "street": "100 Test Plaza", "city": "Chicago", "state": "IL", "zip": "60611",
          "phone": "3125550100"}


def check(name, ok, detail=""):
    R["checks"].append({"check": name, "ok": bool(ok), "detail": str(detail)[:300]})
    print(("OK  " if ok else "FAIL") + " " + name + (f" ({detail})" if detail and not ok else ""))


def api(pg, base, method, path, body=None):
    r = pg.request.fetch(base + "/api/account/" + path, method=method, headers={"Origin": base, "Content-Type": "application/json"},
                         data=json.dumps(body or {}) if method != "GET" else None)
    return r.status, (r.json() if r.text() else None)


def sign_up(pg, base, procs):
    s, b = api(pg, base, "POST", "signup", {"specialty": "ir", "npi": ANN, "email": "ann@home.example", "agree": True})
    assert s == 202, b
    out = json.loads(pg.request.get(base + "/__outbox").text())
    code = re.search(r"code is (\d{6})\.", [m for m in out if m["to"] == "ann@home.example"][-1]["text"]).group(1)
    s, b = api(pg, base, "POST", "code", {"challenge": b["challenge"], "code": code})
    assert s == 200, b
    s, b = api(pg, base, "POST", "attest", {"procedures": procs, "agree": True})
    assert s == 200, b


def with_ann(route):
    r = route.fetch()
    d = r.json()
    d["people"] = [{"npi": ANN, "name": "Ann Testone", "badge": "verified", "practice": "Found Practice", "city": "Chicago",
                    "state": "IL", "city_label": "", "phone": "3125550000", "url": "https://lakeside.example/ann", "grade": "B",
                    "lat": 41.894, "lon": -87.62, "confirmed": False}] + d["people"]
    route.fulfill(response=r, body=json.dumps(d))


def search(pg, base, zip_="60611"):
    pg.goto(base + "/fibroids/")
    t = time.time()
    pg.fill("#zip", zip_); pg.select_option("#radius", "25"); pg.click("#zip-form button")
    pg.wait_for_function("!document.querySelector('#results').hasAttribute('aria-busy') && document.querySelector('#results li.card')",
                         timeout=15000)
    return time.time() - t


def ann_card(pg):
    cards = pg.locator("li.card", has_text="Ann Testone")
    return cards.first if cards.count() else None


def watch(pg):
    pg.on("console", lambda m: m.type == "error" and R["console_errors"].append(m.text))
    pg.on("request", lambda q: "/api/listings" in q.url and R["overlay_requests"].append(q.url))


normal_errors = []


def main():
    global normal_errors
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        state = None
        for label, vp in (("desktop", {"width": 1280, "height": 900}), ("phone", {"width": 390, "height": 844})):
            # one server for both: the phone run reuses Ann's signed-in session from the desktop run
            ctx = b.new_context(viewport=vp, storage_state=state); pg = ctx.new_page(); watch(pg)
            pg.route("**/data/ufe.json", with_ann)
            search(pg, NORMAL)
            c = ann_card(pg)
            if label == "desktop":
                check(f"{label}: before any account, the public listing shows Ann in Likely", c is not None and
                      pg.locator("section.tier-b li.card", has_text="Ann Testone").count() == 1)
                sign_up(pg, NORMAL, ["ufe"])
            s, _ = api(pg, NORMAL, "PUT", "profile", {"offices": [OFFICE], "booking_url": "https://lakeside-test.example/book"})
            check(f"{label}: save office, phone and link", s == 200, s)
            t0 = time.time()
            search(pg, NORMAL)
            c = ann_card(pg)
            txt = c.inner_text() if c else ""
            check(f"{label}: saved change shows in the next search (Likely, office, phone, Website)",
                  c is not None and pg.locator("section.tier-b li.card", has_text="Ann Testone").count() == 1
                  and "Lakeside Test IR" in txt and "100 Test Plaza" in txt and "(312) 555-0100" in txt and "Website" in txt, txt[:200])
            check(f"{label}: card has the one confirm-this-office line", "Details not confirmed by this doctor. Check with the office before you go." in txt)
            check(f"{label}: seen within a minute of saving", time.time() - t0 < 60, round(time.time() - t0, 1))
            (c.screenshot if c else pg.screenshot)(path=os.path.join(OUT, f"{label}-saved.png"))
            s, _ = api(pg, NORMAL, "POST", "withdraw", {"procedure": "ufe"})
            check(f"{label}: remove UFE", s == 200, s)
            search(pg, NORMAL)
            check(f"{label}: removed doctor is gone from the UFE list though the public file lists her", ann_card(pg) is None)
            pg.screenshot(path=os.path.join(OUT, f"{label}-removed.png"), full_page=False)
            api(pg, NORMAL, "POST", "attest", {"procedures": ["ufe"], "agree": True})       # back on for the phone run
            state = ctx.storage_state()
            ctx.close()
        normal_errors = list(R["console_errors"])

        ctx = b.new_context(); pg = ctx.new_page(); watch(pg)
        took = search(pg, DOWN)
        check("database down: search still shows results from the static file", pg.locator("li.card").count() > 0)
        check("database down: no wait", took < 4, round(took, 2))
        took = search(pg, SLOW)
        check("slow database: results from the static file at the time limit, no hang", pg.locator("li.card").count() > 0 and took < 5,
              round(took, 2))
        ctx.close()
        b.close()
    check("overlay requests carry the procedure only, never the ZIP",
          R["overlay_requests"] and all(re.search(r"/api/listings\?procedure=ufe$", u) for u in R["overlay_requests"]),
          R["overlay_requests"][:3])
    check("no console errors on the normal server (the down and slow runs log their expected 503)", not normal_errors, normal_errors[:3])
    json.dump(R, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    bad = [c for c in R["checks"] if not c["ok"]]
    print(f"{len(R['checks']) - len(bad)}/{len(R['checks'])} passed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
