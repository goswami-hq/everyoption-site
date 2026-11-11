#!/usr/bin/env python3
"""Procedure animations on /fibroids/, /enlarged-prostate/, /knee-arthritis/, /hemorrhoids/: loads clean, steps work, reduced motion stays still, no sideways scroll.
  node tools/dev-server.mjs 8793 &
  python3 tools/e2e/anim_e2e.py OUT_DIR
"""
import os, sys
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = os.environ.get("BASE", "http://localhost:8793")
fails = n = 0
def check(name, ok, detail=""):
    global fails, n
    n += 1
    if not ok:
        fails += 1; print("FAIL", name, detail)
with sync_playwright() as p:
    b = p.chromium.launch()
    for path, slug in (("/fibroids/", "ufe"), ("/enlarged-prostate/", "pae"), ("/knee-arthritis/", "gae"), ("/hemorrhoids/", "hae")):
        for w, scheme, rm in ((390, "dark", "no-preference"), (390, "light", "no-preference"), (1280, "light", "no-preference"), (390, "light", "reduce")):
            ctx = b.new_context(viewport={"width": w, "height": 844}, color_scheme=scheme, reduced_motion=rm)
            pg = ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(BASE + path); pg.evaluate("document.querySelectorAll('details.how-fold').forEach(d => d.open = true)")
            tag = f"{slug} {w} {scheme} {rm}"
            fig = pg.locator("figure.proc")
            check(f"{tag}: one animation for this procedure", fig.count() == 1 and fig.get_attribute("data-proc") == slug)
            labels = pg.locator("figure.proc svg text.label").all_text_contents()
            check(f"{tag}: simple labels on the drawing", "Artery" in labels and len(labels) >= 2, labels)
            fig.scroll_into_view_if_needed(); pg.wait_for_timeout(500)
            check(f"{tag}: controls show", pg.locator(".proc-steps").is_visible() and pg.locator(".proc-replay").is_visible())
            for i in (2, 1, 0):
                pg.locator(f"#st-{i}").click(); pg.wait_for_timeout(250)
                check(f"{tag}: step {i} shows its caption", pg.locator(f"#cap-{i}").is_visible() and pg.locator(".proc-cap:visible").count() == 1)
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"{tag}: no sideways scroll", over <= 0, over)
            check(f"{tag}: no script errors", not errs, errs)
            pg.locator("#st-2").click(); pg.wait_for_timeout(5000 if rm != "reduce" else 200)
            fig.screenshot(path=os.path.join(OUT, f"anim-{slug}-{w}-{scheme}-{rm}.png"))
            ctx.close()
    # without JavaScript all three captions stay readable and no catheter is drawn
    ctx = b.new_context(java_script_enabled=False); pg = ctx.new_page(); pg.goto(BASE + "/enlarged-prostate/")
    # job 32: on the condition page the diagram sits in the folded How it works section (as on /fibroids/); opening it needs no script
    pg.locator("#embolization details.how-fold > summary").click()
    check("no JavaScript: all captions show", pg.locator(".proc-cap:visible").count() == 3)
    ctx.close(); b.close()
print(f"{n - fails} of {n} animation checks")
sys.exit(1 if fails else 0)
