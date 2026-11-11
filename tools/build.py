#!/usr/bin/env python3
"""Writes the site's HTML pages into site/ from the templates below (one header, one footer, every page's copy).

  python3 tools/build.py            # then commit site/
The finder data (site/data/*.json, site/data/zip/) comes from goswami-hq/ai-hq scripts/every_option_export.py.
Standard library only; the built pages are plain static HTML (Cloudflare Pages serves site/ with no build step).
"""
import pathlib
import html, json, os, re, shutil
import cities
import condition
import directory
import insurance
import options
import pattern
import registry
import procedures_sql

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
DISCLOSURE = ("Every Option is run by a practicing interventional radiologist. Listings are free, and no one can pay "
              "to be listed, ranked higher, or sent patients.")
CONTACT = "errors@everyoptionmd.com"
ORIGIN = "https://everyoptionmd.com"
REVIEWED = "2026-11-01"
LISTINGS_AS_OF = "2026-10-29"   # the national views the finder data was exported from (directory v3 job 4d)

# The procedure registry (ai-hq job platform-directory-0032): content/conditions.json and content/procedures.json, read
# through tools/registry.py, are the only place a condition or procedure is named. The build writes the browser copy
# (site/assets/procedures.js), the server copies (lib/procedures.mjs, lib/registry.mjs), the database seed
# (supabase/schema.sql, through tools/procedures_sql.py) and the per-condition city functions from them. Finder blurbs (projects/platform/content/pages/
# pae-gae-blurbs-draft.md in goswami-hq/ai-hq, word for word; his style rule 2026-11-01) live in each procedure's "finder".
ROOT = os.path.dirname(SITE)
registry.require(SITE)
PROCEDURES = registry.listed()
PROCS = {p["key"]: p for p in PROCEDURES}   # procedures with a doctor list, in registry order
SHORT = {p["key"]: registry.short(p) for p in PROCEDURES}
PAREN = {p["key"]: registry.paren(p) for p in PROCEDURES}
# Procedures still at stage "listed" (was "draft"): profile tags show, but a profile listed only for these stays noindex
# and out of the sitemap (job platform-directory-0009). Set the stage to "public" at his sign-off.
DRAFT_PROCS = registry.draft_keys()
# The condition page each procedure's finder lives on; /<key>/ is a moved stub and site/_redirects sends a 301.
MOVED = registry.page_of()

# Photos (job 14): free-license stock from Pexels (pexels.com/license: free to use, attribution not required; credited on
# How we know anyway). Self-hosted WebP under site/assets/photos/; sources and license reads in goswami-hq/ai-hq
# projects/platform/design/photos/sources.md. Keys: "home" and each PROCS key. None = no photo.
PHOTOS = {   # key -> file stem (-1600.webp and -800.webp), alt text, credit
    "home": dict(file="home-forked-path", alt="A dirt road in a misty forest at sunrise splits into two paths.",
                 by="Vaidas Vaiciulis", what="Forest road that splits in two",
                 page="https://www.pexels.com/photo/roads-in-between-trees-8514116/"),
    "ufe": dict(file="fibroids-woman-path", alt="A woman walks along a winding country path on a sunny hillside.",
                by="Ugur Bayır", what="Woman walking on a country path",
                page="https://www.pexels.com/photo/woman-walking-on-dirt-road-12771952/"),
    "pae": dict(file="pae-lake-fishing", alt="A man in a hat sits on a bench by a lake, fishing.",
                by="Olavi Anttila", what="Man fishing by a lake",
                page="https://www.pexels.com/photo/man-sitting-on-wooden-bench-near-water-12717503/"),
    "gae": dict(file="gae-stone-stairs", alt="A woman walks toward a wide set of stone steps in a sunny park.",
                by="Nikita Igonkin", what="Woman walking toward stone steps",
                page="https://www.pexels.com/photo/woman-in-white-and-green-floral-dress-walking-10494908/"),
}
PHOTO_W, PHOTO_H = 1600, 667   # every photo is cropped to 12:5; an 800 px copy serves phones


def photo_tag(stem, alt, lazy=True, cls="photo"):
    """A photo slot: width and height set so nothing jumps; lazy unless it sits in the first screen."""
    big, small = f"/assets/photos/{stem}-1600.webp", f"/assets/photos/{stem}-800.webp"
    return (f'<figure class="{cls}"><img src="{ver(big)}" srcset="{ver(small)} 800w, {ver(big)} 1600w" '
            f'sizes="(max-width: 860px) 100vw, 860px" alt="{e(alt)}" width="{PHOTO_W}" height="{PHOTO_H}" decoding="async"'
            f'{" loading=\"lazy\"" if lazy else ""}></figure>')


def photo(key, lazy=True, cls="photo"):
    p = PHOTOS.get(key)
    return photo_tag(p["file"], p["alt"], lazy, cls) if p else ""


LOGO = (pathlib.Path(__file__).resolve().parent / "diagrams" / "logo.svgfrag").read_text()
WAVE = '<svg class="spine-wave" viewBox="0 0 40 400" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wave-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="400"><stop offset="0" stop-color="#ffb648"/><stop offset=".55" stop-color="#ffb648" stop-opacity=".45"/><stop offset="1" stop-color="#ffb648" stop-opacity="0"/></linearGradient></defs><path d="M20 0 C2 60 38 120 20 190 C6 250 34 320 20 400"/></svg>'
NAV = [("/", "Home"), ("/#conditions", "Conditions"), ("/insurance/", "Insurance"), ("/doctors/", "Directory"), ("/how-we-know/", "How we know"), ("/account/", "For physicians")]
# His brand accounts (ai-hq ops/accounts.md). Facebook is left out until Page vs profile is confirmed there.
SOCIAL = [("Instagram", "https://www.instagram.com/everyoptionmd"), ("TikTok", "https://www.tiktok.com/@every.option.md"),
          ("YouTube", "https://www.youtube.com/@everyoptionmd"), ("X", "https://x.com/everyoptionmd")]


