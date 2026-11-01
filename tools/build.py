#!/usr/bin/env python3
"""Writes the site's HTML pages into site/ from the templates below (one header, one footer, every page's copy).

  python3 tools/build.py            # then commit site/
The finder data (site/data/*.json, site/data/zip/) comes from goswami-hq/ai-hq scripts/every_option_export.py.
Standard library only; the built pages are plain static HTML (Cloudflare Pages serves site/ with no build step).
"""
import html, json, os

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
DISCLOSURE = ("Every Option is run by a practicing interventional radiologist. Listings are free, and no one can pay "
              "to be listed, ranked higher, or sent patients.")
CONTACT = "errors@everyoptionmd.com"
ORIGIN = "https://everyoptionmd.com"
REVIEWED = "2026-11-01"
LISTINGS_AS_OF = "2026-10-29"   # the national views the finder data was exported from (directory v3 job 4d)

# Finder blurbs: projects/platform/content/pages/pae-gae-blurbs-draft.md in goswami-hq/ai-hq, word for word (his
# style rule, 2026-11-01: plain, no statistics, trial names or evidence grades in the visible text). Sources sit under
# a collapsed "Sources" link.
PROCS = {
    "ufe": {
        "name": "Uterine fibroid embolization", "abbr": "UFE", "for": "Fibroids",
        "title": "Find a doctor for uterine fibroid embolization (UFE)",
        "about": [
            "Uterine fibroid embolization (UFE) is for fibroids that cause heavy periods, pain or pressure. It’s a "
            "minimally invasive procedure: a doctor works through a small puncture in the wrist or groin and cuts down "
            "the blood going to the fibroids, so they shrink over time. You keep your uterus. Talk to a doctor about "
            "whether it’s right for you.",
        ],
        "sources": [
            ("Cochrane systematic review of embolization versus surgery for fibroids", ""),
            ("CIRSE standards of practice on uterine artery embolisation (van Overhagen and Reekers, 2015)", ""),
            ("ACR Appropriateness Criteria: Management of Uterine Fibroids (2023)", ""),
        ],
    },
    "pae": {
        "name": "Prostate artery embolization", "abbr": "PAE", "for": "Enlarged prostate",
        "title": "Find a doctor for prostate artery embolization (PAE)",
        "about": [
            "Prostate artery embolization (PAE) is for an enlarged prostate that causes urinary problems, like going "
            "often, getting up at night or a weak stream. It’s a minimally invasive procedure: a doctor works through a "
            "small puncture in the wrist or groin and cuts down the blood going to the prostate, so it shrinks over "
            "time. Talk to a doctor about whether it’s right for you.",
        ],
        "sources": [
            ("American Urological Association guideline on benign prostatic hyperplasia (2026 update), as reported by "
             "the Society of Interventional Radiology (2026-06-18)", ""),
        ],
    },
    "gae": {
        "name": "Genicular artery embolization", "abbr": "GAE", "for": "Knee osteoarthritis pain",
        "title": "Find a doctor for genicular artery embolization (GAE)",
        "about": [
            "Genicular artery embolization (GAE) is for knee pain from arthritis that hasn’t gotten better with other "
            "treatments. It’s a minimally invasive procedure: a doctor works through a small puncture in an artery and "
            "cuts down the extra blood flow that feeds inflammation in the knee, which can ease the pain. It’s a newer "
            "option. Talk to a doctor about whether it’s right for you.",
        ],
        "sources": [
            ("Systematic review of sham-controlled trials of genicular artery embolization (PubMed Central)",
             "https://pmc.ncbi.nlm.nih.gov/articles/PMC12320538/"),
        ],
    },
}

NAV = [("/", "Home"), ("/#conditions", "Conditions"), ("/how-we-know/", "How we know"), ("#follow", "Follow")]
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


