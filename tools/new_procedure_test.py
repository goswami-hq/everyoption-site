#!/usr/bin/env python3
"""The fake-procedure guard test (ai-hq job platform-directory-0035, procedure registry job 4 of 4; his words 2026-11-11:
"let's come up with a way that we can add new procedures later on without any issues").

It copies this repo to a scratch folder, adds a fake procedure `zzq` there (a registry entry with no optional parts, a
fake condition with one short page file and, from stage listed, a 3-row site/data/zzq.json with its fingerprint written
through the ai-hq exporter's own fingerprint function), builds the scratch copy at stages page, listed and public, and
checks every surface by the behavior ai-hq projects/platform/directory/add-a-procedure-plan-2026-11-11.md (review item 2)
gives it. Nothing outside the scratch folder is written; the real registry, issued keys and site/ are never touched.

  python3 tools/new_procedure_test.py                  # exit 0 when every surface behaves; FAIL lines name the surface
  python3 tools/new_procedure_test.py --plant dropdown # plant one fault in the scratch copy (dropdown, tag, 404)
  python3 tools/new_procedure_test.py --red            # plant each fault in turn; passes only if each run fails naming it
  --ai-hq <path>   the ai-hq checkout whose scripts/every_option_export.py writes the fingerprint (default $AI_HQ, ~/ai-hq)
  --keep <dir>     build in <dir> (must not exist) and leave it, to look at the pages
Standard library plus node (profiles are rendered by lib/directory.mjs, as on Cloudflare).
"""
import argparse, importlib.util, json, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY, SLUG, NAME = "zzq", "zzq-ache", "Zzq ache"
MIGRATION = "supabase/migrations/2099-01-01-procedures-zzq.sql"