def e(s):
    return html.escape(s, quote=True)


def ver(url):
    """Cache-busting tag: /assets/x.js -> /assets/x.js?v=<first 10 hex of its sha256>, so a new deploy is fetched at once."""
    import hashlib, pathlib
    f = pathlib.Path(__file__).resolve().parent.parent / "site" / url.lstrip("/")
    return f"{url}?v={hashlib.sha256(f.read_bytes()).hexdigest()[:10]}" if f.exists() else url


def page(path, title, desc, body, scripts=(), head="", cls=None, banner="", css=()):
    head = "".join(f'<link rel="stylesheet" href="{ver(s)}">' for s in css) + head
    # Walkthrough finding 3 (his yes, 2026-11-09): "Conditions" from a condition's short page opens the home list with
    # that condition's card changed (src-assets/home-from.js), so the list cannot send the reader back where they were.
    slug = path.strip("/")
    back_to = f"/?from={slug}#conditions" if slug in condition.slugs() else "/#conditions"
    nav = "".join(f'<a href="{back_to if h == "/#conditions" else h}"{" aria-current=\"page\"" if h == path else ""}>{e(t)}</a>' for h, t in NAV)
    social = " · ".join(f'<a href="{u}" rel="noopener" target="_blank">{t}</a>' for t, u in SOCIAL)
    js = "".join(f'<script src="{ver(s)}" defer></script>' for s in scripts)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{"" if path == "/404" else f'<link rel="canonical" href="{ORIGIN}{path}">'}
<link rel="stylesheet" href="{ver('/assets/site.css')}">
<meta name="color-scheme" content="light dark">
{js}
{head}
</head>
<body class="{cls or ("home-page" if path == "/" else ("finder-page t-" + path.strip("/") if scripts else "prose-page"))}">
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap">
<a class="brand" href="/">{LOGO}</a>
<nav class="top" aria-label="Main">{nav}</nav>
</div></header>
{banner}<main id="main"><div class="wrap">
{body}
</div></main>
<footer class="site"><div class="wrap">
<p><strong>Education, not medical advice.</strong> Talk to your doctor about your own care. In an emergency, call 911.</p>
<p>Found an error? <a href="/report/">Report an error</a> or email <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>
<p class="disclosure">{e(DISCLOSURE)}</p>
<p><a href="/doctors/">Find a doctor by name</a> · <a href="/fibroids/doctors/">Doctors by city</a> · <a href="/insurance/">Insurance coverage</a> · <a href="/how-we-know/">How we know</a></p>
<p id="follow" class="follow"><strong>Follow Every Option:</strong> {social}</p>
</div></footer>
</body>
</html>
"""


ARROW = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
         'stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>')


def fork(keys):
    """One line opening into a path per condition: any number of rows; each path takes its condition's color."""
    n, draw, light = len(keys), "", ""
    mid = n * 50
    for i, k in enumerate(keys):
        y = 100 * i + 50
        d = f"M0 {mid} C90 {mid} 90 {y} 200 {y}"
        draw += f'<path class="draw t-{k}" pathLength="100" d="{d}" style="animation-delay:{i * 90}ms"/>'
        light += f'<path class="light" pathLength="100" d="{d}" style="animation-delay:{1.4 + i * 2.6:.1f}s"/>'
    return (f'<svg class="fork-lines" viewBox="0 0 200 {n * 100}" preserveAspectRatio="none" aria-hidden="true">'
            f"{draw}{light}</svg>")


# agreed list item 7 (his words 2026-11-07: stents, ablation, TARE and -plasty are coming, so one line for every
# image-guided treatment, not an embolization definition): true of UFE, PAE, GAE, pelvic vein embolization and stenting.
HOME_HOW = ("The procedures our listed doctors perform work from inside the body, guided by imaging, through a tiny skin "
            "nick instead of a surgical cut.")
ORG_ID = ORIGIN + "/#organization"


def home_schema():
    """One Organization (with @id, url, logo, the brand accounts) and the WebSite, on the home page only (agreed list
    item 19; visibility addendum item 8). No founder, no parent company. Condition pages point to it by @id."""
    import json
    org = {"@context": "https://schema.org", "@type": "Organization", "@id": ORG_ID, "name": "Every Option",
           "url": ORIGIN + "/", "logo": ORIGIN + "/assets/logo.svg", "sameAs": [u for _, u in SOCIAL]}
    site = {"@context": "https://schema.org", "@type": "WebSite", "@id": ORIGIN + "/#website", "name": "Every Option",
            "url": ORIGIN + "/", "publisher": {"@id": ORG_ID}, "inLanguage": "en-US"}
    return "".join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False).replace("</", "<\\/") + "</script>"
                   for x in (org, site))


def logo_file():
    """A standalone copy of the header logo for the Organization record (colors fixed: no page CSS applies)."""
    svg = LOGO.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ', 1).replace(' role="img" aria-label="Every Option"', "")
    svg = svg.replace('fill="currentColor"', 'fill="#22302b"')
    return svg.replace('class="logo-disc"', 'class="logo-disc" fill="#2f5d50"').replace('class="logo-hole"', 'class="logo-hole" fill="#f0a04b"')


