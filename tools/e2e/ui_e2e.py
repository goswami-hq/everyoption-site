#!/usr/bin/env python3
"""Job 13 UI check: defects found in the whole-site look-over, kept as tests so they stay fixed. Local server only.

  node tools/dev-server.mjs 8791 &
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/ui_e2e.py OUT_DIR

Checks, at 320, 390, 768 and 1280 px, light and dark:
- the header fits: the four menu links sit on one line;
- standalone links and controls are at least 44 px tall (header, footer, Sources, the extra links, claim choices);
  links inside a sentence are exempt, as WCAG 2.5.8 allows;
- paragraphs run 75 characters a line or fewer on desktop;
- no sideways scroll; every photo has width, height and alt text.
And once per width (job 19: the report form replaced the claim form): the report form hides after a successful send; an incomplete form names the missing fields in
one plain sentence, marks them invalid and moves focus to the first.
"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = "http://localhost:8791"
PAGES = ["/", "/fibroids/", "/pae/", "/gae/", "/how-we-know/", "/report/", "/account/"]
R = {"checks": []}


def check(name, ok, detail=""):
    R["checks"].append({"check": name, "ok": bool(ok), "detail": str(detail)[:400]})
    if not ok:
        print("FAIL", name, detail)


TARGETS = r"""() => {
  const out = [];
  const sel = 'header.site a, footer.site a, details.sources > summary, .fork-list a, .find-bar, .about > p > a, '
            + 'form.claim-form input[type=radio], form.claim-form input[type=checkbox]';
  for (const el of document.querySelectorAll(sel)) {
    const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') continue;
    if (el.classList.contains('skip')) continue;                   // shown only on focus
    const box = (el.type === 'radio' || el.type === 'checkbox') ? el.closest('label') : el;
    const r = box.getBoundingClientRect(); if (!r.width) continue;
    const p = el.parentElement, inline = el.tagName === 'A' && s.display === 'inline' && p &&
      p.innerText.trim().length > el.innerText.trim().length + 3;  // a link inside a sentence
    if (!inline && r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.value).trim().slice(0, 30)}" ${Math.round(r.height)}px`);
  }
  return out;
}"""
NAV = r"""() => { const t = [...document.querySelectorAll('nav.top a')].map(a => Math.round(a.getBoundingClientRect().top));
  return new Set(t).size; }"""
MEASURE = r"""() => { let worst = 0, where = '';
  for (const p of document.querySelectorAll('main p')) {
    const r = p.getBoundingClientRect(); if (!r.width || p.closest('.card')) continue;
    const s = getComputedStyle(p); const c = document.createElement('canvas').getContext('2d'); c.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const ch = r.width / c.measureText('0').width; if (ch > worst) { worst = ch; where = p.innerText.slice(0, 40); } }
  return [Math.round(worst), where]; }"""
IMGS = r"""() => [...document.querySelectorAll('main img')].filter(i => !i.getAttribute('width') || !i.getAttribute('height') || !i.alt).map(i => i.src)"""


def run():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for scheme in ("light", "dark"):
            for w in (320, 390, 768, 1280):
                ctx = b.new_context(viewport={"width": w, "height": 800}, color_scheme=scheme, reduced_motion="reduce")
                p = ctx.new_page()
                for path in PAGES:
                    p.goto(BASE + path, wait_until="load")
                    tag = f"{path} {w} {scheme}"
                    check(f"{tag}: menu on one line", p.evaluate(NAV) == 1, p.evaluate(NAV))
                    small = p.evaluate(TARGETS)
                    check(f"{tag}: standalone targets 44px or taller", not small, small[:4])
                    check(f"{tag}: no sideways scroll", p.evaluate("document.documentElement.scrollWidth <= innerWidth"))
                    check(f"{tag}: photos have size and alt", not p.evaluate(IMGS), p.evaluate(IMGS))
                    if w == 1280:
                        ch, where = p.evaluate(MEASURE)
                        check(f"{tag}: lines 75 characters or fewer", ch <= 75, f"{ch} ch: {where}")
                if scheme == "light":
                    p.goto(BASE + "/report/", wait_until="load")
                    p.fill("#r-email", "not-an-email")
                    p.click("#report-form button[type=submit]")
                    msg = p.inner_text("#report-status")
                    check(f"/report/ {w}: missing fields named in one sentence", msg == "Please add the doctor's name, what's wrong, and a full email address, or leave it blank.", msg)
                    bad = p.evaluate("() => [...document.querySelectorAll('#report-form [aria-invalid=true]')].map(e => e.id)")
                    check(f"/report/ {w}: missing fields marked invalid", bad == ["r-name", "r-reason", "r-email"], bad)
                    check(f"/report/ {w}: focus moves to the first missing field", p.evaluate("document.activeElement.id") == "r-name")
                    p.fill("#r-name", "Test Person"); p.fill("#r-email", "")
                    check(f"/report/ {w}: a corrected field is no longer marked", p.evaluate("document.getElementById('r-name').getAttribute('aria-invalid')") in (None, "false"))
                    p.check("input[name=reason][value=contact]")
                    check(f"/report/ {w}: a choice clears the mark", p.evaluate("document.getElementById('r-reason').getAttribute('aria-invalid')") in (None, "false"))
                    p.click("#report-form button[type=submit]")
                    p.wait_for_selector("#report-status.ok")
                    check(f"/report/ {w}: the form hides after a successful send", not p.is_visible("#report-form"))
                    check(f"/report/ {w}: plain confirmation", p.inner_text("#report-status") == "Thank you. We got your report.", p.inner_text("#report-status"))
                    p.screenshot(path=os.path.join(OUT, f"report-sent-{w}.png"))
                ctx.close()
        # job 15: no link to a removed page, and lists keep the Oxford comma (his rule, 2026-11-01)
        ctx = b.new_context(); p = ctx.new_page()
        for path in PAGES + ["/404.html"]:
            p.goto(BASE + path, wait_until="load")
            old = p.evaluate("() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /^\\/ufe(\\/|$|\\?)/.test(h))")
            check(f"{path}: no link to the removed /ufe/ page", not old, old)
            vis = p.evaluate("() => document.title + ' ' + document.body.innerText")
            miss = re.findall(r"\b[A-Z]{2,4}, [A-Z]{2,4} (?:and|or) [A-Z]{2,4}\b|\b\w+, \w+ or WebP\b", vis)
            check(f"{path}: short lists keep the Oxford comma", not miss, miss)
        p.goto(BASE + "/report/", wait_until="load")
        p.fill("#r-name", "Test Person")
        p.click("#report-form button[type=submit]")
        msg = p.inner_text("#report-status")
        check("/report/: one missing field reads plainly", msg == "Please add what's wrong.", msg)
        for path in PAGES + ["/404.html"]:
            p.goto(BASE + path, wait_until="load")
            old = p.evaluate("() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /^\\/claim(\\/|$|\\?)/.test(h))")
            check(f"{path}: no link to the old /claim/ page", not old, old)
            words = p.evaluate("() => document.body.innerText")
            check(f"{path}: no 'correction form' wording", "correction form" not in words.lower())
        ctx.close()
        b.close()
    json.dump(R, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    good = sum(c["ok"] for c in R["checks"])
    print(f"{good} of {len(R['checks'])} UI checks")
    return good == len(R["checks"])


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
