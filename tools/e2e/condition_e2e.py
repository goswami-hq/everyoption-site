#!/usr/bin/env python3
"""Job 12 browser checks for condition education pages: every content/conditions/*.toml page at 390 and 1280 px, light
and dark. Job 13: updated for the grouped page (collapsed groups, no comparison table or jump menu). Job 15: the layout of
2026-11-02 (finder first, home cards straight to it, How it works link, Find a doctor bar, /ufe/ forwards). Local server
only; screenshots to OUT_DIR.

  node tools/dev-server.mjs 8792 &
  <browser venv>/bin/python tools/e2e/condition_e2e.py OUT_DIR
"""
import json, os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import condition  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = os.environ.get("BASE", "http://localhost:8792")
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
                    check(f"{tag}: every other option in one group", sorted(opts) == sorted(o["id"] for o in c["options"] if o["id"] != c["diagram_at"]), opts)
                    check(f"{tag}: the lead option is open and its group row points to it",
                          pg.locator(f"section.lead-option#{c['diagram_at']}").count() == 1 and pg.locator(f"details.group a.option-link[href='#{c['diagram_at']}']").count() == 1)
                    check(f"{tag}: everything starts collapsed", pg.locator("details[open]").count() == 0)
                    bad = pg.evaluate("""() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href'))
                        .filter(h => h.length > 1 && !document.getElementById(h.slice(1)))""")
                    check(f"{tag}: every jump link and marker has a target", not bad, bad)
                    check(f"{tag}: diagram shown at {c['diagram_at']}", pg.locator(f"#{c['diagram_at']} figure.how svg.main").count() == 1)
                    # a link straight to a collapsed option opens its group (condition.js)
                    other = next(o["id"] for o in c["options"] if o["id"] != c["diagram_at"])
                    pg2 = ctx.new_page(); pg2.goto(f"{BASE}/{slug}/#{other}"); pg2.wait_for_timeout(200)
                    check(f"{tag}: a link to an option opens it and its group",
                          pg2.evaluate(f"(() => {{ const d = document.getElementById('{other}'); return d.open && d.parentElement.closest('details').open; }})()"))
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
        # Job 15: the layout of 2026-11-02 (decisions: finder first on condition pages, home cards go straight there, a
        # Find a doctor bar once the ZIP box scrolls away, /ufe/ forwards to /fibroids/).
        for w, h in [(320, 640), (390, 844), (768, 1024), (1280, 900)]:
            ctx = b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce")
            pg = ctx.new_page()
            pg.goto(BASE + "/")
            check(f"home {w}: Fibroids card opens /fibroids/", pg.locator('.fork-list li.t-ufe a[href="/fibroids/"]').count() == 1)
            check(f"home {w}: no link to the old /ufe/, /pae/ or /gae/ pages", pg.locator('a[href^="/ufe"], a[href^="/pae"], a[href^="/gae"]').count() == 0)
            check(f"home {w}: Enlarged prostate card opens /enlarged-prostate/ (job 32), GAE card its page", pg.locator('.fork-list li.t-pae a[href="/enlarged-prostate/"]').count() == 1 and
                  pg.locator('.fork-list a[href="/arthritis-embolization/"]').count() == 1)
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"home {w}: no sideways scroll", over <= 0, over)
            if w in (390, 1280):
                pg.screenshot(path=os.path.join(OUT, f"home-{w}.png"), full_page=True)
            for card, path in (("t-ufe", "/fibroids/"), ("t-pae", "/enlarged-prostate/"), ("t-gae", "/arthritis-embolization/")):
                pg.goto(BASE + "/")
                pg.locator(f".fork-list li.{card} a").first.click(); pg.wait_for_load_state("load")
                box = pg.evaluate("(() => { const r = document.getElementById('zip').getBoundingClientRect(); return [r.top, r.bottom]; })()")
                check(f"home {w}: {card} card reaches the ZIP box in one tap", pg.url.endswith(path) and box[0] >= 0 and box[1] <= h,
                      [pg.url, box])
            ctx.close()
        for slug in ("fibroids", "enlarged-prostate", "arthritis-embolization"):
            for w, h in [(390, 844), (1280, 900)]:
                ctx = b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce")
                pg = ctx.new_page()
                tag = f"{slug} {w}"
                pg.goto(f"{BASE}/{slug}/")
                order = pg.evaluate("""(() => { const f = document.getElementById('finder'), h = document.querySelector('h1');
                    const edu = document.getElementById('options') || document.querySelector('.about');
                    return !!(f && h && edu && (h.compareDocumentPosition(f) & 4) && (f.compareDocumentPosition(edu) & 4)); })()""")
                check(f"{tag}: headline, then the finder, then the education", order)
                check(f"{tag}: one benefit sentence with a How it works link",
                      pg.locator(".find-intro").count() == 1 and pg.locator(".find-intro a", has_text="How it works").count() == 1)
                # How it works opens the procedure's section and brings it into view
                target = pg.locator(".find-intro a").get_attribute("href")[1:]
                pg.locator(".find-intro a").click(); pg.wait_for_timeout(200)
                st = pg.evaluate(f"""(() => {{ const el = document.getElementById('{target}'); const r = el.getBoundingClientRect();
                    let shut = 0; for (let n = el; n; n = n.parentElement) if (n.tagName === 'DETAILS' && !n.open) shut++;
                    return [shut, Math.round(r.top)]; }})()""")
                check(f"{tag}: How it works opens #{target} and shows it", st[0] == 0 and -5 <= st[1] <= h, st)
                if slug in ("fibroids", "enlarged-prostate", "arthritis-embolization"):
                    check(f"{tag}: How it works goes to the embolization section", target == "embolization", target)
                # the bar: hidden while the finder shows, shown once it scrolls away, and a tap returns to the ZIP box
                pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(200)
                bar = pg.locator(".find-bar")
                check(f"{tag}: one Find a doctor bar", bar.count() == 1)
                check(f"{tag}: bar hidden while the finder is visible", not bar.is_visible())
                pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(300)
                check(f"{tag}: bar shows once the finder scrolls away", bar.is_visible())
                if bar.is_visible():
                    bb = bar.bounding_box()
                    check(f"{tag}: bar at least 44 px tall and inside the screen", bb["height"] >= 44 and bb["x"] >= 0 and bb["x"] + bb["width"] <= w, bb)
                    pg.screenshot(path=os.path.join(OUT, f"{slug}-bar-{w}.png"))
                    bar.click(); pg.wait_for_timeout(300)
                    check(f"{tag}: tapping the bar puts focus in the ZIP box", pg.evaluate("document.activeElement.id") == "zip")
                    check(f"{tag}: and the bar hides again", not bar.is_visible())
                if slug in ("fibroids", "enlarged-prostate", "arthritis-embolization"):
                    # the button inside the embolization section goes back up to the finder too
                    pg.goto(f"{BASE}/{slug}/#embolization"); pg.wait_for_timeout(200)
                    pg.locator("#embolization .cta a").click(); pg.wait_for_timeout(300)
                    check(f"{tag}: the embolization section's button returns to the ZIP box",
                          pg.evaluate("document.activeElement.id") == "zip")
                ctx.close()
        # /ufe/ forwards: here through the page's own fallback, on Cloudflare through the 301 in site/_redirects
        ctx = b.new_context(); pg = ctx.new_page()
        pg.goto(BASE + "/ufe/"); pg.wait_for_url("**/fibroids/", timeout=5000)
        check("/ufe/ forwards to /fibroids/", pg.url.endswith("/fibroids/"), pg.url)
        pg.goto(BASE + "/ufe/?zip=60611&r=25"); pg.wait_for_url("**/fibroids/**", timeout=5000)
        check("/ufe/ forwarding lands on the fibroid finder", pg.locator("#finder[data-procedure=ufe]").count() == 1, pg.url)
        # Job 32: /pae/ forwards to /enlarged-prostate/ the same way, the ZIP query kept
        pg.goto(BASE + "/pae/"); pg.wait_for_url("**/enlarged-prostate/", timeout=5000)
        check("/pae/ forwards to /enlarged-prostate/", pg.url.endswith("/enlarged-prostate/"), pg.url)
        pg.goto(BASE + "/pae/?zip=60611&r=25"); pg.wait_for_url("**/enlarged-prostate/**", timeout=5000)
        check("/pae/ forwarding keeps the ZIP and lands on the PAE finder",
              "zip=60611" in pg.url and pg.locator("#finder[data-procedure=pae]").count() == 1, pg.url)
        pg.goto(BASE + "/enlarged-prostate/")
        check("prostate page: no fibroid words carried over",
              not any(x in pg.inner_text("main").lower() for x in ("fibroid", "uterus", "pregnan", "women")), "")
        # Job 33: /gae/ forwards to /arthritis-embolization/ the same way, the ZIP query kept; the finder is knee only
        pg.goto(BASE + "/gae/"); pg.wait_for_url("**/arthritis-embolization/", timeout=5000)
        check("/gae/ forwards to /arthritis-embolization/", pg.url.endswith("/arthritis-embolization/"), pg.url)
        pg.goto(BASE + "/gae/?zip=60611&r=25"); pg.wait_for_url("**/arthritis-embolization/**", timeout=5000)
        check("/gae/ forwarding keeps the ZIP and lands on the GAE finder",
              "zip=60611" in pg.url and pg.locator("#finder[data-procedure=gae]").count() == 1, pg.url)
        pg.goto(BASE + "/arthritis-embolization/")
        txt = pg.inner_text("main")
        check("arthritis page: no fibroid or prostate words carried over",
              not any(x in txt.lower() for x in ("fibroid", "uterus", "pregnan", "prostate")), "")
        check("arthritis page: the finder is labelled knee only", "doctors who perform knee embolization" in txt.lower() and
              "does not show who treats other joints" in txt.lower())
        check("arthritis page: other joints shown open after the knee section, frozen shoulder called not arthritis",
              pg.locator("section.lead-extra#other-joints").count() == 1 and "Frozen shoulder is not arthritis" in txt.replace("**", ""))
        check("arthritis page: the search names stay on the page", "genicular artery embolization" in txt.lower() and "GAE" in txt)
        ctx.close()
        rules = [l.split() for l in open(os.path.join(HERE, "..", "..", "site", "_redirects")) if l.strip() and not l.startswith("#")]
        for src in ("/ufe", "/ufe/"):
            check(f"_redirects sends {src} to /fibroids/ with a 301", [src, "/fibroids/", "301"] in rules, rules)
        for src in ("/pae", "/pae/"):
            check(f"_redirects sends {src} to /enlarged-prostate/ with a 301", [src, "/enlarged-prostate/", "301"] in rules, rules)
        for src in ("/gae", "/gae/"):
            check(f"_redirects sends {src} to /arthritis-embolization/ with a 301", [src, "/arthritis-embolization/", "301"] in rules, rules)
        sm = open(os.path.join(HERE, "..", "..", "site", "sitemap.xml")).read()
        check("sitemap no longer lists /ufe/", "/ufe/" not in sm)
        check("sitemap lists /enlarged-prostate/ and not /pae/", "/enlarged-prostate/" in sm and "/pae/" not in sm)
        check("sitemap lists /arthritis-embolization/ and not /gae/", "/arthritis-embolization/" in sm and "/gae/" not in sm)
        b.close()
    ok = sum(c["ok"] for c in R["checks"])
    print(f"{ok}/{len(R['checks'])} checks pass")
    json.dump(R, open(os.path.join(OUT, "condition-e2e.json"), "w"), indent=1)
    return ok == len(R["checks"])


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