def home():
    COUNTS = {k: sum(json.load(open(os.path.join(SITE, "data", k + ".json"), encoding="utf-8"))["counts"].values()) for k in PROCS}
    # One tap to the finder (his yes, 2026-11-02): a condition with an education page opens it, finder first.

    def row(c, k):
        slug = c["slug"]
        compare = condition.load(slug).get("options_page", "") if slug in condition.slugs() else ""
        return (f'<li class="t-{c["card"]["color"]}"><a href="/{slug}/"{f" data-compare={compare!r}" if compare else ""}><strong>{e(c["card"]["name"])}</strong><span class="proc">{e(c["card"]["line"])}'
                f'</span><span class="count">{COUNTS.get(k, 0)} doctors listed</span></a></li>')
    rows = "".join(row(c, p["key"]) for c, p, _ in registry.condition_rows() if p)
    # Conditions with a page but no doctor list yet (job platform-main-0024; his words 2026-11-07: "get the chronic pelvic
    # pain page on the home page, navigation, etc"). Same list and look; no count, no ZIP option, until a finder exists.
    def compare_of(href):   # the comparison page, so the "from" card offers it (src-assets/home-from.js)
        slug = href.strip("/")
        return condition.load(slug).get("options_page", "") if slug in condition.slugs() else ""
    rows += "".join(f'<li class="t-{k}"><a href="{href}"{f" data-compare={compare_of(href)!r}" if compare_of(href) else ""}><strong>{e(name)}</strong><span class="proc">{e(proc)}</span>'
                    f'<span class="count">Doctor list coming</span></a></li>' for k, href, name, proc in PAGE_ONLY)
    opts = "".join(f'<option value="/{c["slug"]}/">{e(c["card"]["name"])}</option>' for c, p, _ in registry.condition_rows() if p)
    hero = f"""<section class="hero">{WAVE}<div class="hero-in">
<div><h1>You have more options than you know.</h1>
<p class="lede">Many common conditions have non-surgical treatments that people never hear about.</p>
<p class="lede-sub">{e(HOME_HOW)}</p></div>
<form id="home-search" class="hero-search" role="search" aria-label="Find a doctor" novalidate>
<p class="find-label">Find a doctor near you</p>
<div class="hs-row"><div class="f"><label for="home-cond">Condition</label><select id="home-cond">{opts}</select></div>
<div class="f f-zip"><label for="home-zip">Your ZIP code</label><input id="home-zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="e.g. 60611"></div>
<button type="submit">Find doctors</button></div>
<p id="home-status" class="hs-status" role="status"></p>
</form></div></section>"""
    # The film and the hero sit in a labelled landmark, so nothing on the page is outside one (axe "region", 2026-11-09).
    banner = ('<section class="home-top" aria-label="Introduction">'
              + (pathlib.Path(__file__).resolve().parent / "diagrams" / "home-banner.html").read_text() + hero + "</section>")
    body = f"""<div class="spine">
<h2 id="conditions">Choose a condition</h2>
<ul class="fork-list stops">{rows}</ul>
<p class="more-soon">And more options coming soon.</p>
<p class="cov-link home-cov"><a href="/insurance/">Will insurance cover it?</a></p>
<div class="plain two">
<div><h2>Who runs this</h2>
<p>{e(DISCLOSURE)} <a href="/how-we-know/">How we know</a>.</p></div>
<div><h2>How it works</h2>
<p>Choose a condition, enter your ZIP code, and see who is nearby. Then call their office and ask whether it’s right for you.</p>
<p>We explain these treatments in plain language. Follow along on {" · ".join(f'<a href="{u}" rel="noopener" target="_blank">{t}</a>' for t, u in SOCIAL)}.</p></div>
</div></div>"""
    # agreed list items 11 and 19 (his "Agree with style recs", 2026-11-07): title, description, Organization and WebSite
    return page("/", "Every Option: Less Invasive Treatments and Who Performs Them",
                "Free guides to every treatment for fibroids, an enlarged prostate, knee arthritis, pelvic vein pain, and bleeding hemorrhoids, "
                "and for most, doctors nearby who perform embolization.", body, ["/assets/ride.js", "/assets/home-search.js", "/assets/home-from.js"],
                head=home_schema(), banner=banner, cls="home-page")


# The animation text per procedure (template: ai-hq projects/platform/design/procedure-animations/README.md, his yes
# 2026-11-02) is the procedure's "animation" part in content/procedures.json; the drawings stay in tools/diagrams/.
PROC_ANIM = registry.animations()
PROC_BANNERS = registry.banners()   # site/assets/proc-banner.js draws these; a procedure without the part gets no banner
PROC_ROUTES = {"wrist": ("M186 192 L168 150 L136 96 L114 100 L110 170", (186, 192)), "groin": ("M122 205 L126 240 L126 262", (122, 205))}
PROC_DEFS = """<defs>
        <radialGradient id="heat"><stop offset="0" stop-color="#ff5a3c" stop-opacity=".62"/><stop offset=".6" stop-color="#ff5a3c" stop-opacity=".22"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/></radialGradient>
        <radialGradient id="shade" cx=".42" cy=".32" r=".8"><stop offset="0" stop-color="var(--shade-a)"/><stop offset=".65" stop-color="var(--shade-b)"/><stop offset="1" stop-color="var(--shade-c)"/></radialGradient>
        <radialGradient id="shadeFib" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="var(--fib-a)"/><stop offset="1" stop-color="var(--fib-b)"/></radialGradient>
      </defs>"""


PROC_VARY = "Results vary from person to person. Talk to a doctor about whether this is right for you."