PROC = {
    "key": KEY, "abbr": "ZQE", "name": "Zzq test embolization", "conditions": [SLUG], "stage": "page", "view": KEY,
    "patient_name": "zzq embolization", "hub_label": "Zzq embolization doctors",
    "city_blurb": "Zzq test embolization (ZQE) is a fake procedure that exists only in this test.",
    "finder": {"title": "Find a doctor for zzq test embolization (ZQE)",
               "about": ["Zzq test embolization is a fake procedure for the guard test."], "sources": []},
}   # no "parts": no animation, banner, coverage page, payer table or city pages
COND = {
    "slug": SLUG, "procedures": [KEY],
    "card": {"name": NAME, "line": "Zzq test embolization (ZQE)", "color": "hem"},
    "label": NAME, "text": "zzq ache", "color": "hem",
    "pages": {"simple": f"content/conditions/{SLUG}.toml"},
}   # color: an existing one (src-assets/site.css); no every-option page, no city pages, not routed
PAGE = '''slug = "zzq-ache"
color = "hem"
nav_name = "Zzq ache"
reviewed = "2026-11-11"
{draft}condition_name = "Zzq ache"
author_name = ""
targets = ["zzq ache treatment", "zzq ache"]
title = "Zzq Ache Treatment Options | Every Option"
description = "Zzq ache is a fake condition used by the guard test. Its treatment options: how invasive each is, how well it works, and side effects."
h1 = "Zzq ache: every option"
hero_intro = "Zzq ache is a fake condition. This page exists only in the guard test's scratch copy."
diagram_at = "embolization"
{finder}answer = "Zzq ache is fake.[^zzq] Embolization is one option."
urgent = "If you feel very sick, call 911."
options_heading = "Your other zzq ache options"
faq_heading = "Common questions"
learn_heading = "Learn more"

[[sections]]
id = "what"
place = "box"
heading = "What is zzq ache?"
text = ["Zzq ache is a fake condition.[^zzq]"]
symptoms = ["A fake ache", "A fake twinge"]
see_doctor = "See a doctor if it is real."

[[categories]]
id = "less-invasive"
name = "Less invasive treatments"
highlight = "embolization"
summary = "Done through a tiny skin nick."
options = ["embolization"]

[[options]]
id = "embolization"
name = "Zzq test procedure"
what = "A fake procedure."
invasive = "A tiny skin nick."
works = "It is fake."
side = "No side effects; it is fake."

[[refs]]
key = "zzq"
cite = "The guard test, 2026-11-11."
'''
FINDER = '''finder = "zzq"
finder_button = "Find a doctor for zzq embolization"
finder_heading = "Find a doctor for zzq embolization"
finder_intro = "Zzq embolization is done through a tiny skin nick."
finder_how = "#embolization"
'''
PEOPLE = [   # 3 fake doctors, listed only for zzq; NPIs no real record has (the 1999... range planted in jobs 0033 and 0034)
    {"npi": "1999999911", "name": "Zzqa Testdoctor", "badge": "verified", "practice": "Zzq Clinic", "city": "Chicago", "state": "IL",
     "city_label": "", "phone": "312-555-0101", "url": "https://example.com/zzqa", "lat": 41.8781, "lon": -87.6298, "confirmed": False},
    {"npi": "1999999922", "name": "Zzqb Testdoctor", "badge": "verified", "practice": "Zzq Clinic", "city": "Evanston", "state": "IL",
     "city_label": "", "phone": "847-555-0102", "url": "https://example.com/zzqb", "lat": 42.0451, "lon": -87.6877, "confirmed": False},
    {"npi": "1999999933", "name": "Zzqc Testdoctor", "badge": "verified", "practice": "Zzq Vein Center", "city": "Houston", "state": "TX",
     "city_label": "", "phone": "713-555-0103", "url": "https://example.com/zzqc", "lat": 29.7604, "lon": -95.3698, "confirmed": False},
]
# The three planted faults (--plant): each edits one line of the scratch copy's code, the way a hand-kept list would go wrong.
PLANTS = {
    "dropdown": ("tools/build.py",   # the home ZIP dropdown skips procedures at stage listed
                 """for c, p, _ in registry.condition_rows() if p)\n    hero""",
                 """for c, p, _ in registry.condition_rows() if p and p["stage"] != "listed")\n    hero"""),
    "tag": ("lib/directory.mjs",     # profiles drop the tag of a procedure at stage listed
            "const listed = PROCS.filter((k) => p.procs[k]),",
            "const listed = PROCS.filter((k) => p.procs[k] && !DRAFT_PROCS.includes(k)),"),
    "404": ("tools/build.py",        # the 404 page's "Find a doctor for" list fixed to today's five conditions
            """        for c, p, _ in registry.condition_rows() if p) + "</ul>\"""",
            """        for c in [registry.BY_SLUG[s] for s in ("fibroids", "enlarged-prostate", "knee-arthritis", "chronic-pelvic-pain", "hemorrhoids")]) + "</ul>\""""),
}
SURFACE_OF_PLANT = {"dropdown": "dropdown", "tag": "profile tag", "404": "404 list"}

RENDER = r"""
import { handleDoctor, resetDirectory } from "../lib/directory.mjs";
import { readFileSync } from "node:fs";
const SITE = new URL("../site/", import.meta.url);
const ASSETS = { async fetch(req) {
  try { return new Response(readFileSync(new URL("." + new URL(req.url).pathname, SITE)), { status: 200 }); }
  catch (_) { return new Response("", { status: 404 }); } } };
const out = {};
for (const path of process.argv.slice(2)) {
  resetDirectory();
  const r = await handleDoctor(new Request(`http://localhost${path}`), { backend: null, noCache: true, ASSETS });
  out[path] = { status: r.status, html: await r.text() };
}
const P = await import("../lib/procedures.mjs");
out["#procedures"] = { PROCS: P.PROCS, DRAFT_PROCS: P.DRAFT_PROCS, STAGE: P.STAGE };
process.stdout.write(JSON.stringify(out));
"""