def page(path, title, desc, body, scripts=()):
    nav = "".join(f'<a href="{h}"{" aria-current=\"page\"" if h == path else ""}>{e(t)}</a>' for h, t in NAV)
    social = " · ".join(f'<a href="{u}" rel="noopener" target="_blank">{t}</a>' for t, u in SOCIAL)
    js = "".join(f'<script src="{ver(s)}" defer></script>' for s in scripts)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{ORIGIN}{path}">
<link rel="stylesheet" href="{ver('/assets/site.css')}">
<meta name="color-scheme" content="light dark">
{js}
</head>
<body class="{"home-page" if path == "/" else ("finder-page t-" + path.strip("/") if scripts else "prose-page")}">
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap">
<a class="brand" href="/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M2 12h6c4 0 4-7 8-7h6M8 12h14M8 12c4 0 4 7 8 7h6"/></svg>Every Option</a>
<nav class="top" aria-label="Main">{nav}</nav>
</div></header>
<main id="main"><div class="wrap">
{body}
</div></main>
<footer class="site"><div class="wrap">
<p><strong>Education, not medical advice.</strong> Talk to your doctor about your own care. In an emergency, call 911.</p>
<p>Found an error? <a href="/claim/">Use the correction form</a> or email <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>
<p class="disclosure">{e(DISCLOSURE)}</p>
<p><a href="/how-we-know/">How we know</a></p>
<p id="follow" class="follow"><strong>Follow Every Option:</strong> {social}</p>
</div></footer>
</body>
</html>
"""


ARROW = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
         'stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>')


def fork(keys):
    """One line opening into a path per condition: any number of rows; each path takes its condition's colour."""
    n, draw, light = len(keys), "", ""
    mid = n * 50
    for i, k in enumerate(keys):
        y = 100 * i + 50
        d = f"M0 {mid} C90 {mid} 90 {y} 200 {y}"
        draw += f'<path class="draw t-{k}" pathLength="100" d="{d}" style="animation-delay:{i * 90}ms"/>'
        light += f'<path class="light" pathLength="100" d="{d}" style="animation-delay:{1.4 + i * 2.6:.1f}s"/>'
    return (f'<svg class="fork-lines" viewBox="0 0 200 {n * 100}" preserveAspectRatio="none" aria-hidden="true">'
            f"{draw}{light}</svg>")


def home():
    rows = "".join(
        f'<li class="t-{k}"><a href="/{k}/"><span><strong>{e(p["for"])}</strong><span class="proc">{e(p["name"])} ({p["abbr"]})</span></span>{ARROW}</a></li>'
        for k, p in PROCS.items())
    body = f"""<h1>You have more options than you know.</h1>
<p class="lede">Many common conditions have non-surgical treatments that people never hear about. Find doctors near you who do them.</p>
<h2 id="conditions" class="sr">Conditions</h2>
<div class="fork">{fork(list(PROCS))}<ul class="fork-list">{rows}</ul></div>
<div class="plain">
<h2>Simple to use, and free</h2>
<p>Choose a condition, enter your ZIP code, and see who is nearby. Then call their office and ask whether it’s right for you.</p>
<h2>Learn more in short videos</h2>
<p>We explain these treatments in plain language. Follow along on {" · ".join(f'<a href="{u}" rel="noopener" target="_blank">{t}</a>' for t, u in SOCIAL)}.</p>
<p class="small muted">{e(DISCLOSURE)} <a href="/how-we-know/">How we know</a>.</p>
</div>"""
    return page("/", "Every Option: find doctors who perform UFE, PAE and GAE",
                "Find doctors who perform uterine fibroid embolization, prostate artery embolization or genicular "
                "artery embolization near you.", body)