def diagram(k, vary=True):
    import pathlib
    a = PROC_ANIM[k]
    scene = (pathlib.Path(__file__).resolve().parent / "diagrams" / f"anim-{k}.svgfrag").read_text()
    d, (cx, cy) = PROC_ROUTES[a["route"]]
    body_shape = ('<g fill="var(--muted)"><circle cx="110" cy="42" r="24"/><path d="M78 76 Q110 62 142 76 L150 170 Q152 190 146 208 L140 300 L118 300 L112 214 L108 214 L102 300 L80 300 L74 208 Q68 190 70 170 Z"/>'
                  '<path d="M80 80 L44 150 L28 196 L38 200 L58 158 L86 112 Z"/><path d="M140 80 L176 150 L192 196 L182 200 L162 158 L134 112 Z"/></g>')
    names = ["Before", "During", "After"]
    btns = "".join(f'<button type="button" id="st-{i}" data-step="{i}" aria-pressed="{"true" if i == 0 else "false"}">{n}</button>' for i, n in enumerate(names))
    caps = "".join(f'<div class="proc-cap{" on" if i == 0 else ""}" id="cap-{i}"><strong>{n}</strong><p>{e(a["caps"][i])}</p></div>' for i, n in enumerate(names))
    return f"""<figure class="how proc" data-proc="{k}">
<div class="proc-stage"><svg class="main" viewBox="-10 -24 420 380" role="img" aria-label="{e(a["alt"])}">{PROC_DEFS}{scene}</svg>
<div class="route"><svg class="inset" viewBox="20 10 180 295" aria-hidden="true">{body_shape}<path id="routeLine" d="{d}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round"/><circle id="routeDot" cx="{cx}" cy="{cy}" r="7" fill="var(--card)" stroke="var(--accent)" stroke-width="3.5"/></svg><span>{e(a["route_text"])}</span></div></div>
<div class="proc-steps" role="group" aria-label="Step" hidden>{btns}</div>
<figcaption aria-live="polite">{caps}</figcaption>
<button type="button" class="proc-replay" data-replay hidden>Replay</button>
{f'<p class="small muted proc-vary">{PROC_VARY}</p>' if vary else ""}
</figure>"""


# A condition page with no finder yet: (color key, address, home card name, procedure line). Not in the home ZIP list.
# From the registry: a condition whose procedure is at stage "page". Empty since job platform-directory-0029.
PAGE_ONLY = [(c["card"]["color"], f"/{c['slug']}/", c["card"]["name"], c["card"]["line"]) for c, p, pg in registry.condition_rows() if not p and pg]
RENAMED = ["arthritis-embolization", "pelvic-vein-pain"]   # job platform-main-0015: now /knee-arthritis/; site/_redirects sends a 301


# Patient walkthrough finding 1 (his "1-4 changes let's do them", 2026-11-09): the comparison page, from the first screen.
COMPARE_LINK = "Compare your options"
FIND_TOP = {k: tuple(p["finder"]["top"]) for k, p in PROCS.items() if p["finder"].get("top")}   # the top of a finder (his yes, 2026-11-02)


def intro_html(text):
    """Finder intro: escaped text, with **bold** and a line break at each newline."""
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", e(text)).replace("\n", "<br>")


def finder_block(k, heading=None, learn="", intro=None, how=None, split=False, note="", compare=""):
    """The ZIP finder: at the top of a condition page or a finder page (his yes, 2026-11-02: finder first)."""
    data = f' data-learn="{e(learn)}"' if learn else ""
    if heading is None:
        heading, intro, how = FIND_TOP[k]
    results = """<div id="status" class="status" role="status" aria-live="polite"></div>
<div id="results"></div>
<noscript><p class="notice">This finder needs JavaScript to sort doctors by distance.</p></noscript>"""
    if split:
        results = ""
    return f"""<section class="find-first">
<p class="find-intro">{intro_html(intro)}</p>
<p class="find-links"><a href="{e(how)}">How it works</a>{f'<a class="find-compare" href="{e(compare)}">{COMPARE_LINK}</a>' if compare else ""}</p>
<p class="find-label">Find a doctor near you</p>
<div id="finder" data-procedure="{k}"{data}>
<form class="zip" id="zip-form" role="search" aria-label="Find doctors by ZIP code" novalidate>
<div class="f"><label for="zip">Your ZIP code</label>
<input id="zip" name="zip" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{{5}}" maxlength="5" placeholder="e.g. 60611" required></div>
<div class="f" style="flex:0 1 130px"><label for="radius">Within</label>
<select id="radius" name="r"><option value="25">25 miles</option><option value="50" selected>50 miles</option><option value="100">100 miles</option><option value="250">250 miles</option></select></div>
<button type="submit">Find doctors</button>
</form>
{results}
</div>
{f'<p class="small muted find-scope">{e(note)}</p>' if note else ""}
</section>"""


FIND_BAR = '<a class="find-bar" href="#finder" hidden>Find a doctor</a>'


def strip(k):
    return ('<div class="page-strip"><div class="pb" data-s="' + k + '"></div>'
            '<button type="button" id="pb-replay" class="pb-replay" aria-label="Replay animation" hidden><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button></div>')


def finder(k):
    p = PROCS[k]
    about = "".join(f"<p>{e(s)}</p>" for s in p["finder"]["about"])
    items = "".join(f'<li><a href="{e(u)}" rel="noopener" target="_blank">{e(t)}</a></li>' if u else f"<li>{e(t)}</li>"
                    for t, u in p["finder"]["sources"])
    src = f'<details class="sources"><summary>Sources</summary><ul>{items}</ul></details>' if items else ""
    body = f"""<h1>{e(FIND_TOP[k][0])}</h1>
{finder_block(k)}
{photo(k, lazy=True, cls="photo banner")}
<div class="about">{about}{src}</div>
<h2 id="how-it-works">How it works</h2>
{diagram(k)}
<p class="small muted" style="margin-top:22px">This list is not a recommendation or a ranking. Whether {e(p["abbr"])} is right for you is a decision for you and your doctor. <a href="/how-we-know/">How we know</a>.</p>
<p class="small muted">Listings checked as of {LISTINGS_AS_OF}. Page last reviewed {REVIEWED}.</p>{FIND_BAR}"""
    return page(f"/{k}/", f"{p['name']} ({p['abbr']}): find a doctor near you | Every Option",
                f"Doctors listed for {p['name'].lower()} ({p['abbr']}) near your ZIP code, nearest first.", body,
                ["/assets/procedures.js", "/assets/telehealth.js", "/assets/finder.js", "/assets/condition.js", "/assets/procedure-anim.js", "/assets/proc-banner.js"],
                banner=strip(k))


