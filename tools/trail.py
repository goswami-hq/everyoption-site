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
SECTIONS = {   # menu item marked on pages that are not the menu item's own address
    "/#conditions": "Conditions", "/insurance/": "Insurance", "/doctors/": "Directory",
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
    if path.startswith("/doctors/"):
        return "/doctors/"
    if path == "/insurance/" or path.endswith("/insurance/"):
        return "/insurance/"
    if path in ("/how-we-know/",):
        return "/how-we-know/"
    if path in ("/account/",):
        return "/account/"
    if path.strip("/").split("/")[0] in registry.BY_SLUG:
        return "/#conditions"
    return None
