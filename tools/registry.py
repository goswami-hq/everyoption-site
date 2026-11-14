"""The procedure registry (ai-hq job platform-directory-0032, procedure registry job 1 of 4; his words 2026-11-11: "let's
come up with a way that we can add new procedures later on without any issues").

Two linked lists are the only place a condition or procedure is named. Every other list in the site is generated from
them, or reads them through this module:
  content/conditions.json      a condition: slug, names, colors, home card, page files, its procedures
  content/procedures.json      a procedure: key, names, the conditions it treats, stage, finder wording, optional parts
  content/procedure-keys.json  the issued keys (append-only) and the reserved words
  content/upcoming-procedures.json  procedures a doctor can tick privately as "not on the site yet" (ai-hq job
                               platform-directory-0036): groups of items (slug, name, for) and the issued slugs (append-only)

Stages: "page" (condition page and a "Doctor list coming" card, no list), "listed" (finder and list, noindex profiles:
what "draft" meant before), "public". Optional parts a procedure declares in "parts": animation (its scene in
tools/diagrams/anim-<key>.svgfrag and site/assets/procedure-anim.js), banner (site/assets/proc-banner.js), coverage (an
insurance page in content/insurance/pages.toml), payer_table (rows in content/insurance/coverage-*.toml), city_pages (a
"procs" entry in content/metros.json). A part that is not declared is left out; a declared part whose file is missing
fails the build (check()).
"""
import json, os, pathlib, re, tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
STAGES = ("page", "listed", "public")
WITH_LIST = ("listed", "public")          # stages with a doctor list (site/data/<key>.json)
KEY = re.compile(r"^[a-z][a-z0-9]{1,15}$")
SLUG = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")   # an upcoming item's slug: lowercase words joined by hyphens
UPCOMING_MAX = 100                                    # profiles.also_performs holds at most 100 entries (schema.sql)
PARTS = {"animation", "banner", "coverage", "payer_table", "city_pages"}


def _load(name):
    return json.loads((ROOT / "content" / name).read_text(encoding="utf-8"))


PROCEDURES = _load("procedures.json")
CONDITIONS = _load("conditions.json")
KEYS = _load("procedure-keys.json")
UPCOMING = _load("upcoming-procedures.json")
BY_KEY = {p["key"]: p for p in PROCEDURES}
BY_SLUG = {c["slug"]: c for c in CONDITIONS}


def listed():
    """Procedures with a doctor list (stage listed or public), in registry order."""
    return [p for p in PROCEDURES if p["stage"] in WITH_LIST]


def keys():
    return [p["key"] for p in listed()]


def draft_keys():
    """Listed but not public: profile tags show, but a profile listed only for these stays noindex (job 0009's "draft")."""
    return [p["key"] for p in PROCEDURES if p["stage"] == "listed"]


def public_keys():
    return [p["key"] for p in PROCEDURES if p["stage"] == "public"]


def condition_of(k):
    """The condition a procedure's finder, home card and city pages hang under: its first condition."""
    return BY_SLUG[BY_KEY[k]["conditions"][0]]


def page_of():
    """key -> its condition page ("/fibroids/"), for every procedure with a list."""
    return {k: "/" + condition_of(k)["slug"] + "/" for k in keys()}


def short(p):
    """The name in running text: the abbreviation, else the short words (job platform-directory-0009)."""
    return p["abbr"] or p.get("short") or p["name"].lower()


def paren(p):
    return f' ({p["abbr"]})' if p["abbr"] else ""


def part(k, name):
    return BY_KEY[k].get("parts", {}).get(name)


def has(k, name):
    return k in BY_KEY and bool(part(k, name))


def animations():
    return {p["key"]: p["parts"]["animation"] for p in PROCEDURES if p.get("parts", {}).get("animation")}


def banners():
    return {p["key"] for p in PROCEDURES if p.get("parts", {}).get("banner")}


def life_strips():
    """Procedures whose page-top strip is the daily-life one (parts.banner == "life"; site/assets/life-strip.js)."""
    return {p["key"] for p in PROCEDURES if p.get("parts", {}).get("banner") == "life"}


