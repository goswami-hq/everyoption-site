#!/usr/bin/env python3
"""The condition-page pattern check (docs/condition-pattern.md; job platform-main-0016, his words 2026-11-06: "Whatever
schema we use for fibroids should be saved so we can mimic it for every other condition").

Runs at the end of the build on the written pages, and alone: python3 tools/pattern.py
Fails when a condition's simple and every-option pages share a title or H1 phrasing or a search target, when a required
link is missing, or when a page lacks its structured data. A page type a condition does not have yet is skipped; a draft
simple page that has not adopted the pattern (no `targets`) gets only the structured-data checks. City pages are
rendered on request, so their half of the check is tools/condition-pattern.test.mjs.
"""
import html, json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import condition, embolization, options

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
BRAND = " | Every Option"
TITLE_MAX, DESC_MIN, DESC_MAX = 65, 110, 160
RUN = 3   # two pages "share phrasing" when their titles or H1s have this many words in a row in common


def words(s):
    s = s.removesuffix(BRAND).lower().replace("vs.", "vs")
    return re.findall(r"[a-z0-9]+", s)


def runs(s, n=RUN):
    w = words(s)
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}


def has(text, phrase):
    return f" {' '.join(words(phrase))} " in f" {' '.join(words(text))} "


def page_parts(path):
    t = path.read_text(encoding="utf-8")
    title = html.unescape(re.search(r"<title>(.*?)</title>", t, re.S).group(1))
    h1 = html.unescape(re.sub(r"<[^>]+>", "", re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S).group(1)))
    desc = html.unescape(re.search(r'<meta name="description" content="(.*?)">', t).group(1))
    ld = [json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S)]
    return {"html": t, "title": title, "h1": h1, "desc": desc, "types": [x.get("@type") for x in ld], "ld": ld}


def links_to(p, href):
    return re.search(r'<a [^>]*href="' + re.escape(href) + r'(?:[?#][^"]*)?"[^>]*>([^<]{12,})</a>', p["html"])


def text_limits(errs, tag, p, targets):
    if len(p["title"]) > TITLE_MAX:
        errs.append(f'{tag}: title is {len(p["title"])} characters (max {TITLE_MAX}): "{p["title"]}"')
    if not p["title"].endswith(BRAND):
        errs.append(f'{tag}: title must end "{BRAND}"')
    if not DESC_MIN <= len(p["desc"]) <= DESC_MAX:
        errs.append(f'{tag}: description is {len(p["desc"])} characters ({DESC_MIN} to {DESC_MAX})')
    if not targets:
        errs.append(f"{tag}: no search targets (`targets`)")
    elif not has(p["title"], targets[0]):
        errs.append(f'{tag}: title does not hold its first target "{targets[0]}"')
    if "Page last reviewed" not in p["html"]:
        errs.append(f'{tag}: no "Page last reviewed" date')


def box_errors(tag, p, c):
    """The "What is <condition>?" box (job platform-condition-pages-0004): heading, definition, symptom tags and a
    "When to see a doctor" fold, all from the condition's place = "box" section."""
    s = next((x for x in c["sections"] if x.get("place") == "box"), None)
    m = re.search(r'<section class="what-box".*?</section>', p["html"], re.S)
    if not m:
        return [f'{tag}: no "{s["heading"] if s else "What is <condition>?"}" box']
    b, errs = m.group(0), []
    if not re.search(r"<h2[^>]*>What (is|are) [^<]+\?</h2>", b):
        errs.append(f'{tag}: the box heading is not "What is <condition>?"')
    if "<p>" not in b:
        errs.append(f"{tag}: the box has no definition")
    if not re.search(r'<ul class="what-tags"[^>]*>(<li>[^<]+</li>){2,}</ul>', b):
        errs.append(f"{tag}: the box has no symptom list")
    if not re.search(r'<details class="topic what-when"><summary>When to see a doctor</summary>', b):
        errs.append(f'{tag}: the box has no "When to see a doctor" fold')
    return errs


def has_box(c):
    s = next((x for x in c["sections"] if x.get("place") == "box"), None)
    return bool(s and s.get("text") and s.get("symptoms") and s.get("see_doctor"))