def credits():
    seen, items = set(), []
    for p in PHOTOS.values():
        if p["page"] not in seen:
            seen.add(p["page"])
            items.append(f'<li><a href="{e(p["page"])}" rel="noopener" target="_blank">{e(p["what"])}</a> by {e(p["by"])} on Pexels</li>')
    return f'<h2>Photos</h2><p>Photos are free-license stock photos, used for illustration only.</p><ul class="small">{"".join(items)}</ul>' if items else ""


def how():
    body = f"""<h1>How we know</h1>
<div class="prose">
<p class="lede">We look through public information so you can find who near you does a procedure. Doctors can claim their own listing for free, and anyone can report an error.</p>
<h2>What the two groups mean</h2>
<dl class="grades">
<div><dt>Confirmed by physician</dt><dd>The doctor told us they perform it, and we have confirmed the account is theirs.</dd></div>
<div><dt>Likely performs this procedure</dt><dd>Public information points to this doctor performing it, or the doctor told us so from an account we have not yet confirmed (the card says so). Call the office to confirm.</dd></div>
</dl>
<h2>Who runs this</h2>
<p>{e(DISCLOSURE)}</p>
<p>Confirming is free.</p>
<h2>Where the information comes from</h2>
<ul>
<li>Doctors’ profiles on hospital, university, and practice websites, and search results for those pages.</li>
<li>Practice websites.</li>
<li>Public Medicare billing records.</li>
<li>ClinicalTrials.gov, the U.S. registry of clinical studies.</li>
<li>Other websites that copy a doctor’s profile.</li>
</ul>
<p>Cities come from the doctor’s newest page or from public records, and they can be out of date. Every card except Confirmed by physician says “Details not confirmed by this doctor. Check with the office before you go.” Distances start from the center of the ZIP code you type; we never ask where you live. When a doctor who confirmed their listing gives an office address, we measure to that office, and a doctor with several offices is shown at the closest one, with all of their offices listed on the card. Otherwise we measure to the center of the doctor’s ZIP code or city.</p>
<h2>A blank is not a no</h2>
<p>If a doctor is missing, it usually means we have not found them yet. It does not mean they don’t perform the procedure.</p>
<h2>When few doctors are near you</h2>
<p>If we find fewer than five doctors for a procedure near you, we also show <strong>Interventional radiologists nearby</strong>: doctors whose own page or practice page shows they are interventional radiologists, but where we could not confirm this procedure. Call and ask whether they perform it. Doctors whose practice website names the procedure come first, then the rest by distance. We list only those with a phone number or a web page, and never from billing records alone.</p>
<p>If that is still not enough, we add the nearest doctors farther away, up to 250 miles, with the distance on each card. If we know of no one within 250 miles, ask your doctor to refer you to an interventional radiologist.</p>
<p>Any doctor on any card can claim their listing, for free.</p>
<h2>The badge under a name</h2>
<p><strong>Interventional radiologist:</strong> their own page or their practice’s page says so, or, when no page does, public Medicare billing records show they perform interventional radiology procedures. When we cannot tell, the doctor is not listed.</p>
<h2>How cards are ordered</h2>
<p>Within each group, the order is by distance only, except that interventional radiologists whose practice website names the procedure come first in their group.</p>
<h2>Find a doctor by name</h2>
<p>Every doctor who can appear in a search has a profile page. <a href="/doctors/">Find a doctor by name</a>. A doctor leaves the directory when they leave our lists. To ask us to remove a profile, use <a href="/report/">Report an error</a>.</p>
<h2>Report an error</h2>
<p>If something on a listing is wrong, anyone can tell us with the <a href="/report/">report form</a> or by email to <a href="mailto:{CONTACT}">{CONTACT}</a>. A report does not change a listing by itself.</p>
<h2>Claim your profile</h2>
<p>Only the physician can claim their own profile, with a free <a href="/account/">account</a>. A physician with an account can add their procedures, offices, phone, and website at once; their card stays under “Likely performs” until we know the account is theirs, and then moves to “Confirmed by physician.”</p>
{credits()}
<p class="small muted">Education, not medical advice. Last reviewed {REVIEWED}.</p>
</div>"""
    return page("/how-we-know/", "How We Find and List Doctors | Every Option",
                "What the two groups on Every Option mean, where the information comes from, and how to report an error.",
                body)


REASONS = [("not_performed", "Doesn’t perform this procedure"), ("contact", "Wrong phone or address"),
           ("moved", "No longer practices here"), ("other", "Something else")]


