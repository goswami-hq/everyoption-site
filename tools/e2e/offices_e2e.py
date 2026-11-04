#!/usr/bin/env python3
"""Job 16: doctors with several offices, rendered by the real finder.js. The test profile (site/data/test-profile.json)
on localhost, and its absence on the live host name; made-up doctors with 1 and 5 offices through request
interception. 390 and 1280 px, light and dark. Local server only.

  node tools/dev-server.mjs 8791 &
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/offices_e2e.py OUT_DIR
"""
import json, os, sys
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = "http://localhost:8791"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "site", "data")
R = {"checks": []}
TEST = "Sample Doctor, MD (test listing)"


def check(name, ok, detail=""):
    R["checks"].append({"check": name, "ok": bool(ok), "detail": str(detail)[:400]})
    if not ok:
        print("FAIL", name, detail)


def office(i, lat, lon):
    return {"practice": f"Five Office IR {i}", "street": f"{i}00 Long Example Boulevard, Suite {i}0{i}", "city": "Chicago",
            "state": "IL", "zip": "60605", "phone": f"31255501{i}{i}", "lat": lat, "lon": lon, "geo": "address"}


FIVE = {"npi": "1999999909", "name": "Five Office Testdoctor", "badge": "verified", "practice": "", "city": "Chicago", "state": "IL",
        "city_label": "", "phone": "", "url": "", "lat": 41.87, "lon": -87.62, "confirmed": True,
        "offices": [office(i, 41.87 + i * 0.01, -87.62) for i in range(1, 6)]}
ONE = {"npi": "1999999917", "name": "One Office Testdoctor", "badge": "verified", "practice": "", "city": "Chicago", "state": "IL",
       "city_label": "", "phone": "", "url": "", "lat": 41.88, "lon": -87.63, "confirmed": True,
       "offices": [dict(office(1, 41.88, -87.63), practice="Single Office IR")]}
OUTSIDE = {"npi": "1999999925", "name": "Far Office Testdoctor", "badge": "verified", "practice": "", "city": "Chicago", "state": "IL",
           "city_label": "", "phone": "", "url": "", "lat": 41.87, "lon": -87.62, "confirmed": True,
           "offices": [dict(office(1, 39.80, -89.64), practice="Springfield Only IR", city="Springfield")]}

CARDS = """() => [...document.querySelectorAll('li.card')].map(c => ({ name: c.querySelector('h3').textContent,
  npi: new URLSearchParams(((c.querySelector('.claim a') || {}).search) || '').get('npi'),
  conf: c.classList.contains('card-confirmed'), dist: c.querySelector('.dist').textContent,
  practice: (c.querySelector('.where .practice') || {}).textContent || '', where: c.querySelector('.where').innerText,
  call: (c.querySelector('a.call') || {}).textContent || '', note: !!c.querySelector('.dist-note'),
  all: [...c.querySelectorAll('.offices li')].map(li => li.innerText), lead: (c.querySelector('.offices li.lead .practice') || {}).textContent || '' }))"""
OVER = """() => { const bad = []; if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page');
  for (const c of document.querySelectorAll('li.card')) { const r = c.getBoundingClientRect();
    for (const d of c.querySelectorAll('*:not(.dist)')) { const q = d.getBoundingClientRect(); if (q.width && (q.right > r.right + 1 || q.left < r.left - 1)) { bad.push(c.querySelector('h3').textContent + ' ' + d.tagName); break; } } }
  return bad; }"""


def search(pg, zip_, r):
    pg.fill("#zip", zip_); pg.select_option("#radius", str(r)); pg.click("#zip-form button")
    pg.wait_for_function("!document.querySelector('#results').hasAttribute('aria-busy')"); pg.wait_for_timeout(500)
    return pg.evaluate(CARDS)


