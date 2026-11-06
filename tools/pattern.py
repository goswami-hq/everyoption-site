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
import condition, options

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


def check(site=SITE):
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
        if adopted:
            text_limits(errs, tag, sp, c.get("targets"))
        if slug not in deep:
            checked.append(f"{slug}: simple{'' if adopted else ' (draft, structured data only)'}; no every-option page yet, skipped")
            continue
        _, d, _ = deep[slug]
        g = site / d["path"].strip("/") / "index.html"
        if not g.exists():
            errs.append(f"{slug}: every-option page not built")
            continue
        dp = page_parts(g)
        dtag = f"{slug} every-option"
        text_limits(errs, dtag, dp, d.get("targets"))
        for a, b in (("title", "title"), ("h1", "h1"), ("title", "h1"), ("h1", "title")):
            shared = runs(sp[a]) & runs(dp[b])
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
        checked.append(f"{slug}: simple and every-option")
    return errs, checked


def main():
    errs, checked = check()
    if errs:
        raise SystemExit("condition pattern (docs/condition-pattern.md) broken:\n  " + "\n  ".join(errs))
    print("condition pattern: " + "; ".join(checked))


if __name__ == "__main__":
    main()
