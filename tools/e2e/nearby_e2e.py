#!/usr/bin/env python3
"""Job 18: thin results. "Interventional radiologists nearby" from site/data/ir-roster.json when Confirmed plus Likely
within the radius are fewer than 5; "Nearest doctors farther away" when still thin; a referral line when nobody is within
250 miles. Real data for 62711, 60605 and 99723; made-up roster rows through request interception for the ordering and
exclusion rules. 390 and 1280 px, light and dark. Local server only.

  node tools/dev-server.mjs 8791 &
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/nearby_e2e.py OUT_DIR
"""
import json, os, sys
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = "http://localhost:8791"
R = {"checks": []}
NOTE = "These doctors are interventional radiologists near you. We couldn't confirm they perform this procedure, so call and ask."
REFER = "Ask your doctor to refer you to an interventional radiologist."


def check(name, ok, detail=""):
    R["checks"].append({"check": name, "ok": bool(ok), "detail": str(detail)[:400]})
    if not ok:
        print("FAIL", name, detail)


READ = """() => ({ status: document.getElementById('status').innerText,
  sections: [...document.querySelectorAll('#results section')].map(s => ({ cls: s.className,
    h2: (s.querySelector('h2') || {}).textContent || '', note: (s.querySelector('.tier-note') || {}).textContent || '',
    cards: [...s.querySelectorAll('li.card')].map(c => ({ name: c.querySelector('h3').textContent,
      npi: new URLSearchParams(((c.querySelector('.claim a') || {}).search) || '').get('npi'),
      claim: (c.querySelector('.claim a') || {}).textContent || '', ask: (c.querySelector('.ask-tag') || {}).textContent || '',
      label: (c.querySelector('.where .label') || {}).textContent || '',
      miles: parseFloat(c.querySelector('.dist').textContent.replace('under 1', '0')) })) })),
  refer: [...document.querySelectorAll('#results .referral p')].map(p => p.textContent),
  cards: document.querySelectorAll('#results li.card').length })"""
OVER = """() => { const bad = []; if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page');
  for (const c of document.querySelectorAll('li.card')) { const r = c.getBoundingClientRect();
    for (const d of c.querySelectorAll('*:not(.dist)')) { const q = d.getBoundingClientRect(); if (q.width && (q.right > r.right + 1 || q.left < r.left - 1)) { bad.push(c.querySelector('h3').textContent + ' ' + d.tagName); break; } } }
  return bad; }"""


def search(pg, path, zip_, r):
    pg.goto(f"{BASE}/{path}/")
    pg.fill("#zip", zip_); pg.select_option("#radius", str(r)); pg.click("#zip-form button")
    pg.wait_for_function("!document.querySelector('#results').hasAttribute('aria-busy')"); pg.wait_for_timeout(500)
    return pg.evaluate(READ)


def sec(v, cls):
    return next((s for s in v["sections"] if cls in s["cls"].split()), None)


def no_dupes(tag, v):
    npis = [c["npi"] for s in v["sections"] for c in s["cards"]]
    check(f"{tag}: no doctor in two groups or twice", len(npis) == len(set(npis)) and None not in npis,
          [n for n in npis if npis.count(n) > 1][:3])


def roster_row(npi, name, lat, lon, **kw):
    p = {"npi": npi, "name": name, "proven": True, "billing_only": False, "neuro_only": False, "practice": "", "city": "Testville",
         "state": "IL", "city_label": "", "phone": "217-555-0100", "url": "", "lat": lat, "lon": lon, "site_names": []}
    p.update(kw)
    return p