def coverage():
    return {p["key"]: p["parts"]["coverage"] for p in listed() if p.get("parts", {}).get("coverage")}


def hub_only_payers():
    """Procedures with payer rows but no coverage page of their own: the insurance hub shows their cards (HAE today)."""
    return [p for p in listed() if p.get("parts", {}).get("payer_table") and not p["parts"].get("coverage")]


def city_blurbs():
    return {k: BY_KEY[k]["city_blurb"] for k in keys()}


def as_of_proc():
    return {k: BY_KEY[k]["listings_as_of"] for k in keys() if BY_KEY[k].get("listings_as_of")}


def condition_rows():
    """Home cards, in registry order: (condition, its listed procedure or None, its page-stage procedure or None)."""
    out = []
    for c in CONDITIONS:
        ps = [BY_KEY[k] for k in c["procedures"]]
        lp = [p for p in ps if p["stage"] in WITH_LIST]
        pg = [p for p in ps if p["stage"] == "page"]
        out.append((c, lp[0] if lp else None, pg[0] if pg else None))
    return out


def lib_procedures():
    """lib/procedures.mjs's PROCEDURES: the fields the server code reads (accounts, report API, profiles)."""
    out = []
    for p in listed():
        x = {"key": p["key"], "abbr": p["abbr"]}
        if p.get("short"):
            x["short"] = p["short"]
        x["name"] = p["name"]
        if part(p["key"], "coverage"):
            x["coverage"] = part(p["key"], "coverage")
        x["stage"] = p["stage"]
        out.append(x)
    return out


def upcoming_groups():
    """The account page's "not on the site yet" tick list: each group with its items still to tick, in file order. An item
    with promoted_to is a real procedure now and leaves the list; a group left empty is left out."""
    out = []
    for g in UPCOMING["groups"]:
        items = [{"slug": i["slug"], "name": i["name"], "for": i["for"]} for i in g["items"] if not i.get("promoted_to")]
        if items:
            out.append({"name": g["name"], "items": items})
    return out


def upcoming_slugs():
    return [i["slug"] for g in upcoming_groups() for i in g["items"]]


def upcoming_module():
    """lib/upcoming.mjs: the server's copy of the tick list (lib/accounts/service.mjs checks also_performs against it)."""
    return ("// Written by tools/build.py from content/upcoming-procedures.json (tools/registry.py). Edit that file, not this one.\n"
            "// Private: what a doctor ticks here is never shown and never lists them (ai-hq job platform-directory-0036).\n"
            f"export const UPCOMING_GROUPS = {json.dumps(upcoming_groups(), ensure_ascii=False)};\n"
            "export const UPCOMING_SLUGS = UPCOMING_GROUPS.flatMap((g) => g.items.map((i) => i.slug));\n")


def account_subs():
    """key -> the grey line under the name in the account page's procedure row (optional field account_sub)."""
    return {p["key"]: p["account_sub"] for p in listed() if p.get("account_sub")}


