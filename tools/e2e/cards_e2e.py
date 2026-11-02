#!/usr/bin/env python3
"""Job 10 card layouts: every mix of the doctor-supplied fields (photo, note, insurances, "confirm with the office",
booking link, more offices, phone, doctor's page: 256 cards) plus long-text cards, rendered by the real finder.js at
390 and 1280 px, light and dark, in the base design and the UFE, PAE and GAE colours. Made-up data, served through
request interception; local server only.

  node tools/dev-server.mjs 8791 &
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/cards_e2e.py OUT_DIR
"""
import json, os, struct, sys, zlib
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = "http://localhost:8791"
HERE = os.path.dirname(os.path.abspath(__file__))
ZIP = "60611"
CENTRE = json.load(open(os.path.join(HERE, "..", "..", "site", "data", "zip", "606.json")))[ZIP]
FIELDS = ["photo", "blurb", "insurances", "insurance_confirm", "booking_url", "offices", "phone", "url"]
LONG = "Supercalifragilisticexpialidociousinterventionalradiologyembolizationspecialist"
R = {"checks": [], "runs": []}


def check(name, ok, detail=""):
    R["checks"].append({"check": name, "ok": bool(ok), "detail": str(detail)[:400]})
    if not ok:
        print("FAIL", name, detail)


