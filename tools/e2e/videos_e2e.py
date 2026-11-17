#!/usr/bin/env python3
"""Videos in a real browser (ai-hq job platform-web-design-0019), on the local build:
- no request leaves the local origin before a tap (home and /videos/, 390 and 1440, light and dark);
- a tap swaps the still for the youtube-nocookie.com player in the same box (same size) and nothing else moves;
- layout shift on load (CLS from the browser's layout-shift entries) stays under 0.01 on both pages;
- the words fold opens; the header icons have names.
YouTube itself is never reached: requests to it are recorded, then aborted.

  node tools/dev-server.mjs 8797 &
  PLAYWRIGHT_BROWSERS_PATH="/Library/Application Support/ai-hq/browser/ms-playwright" \
    "/Library/Application Support/ai-hq/browser/venv/bin/python" -I tools/e2e/videos_e2e.py [--origin http://localhost:8797]
Skips the tap checks when the build shows no film (then /videos/ must not exist). Exits non-zero on any failure.
"""
import argparse, sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

n = fails = 0
CLS_JS = """() => new Promise(r => { let s = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) s += e.value; })
  .observe({ type: 'layout-shift', buffered: true }); } catch (e) {} setTimeout(() => r(s), 800); })"""


def check(name, ok, detail=""):
    global n, fails
    n += 1
    if not ok:
        fails += 1
        print("FAIL", name, detail)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", default="http://localhost:8797")
    a = ap.parse_args()
    o = urlsplit(a.origin)
    if o.scheme != "http" or o.hostname not in ("localhost", "127.0.0.1"):
        sys.exit("local http origin only")
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h, scheme in ((390, 844, "light"), (1440, 900, "light"), (390, 844, "dark")):
            ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme)
            outside = []

            def route(rt):
                u = urlsplit(rt.request.url)
                if u.hostname in ("localhost", "127.0.0.1"):
                    rt.continue_()
                else:
                    outside.append(rt.request.url)
                    rt.abort()
            ctx.route("**/*", route)
            pg = ctx.new_page()
            tag = f"{w}-{scheme}"
            pg.goto(a.origin + "/", wait_until="networkidle")
            pg.mouse.wheel(0, 4000)
            pg.wait_for_timeout(400)
            check(f"{tag} home: no outside request before a tap", not outside, outside[:3])
            cls = pg.evaluate(CLS_JS)
            check(f"{tag} home: layout shift under 0.01", cls < 0.01, cls)
            for nm in ("YouTube", "TikTok", "Instagram", "X"):
                el = pg.get_by_role("link", name=f"Every Option on {nm}")
                check(f"{tag} header icon {nm} named", el.count() == 1, el.count())
            check(f"{tag} home: four channel buttons", pg.locator(".watch .chan").count() == 4)
            has_film = pg.locator(".watch a.vid-play").count() == 1
            r = pg.goto(a.origin + "/videos/", wait_until="networkidle")
            if not has_film:
                check(f"{tag} /videos/ absent with no film", r.status == 404, r.status)
                ctx.close()
                continue
            check(f"{tag} /videos/ loads", r.status == 200, r.status)
            pg.mouse.wheel(0, 4000)
            pg.wait_for_timeout(400)
            check(f"{tag} /videos/: no outside request before a tap", not outside, outside[:3])
            cls = pg.evaluate(CLS_JS)
            check(f"{tag} /videos/: layout shift under 0.01", cls < 0.01, cls)
            fold = pg.locator("details.vid-words").first
            fold.locator("summary").click()
            check(f"{tag} words fold opens", fold.evaluate("d => d.open") and "everyoptionmd.com" in fold.inner_text())
            play = pg.locator("a.vid-play").first
            play.scroll_into_view_if_needed()
            box = play.bounding_box()
            below = pg.locator(".vid figcaption").first.bounding_box()
            play.click()
            pg.wait_for_timeout(300)
            fr = pg.locator("iframe.vid-player").first
            check(f"{tag} tap loads the player", fr.count() == 1)
            src = fr.get_attribute("src") or ""
            check(f"{tag} player is youtube-nocookie.com", src.startswith("https://www.youtube-nocookie.com/embed/"), src)
            fb = fr.bounding_box()
            check(f"{tag} player keeps the still's box", fb and abs(fb["width"] - box["width"]) < 1 and abs(fb["height"] - box["height"]) < 1, (box, fb))
            nb = pg.locator(".vid figcaption").first.bounding_box()
            check(f"{tag} nothing below moves on tap", abs(nb["y"] - below["y"]) < 1, (below["y"], nb["y"]))
            check(f"{tag} the outside request comes only after the tap", any("youtube-nocookie.com" in u for u in outside), outside[:3])
            check(f"{tag} no other outside origin", all(urlsplit(u).hostname == "www.youtube-nocookie.com" for u in outside), outside[:5])
            ctx.close()
        b.close()
    print(f"videos e2e: {n - fails} of {n} passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
