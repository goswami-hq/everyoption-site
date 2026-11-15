"""The trail at the top of every page but the home page, and the menu item each page belongs to.

His yes, ai-hq HQ chat 2026-11-15 17:14 CT, to fix B in ai-hq projects/platform/design/site-architecture-2026-11-15/
feedback-and-fixes.md (friends' feedback: "not always clear what page we are on and what page leads to what. Some pages
have the actual site tree located at the top / Others dont / We should make every page besides the home page have the
site tree architecture at the top").

One source for the words: a condition's name in any trail is its "label" in content/conditions.json, the same word the
city pages use (lib/registry.mjs CONDITION_LABEL). tools/trail_test.py checks every built page against this.
"""
import html

import registry

HOME = ("Home", "/")
# The two pages of a condition, named by him (HQ chat 2026-11-15 17:2x CT, picking from the options offered:
# "Quick guide / Deep dive, every option"). Trail, first-screen link, home card and the deep page's way back use these.
QUICK = "Quick guide"
DEEP = "Deep dive, every option"
SECTIONS = {   # menu item marked on pages that are not the menu item's own address
    "/conditions/": "Conditions", "/insurance/": "Insurance", "/find-a-doctor/": "Find a doctor",
    "/how-we-know/": "How we know", "/account/": "For physicians",
}


def label(slug):
    return registry.BY_SLUG[slug]["label"]


def html_of(items, top_id=True):
    """items: (name, url) pairs from Home on; the last is the current page (url None or ignored)."""
    lis = []
    for i, (name, url) in enumerate(items):
        n = html.escape(name, quote=True)
        lis.append(f'<li><span aria-current="page">{n}</span></li>' if i == len(items) - 1
                   else f'<li><a href="{html.escape(url, quote=True)}">{n}</a></li>')
    return f'<nav class="crumbs"{" id=\"top\"" if top_id else ""} aria-label="Breadcrumb"><ol>{"".join(lis)}</ol></nav>'


def condition(slug, *rest):
    """Home > <condition> [> rest...]. With no rest the condition page itself is current."""
    return [HOME, (label(slug), f"/{slug}/")] + list(rest)


def section_of(path):
    """The menu item a page sits under: its own address, else by where it lives."""
    if path == "/":
        return "/"
    if path.startswith("/doctors/") or "/doctors/" in path:   # name pages, profiles, city lists and city pages (fix D)
        return "/find-a-doctor/"
    if path == "/insurance/" or path.endswith("/insurance/"):
        return "/insurance/"
    if path in ("/how-we-know/",):
        return "/how-we-know/"
    if path in ("/account/",):
        return "/account/"
    if path.strip("/").split("/")[0] in registry.BY_SLUG:
        return "/conditions/"
    return None


# ---- Fix A (his yes, ai-hq HQ chat 2026-11-15 17:38 CT): the condition strip. One row under the trail on every page of a
# condition (quick guide, deep dive, its insurance page, its city pages): Quick guide · Deep dive, every option ·
# Insurance · Find a doctor, the current one marked. A part the condition does not have is left out (pelvic: no
# insurance). The city pages (lib/cities.mjs) draw the same row from STRIP, written into lib/registry.mjs by the build.
INSURANCE = "Insurance"
FIND = "Find a doctor"


def strip_items(slug):
    """[(kind, label, href)] for a condition, in strip order; kinds: quick, deep, insurance, find."""
    c = registry.BY_SLUG[slug]
    out = [("quick", QUICK, f"/{slug}/")]
    if c.get("pages", {}).get("every_option"):
        out.append(("deep", DEEP, f"/{slug}/every-option/"))
    listed = [k for k in c["procedures"] if k in {p["key"] for p in registry.listed()}]
    cov = registry.coverage()
    hub_only = {p["key"] for p in registry.hub_only_payers()}
    for k in listed:
        if k in cov:
            out.append(("insurance", INSURANCE, cov[k]["path"]))
            break
        if k in hub_only:
            out.append(("insurance", INSURANCE, f"/insurance/#{k}"))
            break
    if listed:
        out.append(("find", FIND, f"/{slug}/#finder"))
    return out


def shown(name):
    """The deep page's name in the strip: on phones only "Deep dive" shows, so four tabs fit one row; the rest stays in
    the page (CSS .cs-more) for screen readers and wider screens."""
    head, sep, rest = name.partition(", ")
    if name == DEEP and sep:
        return f'{html.escape(head)}<span class="cs-more">{html.escape(sep + rest)}</span>'
    return html.escape(name)


def strip_html(slug, current):
    """The strip for a condition, with `current` (a kind) marked. On the quick guide, Find a doctor jumps to its own box."""
    lis = []
    for kind, name, href in strip_items(slug):
        if kind == "find" and current == "quick":
            href = "#finder"
        mark = ' aria-current="page"' if kind == current else ""
        lis.append(f'<li><a class="cs-{kind}" href="{html.escape(href, quote=True)}"{mark}>{shown(name)}</a></li>')
    return (f'<nav class="cond-strip" aria-label="{html.escape(label(slug), quote=True)} pages"><ul>{"".join(lis)}</ul></nav>')


def strip_data():
    """{procedure key: [[kind, label, href], ...]} for lib/registry.mjs (city pages)."""
    out = {}
    for c in registry.CONDITIONS:
        for k in c["procedures"]:
            if k in {p["key"] for p in registry.listed()}:
                out[k] = [list(x) for x in strip_items(c["slug"])]
    return out
