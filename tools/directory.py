"""Job 27: the public doctor directory (his words, 2026-11-03: "only groups A B C, nobody else").

Membership is exactly who the finder can show (site/assets/finder.js): anyone on a procedure list with a place on the map
(`place`), plus roster doctors that pass `rosterShown`. tools/directory-job27.test.mjs runs those two finder functions on
the same data and checks they give the same people as `members` here.

Writes, all public fields only:
  site/data/directory.json        the name search file: name, city, state, profile path, and the lists each person is on
                                   (the browser needs the lists to apply a doctor's removal the way the finder does)
  site/data/doctors/<NN>.json     profile data in 100 small files by the NPI's last two digits (the server reads one)
  site/doctors/index.html, site/doctors/<letter>/index.html   search page and A to Z pages (plain links for crawlers)
Profiles themselves are rendered by lib/directory.mjs on request; none are committed as pages.
"""
import json, os, re, unicodedata

PROC_PAGE = {"ufe": "/fibroids/", "pae": "/pae/", "gae": "/gae/"}
TEST_NPIS = {"1999999990"}
CARD_KEYS = ["insurances", "insurance_other", "insurance_confirm", "booking_url"]
OFFICE_KEYS = ["practice", "street", "city", "state", "zip", "phone"]
PHOTO = re.compile(r"^/(photos|api/photo)/[0-9]{10}-[0-9a-f]{8,32}\.(jpg|png|webp)$")
SUFFIX = {"jr", "sr", "ii", "iii", "iv", "md", "do", "phd", "mph"}


def slug(name):
    """Same as slug() in lib/directory.mjs and site/assets/finder.js (the test compares all three on every name)."""
    s = re.sub("[̀-ͯ]", "", unicodedata.normalize("NFKD", name or "")).lower()
    s = s.replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "doctor"


def path(p):
    return f"/doctors/{slug(p['name'])}-{p['npi']}/"


def has_point(o):
    return o.get("lat") is not None and o.get("lon") is not None


def placed(p):
    """finder.js place(): any office with a point, else the card's own point."""
    offs = p.get("offices") or []
    return any(has_point(o) for o in offs) or has_point(p)


def roster_shown(p):
    """finder.js rosterShown()."""
    return bool(p.get("proven") and not p.get("billing_only") and not p.get("neuro_only") and (p.get("phone") or p.get("url"))
                and has_point(p))


def is_test(p):
    return p.get("npi") in TEST_NPIS or p.get("test") or "(test listing)" in (p.get("name") or "")


def public(p, proc):
    """The allow-list. Photo only on Confirmed (as on the card); note per procedure."""
    r = {k: p.get(k) or "" for k in ("name", "practice", "city", "state", "phone", "url")}
    offs = [{k: o.get(k) or "" for k in OFFICE_KEYS} for o in (p.get("offices") or []) if o.get("city")]
    if offs:
        r["offices"] = offs
    for k in CARD_KEYS:
        if p.get(k):
            r[k] = p[k]
    if p.get("confirmed") and PHOTO.match(p.get("photo") or ""):
        r["photo"] = p["photo"]
    if p.get("blurb") and proc:
        r["blurbs"] = {proc: p["blurb"]}
    return r


def members(lists, roster):
    """lists: {proc: [people]}, roster: [people] -> {npi: record} for everyone the finder can show."""
    out = {}
    for proc, people in lists.items():
        for p in people:
            if is_test(p) or not placed(p):
                continue
            rec = out.get(p["npi"])
            if rec is None:
                rec = out[p["npi"]] = dict(public(p, proc), npi=p["npi"], procs={}, roster=False)
            else:
                if p.get("blurb"):
                    rec.setdefault("blurbs", {})[proc] = p["blurb"]
                if p.get("confirmed") and "photo" not in rec and PHOTO.match(p.get("photo") or ""):
                    rec["photo"] = p["photo"]
            rec["procs"][proc] = "confirmed" if p.get("confirmed") else "likely"
    for p in roster:
        if is_test(p) or not roster_shown(p):
            continue
        if p["npi"] in out:
            out[p["npi"]]["roster"] = True
        else:
            out[p["npi"]] = dict(public(p, None), npi=p["npi"], procs={}, roster=True)
    return out