# ---- Page parts and fixed wording (job platform-web-design-0009; his yes 2026-11-09 22:06 CT: rebuild the pattern as
# the one reference and extend this check). Each rule cites its decision in docs/condition-pattern.md.

MENU = ["Home", "Conditions", "Insurance", "Directory", "How we know", "For physicians"]
FOOTER_LINKS = ['href="/report/"', 'href="/doctors/"', 'href="/insurance/"', 'href="/how-we-know/"']
SITE_LABEL, SITE_LABEL_SR = "Doctor's website", "Doctor's website, opens in a new tab"
SITE_LABEL_FILES = ["src-assets/finder.js", "lib/cities.mjs", "lib/directory.mjs"]


def in_order(errs, tag, t, marks):
    """Each (name, marker) must appear, and in this order from the top of the page."""
    at = -1
    for name, mark in marks:
        i = t.find(mark, at + 1)
        if i < 0:
            j = t.find(mark)
            errs.append(f"{tag}: {name} " + ("missing" if j < 0 else "out of order (comes too early)"))
            continue
        at = i


def chrome_errors(tag, p, conditions_href="/#conditions"):
    """Header menu (six items, Conditions target) and footer, on every page."""
    errs = []
    nav = re.search(r'<nav class="top" aria-label="Main">(.*?)</nav>', p["html"], re.S)
    if not nav:
        return [f"{tag}: no main menu"]
    items = [html.unescape(re.sub(r"<[^>]+>", "", x)) for x in re.findall(r"<a [^>]*>.*?</a>", nav.group(1))]
    if items != MENU:
        errs.append(f"{tag}: menu is {items}, not {MENU}")
    if f'<a href="{conditions_href}">Conditions</a>' not in nav.group(1):
        errs.append(f'{tag}: menu "Conditions" does not go to {conditions_href}')
    foot = re.search(r'<footer class="site">.*?</footer>', p["html"], re.S)
    if not foot:
        errs.append(f"{tag}: no footer")
    else:
        f = foot.group(0)
        for need in FOOTER_LINKS + ['class="disclosure"', "Education, not medical advice."]:
            if need not in f:
                errs.append(f"{tag}: footer lacks {need}")
    return errs


def coverage_of(c):
    return next((x["coverage"] for x in condition.PROCEDURES if x["key"] == c.get("finder") and x.get("coverage")), None)


def simple_parts(tag, p, c, slug, deep_path):
    errs, t = [], p["html"]
    finder = bool(c.get("finder"))   # a condition with no doctor list (hemorrhoids) has no finder (L622)
    top = ([('"How it works" link', '<p class="find-links"><a href="#'), ("ZIP finder", 'id="zip-form"')] if finder
           else [("intro", '<p class="lede">')])
    in_order(errs, tag, t, [("H1", "<h1>")] + top + [('"What is" box', '<section class="what-box"'),
                            ("lead option", '<section class="lead-option"'), ("other options", '<section id="options">'),
                            ("Learn more", '<section id="learn">'), ("references", 'id="references"'),
                            ('"Page last reviewed"', "Page last reviewed")])
    # compare link on the first screen, beside "How it works" (walkthrough fix 1, his words 2026-11-09 "1-4 changes let's do them")
    # with no finder the link sits under the intro (hero-compare, job platform-condition-pages-0014)
    compare = None
    if deep_path:
        compare = (f'<a class="find-compare" href="{deep_path}">Compare your options</a>' if finder else
                   f'<p class="hero-compare"><a href="{deep_path}">Compare your options</a></p>')
    if compare and compare not in t:
        errs.append(f'{tag}: no first-screen "Compare your options" link to {deep_path}')
    if compare and finder and t.find('class="find-compare"') > t.find('id="zip-form"'):
        errs.append(f"{tag}: the compare link comes after the finder")
    if not deep_path and ('class="find-compare"' in t or 'class="hero-compare"' in t):
        errs.append(f"{tag}: compare link with no every-option page")
    # coverage link under the lead option's finder button (his words 2026-11-08 21:35 CT)
    cov = coverage_of(c)
    lead = re.search(r'<section class="lead-option".*?</section>', t, re.S)
    if cov:
        want = f'<p class="cov-link"><a href="{cov["path"]}">{html.escape(cov["link"], quote=False)}</a></p>'
        if not lead or want not in lead.group(0):
            errs.append(f'{tag}: no "{cov["link"]}" link in the lead option')
    elif 'class="cov-link"' in t:
        errs.append(f"{tag}: insurance link with no coverage page")
    errs += chrome_errors(tag, p, f"/?from={slug}#conditions")
    errs += ruling_errors(tag, t, c)
    errs += embo_errors(tag, t, c)
    return errs