def finder(k):
    p = PROCS[k]
    about = "".join(f"<p>{e(s)}</p>" for s in p["about"])
    items = "".join(f'<li><a href="{e(u)}" rel="noopener" target="_blank">{e(t)}</a></li>' if u else f"<li>{e(t)}</li>"
                    for t, u in p["sources"])
    src = f'<details class="sources"><summary>Sources</summary><ul>{items}</ul></details>' if items else ""
    body = f"""<h1>{e(p["title"])}</h1>
<div class="about">{about}{src}</div>
<div id="finder" data-procedure="{k}">
<form class="zip" id="zip-form" role="search" aria-label="Find doctors by ZIP code" novalidate>
<div class="f"><label for="zip">Your ZIP code</label>
<input id="zip" name="zip" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{{5}}" maxlength="5" placeholder="e.g. 60611" required></div>
<div class="f" style="flex:0 1 130px"><label for="radius">Within</label>
<select id="radius" name="r"><option value="25">25 miles</option><option value="50" selected>50 miles</option><option value="100">100 miles</option><option value="250">250 miles</option></select></div>
<button type="submit">Find doctors</button>
</form>
<div id="status" class="status" role="status" aria-live="polite"></div>
<div id="results"></div>
<noscript><p class="notice">This finder needs JavaScript to sort doctors by distance.</p></noscript>
</div>
<p class="small muted" style="margin-top:22px">This list is not a recommendation or a ranking. Whether {e(p["abbr"])} is right for you is a decision for you and your doctor. <a href="/how-we-know/">How we know</a>.</p>
<p class="small muted">Listings checked as of {LISTINGS_AS_OF}. Page last reviewed {REVIEWED}.</p>"""
    return page(f"/{k}/", f"{p['name']} ({p['abbr']}): find a doctor near you | Every Option",
                f"Doctors listed for {p['name'].lower()} ({p['abbr']}) near your ZIP code, nearest first.", body, ["/assets/finder.js"])


def how():
    body = f"""<h1>How we know</h1>
<div class="prose">
<p class="lede">We look through public information so you can find who near you does a procedure. Doctors can confirm or correct their own listing for free.</p>
<h2>What the two groups mean</h2>
<dl class="grades">
<div><dt>Performs this procedure, confirmed by physician</dt><dd>The doctor told us they perform it. A person checks each submission before it appears.</dd></div>
<div><dt>Likely performs this procedure</dt><dd>Public information points to this doctor performing it. We have not heard from the doctor, so call the office to confirm.</dd></div>
</dl>
<h2>Where the information comes from</h2>
<ul>
<li>Doctors’ profiles on hospital, university and practice websites, and search results for those pages.</li>
<li>Practice websites.</li>
<li>Public Medicare billing records.</li>
<li>ClinicalTrials.gov, the U.S. registry of clinical studies.</li>
<li>Other websites that copy a doctor’s profile.</li>
</ul>
<p>Cities come from the doctor’s newest page. When we only have a city from public records, the card says “City from public records; confirm location with the practice.” Distances are measured between ZIP code centres, not street addresses.</p>
<h2>A blank is not a no</h2>
<p>If a doctor is missing, it usually means we have not found them yet. It does not mean they don’t perform the procedure.</p>
<h2>The badge under a name</h2>
<p><strong>Interventional radiologist:</strong> their own page or their practice’s page says so, or, when no page does, public Medicare billing records show they perform interventional radiology procedures. When we cannot tell, the doctor is not listed.</p>
<h2>Who runs this</h2>
<p>{e(DISCLOSURE)}</p>
<p>Confirming is free. Within each group, the order is by distance only.</p>
<h2>Report an error</h2>
<p>If something is wrong, or you are a listed doctor and want to confirm or correct your listing, use the <a href="/claim/">correction form</a> or email <a href="mailto:{CONTACT}">{CONTACT}</a>. A person reviews every report before anything changes.</p>
<p class="small muted">Education, not medical advice. Last reviewed {REVIEWED}.</p>
</div>"""
    return page("/how-we-know/", "How we know | Every Option",
                "What the two groups on Every Option mean, where the information comes from, and how to report an error.",
                body)