class Guard:
    def __init__(self, scratch, ai_hq):
        self.s, self.ai_hq, self.fails, self.passes = scratch, ai_hq, [], 0

    # ---- scratch edits
    def path(self, rel):
        return os.path.join(self.s, rel)

    def read(self, rel):
        with open(self.path(rel), encoding="utf-8") as fh:
            return fh.read()

    def write(self, rel, text):
        os.makedirs(os.path.dirname(self.path(rel)), exist_ok=True)
        with open(self.path(rel), "w", encoding="utf-8") as fh:
            fh.write(text)

    def json_edit(self, rel, fn):
        d = json.loads(self.read(rel))
        fn(d)
        self.write(rel, json.dumps(d, indent=2, ensure_ascii=False) + "\n")

    def plant(self, name):
        rel, old, new = PLANTS[name]
        t = self.read(rel)
        if t.count(old) != 1:
            raise SystemExit(f"plant {name}: the line to change was not found once in {rel}; update PLANTS")
        self.write(rel, t.replace(old, new))
        print(f"planted fault {name!r} in scratch {rel}")

    def add_registry(self):
        self.json_edit("content/procedure-keys.json", lambda d: d["issued"].append(KEY))   # scratch only
        self.json_edit("content/procedures.json", lambda d: d.append(dict(PROC)))
        self.json_edit("content/conditions.json", lambda d: d.append(dict(COND)))
        self.page(finder=False, draft=True)

    def stage(self, st):
        def f(d):
            next(p for p in d if p["key"] == KEY)["stage"] = st
        self.json_edit("content/procedures.json", f)

    def page(self, finder, draft):
        self.write(f"content/conditions/{SLUG}.toml", PAGE.format(
            finder=FINDER if finder else "", draft='draft = true\n' if draft else ""))

    def add_list(self):
        """site/data/zzq.json and its fingerprint, through the exporter's own fingerprint function."""
        d = {"procedure": KEY, "name": PROC["name"], "counts": {"likely": len(PEOPLE), "confirmed": 0}, "unplaced": 0,
             "held": 0, "people": PEOPLE}
        self.write(f"site/data/{KEY}.json", json.dumps(d, ensure_ascii=False, separators=(",", ":")))
        spec = importlib.util.spec_from_file_location("eo_export", os.path.join(self.ai_hq, "scripts", "every_option_export.py"))
        ex = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ex)
        roster = json.loads(self.read("site/data/ir-roster.json"))
        fp = ex.fingerprint({KEY: d}, roster)["procedures"][KEY]
        sys.path.insert(0, self.path("tools"))
        import listings_check
        sys.path.pop(0)
        self.check("fingerprint", fp == listings_check.one(d), "the exporter's fingerprint differs from the site check's")
        self.json_edit("site/data/listings-fingerprint.json", lambda f: f["procedures"].__setitem__(KEY, fp))
        t = self.read("content/redirects.txt")
        self.write("content/redirects.txt", t.replace("/hae/ /hemorrhoids/ 301\n", f"/hae/ /hemorrhoids/ 301\n/{KEY} /{SLUG}/ 301\n/{KEY}/ /{SLUG}/ 301\n"))

    # ---- build and look
    def build(self, want_ok=True, tag=""):
        r = subprocess.run([sys.executable, "tools/build.py"], cwd=self.s, capture_output=True, text=True)
        out = (r.stdout + r.stderr).strip()
        if want_ok:
            self.check(f"{tag} clean build", r.returncode == 0 and "Traceback" not in out,
                       f"build exit {r.returncode}: {out[-600:]}")
        return r.returncode, out

    def check(self, surface, ok, why):
        if ok:
            self.passes += 1
        else:
            self.fails.append(f"FAIL {surface}: {why}")
            print(f"FAIL {surface}: {why}")

    def site(self, rel):
        try:
            return self.read("site/" + rel)
        except FileNotFoundError:
            return ""

    def sitemaps(self):
        return "\n".join(self.site(f) for f in os.listdir(self.path("site")) if re.match(r"^sitemap.*\.xml$", f))

    def render(self, paths):
        self.write("tools/_zzq_render.mjs", RENDER)
        r = subprocess.run(["node", "tools/_zzq_render.mjs", *paths], cwd=self.s, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit("node render failed: " + r.stderr[-800:])
        return json.loads(r.stdout)

    def procs_js(self):
        m = re.search(r"window\.EO_PROCS = (\{.*\});", self.site("assets/procedures.js"))
        return json.loads(m.group(1))

    def broken(self, st, text, where):
        """No empty or broken part where zzq shows."""
        vis = re.sub(r"<script.*?</script>", "", text, flags=re.S)
        for bad, what in ((r"\bNone\b", "Python None"), (r"\bundefined\b", "undefined"), (r"\bnull\b", "null"),
                          (r"\(\s*\)", "empty brackets"), (r'href=""', "empty link"), (r"<li>\s*</li>", "empty list item"),
                          (r"<ul[^>]*>\s*</ul>", "empty list"), (r"%%[A-Z_]+%%", "unfilled placeholder"), (r"\{[a-z_]+\}", "unfilled field")):
            if re.search(bad, vis):
                self.check(f"{st} clean build", False, f"{where}: {what} ({re.search(bad, vis).group(0)!r})")
                return
        self.passes += 1

    def surfaces(self, st):
        home, nf = self.site("index.html"), self.site("404.html")
        cond = self.site(f"{SLUG}/index.html")
        card = re.search(rf'<li class="t-hem"><a href="/{SLUG}/"[^>]*><strong>{NAME}</strong>.*?<span class="count">([^<]*)</span>', home)
        opts = re.findall(r'<option value="([^"]+)">', home)
        found, read_about = (nf.split("<p>Read about:</p>") + [""])[:2]
        ejs = self.procs_js()
        dirjs = re.search(r"var PROCS = (\[[^\]]*\])", self.site("assets/directory.js"))
        dirjs = json.loads(dirjs.group(1)) if dirjs else []
        people = json.loads(self.site("data/directory.json"))["people"]
        fake = [p for p in people if p["p"].endswith(tuple(f"-{x['npi']}/" for x in PEOPLE))]
        bare = next(p for p in people if not p.get("l"))
        smaps = self.sitemaps()
        rendered = self.render([p["p"] for p in fake] + [bare["p"]])
        lib = rendered["#procedures"]
        ask = re.search(r"Call and ask about:</p><ul class=\"dir-procs\">(.*?)</ul>", rendered[bare["p"]]["html"])
        ask = ask.group(1) if ask else ""
        any_public = any(v == "public" for k, v in lib["STAGE"].items() if k != KEY)
        self.check(f"{st} condition page", bool(cond) and f"<h1>{NAME}: every option</h1>" in cond, f"/{SLUG}/ was not built")
        self.broken(st, cond, f"/{SLUG}/")
        self.broken(st, home[home.find("fork-list"):home.find("more-soon")], "home cards")
        # the 404 page: zzq's own entry only. Its "Read about:" list is empty whenever no procedure is at stage page, on the
        # committed site too (found by this test, 2026-11-11; a page change, so left for his list).
        self.broken(st, "".join(re.findall(rf'<li><a href="/{SLUG}/">.*?</li>', nf)), "404 entry")   # a missing entry: "404 list"
        self.check(f"{st} no optional parts", not any(x in cond for x in ("data-replay", "proc-banner-", f"/{SLUG}/insurance/", f"/{SLUG}/doctors/"))
                   and not os.path.exists(self.path(f"functions/{SLUG}")) and KEY not in json.loads(self.read("content/metros.json"))["procs"],
                   "an undeclared part (animation, banner, coverage page or city pages) appeared")
        if st == "page":
            self.check("page home card", card is not None and card.group(1) == "Doctor list coming", f"home card count {card and card.group(1)!r}, want 'Doctor list coming'")
            self.check("page dropdown", f"/{SLUG}/" not in opts, "the ZIP dropdown offers a page-stage condition")
            self.check("page finder", f'data-procedure="{KEY}"' not in cond, "a finder on a page-stage condition")
            self.check("page profile tag", not fake, "profiles listed for a procedure with no list")
            self.check("page account Add", KEY not in ejs["keys"] and KEY not in ejs["short"] and KEY not in lib["PROCS"], "doctors could add a page-stage procedure")
            self.check("page directory filter", KEY not in dirjs, "the directory filter offers a page-stage procedure")
            self.check("page 404 list", f'href="/{SLUG}/"' in read_about and f'href="/{SLUG}/"' not in found,
                       "404: want it under 'Read about' (doctor list coming), not under 'Find a doctor for'")
            self.check("page no data file", not os.path.exists(self.path(f"site/data/{KEY}.json")) and not os.path.exists(self.path(f"site/{KEY}")),
                       "a page-stage procedure got a list or a /zzq/ page")
            self.check("page call and ask", KEY not in ask and "Zzq" not in ask, "'Call and ask about' offers a page-stage procedure")
            return
        n = len(PEOPLE)
        self.check(f"{st} home card", card is not None and card.group(1) == f"{n} doctors listed", f"home card count {card and card.group(1)!r}, want '{n} doctors listed'")
        self.check(f"{st} dropdown", f"/{SLUG}/" in opts, "the home ZIP dropdown has no entry for it")
        self.check(f"{st} finder", f'<div id="finder" data-procedure="{KEY}"' in cond, f"no finder on /{SLUG}/")
        self.check(f"{st} profile tag", len(fake) == n and all(p.get("l") == KEY for p in fake)
                   and all(re.search(rf'<a href="/{SLUG}/">Zzq test embolization \(ZQE\)</a>', rendered[p["p"]]["html"]) for p in fake),
                   f"want {n} profiles, each tagged with a link to /{SLUG}/")
        self.check(f"{st} directory filter", KEY in dirjs, "assets/directory.js PROCS lacks it")
        self.check(f"{st} account Add/Remove", KEY in ejs["keys"] and ejs["short"].get(KEY) == "ZQE" and KEY in lib["PROCS"],
                   "assets/procedures.js or lib/procedures.mjs lacks it, so doctors cannot add or remove it")
        self.check(f"{st} 404 list", f'href="/{SLUG}/"' in found and f'href="/{SLUG}/"' not in read_about,
                   "404: want it under 'Find a doctor for', not 'Read about'")
        self.check(f"{st} redirects", f"/{KEY} /{SLUG}/ 301" in self.site("_redirects") and f"/{SLUG}/" in self.site(f"{KEY}/index.html"),
                   f"/{KEY} does not lead to /{SLUG}/")
        for p in fake:
            self.broken(st, rendered[p["p"]]["html"], p["p"])
        idx = lambda h: '<meta name="robots" content="noindex">' not in h
        if st == "listed":
            self.check("listed noindex", not idx(cond) and all(not idx(rendered[p["p"]]["html"]) for p in fake),
                       "a listed-stage condition page or zzq-only profile is indexable")
            self.check("listed sitemap", f"/{SLUG}/" not in smaps and not any(p["p"] in smaps for p in fake), "a listed-stage page is in the sitemap")
            self.check("listed call and ask", (KEY not in ask and "Zzq" not in ask) if any_public else "Zzq" in ask,
                       "'Call and ask about' offers a listed procedure while another is public")
            self.check("listed stage", KEY in lib["DRAFT_PROCS"], "lib/procedures.mjs does not mark it listed (draft)")
        else:
            self.check("public indexable", idx(cond) and all(idx(rendered[p["p"]]["html"]) for p in fake), "the condition page or a profile is still noindex")
            self.check("public sitemap", f"/{SLUG}/" in smaps and all(p["p"] in smaps for p in fake), "the condition page or a profile is not in the sitemap")
            self.check("public call and ask", "Zzq test embolization (ZQE)" in ask, "'Call and ask about' does not offer it")
            self.check("public stage", KEY not in lib["DRAFT_PROCS"] and lib["STAGE"].get(KEY) == "public", "still marked listed")

    def run(self, plant=None):
        if plant:
            self.plant(plant)
        self.add_registry()
        # Job platform-directory-0036: a "not on the site yet" slug may never equal an issued key; the build refuses it.
        saved = self.read("content/upcoming-procedures.json")
        def plant_slug(d):
            d["groups"][0]["items"].append({"slug": KEY, "name": "Zzq as an upcoming item", "for": "zzq ache"})
            d["issued"].append(KEY)
        self.json_edit("content/upcoming-procedures.json", plant_slug)
        rc, out = self.build(want_ok=False)
        self.check("upcoming slug", rc != 0 and f"upcoming {KEY}: equals an issued procedure key" in out,
                   f"the build allowed an upcoming slug equal to the key {KEY} (exit {rc})")
        self.write("content/upcoming-procedures.json", saved)
        # Database row: an issued key with no migration stops the build, naming it; the generator writes its migration.
        rc, out = self.build(want_ok=False)
        self.check("database row", rc != 0 and KEY in out and "procedures_sql.py --new" in out,
                   f"the build did not stop on an issued key with no migration (exit {rc})")
        r = subprocess.run([sys.executable, "tools/procedures_sql.py", "--new", MIGRATION], cwd=self.s, capture_output=True, text=True)
        mig = self.read(MIGRATION) if os.path.exists(self.path(MIGRATION)) else ""
        self.check("database row", r.returncode == 0 and f"('{KEY}')" in mig and not re.search(r"\('(ufe|pae|gae|pelvic|hae)'\)", mig),
                   f"procedures_sql.py --new did not write a zzq-only migration: {r.stdout}{r.stderr}")
        print(f"page: migration {MIGRATION} written in scratch (not applied):\n  " + "\n  ".join(l for l in mig.splitlines() if "zzq" in l))
        self.build(tag="page")
        self.check("database row", f"('{KEY}')" in self.read("supabase/schema.sql"), "schema.sql's seed lacks zzq")
        self.surfaces("page")
        # listed: the export (here the fake list and its fingerprint), the /zzq 301s, the page's finder, still a draft page
        self.add_list()
        self.stage("listed")
        self.page(finder=True, draft=False)   # a listed procedure's page without its draft line would be indexable
        rc, out = self.build(want_ok=False)
        self.check("listed noindex", rc != 0 and "needs draft = true" in out, f"the build allowed a listed procedure's page without draft (exit {rc})")
        self.page(finder=True, draft=True)
        self.build(tag="listed")
        self.surfaces("listed")
        # public, on his word: the stage, and the page's draft line deleted
        self.stage("public")
        self.page(finder=True, draft=False)
        self.build(tag="public")
        self.surfaces("public")
        print(f"{self.passes} passed, {len(self.fails)} failed")
        return 1 if self.fails else 0


def scratch_copy(dest):
    shutil.copytree(ROOT, dest, ignore=shutil.ignore_patterns(".git", "__pycache__", "node_modules", ".wrangler"))
    return dest


def one(ai_hq, plant=None, keep=None):
    if keep:
        return Guard(scratch_copy(keep), ai_hq).run(plant)
    with tempfile.TemporaryDirectory(prefix="zzq-guard-") as tmp:
        return Guard(scratch_copy(os.path.join(tmp, "site")), ai_hq).run(plant)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--plant", choices=sorted(PLANTS))
    ap.add_argument("--red", action="store_true")
    ap.add_argument("--ai-hq", default=os.environ.get("AI_HQ", os.path.expanduser("~/ai-hq")))
    ap.add_argument("--keep")
    a = ap.parse_args(argv)
    if not os.path.exists(os.path.join(a.ai_hq, "scripts", "every_option_export.py")):
        print(f"needs the ai-hq checkout for the exporter's fingerprint function: --ai-hq (tried {a.ai_hq})", file=sys.stderr)
        return 2
    if not a.red:
        return one(a.ai_hq, a.plant, a.keep)
    bad = []
    for name in sorted(PLANTS):
        print(f"\n=== red: plant {name!r}, expect FAIL naming {SURFACE_OF_PLANT[name]!r}")
        import contextlib, io
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = one(a.ai_hq, name)
        out = buf.getvalue()
        print("\n".join(l for l in out.splitlines() if l.startswith(("FAIL", "planted")) or "passed," in l))
        named = any(re.match(rf"FAIL \w+ {re.escape(SURFACE_OF_PLANT[name])}:", l) for l in out.splitlines())
        if rc == 0 or not named:
            bad.append(name)
    print("\nred:", "every planted fault failed naming its surface" if not bad else f"NOT caught: {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