def check_upcoming():
    """The upcoming list's rules: slugs well formed and unique, every slug issued and every issued slug kept (append-only,
    as procedure keys), no slug equal to an issued procedure key or a reserved word, promoted_to only to an issued key."""
    errs = []
    keys, words = set(KEYS["issued"]), set(KEYS["reserved"])
    issued = UPCOMING.get("issued", [])
    seen = set()
    groups = UPCOMING.get("groups", [])
    if not groups:
        errs.append("upcoming: no groups")
    for g in groups:
        if not g.get("name"):
            errs.append("upcoming: a group with no name")
        if not g.get("items"):
            errs.append(f"upcoming group {g.get('name')!r}: no items")
        for i in g.get("items", []):
            s = i.get("slug", "")
            unknown = set(i) - {"slug", "name", "for", "promoted_to"}
            if unknown:
                errs.append(f"upcoming {s}: unknown fields {sorted(unknown)}")
            if not SLUG.match(s) or len(s) > 60:
                errs.append(f"upcoming {s!r}: a slug is lowercase letters and digits, words joined by single hyphens, at most 60")
            if s in seen:
                errs.append(f"upcoming {s}: listed twice")
            seen.add(s)
            if s in keys:
                errs.append(f"upcoming {s}: equals an issued procedure key; a slug is never a key")
            if s in words:
                errs.append(f"upcoming {s}: a reserved word")
            if s not in issued:
                errs.append(f"upcoming {s}: not in content/upcoming-procedures.json 'issued'; append it there (slugs are permanent)")
            for f in ("name", "for"):
                if not isinstance(i.get(f), str) or not i.get(f).strip():
                    errs.append(f"upcoming {s}: no {f!r}")
            if "promoted_to" in i and i["promoted_to"] not in keys:
                errs.append(f"upcoming {s}: promoted_to {i['promoted_to']!r} is not an issued procedure key")
    for n, s in enumerate(issued):
        if issued.index(s) != n:
            errs.append(f"upcoming issued slug {s}: listed twice")
        if s not in seen:
            errs.append(f"upcoming issued slug {s}: has no item (an issued slug is never deleted; promote it with promoted_to)")
    if len(seen) > UPCOMING_MAX:
        errs.append(f"upcoming: {len(seen)} items, over the {UPCOMING_MAX} profiles.also_performs holds")
    return errs


def lib_module(conditions_toml):
    """lib/registry.mjs: the server's copy of the maps the city pages and the dev server read."""
    ks = keys()
    cond = {k: condition_of(k) for k in ks}
    options = {k: conditions_toml[cond[k]["slug"]].get("options_page") for k in ks}
    cities = [c["slug"] for c in CONDITIONS if c.get("city_pages")]
    data = {
        "ALL": ks,
        "PATIENT": {k: BY_KEY[k]["patient_name"] for k in ks},
        "CONDITION": {k: cond[k]["text"] for k in ks},
        "CONDITION_LABEL": {k: cond[k]["label"] for k in ks},
        "HUB_LABEL": {k: BY_KEY[k]["hub_label"] for k in ks},
        "COLOR": {k: "t-" + cond[k]["color"] for k in ks},
        "PAGE_OF": page_of(),
        "OPTIONS_OF": {k: v for k, v in options.items() if v},
        "COMPARE_LINK": {k: cond[k]["compare_link"] for k in ks if cond[k].get("compare_link")},
        "LONG_NAME": {k: BY_KEY[k]["long_name"] for k in ks if BY_KEY[k].get("long_name")},
        "CITY_SLUGS": cities,
        "PROC_OF_PATH": {c["slug"]: next(k for k in c["procedures"] if k in ks) for c in CONDITIONS
                         if c.get("city_pages") and any(k in ks for k in c["procedures"])},
    }
    return ("// Written by tools/build.py from content/conditions.json and content/procedures.json (tools/registry.py).\n"
            "// Edit those, not this file.\n"
            + "".join(f"export const {n} = {json.dumps(v, ensure_ascii=False)};\n" for n, v in data.items()))


FUNCTION = """// Written by tools/build.py from content/conditions.json (tools/registry.py). Edit that file, not this one.
// Cloudflare Pages Function for /{slug}/doctors/ and everything under it: the hub and the metro city pages,
// rendered on request by lib/cities.mjs (static list plus the live account overlay).
import {{ handleCity }} from "../../../lib/cities.mjs";

export async function onRequest({{ request, env, next, waitUntil }}) {{
  const r = await handleCity(request, {{ ...env, waitUntil }});
  return r || next();
}}
"""


def function_files():
    """functions/<slug>/doctors/[[path]].js for each condition with city pages: one file each, no shared catch-all route
    (plan review item 8)."""
    return {f"functions/{c['slug']}/doctors/[[path]].js": FUNCTION.format(slug=c["slug"]) for c in CONDITIONS if c.get("city_pages")}


def routed():
    """Condition slugs whose /<slug>/doctors addresses site/_routes.json sends to the functions. Every condition with city pages
    must be routed (check()); pelvic and hemorrhoids were not until 2026-11-11."""
    return [c["slug"] for c in CONDITIONS if c.get("routed")]