def png(w=128, h=128):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    raw = b"".join(b"\0" + bytes([180, 140, 120]) * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def person(i, mask, long=False):
    on = {f: bool(mask >> k & 1) for k, f in enumerate(FIELDS)}
    p = {"npi": f"19990{i:05d}", "name": f"Combo {i:03d} Testperson", "badge": "verified",
         "practice": "Lakeside Interventional Radiology" if i % 2 else "", "city": "Chicago", "state": "IL",
         "city_label": "City from public records; confirm location with the practice." if i % 3 == 0 else "",
         "phone": "3125550100" if on["phone"] else "", "url": "https://lakeside.example/team/x" if on["url"] else "",
         "lat": CENTRE[0], "lon": CENTRE[1], "confirmed": any(on[f] for f in FIELDS[:6])}
    if on["photo"]: p["photo"] = f"/photos/19990{i:05d}-abcdef0123456789.png"
    if on["blurb"]: p["blurb"] = "I perform this procedure at Lakeside in Chicago and Evanston. Call the office to ask whether it fits you."
    if on["insurances"]: p["insurances"], p["insurance_other"] = ["Aetna", "Medicare", "UnitedHealthcare"], "Most local plans"
    if on["insurance_confirm"]: p["insurance_confirm"] = True
    if on["booking_url"]: p["booking_url"] = "https://lakeside.example/book"
    if on["offices"]: p["offices"] = [{"practice": "Lakeside IR", "city": "Chicago", "state": "IL", "phone": "3125550100"},
                                       {"practice": "Lakeside IR North", "city": "Evanston", "state": "IL", "phone": "8475550111"},
                                       {"practice": "", "city": "Skokie", "state": "IL", "phone": ""}]
    if long:
        p.update(name="Maximiliana Anastasia Bartholomew-Wolfeschlegelsteinhausen " + LONG[:30], practice="The " + LONG + " Group",
                 blurb=(LONG + " ") * 3 + "x" * (300 - len((LONG + " ") * 3)), insurance_other=LONG,
                 offices=[p.get("offices", [{}])[0] or {}, {"practice": LONG, "city": "Rancho Palos Verdes Estates", "state": "CA", "phone": "3105550199"}])
        p["offices"][0] = {"practice": "x", "city": "Chicago", "state": "IL", "phone": ""}
    return p, on


PEOPLE, MASKS = [], {}
for m in range(256):
    p, on = person(m, m); PEOPLE.append(p); MASKS[p["name"]] = on
for j in range(4):
    p, on = person(300 + j, 255 if j % 2 == 0 else 0b00000011, long=True); PEOPLE.append(p); MASKS[p["name"]] = None

JS_LAYOUT = """() => {
  const bad = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page scrolls sideways: ' + document.documentElement.scrollWidth);
  for (const c of document.querySelectorAll('li.card')) {
    const r = c.getBoundingClientRect(), sec = c.closest('section').getBoundingClientRect();
    // html and body clip sideways overflow, so page scrollWidth alone cannot see a card wider than the screen
    if (r.right > innerWidth + 1 || r.left < -1 || r.right > sec.right + 1) bad.push(c.querySelector('h3').textContent + ': card wider than the screen or its group');
    if (c.scrollWidth > c.clientWidth + 1) bad.push(c.querySelector('h3').textContent + ': card overflows');
    for (const d of c.querySelectorAll('*')) {
      const q = d.getBoundingClientRect();
      if (q.width && (q.right > r.right + 1 || q.left < r.left - 1)) { bad.push(c.querySelector('h3').textContent + ': ' + d.tagName + '.' + d.className + ' outside'); break; }
    }
  }
  return bad;
}"""
JS_FIELDS = """() => [...document.querySelectorAll('li.card')].map(c => ({ name: c.querySelector('h3').textContent,
  photo: !!c.querySelector('img.photo'), blurb: !!c.querySelector('.blurb'), insurances: /Aetna/.test((c.querySelector('.ins')||{}).textContent||''),
  insurance_confirm: !!c.querySelector('.ins .confirm'), booking_url: !!c.querySelector('a.book'), offices: !!c.querySelector('.offices'),
  phone: !!c.querySelector('a.call'), url: [...c.querySelectorAll('.actions a')].some(a => a.textContent === "Doctor's page"),
  emptyIns: !!c.querySelector('.ins') && !(c.querySelector('.ins').textContent.trim().length > 'Insurance:'.length) }))"""


def run(b, width, scheme, theme):
    proc = "ufe" if theme == "base" else theme
    ctx = b.new_context(viewport={"width": width, "height": 900}, color_scheme=scheme)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(f"**/data/{proc}.json", lambda r: r.fulfill(status=200, content_type="application/json",
             body=json.dumps({"procedure": proc, "name": proc, "counts": {}, "unplaced": 0, "held": 0, "people": PEOPLE})))
    pg.route("**/photos/*", lambda r: r.fulfill(status=200, content_type="image/png", body=png()))
    pg.goto(f"{BASE}/{'fibroids' if proc == 'ufe' else proc}/")
    if theme == "base":
        pg.evaluate("document.body.classList.remove('t-ufe')")
    pg.fill("#zip", ZIP); pg.select_option("#radius", "25"); pg.click("#zip-form button")
    pg.wait_for_function("!document.querySelector('#results').hasAttribute('aria-busy')")
    for _ in range(40):
        if pg.locator("button.more").count() == 0:
            break
        pg.locator("button.more").first.click()
    pg.wait_for_timeout(600)          # card arrival animation
    tag = f"{width} {scheme} {theme}"
    n = pg.locator("li.card").count()
    check(f"{tag}: all {len(PEOPLE)} cards shown", n == len(PEOPLE), n)
    bad = pg.evaluate(JS_LAYOUT)
    check(f"{tag}: nothing overflows (page or any card)", not bad, bad[:5])
    seen = pg.evaluate(JS_FIELDS)
    wrong = []
    for s in seen:
        on = MASKS.get(s["name"])
        if s["emptyIns"]:
            wrong.append(s["name"] + ": empty insurance line")
        if on is None:
            continue
        for f in FIELDS:
            if s[f] != on[f]:
                wrong.append(f"{s['name']}: {f} shown={s[f]} supplied={on[f]}")
    check(f"{tag}: each card shows exactly the fields supplied", not wrong, wrong[:5])
    conf = pg.locator("section.tier-a li.card").count()
    check(f"{tag}: confirmed cards in the confirmed group, first", conf == sum(p["confirmed"] for p in PEOPLE)
          and pg.evaluate("document.querySelector('section.tier-a').compareDocumentPosition(document.querySelector('section.tier-b')) & 4") > 0, conf)
    check(f"{tag}: no page errors", not errs, errs)
    for name, file in (("Combo 255 Testperson", "all-fields"), ("Combo 000 Testperson", "no-fields")):
        pg.locator("li.card", has_text=name).first.screenshot(path=os.path.join(OUT, f"card-{file}-{width}-{scheme}-{theme}.png"))
    pg.locator("li.card", has_text="Maximiliana").first.screenshot(path=os.path.join(OUT, f"card-long-{width}-{scheme}-{theme}.png"))
    R["runs"].append({"run": tag, "cards": n})
    ctx.close()


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for width in (390, 1280):
            for scheme in ("light", "dark"):
                for theme in ("base", "ufe", "pae", "gae"):
                    run(b, width, scheme, theme)
        b.close()
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    json.dump(R, open(os.path.join(OUT, "cards-results.json"), "w"), indent=1)
    print(f"{R['passed']} of {R['total']} card checks")


if __name__ == "__main__":
    main()
