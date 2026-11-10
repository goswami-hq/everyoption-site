#!/usr/bin/env python3
"""First-screen and phone rules of the page reference (docs/condition-pattern.md, "What to check before landing"), on the
local build in a real browser at 390 x 844, light and dark. Job platform-web-design-0009 (his yes 2026-11-09 22:06 CT).
tools/build.py does not run this; the page pipeline's check step does, after the build:

  node tools/dev-server.mjs 8797 &
  PLAYWRIGHT_BROWSERS_PATH="/Library/Application Support/ai-hq/browser/ms-playwright" \
    "/Library/Application Support/ai-hq/browser/venv/bin/python" -I tools/e2e/first_screen_e2e.py [--origin http://localhost:8797]

Only a local http origin is accepted. Exits non-zero on any failed check and prints each failure.
"""
import argparse, json, pathlib, re, sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
W, H = 390, 844
TAP = 44

n = fails = 0


def check(name, ok, detail=""):
    global n, fails
    n += 1
    if not ok:
        fails += 1
        print("FAIL", name, detail)


def conditions():
    """(slug, every-option path or None) for each built simple page, from the build's own outputs."""
    out = []
    for f in sorted(SITE.glob("*/index.html")):
        t = f.read_text(encoding="utf-8")
        if 'id="zip-form"' in t and '<section class="what-box"' in t:
            slug = f.parent.name
            deep = f.parent / "every-option" / "index.html"
            out.append((slug, f"/{slug}/every-option/" if deep.exists() else None))
    return out


def box(pg, sel):
    return pg.evaluate("""(s) => { const e = document.querySelector(s); if (!e) return null;
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return {top: r.top, bottom: r.bottom, h: r.height, w: r.width, display: cs.display, visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0,
                underline: (cs.textDecorationLine || '').includes('underline')}; }""", sel)


def on_first_screen(name, pg, sel):
    b = box(pg, sel)
    check(f"{name}: {sel} on the first screen (bottom <= {H})", bool(b and b["visible"] and b["bottom"] <= H), b)
    return b


def tall_enough(name, b, sel):
    check(f"{name}: {sel} at least {TAP} px tall", bool(b and b["h"] >= TAP - 0.5), b and round(b["h"]))


def common(name, pg):
    check(f"{name}: no sideways scroll", pg.evaluate("document.documentElement.scrollWidth") <= W, pg.evaluate("document.documentElement.scrollWidth"))
    check(f"{name}: one h1", pg.locator("h1").count() == 1)
    ins = box(pg, "nav.top a[href='/insurance/']")
    # phone menu keeps five items; Insurance is parked (his words 2026-11-08 22:27 CT: "Leave it for now but park it")
    check(f"{name}: no Insurance item in the phone menu", bool(ins) and not ins["visible"], ins)
    menu = pg.evaluate("[...document.querySelectorAll('nav.top a')].filter(a => getComputedStyle(a).display !== 'none').map(a => a.getBoundingClientRect().bottom)")
    check(f"{name}: menu on one row", len(set(round(x) for x in menu)) == 1, menu)


def run(origin):
    cond = conditions()
    city = profile = None
    fib = (SITE / "fibroids" / "index.html").read_text(encoding="utf-8")
    m = re.search(r'href="(/fibroids/doctors/[a-z-]+/)"', fib)
    city = m.group(1) if m else None
    a = (SITE / "doctors" / "a" / "index.html").read_text(encoding="utf-8")
    m = re.search(r'href="(/doctors/[a-z0-9-]+-\d{10}/)"', a)
    profile = m.group(1) if m else None
    with sync_playwright() as p:
        b = p.chromium.launch()
        for scheme in ("light", "dark"):
            ctx = b.new_context(viewport={"width": W, "height": H}, color_scheme=scheme, device_scale_factor=1)
            pg = ctx.new_page()
            errors = []
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

            def go(path):
                pg.goto(origin + path)
                pg.wait_for_load_state("load")
                pg.wait_for_timeout(250)
                pg.evaluate("window.scrollTo(0, 0)")

            for slug, deep in cond:
                name = f"{scheme} /{slug}/"
                go(f"/{slug}/")
                common(name, pg)
                on_first_screen(name, pg, "h1")
                # the ZIP finder sits inside the first screen, button included
                on_first_screen(name, pg, "#zip-form input[name='zip']")
                tall_enough(name, on_first_screen(name, pg, "#zip-form button"), "#zip-form button")
                if deep:
                    # compare link on the first screen (walkthrough fix 1, his words 2026-11-09: "1-4 changes let's do them")
                    tall_enough(name, on_first_screen(name, pg, "a.find-compare"), "a.find-compare")
                if deep:
                    name = f"{scheme} {deep}"
                    go(deep)
                    common(name, pg)
                    on_first_screen(name, pg, "h1")
                    on_first_screen(name, pg, ".glance-peek caption")
                    tall_enough(name, on_first_screen(name, pg, ".peek-more a"), ".peek-more a")
                    # finder button inside the first screen at 390 x 844 (his words 2026-11-09 21:46 CT)
                    tall_enough(name, on_first_screen(name, pg, ".glance-peek + p.cta a.btn, p.cta a.btn"), "p.cta a.btn")
                    near = box(pg, "p.cov-near a")
                    if near:
                        tall_enough(name, near, "p.cov-near a")
            name = f"{scheme} /"
            go("/")
            common(name, pg)
            on_first_screen(name, pg, ".home-banner")
            on_first_screen(name, pg, "h1")
            check(f"{name}: banner has no replay control", pg.locator(".home-banner button, .home-banner .pb-replay").count() == 0)
            if city:
                name = f"{scheme} {city}"
                go(city)
                common(name, pg)
                on_first_screen(name, pg, "h1")
                on_first_screen(name, pg, "p.answer")
                nm = box(pg, "li.card h3 a")
                # doctor names read as links (his 3A, 2026-11-09)
                check(f"{name}: doctor names underlined", bool(nm and nm["underline"]), nm)
                lab = pg.locator("li.card a.page").first
                if lab.count():
                    check(f"{name}: doctor's site button label", lab.inner_text().strip() == "Doctor's website ↗", lab.inner_text())
            if profile:
                name = f"{scheme} {profile}"
                go(profile)
                common(name, pg)
                on_first_screen(name, pg, "h1")
            check(f"{scheme}: no console errors", not errors, errors[:3])
            ctx.close()
        b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", default="http://localhost:8797")
    o = ap.parse_args().origin.rstrip("/")
    u = urlsplit(o)
    if u.scheme != "http" or u.hostname not in ("localhost", "127.0.0.1"):
        raise SystemExit("local http origin only")
    run(o)
    print(f"{n - fails} of {n} first-screen checks")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
