#!/usr/bin/env python3
"""Job 12 browser checks for condition education pages: every content/conditions/*.toml page at 390 and 1280 px, light
and dark, plus the home card and the UFE finder's link back. Job 13: updated for the grouped page (collapsed groups, no
comparison table or jump menu). Local server only; screenshots to OUT_DIR.

  node tools/dev-server.mjs 8792 &
  <browser venv>/bin/python tools/e2e/condition_e2e.py OUT_DIR
"""
import json, os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import condition  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = "http://localhost:8792"
R = {"checks": []}


def check(name, ok, detail=""):
    R["checks"].append({"check": name, "ok": bool(ok), "detail": str(detail)[:300]})
    if not ok:
        print("FAIL", name, detail)


def run():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for slug in condition.slugs():
            c = condition.load(slug)
            for w, h in [(390, 844), (1280, 900)]:
                for scheme in ["light", "dark"]:
                    ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, reduced_motion="reduce")
                    pg = ctx.new_page()
                    errs = []
                    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
                    pg.on("pageerror", lambda e: errs.append(str(e)))
                    tag = f"{slug} {w} {scheme}"
                    resp = pg.goto(f"{BASE}/{slug}/")
                    check(f"{tag}: 200", resp.status == 200, resp.status)
                    check(f"{tag}: one h1", pg.locator("h1").count() == 1)
                    over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                    check(f"{tag}: no sideways scroll", over <= 0, over)
                    # job 13: the page is grouped (decisions 2026-11-01): every option sits in exactly one group, all collapsed at first
                    groups = pg.locator("details.group").count()
                    check(f"{tag}: one group per category", groups == len(c["categories"]), groups)
                    opts = pg.evaluate("[...document.querySelectorAll('details.group details.option')].map(d => d.id)")
                    check(f"{tag}: every option in one group", sorted(opts) == sorted(o["id"] for o in c["options"]), opts)
                    check(f"{tag}: everything starts collapsed", pg.locator("details[open]").count() == 0)
                    bad = pg.evaluate("""() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href'))
                        .filter(h => h.length > 1 && !document.getElementById(h.slice(1)))""")
                    check(f"{tag}: every jump link and marker has a target", not bad, bad)
                    check(f"{tag}: diagram shown at {c['diagram_at']}", pg.locator(f"#{c['diagram_at']} figure.how svg").count() == 1)
                    # a link straight to an option opens its group (condition.js)
                    pg2 = ctx.new_page(); pg2.goto(f"{BASE}/{slug}/#{c['diagram_at']}"); pg2.wait_for_timeout(200)
                    check(f"{tag}: a link to an option opens it and its group",
                          pg2.evaluate(f"(() => {{ const d = document.getElementById('{c['diagram_at']}'); return d.open && d.parentElement.closest('details').open; }})()"))
                    pg2.close()
                    check(f"{tag}: no console errors", not errs, errs)
                    if w == 390:
                        tap = pg.evaluate("""() => [...document.querySelectorAll('.cta a, details > summary')].filter(a => { const r = a.getBoundingClientRect(); return r.height && r.height < 44; }).length""")
                        check(f"{tag}: section headings and buttons at least 44 px tall", tap == 0, tap)
                    # a group opens and closes on a tap
                    first = pg.locator("details.group > summary").first
                    first.click(); check(f"{tag}: a group opens", pg.locator("details.group").first.get_attribute("open") is not None)
                    first.click(); check(f"{tag}: and closes", pg.locator("details.group").first.get_attribute("open") is None)
                    # a reference marker opens the collapsed references and lands on the reference
                    pg.locator('p.answer sup.ref a').first.click()
                    pg.wait_for_timeout(150)
                    target = pg.locator('p.answer sup.ref a').first.get_attribute("href")[1:]
                    top = pg.evaluate(f"document.getElementById('{target}').getBoundingClientRect().top")
                    check(f"{tag}: a reference marker opens References and lands on it", -5 <= top <= h, top)
                    pg.evaluate("window.scrollTo(0, 0)")
                    pg.screenshot(path=os.path.join(OUT, f"{slug}-{w}-{scheme}.png"), full_page=True)
                    ld = pg.evaluate("""() => [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent))""")
                    faq = next((d for d in ld if d["@type"] == "FAQPage"), None)
                    vis = pg.evaluate("[...document.querySelectorAll('#faq h3')].map(h => h.textContent)")
                    check(f"{tag}: FAQ schema matches visible questions", faq and [q["name"] for q in faq["mainEntity"]] == vis)
                    page = next((d for d in ld if d["@type"] == "MedicalWebPage"), {})
                    check(f"{tag}: no author in schema while the setting is empty",
                          bool(c.get("author_name")) == ("author" in page))
                    # internal links resolve
                    links = pg.evaluate("""() => [...new Set([...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href').split('#')[0]))]""")
                    for href in links:
                        st = ctx.request.get(BASE + href).status
                        check(f"{tag}: link {href} resolves", st == 200, st)
                    ctx.close()
        # Home card and finder back-link (job 12 item 5)
        for w in (390, 1280):
            ctx = b.new_context(viewport={"width": w, "height": 900}, reduced_motion="reduce")
            pg = ctx.new_page()
            pg.goto(BASE + "/")
            check(f"home {w}: Fibroids card opens /fibroids/", pg.locator('.fork-list li.t-ufe a[href="/fibroids/"]').count() == 1)
            check(f"home {w}: Fibroids card has a direct finder link", pg.locator('.fork-list li.t-ufe a[href="/ufe/"]').count() == 1)
            check(f"home {w}: PAE and GAE cards unchanged", pg.locator('.fork-list a[href="/pae/"]').count() == 1 and
                  pg.locator('.fork-list a[href="/gae/"]').count() == 1)
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"home {w}: no sideways scroll", over <= 0, over)
            pg.screenshot(path=os.path.join(OUT, f"home-{w}.png"), full_page=True)
            pg.goto(BASE + "/ufe/")
            check(f"ufe {w}: links back to /fibroids/", pg.locator('.about a[href="/fibroids/"]').count() == 1)
            pg.screenshot(path=os.path.join(OUT, f"ufe-{w}.png"))
            ctx.close()
        b.close()
    ok = sum(c["ok"] for c in R["checks"])
    print(f"{ok}/{len(R['checks'])} checks pass")
    json.dump(R, open(os.path.join(OUT, "condition-e2e.json"), "w"), indent=1)
    return ok == len(R["checks"])


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