def ruling_errors(tag, t, c):
    """Clinical rulings every page follows. GAE is strictly outpatient (his words 2026-11-09: "GAE is strictly
    outpatient"): the knee pages never hedge the same-day stay."""
    errs = []
    if c.get("finder") == "gae":
        text = re.sub(r"<[^>]+>", " ", t)
        if re.search(r"\b(Most|Many|Some|Usually|often)\b[^.]{0,40}\b(home|discharged)\b[^.]{0,20}same day", text, re.I):
            errs.append(f"{tag}: hedges the GAE same-day stay (GAE is strictly outpatient)")
    # Frequencies read "1 out of 5", never "1 in 5" (his words 2026-11-09 22:39 CT: "1. Yes"). Patient text only:
    # the reference list is cut off first, since study titles may say "in".
    body = re.sub(r"<[^>]+>", " ", re.split(r'id="references"|<h2[^>]*>References', t)[0])
    # "out of 100 in 2023" names a year, not a frequency (knee rewrite, 2026-11-12)
    m = re.search(r"(?<!out of )\b\d+(?: to \d+)? in (?!(?:19|20)\d\d\b)\d[\d,]*\b(?! (?:years?|months?|weeks?|days?|hours?|minutes?|mi|miles?)\b)", body)
    if m:
        errs.append(f'{tag}: frequency written "{m.group(0)}"; write "out of"')
    return errs


def embo_errors(tag, t, c, deep=False):
    """The embolization explainer (ai-hq job platform-condition-pages-0020, his words 2026-11-11 14:25 CT: "Across all the
    embo pages, we need to explain what embolization is simply and the types of things we use as embolic agents simply").
    Every condition whose lead treatment is an embolization must be in content/embolization.toml; its short guide
    carries the "What is embolization?" fold inside the lead option, after "How it works" and before "How well does it
    work?"; its in-depth page carries "What is used to block the blood flow?" inside the lead option, with this page's
    materials first and marked and every material of the file shown once."""
    lead_opt = next((o for o in c["options"] if o["id"] == c.get("diagram_at")), None)
    listed = embolization.conditions().get(c["slug"])
    if not listed:
        return ([f"{tag}: lead treatment is an embolization but the condition is not in content/embolization.toml"]
                if lead_opt and "embolization" in lead_opt["name"].lower() else [])
    d = embolization.data()
    errs = []
    if not deep:
        lead = re.search(r'<section class="lead-option".*?</section>', t, re.S)
        lead = lead.group(0) if lead else ""
        f = re.search(r'<details class="topic embo-what" id="what-is-embolization"[^>]*><summary>' + re.escape(html.escape(d["fold_heading"])) + "</summary>", lead)
        i = f.start() if f else -1
        if i < 0:
            return [f'{tag}: no "{d["fold_heading"]}" fold in the lead option']
        if '<details class="topic embo-what" id="what-is-embolization" open' in lead:
            errs.append(f'{tag}: the "{d["fold_heading"]}" fold must start closed')
        how, well = lead.find('class="topic how-fold"'), lead.find("<summary>How well does it work?</summary>")
        if not how < i < well:
            errs.append(f'{tag}: the "{d["fold_heading"]}" fold is not between "How it works" and "How well does it work?"')
        return errs
    lead = re.search(r'<article class="deep-option lead-option".*?</article>', t, re.S)
    lead = lead.group(0) if lead else ""
    m = re.search(r'<section class="embo-agents" id="embolic-materials".*?</section>', lead, re.S)
    if not m:
        return [f'{tag}: no "{d["deep_heading"]}" section in the lead option']
    sec = m.group(0)
    if f'<h4 id="embolic-materials-h">{html.escape(d["deep_heading"])}</h4>' not in sec:
        errs.append(f'{tag}: the materials section heading is not "{d["deep_heading"]}"')
    cards = re.findall(r'<li class="agent( this)?">.*?<h5>(.*?)</h5>', sec, re.S)
    if len(cards) != len(d["material"]):
        errs.append(f'{tag}: the materials section shows {len(cards)} cards, content/embolization.toml has {len(d["material"])}')
    mine = len(listed["materials"])
    if [bool(x) for x, _ in cards] != [True] * mine + [False] * (len(cards) - mine):
        errs.append(f"{tag}: this page's materials are not first and marked")
    return errs


