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

PROCS = {
    "ufe": {
        "name": "Uterine fibroid embolization", "abbr": "UFE", "for": "Fibroids",
        "title": "Find a doctor for uterine fibroid embolization (UFE)",
        "about": [
            "Uterine fibroid embolization (UFE) treats fibroids that cause heavy bleeding, pain or pressure. A doctor "
            "blocks the fibroids’ blood supply through a small puncture in an artery, and the uterus stays in place.",
            "In a Cochrane review of randomized trials, satisfaction was similar to surgery and women returned to normal "
            "activities about two weeks sooner, but more needed another procedure within two years (moderate-quality "
            "evidence).",
            "It is not for pregnancy, an active infection of the uterus, or uterine or ovarian cancer (CIRSE standards "
            "of practice, 2015). If you plan a pregnancy, guidelines differ; ask about myomectomy too.",
        ],
        "sources": "Sources: Cochrane systematic review of embolization versus surgery for fibroids (6 randomized "
                   "trials, 640 women at 24 months); CIRSE standards of practice (van Overhagen and Reekers, 2015); "
                   "ACR Appropriateness Criteria, Management of Uterine Fibroids (2023).",
    },
    "pae": {
        "name": "Prostate artery embolization", "abbr": "PAE", "for": "Enlarged prostate",
        "title": "Find a doctor for prostate artery embolization (PAE)",
        "about": [
            "Prostate artery embolization (PAE) is a procedure for an enlarged prostate (benign prostatic hyperplasia).",
            "We have not yet published our sourced summary of who it suits. Ask the doctor whether it fits your "
            "situation, and about the other options for an enlarged prostate.",
        ],
        "sources": "",
    },
    "gae": {
        "name": "Genicular artery embolization", "abbr": "GAE", "for": "Knee osteoarthritis pain",
        "title": "Find a doctor for genicular artery embolization (GAE)",
        "about": [
            "Genicular artery embolization (GAE) is a procedure for knee pain from osteoarthritis.",
            "We have not yet published our sourced summary of who it suits. Ask the doctor whether it fits your "
            "situation, and about the other options for knee osteoarthritis.",
        ],
        "sources": "",
    },
}

NAV = [("/", "Home"), ("/ufe/", "UFE"), ("/pae/", "PAE"), ("/gae/", "GAE"), ("/how-we-know/", "How we know")]


def e(s):
    return html.escape(s, quote=True)


def page(path, title, desc, body, scripts=()):
    nav = "".join(f'<a href="{h}"{" aria-current=\"page\"" if h == path else ""}>{e(t)}</a>' for h, t in NAV)
    js = "".join(f'<script src="{s}" defer></script>' for s in scripts)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{ORIGIN}{path}">
<link rel="stylesheet" href="/assets/site.css">
<meta name="color-scheme" content="light dark">
{js}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap">
<a class="brand" href="/"><span aria-hidden="true"></span>Every Option</a>
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
</div></footer>
</body>
</html>
"""


def home():
    cards = "".join(
        f'<li><a href="/{k}/"><span class="abbr">{p["abbr"]}</span><strong>{e(p["name"])}</strong>'
        f'<span class="for">{e(p["for"])}</span></a></li>' for k, p in PROCS.items())
    body = f"""<h1>Find the doctors who do the procedure, and see why each one is listed.</h1>