def claim():
    checks = "".join(f'<label><input type="checkbox" name="procedures" value="{k}"> {e(p["name"])} ({p["abbr"]})</label>'
                     for k, p in PROCS.items())
    body = f"""<h1>Is this you? Confirm or correct a listing</h1>
<div class="prose">
<p class="lede">Tell us which procedures you perform. Doctors who confirm are listed first for those procedures, free. A person reviews every submission, and nothing you send appears on the site until it has been checked.</p>
<p class="small muted">We use your email only to reply about this submission. We do not sell or share it. No account is created. To limit repeated submissions, a code made from your connection’s internet address is kept for two hours, then deleted; it is never stored with your submission.</p>
</div>
<form class="claim-form" id="claim-form" novalidate>
<input type="hidden" name="listing"><input type="hidden" name="submission_id">
<fieldset><legend>I am</legend><div class="checks">
<label><input type="radio" name="role" value="doctor" checked> The doctor listed</label>
<label><input type="radio" name="role" value="practice"> Staff at their practice</label>
<label><input type="radio" name="role" value="other"> Someone reporting an error</label>
</div></fieldset>
<div><label for="c-name">Doctor’s full name</label><input id="c-name" name="name" maxlength="120" autocomplete="name" required></div>
<div><label for="c-npi">NPI <span class="hint">(10 digits; required if you are the doctor)</span></label><input id="c-npi" name="npi" inputmode="numeric" maxlength="10" pattern="[0-9]{{10}}"></div>
<div><label for="c-email">Your email</label><input id="c-email" name="email" type="email" maxlength="200" autocomplete="email" required></div>
<fieldset><legend>Procedures the doctor performs</legend><div class="checks">{checks}</div></fieldset>
<div><label for="c-practice">Correct practice name</label><input id="c-practice" name="practice" maxlength="200" autocomplete="organization"></div>
<div class="row2">
<div><label for="c-city">City</label><input id="c-city" name="city" maxlength="100" autocomplete="address-level2"></div>
<div><label for="c-state">State <span class="hint">(2 letters)</span></label><input id="c-state" name="state" maxlength="2" autocomplete="address-level1" style="text-transform:uppercase"></div>
</div>
<div><label for="c-note">Anything else <span class="hint">(optional; please do not include any patient information)</span></label><textarea id="c-note" name="note" rows="4" maxlength="2000"></textarea></div>
<div class="hp" aria-hidden="true"><label for="c-website">Leave this empty</label><input id="c-website" name="website" tabindex="-1" autocomplete="off"></div>
<div><button type="submit">Send</button></div>
</form>
<div id="claim-status" class="status" role="status" aria-live="polite" tabindex="-1"></div>
<noscript><p class="notice">This form needs JavaScript. You can email <a href="mailto:{CONTACT}">{CONTACT}</a> instead.</p></noscript>"""
    return page("/claim/", "Correct or claim a listing | Every Option",
                "Doctors and practices can correct or claim an Every Option listing. A person reviews every submission.",
                body, ["/assets/claim.js"])


def not_found():
    body = """<h1>Page not found</h1><p>Try one of the procedure finders:</p>
<ul class="finders">""" + "".join(
        f'<li><a href="/{k}/"><span class="abbr">{p["abbr"]}</span><strong>{e(p["name"])}</strong></a></li>'
        for k, p in PROCS.items()) + "</ul>"
    return page("/404", "Page not found | Every Option", "Page not found.", body)


def write(rel, text):
    p = os.path.join(SITE, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(text)


def main():
    write("index.html", home())
    for k in PROCS:
        write(f"{k}/index.html", finder(k))
    write("how-we-know/index.html", how())
    write("claim/index.html", claim())
    write("404.html", not_found())
    counts = {}
    for k in PROCS:
        with open(os.path.join(SITE, "data", k + ".json"), encoding="utf-8") as fh:
            counts[k] = json.load(fh)["counts"]
    print("built", counts)


if __name__ == "__main__":
    main()