def run(b, width, scheme):
    tag = f"{width} {scheme}"
    ctx = b.new_context(viewport={"width": width, "height": 900}, color_scheme=scheme)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    for path, proc, r in (("fibroids", "uterine fibroid embolization (UFE)", 50), ("gae", "genicular artery embolization (GAE)", 25)):
        v = search(pg, path, "62711", r)
        t = f"{tag} {path} 62711 {r} mi"
        c = sec(v, "tier-c")
        names = [x["name"] for x in (c or {}).get("cards", [])]
        check(f"{t}: IRs nearby shows Mayer and Muehle", c and "Shawn Andrew Mayer" in names and "Casey Muehle" in names, names)
        check(f"{t}: heading and note", c and c["h2"].startswith("Interventional radiologists nearby") and c["note"] == NOTE, c and c["h2"])
        check(f"{t}: each IR card asks about the procedure and can be claimed",
              c and all(x["ask"] == f"Ask: do you perform {proc}?" and x["claim"] == "Is this you?" for x in c["cards"]), c and c["cards"][:1])
        f = sec(v, "tier-far")
        if len(c["cards"] if c else []) < 5:     # still thin: the farther group follows (job 17 part 2: UFE at 50 mi
            check(f"{t}: then nearest doctors farther away, with distances beyond the radius",      # is no longer thin)
                  f and f["cards"] and all(x["miles"] > r for x in f["cards"]) and v["sections"].index(f) > v["sections"].index(c), f and f["h2"])
            check(f"{t}: groups in order: confirmed line, IRs nearby, farther", [s["cls"].split()[-1] for s in v["sections"]][:3] == ["tier-empty", "tier-c", "tier-far"],
                  [s["cls"] for s in v["sections"]])
        else:
            check(f"{t}: 5 or more IRs nearby: no farther group", f is None and [s["cls"].split()[-1] for s in v["sections"]][:2] == ["tier-empty", "tier-c"],
                  [s["cls"] for s in v["sections"]])
        no_dupes(t, v)
        bad = pg.evaluate(OVER)
        check(f"{t}: nothing overflows", not bad, bad[:3])
        if path == "fibroids":
            pg.locator("#results").screenshot(path=os.path.join(OUT, f"62711-{width}-{scheme}.png"))
    v = search(pg, "fibroids", "60605", 25)
    check(f"{tag} 60605: no IRs nearby group", sec(v, "tier-c") is None and sec(v, "tier-far") is None and v["cards"] >= 5)
    no_dupes(f"{tag} 60605", v)
    v = search(pg, "pae", "99723", 25)       # Utqiagvik, AK (99701 has an IR at 178 mi since job 17 part 2)
    check(f"{tag} 99723 PAE: nobody within 250 miles gives the one referral line", v["refer"] == [REFER] and v["cards"] == 0, v)
    if width == 390:
        pg.locator("#results").screenshot(path=os.path.join(OUT, f"99723-{width}-{scheme}.png"))
    pg.goto(f"{BASE}/fibroids/"); pg.fill("#zip", ""); pg.click("#zip-form button"); pg.wait_for_timeout(200)
    check(f"{tag}: empty ZIP asks for 5 digits", "Enter a 5-digit ZIP code." in pg.inner_text("#status"))
    check(f"{tag}: no page errors", not errs, errs)
    ctx.close()


def rules(b):
    """Made-up roster: the practice-site-names-it doctor first; billing-only, neuro-only, no-contact and listed NPIs out;
    a city from public records looks like any other card; 5 or more found means no IR group."""
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    c62711 = (39.7701, -89.7091)
    with open(os.path.join(os.path.dirname(__file__), "..", "..", "site", "data", "ufe.json"), encoding="utf-8") as fh:
        listed = json.load(fh)["people"][0]
    people = [roster_row("1999990001", "Near Testdoctor", c62711[0] + 0.01, c62711[1]),
              roster_row("1999990002", "Names It Testdoctor", c62711[0] + 0.3, c62711[1], site_names=["ufe"]),
              roster_row("1999990003", "Billing Testdoctor", c62711[0], c62711[1], proven=False, billing_only=True),
              roster_row("1999990004", "Neuro Testdoctor", c62711[0], c62711[1], neuro_only=True),
              roster_row("1999990005", "Nocontact Testdoctor", c62711[0], c62711[1], phone="", url=""),
              roster_row("1999990006", "Records Testdoctor", c62711[0] + 0.05, c62711[1],
                         city_label="City from public records; confirm location with the practice."),
              roster_row(listed["npi"], "Listed Elsewhere Testdoctor", c62711[0], c62711[1])]
    pg.route("**/data/ir-roster.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"people": people})))
    v = search(pg, "fibroids", "62711", 25)
    c = sec(v, "tier-c")
    names = [x["name"] for x in (c or {}).get("cards", [])]
    check("rules: practice site naming the procedure sorts first, then distance", names[:3] == ["Names It Testdoctor", "Near Testdoctor", "Records Testdoctor"], names)
    check("rules: no billing-only, neuro-only, no-contact, or already-listed doctors", not {"Billing Testdoctor", "Neuro Testdoctor",
          "Nocontact Testdoctor", "Listed Elsewhere Testdoctor"} & set(names), names)
    rec = next((x for x in (c or {}).get("cards", []) if x["name"] == "Records Testdoctor"), {})
    check("rules: a city from public records carries no label of its own", rec.get("label", "") == "" and bool(rec), rec)
    more = [roster_row(f"19999901{i:02d}", f"Crowd {i} Testdoctor", c62711[0] + i * 0.01, c62711[1]) for i in range(6)]
    data = {"procedure": "ufe", "name": "ufe", "counts": {}, "unplaced": 0, "held": 0,
            "people": [dict(p, badge="verified", confirmed=False) for p in more[:5]]}
    pg.route("**/data/ufe.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(data)))
    v = search(pg, "fibroids", "62711", 25)
    check("rules: 5 Likely within the radius: no IRs nearby group, no farther group", sec(v, "tier-c") is None and sec(v, "tier-far") is None, v["status"])
    data["people"] = data["people"][:4]
    v = search(pg, "fibroids", "62711", 25)
    check("rules: 4 Likely: the IRs nearby group shows", sec(v, "tier-c") is not None, v["status"])
    ctx.close()


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for width in (390, 1280):
            for scheme in ("light", "dark"):
                run(b, width, scheme)
        rules(b)
        b.close()
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    json.dump(R, open(os.path.join(OUT, "nearby-results.json"), "w"), indent=1)
    print(f"{R['passed']} of {R['total']} nearby checks")


if __name__ == "__main__":
    main()