def check(site=None):
    """Every rule the registry must keep. Returns a list of errors ([] when sound). The build stops on any."""
    errs = []
    issued, words = KEYS["issued"], set(KEYS["reserved"])
    reserved = set(words)   # for keys: the words plus every top-level folder of site/ that is not a procedure's own
    if site and os.path.isdir(site):
        reserved |= {d for d in os.listdir(site) if os.path.isdir(os.path.join(site, d))} - {p["key"] for p in PROCEDURES}
    # 2026-11-11: pelvic and hemorrhoid city pages had functions but were not in site/_routes.json, so Cloudflare
    # served its static 404 for /<slug>/doctors/... (found by job platform-directory-0032). City pages need routing.
    for c in CONDITIONS:
        if c.get("city_pages") and not c.get("routed"):
            errs.append(f"condition {c.get('slug')}: has city pages but is not routed, so its /doctors/ addresses would 404 on Cloudflare")
    seen = set()
    for p in PROCEDURES:
        k = p.get("key", "")
        if k in seen:
            errs.append(f"procedure {k}: listed twice")
        seen.add(k)
        if not KEY.match(k):
            errs.append(f"procedure {k!r}: a key is 2 to 16 lowercase letters or digits, starting with a letter")
        if k in reserved:
            errs.append(f"procedure {k}: a reserved word or a top-level folder of site/, so it cannot be a key")
        if k not in issued:
            errs.append(f"procedure {k}: not in content/procedure-keys.json 'issued'; append it there (keys are permanent)")
        if p.get("stage") not in STAGES:
            errs.append(f"procedure {k}: stage {p.get('stage')!r} is not one of {', '.join(STAGES)}")
        for f in ("abbr", "name", "conditions", "view", "patient_name", "hub_label", "city_blurb", "finder"):
            if f not in p:
                errs.append(f"procedure {k}: no {f!r}")
        if "account_sub" in p and (not isinstance(p["account_sub"], str) or not p["account_sub"].strip() or len(p["account_sub"]) > 120):
            errs.append(f"procedure {k}: account_sub is the account row's grey line: text, 1 to 120 characters")
        unknown = set(p.get("parts", {})) - PARTS
        if unknown:
            errs.append(f"procedure {k}: unknown parts {sorted(unknown)} (known: {sorted(PARTS)})")
        if not p.get("conditions"):
            errs.append(f"procedure {k}: treats no condition (every procedure hangs under a condition page)")
        for s in p.get("conditions", []):
            if s not in BY_SLUG:
                errs.append(f"procedure {k}: condition {s} is not in content/conditions.json")
            elif k not in BY_SLUG[s]["procedures"]:
                errs.append(f"procedure {k}: condition {s} does not list it back")
        parts = p.get("parts", {})
        if parts.get("animation"):
            a = parts["animation"]
            if not (ROOT / "tools" / "diagrams" / f"anim-{k}.svgfrag").exists():
                errs.append(f"procedure {k}: declares an animation but tools/diagrams/anim-{k}.svgfrag is missing")
            if set(a) != {"alt", "route", "route_text", "caps"} or len(a.get("caps", [])) != 3:
                errs.append(f"procedure {k}: animation needs alt, route, route_text and 3 caps")
        if parts.get("banner"):
            js = ROOT / "site" / "assets" / ("life-strip.js" if parts["banner"] == "life" else "proc-banner.js")
            if not js.exists() or not re.search(rf"\b{k}\s*:", js.read_text(encoding="utf-8")):
                errs.append(f"procedure {k}: declares a banner but site/assets/{js.name} has no {k} scene")
        if parts.get("coverage"):
            cov = parts["coverage"]
            pages = tomllib.loads((ROOT / "content" / "insurance" / "pages.toml").read_text(encoding="utf-8"))["pages"]
            if not any(x["key"] == k and cov.get("path") == f'/{x["slug"]}/insurance/' for x in pages):
                errs.append(f"procedure {k}: declares a coverage page {cov.get('path')} that content/insurance/pages.toml does not build")
        if parts.get("payer_table"):
            cells = {}
            for f in sorted((ROOT / "content" / "insurance").glob("coverage-*.toml"))[-1:]:
                cells = tomllib.loads(f.read_text(encoding="utf-8")).get("cells", {})
            if k not in cells:
                errs.append(f"procedure {k}: declares a payer table but the newest content/insurance/coverage-*.toml has no {k} rows")
        if p.get("stage") in WITH_LIST and site and not os.path.exists(os.path.join(site, "data", k + ".json")):
            errs.append(f"procedure {k}: stage {p['stage']} needs its list site/data/{k}.json (run the export first)")
    for i, k in enumerate(issued):
        if issued.index(k) != i:
            errs.append(f"issued key {k}: listed twice")
    metros = json.loads((ROOT / "content" / "metros.json").read_text(encoding="utf-8"))
    city = [p["key"] for p in listed() if p.get("parts", {}).get("city_pages")]
    if metros["procs"] != city:
        errs.append(f"content/metros.json procs {metros['procs']} must equal the procedures declaring city_pages {city}")
    redirects = (ROOT / "content" / "redirects.txt").read_text(encoding="utf-8")
    for k in keys():
        if not BY_KEY[k].get("conditions") or BY_KEY[k]["conditions"][0] not in BY_SLUG:
            continue   # reported above
        to = "/" + BY_KEY[k]["conditions"][0] + "/"
        for src in (f"/{k}", f"/{k}/"):
            if f"\n{src} {to} 301" not in "\n" + redirects:
                errs.append(f"content/redirects.txt: no '{src} {to} 301' line for procedure {k}")
    for c in CONDITIONS:
        s = c.get("slug", "")
        if s in words or s in BY_KEY:
            errs.append(f"condition {s}: a reserved word or a procedure key")
        for f in ("procedures", "card", "label", "text", "color", "pages"):
            if f not in c:
                errs.append(f"condition {s}: no {f!r}")
        for name, rel in c.get("pages", {}).items():
            if not (ROOT / rel).exists():
                errs.append(f"condition {s}: page file {rel} ({name}) is missing")
        simple = ROOT / c.get("pages", {}).get("simple", "-")
        if simple.exists():
            t = tomllib.loads(simple.read_text(encoding="utf-8"))
            if t.get("color") != c.get("color"):
                errs.append(f"condition {s}: color {c.get('color')} differs from its page's color {t.get('color')}")
            lp = [k for k in c.get("procedures", []) if k in BY_KEY and BY_KEY[k]["stage"] in WITH_LIST]
            if lp and t.get("finder") != lp[0]:
                errs.append(f"condition {s}: its page's finder is {t.get('finder')!r}, not its listed procedure {lp[0]}")
        # Stage listed means noindex and out of the sitemap (plan review item 2). The pages carry that as `draft = true`,
        # so a listed procedure's condition pages must keep it until he says public (ai-hq job platform-directory-0035).
        if any(k in BY_KEY and BY_KEY[k]["stage"] == "listed" for k in c.get("procedures", [])):
            for name, rel in c.get("pages", {}).items():
                f = ROOT / rel
                if f.exists() and not tomllib.loads(f.read_text(encoding="utf-8")).get("draft"):
                    errs.append(f"condition {s}: its procedure is at stage listed, so {rel} needs draft = true (noindex) until it is public")
        for k in c.get("procedures", []):
            if k not in BY_KEY:
                errs.append(f"condition {s}: procedure {k} is not in content/procedures.json")
            elif s not in BY_KEY[k]["conditions"]:
                errs.append(f"condition {s}: procedure {k} does not list it back")
        if sum(1 for k in c.get("procedures", []) if k in BY_KEY and BY_KEY[k]["stage"] in WITH_LIST) > 1:
            errs.append(f"condition {s}: more than one listed procedure needs the finder's procedure choice, which is not built yet")
        if c.get("routed") and not c.get("city_pages"):
            errs.append(f"condition {s}: routed without city pages")
    errs += check_upcoming()
    return errs


def require(site=None):
    errs = check(site)
    if errs:
        raise SystemExit("registry: " + "\n  ".join(["content/conditions.json and content/procedures.json fail their checks:"] + errs))