def run(b, width, scheme):
    tag = f"{width} {scheme}"
    ctx = b.new_context(viewport={"width": width, "height": 900}, color_scheme=scheme)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    for proc, path in (("ufe", "fibroids"), ("pae", "pae"), ("gae", "gae")):
        pg.goto(f"{BASE}/{path}/")
        cards = search(pg, "60605", 25)
        t = [c for c in cards if c["name"] == TEST]
        check(f"{tag} {proc}: test profile shows once on localhost in 60605", len(t) == 1, len(t))
        if not t:
            continue
        t = t[0]
        check(f"{tag} {proc}: it is confirmed and first", cards[0]["name"] == TEST and t["conf"], cards[0]["name"])
        check(f"{tag} {proc}: card leads with the 60605 office, its distance and Call button",
              t["practice"] == "Sample Interventional Radiology" and "Chicago, IL" in t["where"] and t["call"] == "Call (312) 555-0142"
              and t["dist"] == "under 1 mi", t)
        check(f"{tag} {proc}: All offices lists the three with address and distance, and a phone unless the Call button already shows it",
              len(t["all"]) == 3 and all(" mi" in x for x in t["all"]) and "555-01" not in t["all"][0] and all("555-01" in x for x in t["all"][1:]) and "Evanston" in t["all"][1]
              and "2 Example Avenue" in t["all"][1] and t["lead"] == "Sample Interventional Radiology", t["all"])
        check(f"{tag} {proc}: real address card says distance is from your ZIP center", t["note"])
        img = pg.evaluate("(() => { const i = [...document.querySelectorAll('li.card')].find(c => c.querySelector('h3').textContent.includes('test listing')).querySelector('img.photo'); return i ? [i.complete, i.naturalWidth, i.getAttribute('src')] : null; })()")
        check(f"{tag} {proc}: drawn avatar loads", img and img[0] and img[1] > 0 and img[2] == "/assets/test-avatar.svg", img)
        if proc == "ufe":
            pg.locator("li.card", has_text=TEST).first.screenshot(path=os.path.join(OUT, f"test-profile-{width}-{scheme}.png"))
            cards = search(pg, "60540", 25)
            t = [c for c in cards if c["name"] == TEST]
            check(f"{tag}: from 60540 the Naperville office leads", t and t[0]["practice"] == "Sample IR West" and t[0]["call"] == "Call (630) 555-0187", t[:1])
            cards = search(pg, "62711", 50)
            check(f"{tag}: from 62711 within 50 mi the test profile is absent (all offices outside)", not any(c["name"] == TEST for c in cards))
    # made-up doctors: 1 office (no extra list), 5 offices, all offices outside
    real = json.load(open(os.path.join(DATA, "ufe.json")))
    body = json.dumps(dict(real, people=[FIVE, ONE, OUTSIDE] + real["people"]))
    pg.route("**/data/ufe.json", lambda r: r.fulfill(status=200, content_type="application/json", body=body))
    pg.goto(f"{BASE}/fibroids/")
    cards = search(pg, "60605", 25)
    names = [c["name"] for c in cards]
    one = next((c for c in cards if c["name"] == ONE["name"]), None)
    five = next((c for c in cards if c["name"] == FIVE["name"]), None)
    check(f"{tag}: one office: no All offices list", one and one["all"] == [] and one["practice"] == "Single Office IR", one)
    check(f"{tag}: five offices: all five listed, nearest leads", five and len(five["all"]) == 5 and five["lead"] == "Five Office IR 1", five and five["all"][:2])
    check(f"{tag}: doctor with every office outside the radius is left out", OUTSIDE["name"] not in names)
    npis = [c["npi"] for c in cards]
    check(f"{tag}: no doctor twice (by NPI)", len(npis) == len(set(npis)) and None not in npis, [n for n in npis if npis.count(n) > 1][:3])
    conf = [c["conf"] for c in cards]
    check(f"{tag}: confirmed first", conf == sorted(conf, reverse=True))
    bad = pg.evaluate(OVER)
    check(f"{tag}: nothing overflows", not bad, bad[:4])
    for n, f in ((ONE["name"], "one-office"), (FIVE["name"], "five-offices")):
        pg.locator("li.card", has_text=n).first.screenshot(path=os.path.join(OUT, f"{f}-{width}-{scheme}.png"))
    check(f"{tag}: no page errors", not errs, errs)
    ctx.close()


def live_host(b):
    """The same page served under the live host name: the test profile must not load."""
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page(); asked = []

    def proxy(route):
        u = route.request.url
        if "test-profile" in u:
            asked.append(u)
        resp = route.fetch(url=u.replace("https://everyoptionmd.com", BASE))
        route.fulfill(response=resp)
    pg.route("https://everyoptionmd.com/**", proxy)
    pg.goto("https://everyoptionmd.com/fibroids/")
    cards = search(pg, "60605", 25)
    check("live host: test profile absent", not any(c["name"] == TEST for c in cards) and len(cards) > 0, len(cards))
    check("live host: test profile file never requested", not asked, asked)
    ctx.close()


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for width in (390, 1280):
            for scheme in ("light", "dark"):
                run(b, width, scheme)
        live_host(b)
        b.close()
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    json.dump(R, open(os.path.join(OUT, "offices-results.json"), "w"), indent=1)
    print(f"{R['passed']} of {R['total']} office checks")


if __name__ == "__main__":
    main()