def report():
    """Job 19: the report-an-error form, open to anyone. Claiming a profile is separate (/account/, physicians only).
    A report is stored for us to read; it never changes a listing."""
    reasons = "".join(f'<label><input type="radio" name="reason" value="{k}"> {e(t)}</label>' for k, t in REASONS)
    body = f"""<h1>Report an error</h1>
<div class="prose">
<p class="lede">Tell us what’s wrong with a listing. Anyone can send a report.</p>
<p class="small">Are you the doctor? <a href="/account/" id="r-claim">Claim your profile</a> instead.</p>
</div>
<form class="claim-form" id="report-form" novalidate>
<input type="hidden" name="listing"><input type="hidden" name="procedure"><input type="hidden" name="submission_id">
<div id="r-doc-known" class="r-doc" hidden><p class="k">Doctor</p><p id="r-doc-name"></p></div>
<div id="r-doc-field"><label for="r-name">Doctor’s name</label><input id="r-name" name="doctor" maxlength="120" required></div>
<fieldset id="r-reason"><legend>What’s wrong?</legend><div class="checks" style="flex-direction:column">{reasons}</div></fieldset>
<div><label for="r-note">Details <span class="hint">(optional) Please do not include patient information.</span></label><textarea id="r-note" name="note" rows="4" maxlength="2000"></textarea></div>
<div><label for="r-email">Your email <span class="hint">(optional) Only if you want a reply.</span></label><input id="r-email" name="email" type="email" maxlength="200" autocomplete="email"></div>
<div class="hp" aria-hidden="true"><label for="r-website">Leave this empty</label><input id="r-website" name="website" tabindex="-1" autocomplete="off"></div>
<div><button type="submit">Send report</button></div>
</form>
<div id="report-status" class="status" role="status" aria-live="polite" tabindex="-1"></div>
<div class="prose"><p class="small muted">We keep what you send to fix the listing. If you give an email, we use it only to reply about this report, and we do not sell or share it. To limit repeated reports, a code made from your connection’s internet address is kept for up to 3 days, then deleted; it is never stored with your report.</p></div>
<noscript><p class="notice">This form needs JavaScript. You can email <a href="mailto:{CONTACT}">{CONTACT}</a> instead.</p></noscript>"""
    return page("/report/", "Report an error | Every Option",
                "Anyone can report an error on an Every Option listing.",
                body, ["/assets/report.js"], cls="finder-page t-report")


def account():
    """Jobs 10 and 11: physician accounts, built but not open. With no backend connected the page says so and the
    script stores nothing and offers the report form (its link carries the card's NPI). Claiming needs an account
    (his words, 2026-11-02), so nothing else stands in for it. Open, the script builds the forms: Is this you?, the code, invitations."""
    body = f"""<h1>For physicians</h1>
<div class="prose">
<div id="acct-closed" class="notice" role="status"><p><strong>Accounts are not open yet.</strong> When they open, physicians can claim their profile here. To tell us about an error now, use the <a id="closed-report" href="/report/">report form</a>.</p></div>
</div>
<div id="acct" hidden>
<div class="prose"><p class="lede" id="acct-lede">Claim your free listing. Once we confirm the account is yours, your card shows under Confirmed by physician, above Likely performs, for each procedure you confirm, with your photo and whether you see patients by video. Your edits show at once. No one can pay for placement, and we do not send or sell patients.</p></div>
<div id="acct-status" class="status" role="status" aria-live="polite" tabindex="-1"></div>
<div id="acct-out"></div>
</div>
<noscript><p class="notice">This page needs JavaScript. To report an error, email <a href="mailto:{CONTACT}">{CONTACT}</a>.</p></noscript>"""
    return page("/account/", "For physicians | Every Option",
                "Physicians can claim their Every Option profile with a free account. Accounts are not open yet.",
                body, ["/assets/procedures.js", "/assets/telehealth.js", "/assets/account.js"])


def not_found():
    body = """<h1>Page not found</h1><p>Find a doctor for:</p>
<ul class="finders">""" + "".join(
        f'<li><a href="/{c["slug"]}/"><strong>{e(c["card"]["name"])}</strong></a></li>'
        for c, p, _ in registry.condition_rows() if p) + "</ul>" + "<p>Read about:</p><ul class=\"finders\">" + "".join(
        f'<li><a href="{href}"><strong>{e(name)}</strong></a> (doctor list coming)</li>' for _, href, name, _ in PAGE_ONLY) + "</ul>"
    return page("/404", "Page not found | Every Option", "Page not found.", body)


# Search engines and AI assistants may read every public page (his goal, 2026-11-01: pages "picked up be search engines
# and by LLMs"). Named AI crawlers are allowed explicitly; Cloudflare's own bot settings can still override this file
# (a launch check, listed in the job 12 run log).
AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot",
           "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot", "Googlebot", "Applebot", "DuckDuckBot"]
ROBOTS = "".join(f"User-agent: {b}\nAllow: /\n\n" for b in AI_BOTS) + "User-agent: *\nAllow: /\n"
# Job 42 (seo-audit 4): /account/ and /report/ stay indexable but leave the sitemap; each page's date is when its text
# last changed: a condition page's own `reviewed` field, REVIEWED for the others.
SITEMAP_PAGES = ["/", "/how-we-know/", "/doctors/"]


def drafts():
    return {s for s in condition.slugs() if condition.load(s).get("draft")}


def condition_dates():
    return {f"/{s}/": condition.load(s)["reviewed"] for s in condition.slugs() if s not in drafts()}


def urlset(entries):
    urls = "".join(f"<url><loc>{ORIGIN}{e(u)}</loc>{f'<lastmod>{d}</lastmod>' if d else ''}</url>" for u, d in entries)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n'


