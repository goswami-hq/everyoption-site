"""Job 42: procedure-by-city pages (ai-hq projects/platform/aeo/skills-run-2026-11-05/city-pages.md, his yes 2026-11-05:
"it shouldn't be a static page, it should dynamically update").

A metro is every listed doctor within `radius` miles of a fixed center ZIP (content/metros.json). The build counts each
metro from the static lists with the finder's own distance rule (site/assets/finder.js miles() and place()); a metro
whose count reaches `bar` gets a page. The pages themselves are rendered on request by lib/cities.mjs, which lays the
live account overlay over the same lists, so a doctor who removes a procedure leaves the page within the cache time.

Writes lib/cities-data.mjs (the page shell, the metros that have pages with their centers, and the copy the pages
reuse). Nothing here holds a ZIP a patient typed.
"""
import json, math, os

PAGE = {"ufe": "/fibroids/"}            # procedures with city pages: condition page each hangs under
HUB = {k: v + "doctors/" for k, v in PAGE.items()}
REVIEWED = "2026-11-05"                 # the city page template text


def miles(a, b):
    """finder.js miles(): haversine, R = 3958.8."""
    r, rad = 3958.8, math.pi / 180
    dlat, dlon = (b[0] - a[0]) * rad, (b[1] - a[1]) * rad
    h = math.sin(dlat / 2) ** 2 + math.cos(a[0] * rad) * math.cos(b[0] * rad) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(h)))


def place(p, center, radius):
    """finder.js place(): closest office with a point inside the radius, else the card's own point. Miles or None."""
    offs = [o for o in (p.get("offices") or []) if o.get("lat") is not None and o.get("lon") is not None]
    if offs:
        best = min((miles(center, [o["lat"], o["lon"]]) for o in offs), default=None)
        return best if best is not None and best <= radius else None
    if p.get("lat") is None or p.get("lon") is None:
        return None
    m = miles(center, [p["lat"], p["lon"]])
    return m if m <= radius else None


def zip_center(site, z):
    with open(os.path.join(site, "data", "zip", z[:3] + ".json"), encoding="utf-8") as fh:
        ll = json.load(fh).get(z)
    if not ll:
        raise SystemExit(f"cities: center ZIP {z} has no point in site/data/zip/")
    return ll


def load(root, site):
    with open(os.path.join(root, "content", "metros.json"), encoding="utf-8") as fh:
        cfg = json.load(fh)
    for m in cfg["metros"]:
        for c in m["centers"]:
            c["ll"] = zip_center(site, c["zip"])
    return cfg


def metro_miles(p, m, radius):
    """Distance to the nearer center, or None when outside every circle."""
    d = [x for x in (place(p, c["ll"], radius) for c in m["centers"]) if x is not None]
    return min(d) if d else None


def counts(cfg, people):
    r = cfg["radius"]
    return {m["slug"]: sum(1 for p in people if not p.get("test") and metro_miles(p, m, r) is not None) for m in cfg["metros"]}


def plan(root, site):
    """-> cfg, {proc: [metros with pages, in count order]}, {proc: {slug: count}} for every metro (the thin list too)."""
    cfg = load(root, site)
    pages, allc = {}, {}
    for k in cfg["procs"]:
        with open(os.path.join(site, "data", k + ".json"), encoding="utf-8") as fh:
            people = json.load(fh)["people"]
        c = counts(cfg, people)
        allc[k] = c
        order = {m["slug"]: i for i, m in enumerate(cfg["metros"])}
        pages[k] = sorted((m for m in cfg["metros"] if c[m["slug"]] >= cfg["bar"] and m["slug"] in cfg["pages"]), key=lambda m: (-c[m["slug"]], order[m["slug"]]))
    return cfg, pages, allc


def sitemap_entries(pages, as_of):
    out = []
    for k, ms in pages.items():
        if ms:
            out.append((HUB[k], as_of))
            out += [(HUB[k] + m["slug"] + "/", as_of) for m in ms]
    return out


def city_block(k, pages, e):
    """Plain-HTML links under the finder on the condition page (city-pages 4: real links, not added by script)."""
    ms = pages.get(k) or []
    if not ms:
        return ""
    links = "".join(f'<li><a href="{HUB[k]}{m["slug"]}/">{e(m["name"])}</a></li>' for m in sorted(ms, key=lambda m: m["name"]))
    return (f'<nav class="by-city" aria-label="Doctors by city"><h2>Doctors by city</h2><ul>{links}</ul>'
            f'<p class="small"><a href="{HUB[k]}">All cities and states</a></p></nav>')


def metro_of(cfg, pages, site):
    """npi -> the slug of the page metro whose center is nearest, for the profile's link back (city-pages 4)."""
    out = {}
    for k, ms in pages.items():
        with open(os.path.join(site, "data", k + ".json"), encoding="utf-8") as fh:
            people = json.load(fh)["people"]
        of = {}
        for p in people:
            if p.get("test"):
                continue
            best = min(((d, m["slug"]) for m in ms if (d := metro_miles(p, m, cfg["radius"])) is not None), default=None)
            if best:
                of[p["npi"]] = best[1]
        out[k] = dict(sorted(of.items()))
    return out


def write_module(root, cfg, pages, shell, blurbs, as_of, site):
    data = {
        "radius": cfg["radius"], "bar": cfg["bar"], "floor": cfg["floor"], "page": PAGE, "hub": HUB, "reviewed": REVIEWED,
        "as_of": as_of, "blurbs": blurbs,
        "metros": {k: [{"slug": m["slug"], "name": m["name"], "place": m["place"],
                        "centers": [{"zip": c["zip"], "label": c["label"], "ll": c["ll"]} for c in m["centers"]]} for m in ms]
                   for k, ms in pages.items()},
        "metro_of": metro_of(cfg, pages, site),
    }
    with open(os.path.join(root, "lib", "cities-data.mjs"), "w", encoding="utf-8") as fh:
        fh.write("// Written by tools/build.py (job 42) from content/metros.json and the build's copy. Edit those, not this file.\n"
                 f"export const CITY_SHELL = {json.dumps(shell)};\nexport const CITIES = {json.dumps(data, ensure_ascii=False)};\n")