def deep_parts(tag, p, c, d, slug):
    errs, t = [], p["html"]
    fb = [("finder button", '<p class="cta"><a class="btn" href="/' + slug + '/#finder">')] if c.get("finder") else []
    in_order(errs, tag, t, [("breadcrumbs", '<nav class="crumbs"'), ("H1", "<h1>"), ("at-a-glance view", 'class="glance-peek"')]
                            + fb + [("lede", '<p class="lede">'), ("link to the simple page", 'class="see-every see-simple"'),
                            ("contents list", '<nav class="toc"'), ('"What is" box', '<section class="what-box"'),
                            ("glance table", '<table class="glance"')] + ([("find-a-doctor block", '<section class="find-end"')] if c.get("finder") else []) + [
                            ("references", 'id="references"'), ('"Page last reviewed"', "Page last reviewed")])
    # caption states the slice, the link the full count (his 5B, 2026-11-09 21:42 CT)
    n, m = len(d.get("glance_peek", [])), len(d.get("glance", []))
    peek = re.search(r'<div class="glance-peek">.*?</div>', t, re.S)
    peek = peek.group(0) if peek else ""
    if f"<caption>At a glance: {n} of {m} treatments</caption>" not in peek:
        errs.append(f'{tag}: at-a-glance caption is not "At a glance: {n} of {m} treatments"')
    if f'<a href="#glance">See all {m} and how well each works</a>' not in peek:
        errs.append(f'{tag}: no "See all {m} and how well each works" link')
    rows = len(re.findall(r"<tbody><tr|</tr><tr", peek))
    if peek and rows != n:
        errs.append(f"{tag}: at-a-glance view shows {rows} rows, glance_peek names {n}")
    g = t[t.find('<table class="glance"'):]
    g = g[:g.find("</table>")]
    grid = len(re.findall(r'<tr class="row[ "]', g))
    if grid != m:
        errs.append(f"{tag}: the glance table has {grid} treatments, the options file {m}")
    cov = coverage_of(c)
    if cov:
        # "Does insurance cover it? →" just under the lead option's heading (his 2A, 2026-11-09 19:22 CT), and the link
        # at the section's end stays
        near = (f'<p class="cov-near"><a href="{cov["path"]}"><span class="t">Does insurance cover it?</span>'
                '<span aria-hidden="true">\u00a0→</span></a></p>')   # no-break space, as tools/condition.py writes it
        if near not in t:
            errs.append(f'{tag}: no "Does insurance cover it? →" line under the lead option')
        if f'<p class="cov-link"><a href="{cov["path"]}">' not in t:
            errs.append(f"{tag}: no coverage link at the lead option's end")
    errs += chrome_errors(tag, p)
    errs += ruling_errors(tag, t, c)
    errs += embo_errors(tag, t, c, deep=True)
    return errs