def sitemaps(profiles=(), letters=(), cities=()):
    """Job 42 (city-pages 4): a sitemap index with one file per page type, so indexing can be read per type."""
    files = {
        "sitemap-pages.xml": [(u, REVIEWED) for u in SITEMAP_PAGES] + sorted(condition_dates().items()),
        "sitemap-cities.xml": list(cities),
        "sitemap-doctors.xml": [(u, None) for u in letters] + [(u, None) for u in profiles],   # job 27: indexed groups only
    }
    index = "".join(f"<sitemap><loc>{ORIGIN}/{f}</loc></sitemap>" for f, v in files.items() if v)
    return {f: urlset(v) for f, v in files.items() if v}, (
        f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{index}</sitemapindex>\n')


def write_procedures():
    """The browser, server and database copies of content/procedures.json."""
    short = dict(SHORT)
    long_ = {p["key"]: p["name"] + PAREN[p["key"]] for p in PROCEDURES}
    head = "// Written by tools/build.py from content/procedures.json. Edit that file, not this one.\n"
    write("assets/procedures.js", head + "window.EO_PROCS = " + json.dumps(
        {"keys": [p["key"] for p in PROCEDURES], "short": short, "long": long_,
         "coverage": registry.coverage()}) + ";\n")
    with open(os.path.join(ROOT, "lib", "procedures.mjs"), "w", encoding="utf-8") as fh:
        fh.write(head + "export const PROCEDURES = " + json.dumps(registry.lib_procedures(), ensure_ascii=False) + ";\n"
                 "export const PROCS = PROCEDURES.map((p) => p.key);\n"
                 "// The name in running text: the abbreviation, else the procedure's short words (job platform-directory-0009).\n"
                 "export const PROC_SHORT = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr || p.short || p.name.toLowerCase()]));\n"
                 "export const PROC_LONG = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr ? `${p.name} (${p.abbr})` : p.name]));\n"
                 "// Stage per procedure (tools/registry.py): \"listed\" is what \"draft\" meant before; \"public\" has every surface on (UFE, PAE, GAE).\n"
                 "export const STAGE = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.stage]));\n"
                 "export const DRAFT_PROCS = PROCEDURES.filter((p) => p.stage === \"listed\").map((p) => p.key);\n"
                 "// The coverage page and its link text, for a procedure that has one (job platform-condition-pages-0013).\n"
                 "export const COVERAGE = Object.fromEntries(PROCEDURES.filter((p) => p.coverage).map((p) => [p.key, p.coverage]));\n")
    with open(os.path.join(ROOT, "lib", "registry.mjs"), "w", encoding="utf-8") as fh:
        fh.write(registry.lib_module({s: condition.load(s) for s in registry.BY_SLUG}))
    for rel, text in registry.function_files().items():   # plan review item 8: one function per condition, same shape
        os.makedirs(os.path.dirname(os.path.join(ROOT, rel)), exist_ok=True)
        with open(os.path.join(ROOT, rel), "w", encoding="utf-8") as fh:
            fh.write(text)
    # Procedure registry job 2 (ai-hq job platform-directory-0033): the procedures table's seed rows in schema.sql are
    # written from content/procedure-keys.json; the build stops if schema.sql or the migrations differ from it.
    procedures_sql.write_schema()
    errs = procedures_sql.check()
    if errs:
        raise SystemExit("procedures seed:\n  " + "\n  ".join(errs))


def write(rel, text):
    p = os.path.join(SITE, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(text)


def write_telehealth():
    """Job platform-directory-0007: the browser copy of lib/telehealth.mjs (window.EO_TELE), so the finder and the
    account page use the server's checks and markup. The module keeps to top-level `export const` / `export function`."""
    with open(os.path.join(ROOT, "lib", "telehealth.mjs"), encoding="utf-8") as fh:
        src = fh.read()
    names = re.findall(r"^export (?:const|function) ([A-Za-z_]\w*)", src, re.M)
    body = re.sub(r"^export ", "", src, flags=re.M)
    if re.search(r"^\s*(import|export)\b", body, re.M):
        raise SystemExit("lib/telehealth.mjs: only top-level export const / export function can be copied to the browser")
    write("assets/telehealth.js", "// Written by tools/build.py from lib/telehealth.mjs. Edit that file, not this one.\n"
          "(function () {\n" + body + "\nwindow.EO_TELE = { " + ", ".join(names) + " };\n})();\n")


def copy_src_assets():
    """Hand-written assets kept outside site/ (src-assets/README.md), copied in before any page is written so ver()
    tags them by content."""
    src = os.path.join(ROOT, "src-assets")
    for name in sorted(os.listdir(src)):
        if name.endswith((".css", ".js")):
            with open(os.path.join(src, name), encoding="utf-8") as fh:
                # %%PROC_KEYS%%: the procedure keys from the registry (src-assets/directory.js), so no asset keeps its own list
                write("assets/" + name, fh.read().replace("%%PROC_KEYS%%", json.dumps(registry.keys())))
    # Home banner film (W13 ride c2 v5, his "Put it on dev site", 2026-11-08 19:40 CT): binary files, copied as they are.
    media = os.path.join(src, "media")
    if os.path.isdir(media):
        import shutil
        os.makedirs(os.path.join(SITE, "assets", "media"), exist_ok=True)
        for name in sorted(os.listdir(media)):
            if name.endswith((".mp4", ".png")):
                shutil.copyfile(os.path.join(media, name), os.path.join(SITE, "assets", "media", name))


def main():
    directory.stamp_paths(SITE)   # job platform-web-design-0008: every card's profile link, written once, before anything reads the lists
    copy_src_assets()
    write("assets/logo.svg", logo_file())
    write_telehealth()
    # Job 42: city pages. The build counts each metro and writes what the request-time renderer needs.
    metro_cfg, city_pages, _ = cities.plan(ROOT, SITE)
    city_entries = cities.sitemap_entries(city_pages, LISTINGS_AS_OF)
    write("index.html", home())
    for k in PROCS:
        if k in MOVED:     # the finder now lives on the condition page; site/_redirects sends a 301
            to = MOVED[k]
            write(f"{k}/index.html", f'<!doctype html><meta charset="utf-8"><title>Moved</title><link rel="canonical" href="{ORIGIN}{to}"><meta http-equiv="refresh" content="0; url={to}"><p><a href="{to}">This page moved.</a></p>')
            continue
        write(f"{k}/index.html", finder(k))
    write("how-we-know/index.html", how())
    write("report/index.html", report())
    write("account/index.html", account())
    write("404.html", not_found())
    with open(os.path.join(ROOT, "content", "redirects.txt"), encoding="utf-8") as fh:   # job platform-main-0015
        write("_redirects", "".join(l for l in fh if l.strip() and not l.startswith("#")))
    for old in RENAMED:   # a renamed page's old folder goes, so only site/_redirects answers its old address
        shutil.rmtree(os.path.join(SITE, old), ignore_errors=True)
    for slug in condition.slugs():
        c = condition.load(slug)
        path = f"/{slug}/"
        # Job 42 (seo-audit 3): draft = true in the condition file keeps the page out of search (noindex, not in the
        # sitemap) until he signs off; clear it then.
        robots = '<meta name="robots" content="noindex">\n' if c.get("draft") else ""
        nojs = '<noscript><p class="notice">This finder needs JavaScript to sort doctors by distance.</p></noscript>'
        body = condition.body(c, diagram, e, condition.hero(c, finder_block))
        block = cities.city_block(c["finder"], city_pages, e) if c.get("finder") else ""
        if block:
            assert nojs in body, "condition page layout changed: place the Doctors by city block again"
            body = body.replace(nojs, nojs + block, 1)
        write(f"{slug}/index.html", page(path, c["title"], c["description"], body, ["/assets/procedures.js", "/assets/telehealth.js", "/assets/finder.js", "/assets/condition.js", "/assets/procedure-anim.js", "/assets/proc-banner.js", "/assets/city-fold.js"],
                                         css=["/assets/condition-box.css"], head=robots + condition.schema(c, ORIGIN + path, ORIGIN, "Every Option"),
                                         cls=f"prose-page condition-page t-{c['color']}", banner=strip(c["diagram"]) if c.get("diagram") in PROC_BANNERS else ""))
    for slug in options.slugs():   # the deep "every option" pages, tied to the simple page by tools/options.py
        c, d, f = options.load(slug)
        robots = '<meta name="robots" content="noindex">\n' if d.get("draft") else ""
        hub = cities.HUB.get(c.get("finder"), "") if city_pages.get(c.get("finder")) else ""
        body = options.render(c, d, f, diagram, f"/{slug}/#finder", hub)
        write(d["path"].strip("/") + "/index.html", page(d["path"], d["title"], d["description"], body,
                                                         ["/assets/condition.js", "/assets/procedure-anim.js", "/assets/proc-banner.js", "/assets/deep-nav.js"],
                                                         css=["/assets/condition-box.css"], head=robots + options.schema(c, d, ORIGIN, "Every Option"),
                                                         cls=f"prose-page condition-page options-page t-{c['color']}", banner=strip(c["diagram"]) if c.get("diagram") in PROC_BANNERS else ""))
    insurance.write_all(page, write, ORIGIN)   # noindex and out of the sitemap until launch; linked since job 0013
    # Job 27: the doctor directory. Profiles are rendered on request by lib/directory.mjs from the files written here.
    with open(os.path.join(ROOT, "content", "directory.json"), encoding="utf-8") as fh:
        setting = json.load(fh)["index"]
    recs = directory.load(SITE)
    with open(os.path.join(ROOT, "content", "known-different.json"), encoding="utf-8") as fh:   # job 38
        directory.check_duplicates(recs, [p["npis"] for p in json.load(fh)["pairs"]])
    directory.write_data(SITE, recs, LISTINGS_AS_OF)
    by = directory.letters(recs)
    write("doctors/index.html", page("/doctors/", "Find a doctor by name | Every Option",
                                     "Look up any doctor listed on Every Option by name and open their profile.",
                                     directory.index_body(by, e, len(recs)), ["/assets/directory.js"], cls="prose-page dir-page"))
    for k in by:
        label = "other letters" if k == "other" else k.upper()
        write(f"doctors/{k}/index.html", page(f"/doctors/{k}/", f"Doctors by last name: {label} | Every Option",
                                              f"Doctors listed on Every Option whose last name starts with {label}.",
                                              directory.letter_body(by, k, e), cls="prose-page dir-page"))
    write("_routes.json", json.dumps(directory.routes(by), indent=1) + "\n")
    city_shell = page("%%PATH%%", "%%TITLE%%", "%%DESC%%", "%%BODY%%", head="%%HEAD%%", cls="prose-page city-page %%COLOR%%")
    cities.write_module(ROOT, metro_cfg, city_pages, city_shell,
                        # one sentence per procedure for its city pages: its "city_blurb" in content/procedures.json
                        registry.city_blurbs(), LISTINGS_AS_OF, SITE)
    shell = page("%%PATH%%", "%%TITLE%%", "%%DESC%%", "%%BODY%%", head="%%HEAD%%", cls="prose-page doctor-page")
    with open(os.path.join(ROOT, "lib", "directory-shell.mjs"), "w", encoding="utf-8") as fh:
        fh.write("// Written by tools/build.py (job 27): the site's header and footer around a profile, and the index setting\n"
                 "// from content/directory.json. Edit those, not this file.\n"
                 f"export const SHELL = {json.dumps(shell)};\nexport const INDEX = {json.dumps(setting)};\n"
                 f"export const ORIGIN = {json.dumps(ORIGIN)};\nexport const PROC_PAGE = {json.dumps(directory.PROC_PAGE)};\n")
    files, index = sitemaps(directory.indexed(recs, setting), [f"/doctors/{k}/" for k in by], city_entries)
    for f in os.listdir(SITE):
        if f.startswith("sitemap-") and f.endswith(".xml") and f not in files:
            os.remove(os.path.join(SITE, f))
    for f, text in files.items():
        write(f, text)
    write("sitemap.xml", index)
    write_procedures()
    write("robots.txt", ROBOTS + f"\nSitemap: {ORIGIN}/sitemap.xml\n")
    counts = {}
    for k in PROCS:
        with open(os.path.join(SITE, "data", k + ".json"), encoding="utf-8") as fh:
            counts[k] = json.load(fh)["counts"]
    pattern.main()   # docs/condition-pattern.md: fails the build when a condition breaks the page pattern (job platform-main-0016)
    print("built", counts, "directory", len(recs), {g: sum(directory.group(r) == g for r in recs.values()) for g in ("confirmed", "likely", "nearby")})


if __name__ == "__main__":
    main()