def group(rec):
    v = set(rec["procs"].values())
    return "confirmed" if "confirmed" in v else "likely" if v else "nearby"


def last_letter(name):
    words = [w for w in slug(name).split("-") if w not in SUFFIX] or ["x"]
    c = words[-1][0]
    return c if "a" <= c <= "z" else "other"


def sort_key(rec):
    words = [w for w in slug(rec["name"]).split("-") if w not in SUFFIX]
    return (words[-1] if words else "", slug(rec["name"]))


def load(site):
    lists = {}
    for k in PROC_PAGE:
        with open(os.path.join(site, "data", k + ".json"), encoding="utf-8") as fh:
            lists[k] = json.load(fh)["people"]
    with open(os.path.join(site, "data", "ir-roster.json"), encoding="utf-8") as fh:
        roster = json.load(fh)["people"]
    return members(lists, roster)


def write_data(site, recs, as_of):
    people = []
    for r in sorted(recs.values(), key=sort_key):
        x = {"n": r["name"], "c": r["city"], "s": r["state"], "p": path(r)}
        if r["procs"]:
            x["l"] = " ".join(k for k in PROC_PAGE if k in r["procs"])
            if r["roster"]:
                x["r"] = 1
        people.append(x)
    with open(os.path.join(site, "data", "directory.json"), "w", encoding="utf-8") as fh:
        json.dump({"as_of": as_of, "people": people}, fh, ensure_ascii=False, separators=(",", ":"))
    shards = {f"{i:02d}": {} for i in range(100)}   # every file exists, so a missing one never means "try again" forever
    for r in recs.values():
        shards.setdefault(r["npi"][-2:], {})[r["npi"]] = {k: v for k, v in r.items() if k != "npi"}
    d = os.path.join(site, "data", "doctors")
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        if f.endswith(".json"):
            os.remove(os.path.join(d, f))
    for key, recs_ in shards.items():
        with open(os.path.join(d, key + ".json"), "w", encoding="utf-8") as fh:
            json.dump(recs_, fh, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def letters(recs):
    by = {}
    for r in recs.values():
        by.setdefault(last_letter(r["name"]), []).append(r)
    return {k: sorted(v, key=sort_key) for k, v in sorted(by.items())}


def az_nav(by, e, current=None):
    links = []
    for k in by:
        label = "Other" if k == "other" else k.upper()
        links.append(f'<a href="/doctors/{k}/"{" aria-current=\"page\"" if k == current else ""}>{label}</a>')
    return f'<nav class="az" aria-label="Doctors by last name">{"".join(links)}</nav>'


def index_body(by, e, count):
    return f"""<h1>Find a doctor by name</h1>
<div id="dir" class="dir-search">
<label for="dir-q">Doctor’s name</label>
<input id="dir-q" type="search" autocomplete="off" spellcheck="false" placeholder="e.g. Maria Lopez">
<p id="dir-status" class="small muted" role="status" aria-live="polite">{count:,} doctors. Type a first or last name.</p>
<ul id="dir-results" class="dir-list"></ul>
<noscript><p class="notice">Search needs JavaScript. Use the letters below to browse by last name.</p></noscript>
</div>
<h2>Browse by last name</h2>
{az_nav(by, e)}
<p class="small muted">This list is not a recommendation or a ranking. It holds every doctor who can appear in a search on this site. <a href="/how-we-know/">How we know</a>.</p>"""


def letter_body(by, k, e):
    rows = "".join(f'<li><a href="{path(r)}">{e(r["name"])}</a> <span class="muted">{e(r["city"])}, {e(r["state"])}</span></li>'
                   for r in by[k])
    label = "other letters" if k == "other" else k.upper()
    return f"""<p class="small"><a href="/doctors/">Search by name</a></p>
<h1>Doctors: last names starting with {label}</h1>
{az_nav(by, e, k)}
<ul class="dir-list">{rows}</ul>"""


def routes(by):
    """site/_routes.json: the profile function runs for /doctors/* except the static search and A to Z pages."""
    return {"version": 1, "include": ["/api/*", "/doctors/*"], "exclude": ["/doctors/"] + [f"/doctors/{k}/" for k in by]}


def indexed(recs, setting):
    return [path(r) for r in sorted(recs.values(), key=sort_key) if setting.get(group(r), False)]