def other_pages(site):
    """Home, insurance hub and coverage pages, directory and A to Z (built pages only; city pages and profiles are
    rendered on request: tools/condition-pattern.test.mjs, tools/e2e/first_screen_e2e.py)."""
    errs, done = [], []
    f = site / "index.html"
    if f.exists():
        p = page_parts(f)
        errs += chrome_errors("home", p)
        t = p["html"]
        if '<section class="home-top" aria-label="Introduction"><div class="home-banner' not in t:
            errs.append("home: banner is not inside the Introduction landmark")
        if re.search(r'class="[^"]*\b(pb-replay|replay)\b', t):
            errs.append("home: banner has a replay control (removed on his 7B, 2026-11-09)")
        if '<h2 id="conditions">' not in t:
            errs.append('home: no condition list (id="conditions", the menu\'s target)')
        if not re.search(r'<p class="cov-link home-cov"><a href="/insurance/">', t):
            errs.append("home: no insurance hub link under the condition list")
        done.append("home")
    f = site / "insurance" / "index.html"
    if f.exists():
        p = page_parts(f)
        errs += chrome_errors("insurance hub", p)
        for x in condition.PROCEDURES:
            if x.get("coverage") and f'href="{x["coverage"]["path"]}"' not in p["html"]:
                errs.append(f'insurance hub: no link to {x["coverage"]["path"]}')
        if "Page last reviewed" not in p["html"]:
            errs.append('insurance hub: no "Page last reviewed" date')
        done.append("insurance hub")
    for x in condition.PROCEDURES:
        cov = x.get("coverage")
        if not cov:
            continue
        f = site / cov["path"].strip("/") / "index.html"
        if not f.exists():
            errs.append(f'{cov["path"]}: coverage page not built')
            continue
        p = page_parts(f)
        tag = f'{x["abbr"]} coverage page'
        errs += chrome_errors(tag, p)
        # the link text everywhere is this page's own H1 (one source: content/procedures.json)
        if p["h1"] != cov["link"]:
            errs.append(f'{tag}: H1 "{p["h1"]}" differs from the link text "{cov["link"]}"')
        in_order(errs, tag, p["html"], [("breadcrumbs", '<nav class="crumbs"'), ("H1", "<h1>"), ("hub link", 'href="/insurance/"'),
                                        ('"Page last reviewed"', "Page last reviewed")])
        done.append(tag)
    f = site / "doctors" / "index.html"
    if f.exists():
        p = page_parts(f)
        errs += chrome_errors("directory", p)
        letters = sorted(x.name for x in (site / "doctors").iterdir() if len(x.name) == 1 and (x / "index.html").exists())
        for L in letters:
            if f'href="/doctors/{L}/"' not in p["html"]:
                errs.append(f"directory: no link to the {L.upper()} page")
        for L in letters:
            errs += chrome_errors(f"directory {L.upper()}", page_parts(site / "doctors" / L / "index.html"))
        done.append(f"directory and {len(letters)} A to Z pages")
    return errs, done


def source_rules(root=ROOT):
    """Rules kept in source files rather than one built page."""
    errs = []
    # one label for the doctor's own site button (his words 2026-11-09 21:42 CT: "Doctor's website")
    for f in SITE_LABEL_FILES:
        s = (root / f).read_text(encoding="utf-8")
        if "Doctor's page" in s or SITE_LABEL not in s or SITE_LABEL_SR not in s:
            errs.append(f'{f}: the doctor\'s site button is not "{SITE_LABEL} ↗" with its screen-reader label')
    # symptoms are a plain list, no pills (his words 2026-11-09 16:20 CT: "Fix that, no pills")
    css = (root / "src-assets" / "condition-box.css").read_text(encoding="utf-8")
    for rule in re.findall(r"([^{}]*ul\.what-tags[^{}]*)\{([^}]*)\}", css):
        body = rule[1]
        if re.search(r"border-radius|background|border\s*:|display\s*:\s*(inline|flex)", body):
            errs.append(f"condition-box.css: symptom list styled as pills ({rule[0].strip()})")
    if not re.search(r"ul\.what-tags\s*\{[^}]*list-style:\s*disc", css):
        errs.append("condition-box.css: symptom list is not a plain bulleted list")
    return errs