<p class="lede">Every Option shows which doctors perform a procedure, with the evidence for each listing under their name.</p>
<ul class="finders">{cards}</ul>
<div class="about">
<p>Type your ZIP code on a procedure page. Doctors with evidence that they perform it come first; doctors whose pages only list it come next. Nearest first.</p>
<p class="small muted">{e(DISCLOSURE)} <a href="/how-we-know/">How we know</a>.</p>
</div>"""
    return page("/", "Every Option: find doctors for UFE, PAE and GAE, with the evidence shown",
                "Find doctors who perform uterine fibroid embolization, prostate artery embolization or genicular "
                "artery embolization near you, with the evidence for each listing.", body)


def finder(k):
    p = PROCS[k]
    about = "".join(f"<p>{e(s)}</p>" for s in p["about"])
    src = f'<p class="sources">{e(p["sources"])}</p>' if p["sources"] else ""
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
<p class="small muted" style="margin-top:22px">This list is not a recommendation or a ranking. Whether {e(p["abbr"])} is right for you is a decision for you and your doctor. <a href="/how-we-know/">How we know</a>.</p>"""
    return page(f"/{k}/", f"{p['name']} ({p['abbr']}): find a doctor near you | Every Option",
                f"Doctors who perform {p['name'].lower()} ({p['abbr']}) near your ZIP code, nearest first, with the "
                "evidence for each listing.", body, ["/assets/finder.js"])


def how():
    body = f"""<h1>How we know</h1>
<div class="prose">
<p class="lede">Every doctor on a procedure page is there because of something we can show you. The evidence sits under their name, with a link to where it came from.</p>
<h2>What the two groups mean</h2>
<dl class="grades">
<div><dt>Performs this procedure</dt><dd>The doctor’s own page says they perform it (for example, “she performs uterine fibroid embolization” or “has extensive experience in” it), or public Medicare billing records show a billing code used only for this procedure.</dd></div>
<div><dt>Lists this procedure; confirm with the practice</dt><dd>A page lists or mentions the procedure, but does not say this doctor performs it: a list of services, a practice page, a search-result preview of their page, or a ClinicalTrials.gov study they lead. Call the practice before you book.</dd></div>
</dl>
<p>We only show a doctor when we have one of these. People with weaker evidence are not shown.</p>
<h2>Where the evidence comes from</h2>
<ul>
<li><strong>Doctors’ own pages:</strong> their profile on a hospital, university or practice website.</li>
<li><strong>Practice pages:</strong> the services page of the practice they work in.</li>
<li><strong>Public Medicare billing records:</strong> the yearly files Medicare publishes on what each doctor billed. We show the code and the year.</li>
<li><strong>ClinicalTrials.gov:</strong> the U.S. registry of clinical studies, where study leaders are named.</li>
</ul>
<p>Cities come from the doctor’s newest page. When we only have a city from public records, the card says “City from public records; confirm location with the practice.” Distances are measured between ZIP code centres, not street addresses.</p>
<h2>A blank is not a no</h2>
<p>If a doctor is missing, or shows only in the second group, it usually means we have not found a page that says more. It does not mean they don’t perform the procedure.</p>
<h2>The badge under a name</h2>
<ul>
<li><strong>Interventional radiologist:</strong> their own page states interventional radiology training or board certification.</li>
<li><strong>Does IR procedures:</strong> their own page says they perform catheter procedures that interventional radiologists do.</li>
<li><strong>Bills IR procedures:</strong> public Medicare billing records show interventional radiology procedures.</li>
</ul>
<h2>Who runs this</h2>
<p>{e(DISCLOSURE)}</p>
<p>The order on every page is by distance only.</p>
<h2>Report an error</h2>
<p>If something is wrong, or you are a listed doctor and want to correct or claim your listing, use the <a href="/claim/">correction form</a> or email <a href="mailto:{CONTACT}">{CONTACT}</a>. A person reviews every report before anything changes.</p>
<p class="small muted">Education, not medical advice.</p>
</div>"""
    return page("/how-we-know/", "How we know | Every Option",
                "What the two groups on Every Option mean, where the evidence comes from, and how to report an error.",
                body)


def claim():
    checks = "".join(f'<label><input type="checkbox" name="procedures" value="{k}"> {e(p["name"])} ({p["abbr"]})</label>'
                     for k, p in PROCS.items())
    body = f"""<h1>Is this you? Correct or claim a listing</h1>
<div class="prose">
<p class="lede">Tell us what is right. A person reviews every submission, and nothing you send appears on the site until it has been checked.</p>
<p class="small muted">We use your email only to reply about this submission. We do not sell or share it. No account is created.</p>
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