def check(site=SITE, root=ROOT):
    errs, checked = [], []
    deep = {s: options.load(s) for s in options.slugs()}
    for slug in condition.slugs():
        c = condition.load(slug)
        f = site / slug / "index.html"
        if not f.exists():
            errs.append(f"{slug}: simple page not built")
            continue
        sp = page_parts(f)
        tag = f"{slug} simple"
        if "MedicalWebPage" not in sp["types"]:
            errs.append(f"{tag}: no MedicalWebPage structured data")
        if "FAQPage" in sp["types"]:
            errs.append(f"{tag}: FAQ markup (the pattern carries none)")
        adopted = bool(c.get("targets")) or not c.get("draft")
        # the box: required on every condition; a draft without the content yet is skipped (and says so)
        box = has_box(c) or not c.get("draft")
        if box:
            errs += box_errors(tag, sp, c)
        errs += simple_parts(tag, sp, c, slug, deep[slug][1]["path"] if slug in deep else None)
        if adopted:
            text_limits(errs, tag, sp, c.get("targets"))
        nobox = "" if box else "; no box content yet (draft), box skipped"
        if slug not in deep:
            checked.append(f"{slug}: simple{'' if adopted else ' (draft, structured data only)'}{nobox}; no every-option page yet, skipped")
            continue
        _, d, _ = deep[slug]
        g = site / d["path"].strip("/") / "index.html"
        if not g.exists():
            errs.append(f"{slug}: every-option page not built")
            continue
        dp = page_parts(g)
        dtag = f"{slug} every-option"
        text_limits(errs, dtag, dp, d.get("targets"))
        if box:
            errs += box_errors(dtag, dp, c)
        errs += deep_parts(dtag, dp, c, d, slug)
        # The diagnosis patients are given may sit in both H1s (his Google Doc edits, 2026-11-12: "(benign prostatic
        # hyperplasia/BPH)" in the in-depth H1, after "(benign prostatic hyperplasia)" in the short guide's). A run made
        # only of the words in the page's `shared_name` is not shared phrasing; any other run still fails.
        ok = set(words(d.get("shared_name", "")))
        for a, b in (("title", "title"), ("h1", "h1"), ("title", "h1"), ("h1", "title")):
            shared = {r for r in runs(sp[a]) & runs(dp[b]) if not set(r.split()) <= ok}
            if shared or words(sp[a]) == words(dp[b]):
                errs.append(f'{slug}: simple {a} and every-option {b} share phrasing {sorted(shared) or [sp[a]]}')
        both = {" ".join(words(t)) for t in c.get("targets", [])} & {" ".join(words(t)) for t in d.get("targets", [])}
        if both:
            errs.append(f"{slug}: both pages target {sorted(both)}")
        for mine, other, otag in ((c.get("targets"), dp, "every-option"), (d.get("targets"), sp, "simple")):
            if mine and (has(other["title"], mine[0]) or has(other["h1"], mine[0])):
                errs.append(f'{slug}: the {otag} page chases the other page\'s first target "{mine[0]}"')
        if not links_to(sp, d["path"]):
            errs.append(f"{tag}: no descriptive link to {d['path']}")
        if not links_to(dp, f"/{slug}/"):
            errs.append(f"{dtag}: no descriptive link to /{slug}/")
        for t in ("MedicalWebPage", "BreadcrumbList"):
            if t not in dp["types"]:
                errs.append(f"{dtag}: no {t} structured data")
        if "FAQPage" in dp["types"]:
            errs.append(f"{dtag}: FAQ markup (the pattern carries none)")
        if c.get("finder"):
            end = re.search(r'<section class="find-end".*?</section>', dp["html"], re.S)
            if not end or f'action="/{slug}/#finder"' not in end.group(0) or 'name="zip"' not in end.group(0):
                errs.append(f"{dtag}: does not end with the find-a-doctor block (ZIP box to /{slug}/#finder)")
            else:
                # a condition with city pages shows them on its simple page; the every-option page then links the list too
                by_city = re.search(r'<nav class="by-city".*?<a href="([^"]+)">All cities and states</a>', sp["html"], re.S)
                if by_city and f'href="{by_city.group(1)}"' not in end.group(0):
                    errs.append(f"{dtag}: find-a-doctor block has no link to the city list {by_city.group(1)}")
        checked.append(f"{slug}: simple and every-option{nobox}")
    e, done = other_pages(site)
    errs += e + source_rules(root)
    checked.append("pages: " + ", ".join(done))
    return errs, checked


def main():
    errs, checked = check()
    if errs:
        raise SystemExit("condition pattern (docs/condition-pattern.md) broken:\n  " + "\n  ".join(errs))
    print("condition pattern: " + "; ".join(checked))


if __name__ == "__main__":
    main()
