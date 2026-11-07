#!/usr/bin/env python3
"""The deep "every option" page per condition (first: fibroids). His words, 2026-11-05: the simple and deep pages are
not exact copies, but are "tied together in the numbers and sources and relative phrasings".

content/options/<slug>.toml      the deep page's own text
content/options/<slug>.facts.toml the tie: each number or comparison, its wording on each page, and its references
check() fails the build when either page states a number the ledger does not hold, or a ledger line no longer matches
the simple page's text or citations.

Deep-only numbers (job platform-main-0020, knee: study sizes, follow-up and harm counts for the advanced reader; his
words 2026-11-05: "All of these specific details we can include on the in depth page"): a ledger line with simple = ""
is a deep-only fact, written {d:id}. It must carry refs and `read` (how its source was read: "full text", "abstract" or
"page"); a line read from an abstract prints "(abstract only)". A deep-only fact may cite the deep page's own [[refs]];
a shared fact ({f:id}) cites only the simple page's. A detail with `certainty` must use the simple page's certainty
word for that option, and open its `works` text with it.
"""
import datetime, html, pathlib, re, tomllib
import condition

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "content" / "options"
PH = re.compile(r"\{([fgd]):([a-z0-9-]+)\}")
NUM = re.compile(r"\d|\bout of\b|%|\bpercent\b", re.I)
SIMPLE_FIELDS = ("what", "invasive", "works", "side")
DETAIL_FIELDS = ("intro", "works", "evidence", "risks", "selection", "fit", "unknown")
# The certainty ladder (ai-hq projects/platform/content/evidence-writing-rules.md), used the same way for every option.
LADDER = ("strong evidence shows", "good evidence suggests", "early studies suggest", "early results are encouraging",
          "studies disagree", "not yet well studied")
GLANCE_COLS = (("involves", "What it involves"), ("recovery", "Recovery"), ("uterus", "Keeps uterus?"),
               ("fibroids", "Treats the fibroids?"))
HEADINGS = {"works": "How well does it work?", "evidence": "The studies", "risks": "Side effects and risks",
            "selection": "Who was studied, and who it is for", "fit": "What experts say", "unknown": "What is not known"}


class TieError(ValueError):
    pass


def slugs():
    return sorted(p.stem for p in DIR.glob("*.toml") if not p.stem.endswith(".facts"))


def load(slug, simple=None, deep=None, facts=None):
    read = lambda p: tomllib.loads(p.read_text(encoding="utf-8"))
    return (simple or condition.load(slug), deep or read(DIR / f"{slug}.toml"), facts or read(DIR / f"{slug}.facts.toml"))


def _norm(s):
    return re.sub(r"\s+", " ", condition.MARK.sub("", s)).replace(" ,", ",").replace(" .", ".").strip().lower()


def _as_list(t):
    return t if isinstance(t, list) else [t] if t else []


def _simple_texts(c):
    """(option id or "", text) for every field of the simple page that patients read as a claim."""
    for o in c["options"]:
        for k in SIMPLE_FIELDS:
            yield o["id"], o[k]
    for s in c["sections"]:
        for k in ("text", "list", "after"):
            for t in s.get(k, []):
                yield "", t
        if s.get("see_doctor"):
            yield "", s["see_doctor"]
    for q in c["faq"]:
        yield "", q["a"]
    yield "", c["answer"]
    yield "", c["finder_intro"].replace("**", "")


def _deep_texts(d):
    """(where, text) for every deep-page field that states a claim: option details and the page's own sections."""
    for dt in d["detail"]:
        for k in DETAIL_FIELDS:
            for t in _as_list(dt.get(k, "")):
                yield f'{dt["option"]}.{k}', t
    for sec in d.get("section", []):
        for t in sec["text"]:
            yield f'section {sec["id"]}', t


def _notes(d):
    """The reading note under the lede: method, not claims, so it carries no source, but no number either."""
    return d.get("reading_note", [])


def check(c, d, f):
    facts, errs = {x["id"]: x for x in f["fact"]}, []
    texts = list(_simple_texts(c))
    keys = {r["key"] for r in c["refs"]}
    own = {r["key"] for r in d.get("refs", [])}
    if keys & own:
        errs.append(f"deep page references reuse simple page keys: {sorted(keys & own)}")
    for x in f["fact"]:
        if x["simple"]:
            continue
        if not x.get("refs"):
            errs.append(f'deep-only fact {x["id"]}: no references')
        if set(x.get("refs", [])) - keys - own:
            errs.append(f'deep-only fact {x["id"]}: unknown reference {set(x["refs"]) - keys - own}')
        if x.get("read") not in ("full text", "abstract", "page"):
            errs.append(f'deep-only fact {x["id"]}: `read` must be "full text", "abstract" or "page"')
    for x in f["fact"]:
        if not x["simple"]:
            continue
        want, found = x["simple"].lower(), False
        for opt, t in texts:
            if (not x["option"] or opt == x["option"]) and want in _norm(t):
                found = True
                missing = [r for r in x["refs"] if r not in condition.MARK.findall(t)]
                if missing and not re.search(r"recovery|major", x["id"]):
                    errs.append(f'fact {x["id"]}: the simple text no longer cites {missing}')
        if not found:
            errs.append(f'fact {x["id"]}: simple page no longer says "{x["simple"]}"')
        if set(x["refs"]) - keys:
            errs.append(f'fact {x["id"]}: reference not on the simple page: {set(x["refs"]) - keys}')
    phrases = sorted((x["simple"].lower() for x in f["fact"] if x["simple"]), key=len, reverse=True)
    for opt, t in texts:
        rest = _norm(t)
        for p in phrases:
            rest = rest.replace(p, " ")
        if NUM.search(rest):
            errs.append(f'simple page number with no ledger line ({opt or "page"}): "{rest[:120]}"')
    ids = {o["id"] for o in c["options"]}
    simple_works = {o["id"]: o["works"].lower() for o in c["options"]}
    for dt in d["detail"]:
        if dt["option"] not in ids:
            errs.append(f'deep page option unknown: {dt["option"]}')
        elif "certainty" in dt:
            said = [w for w in LADDER if w in simple_works[dt["option"]]]
            want = dt["certainty"].lower()
            if said and want not in said:
                errs.append(f'{dt["option"]}: certainty "{dt["certainty"]}" is not the simple page\'s {said}')
            if not said and want:
                errs.append(f'{dt["option"]}: certainty "{dt["certainty"]}" but the simple page uses no certainty word')
            if want and not condition.MARK.sub("", PH.sub("", dt.get("works", ""))).lower().startswith(want):
                errs.append(f'{dt["option"]}.works must open with its certainty word "{dt["certainty"]}"')
    for where, t in _deep_texts(d):
        for m in PH.finditer(t):
            x = facts.get(m.group(2))
            if not x:
                errs.append(f'{where}: unknown fact {m.group(2)}')
            elif m.group(1) != "g" and (m.group(1) == "d") != (not x["simple"]):
                errs.append(f'{where}: {m.group(2)} is a {"shared" if x["simple"] else "deep-only"} fact; '
                            f'write it {{{"f" if x["simple"] else "d"}:{m.group(2)}}}')
        bare = condition.MARK.sub("", PH.sub("", t))
        if NUM.search(bare):
            errs.append(f'{where}: number outside the ledger: "{bare[:120]}"')
        if t and not (condition.MARK.search(t) or PH.search(t)):
            errs.append(f'{where}: no source')
        for key in condition.MARK.findall(t):
            if key not in keys | own:
                errs.append(f'{where}: reference {key} is not on the simple page' + (" or this page" if own else ""))
    for t in _notes(d):
        if NUM.search(t):
            errs.append(f'reading note: number outside the ledger: "{t[:120]}"')
    for g in d["glance"]:
        for k, _ in d.get("glance_columns", GLANCE_COLS):
            if NUM.search(PH.sub("", g[k])):
                errs.append(f'glance {g["option"]}.{k}: number outside the ledger')
            for m in PH.finditer(g[k]):
                if m.group(2) not in facts:
                    errs.append(f'glance {g["option"]}: unknown fact {m.group(2)}')
    if {g["option"] for g in d["glance"]} != ids or {x["option"] for x in d["detail"]} != ids:
        errs.append("every option on the simple page must be in the deep page's table and details")
    if errs:
        raise TieError("simple and deep pages are out of tie:\n  " + "\n  ".join(errs))


def _fill(t, facts):
    def one(m):
        x = facts[m.group(2)]
        if m.group(1) == "g":
            return x["deep"].capitalize()
        label = " (abstract only)" if m.group(1) == "d" and x.get("read") == "abstract" else ""
        return x["deep"] + label + "".join(f"[^{r}]" for r in x["refs"])
    return PH.sub(one, t)


def _cap(s):
    """A sentence that begins with a filled-in fact still begins with a capital."""
    return re.sub(r"(^|[.:?!]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), s) if s else s


def render(c, d, f, diagram_fn, finder_href, city_hub="", city_links=""):
    check(c, d, f)
    facts = {x["id"]: x for x in f["fact"]}
    refs, names = condition.Refs(c["refs"] + d.get("refs", [])), {o["id"]: o["name"] for o in c["options"]}
    txt = lambda s: refs.inline(condition.tail(_cap(_fill(s, facts))))
    e = lambda s: html.escape(s, quote=False)
    det = {x["option"]: x for x in d["detail"]}
    gcols = d.get("glance_columns", GLANCE_COLS)
    cols = ("Treatment",) + tuple(label for _, label in gcols)
    heads = {**HEADINGS, **d.get("detail_headings", {})}
    # Roles stay explicit: on a phone the table shows as one card per row (design review 2026-11-06), and some
    # browsers drop table semantics when a table's display changes. data-label names each cell on the card.
    head = "".join(f"<th scope=col role=columnheader>{t}</th>" for t in cols)
    groups = ""
    for k in c["categories"]:
        rows = ""
        for i in k["options"]:
            g = next(x for x in d["glance"] if x["option"] == i)
            cell = lambda n, key: f'<td role=cell data-label="{cols[n]}">{e(PH.sub(lambda m: facts[m.group(2)]["deep"].capitalize(), g[key]))}</td>'
            lead = " lead" if i == c.get("diagram_at") else ""
            rows += (f'<tr class="row{lead}" role=row><th scope=row role=rowheader><a href="#{i}">{e(names[i])}</a></th>'
                     + "".join(cell(n, key) for n, (key, _) in enumerate(gcols, 1)) + '</tr>')
        groups += f'<tbody role=rowgroup><tr class=grp role=row><th colspan={len(cols)} scope=rowgroup role=rowheader>{e(k["name"])}</th></tr>{rows}</tbody>'
    table = (f'<div class="table-scroll" tabindex="0" role="region" aria-label="{e(d["glance_heading"])}"><table class="glance" role=table>'
             f'<thead role=rowgroup><tr role=row>{head}</tr></thead>{groups}</table></div>')

    def block(key, val):
        if isinstance(val, list):
            return f'<h4>{e(heads[key])}</h4><ul class="evidence">' + "".join(f"<li>{txt(v)}</li>" for v in val) + "</ul>"
        return f'<h4>{e(heads[key])}</h4><p>{txt(val)}</p>'

    box = condition.what_box(refs, c)   # before the sections, so its sources number first, in reading order
    sections, extra = "", {}
    for sec in d.get("section", []):
        extra.setdefault(sec.get("after", "end"), []).append(sec)
    show = lambda sec: f'<section id="{sec["id"]}" class="deep-extra"><h2>{e(sec["heading"])}</h2>' + "".join(f"<p>{txt(t)}</p>" for t in sec["text"]) + "</section>"
    for k in c["categories"]:
        items = ""
        for i in k["options"]:
            x = det[i]
            lead = i == c.get("diagram_at")
            rows = "".join(block(key, x[key]) for key in DETAIL_FIELDS[1:] if x.get(key))
            pic = diagram_fn(c["diagram"], vary=False) if x.get("diagram") else ""
            cta = f'<p class="cta"><a class="btn" href="{finder_href}">{e(c["finder_button"])}</a></p>' if lead else ""
            items += f'<article class="deep-option{" lead-option" if lead else ""}" id="{i}"><h3>{e(names[i])}</h3><p>{txt(x["intro"])}</p>{pic}{rows}{cta}</article>'
        # headings phrased as the comparisons this page targets (docs/condition-pattern.md); the simple page keeps k["name"]
        h2 = d.get("compare_headings", {}).get(k["id"], k["name"])
        sections += f'<section id="{k["id"]}"><h2>{e(h2)}</h2><p>{txt(k["summary"])}</p>{items}</section>'
        sections += "".join(show(sec) for sec in extra.get(k["id"], []))
    sections += "".join(show(sec) for sec in extra.get("end", []))
    top = "".join(show(sec) for sec in extra.get("top", []))
    when = datetime.date.fromisoformat(d["reviewed"])
    body = (f'<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/{c["slug"]}/">{e(c.get("nav_name", c["condition_name"]))}</a></li>'
            f'<li><span aria-current="page">Every option</span></li></ol></nav><h1>{e(d["h1"])}</h1><p class="lede">{e(d["lede"])}</p>'
            + "".join(f'<p class="reading-note small">{e(t)}</p>' for t in _notes(d)) + f'<p class="see-every see-simple"><a href="/{c["slug"]}/">{e(d["simple_link"])}</a></p>'
            f'<p class="cta"><a class="btn" href="{finder_href}">{e(c["finder_button"])}</a></p>{box}{top}'
            f'<h2 id="glance">{e(d["glance_heading"])}</h2><p class="small muted">{e(d["glance_note"])}</p>{table}{sections}'
            f'{find_block(c, d, finder_href, city_hub, city_links)}<p class="urgent-line">{e(c["urgent"])}</p>')
    # The references fold uses the simple page's fold styling (design review 2026-11-06: it showed a bare browser arrow).
    body += f'<div class="condition deep-refs">{condition.references(refs)}</div>'
    body += f'<p class="small muted">{e(c["not_advice"])} Page last reviewed {when.strftime("%B")} {when.day}, {when.year}.</p>'
    return body


def find_block(c, d, finder_href, city_hub, city_links=""):
    """The page's last stop: a ZIP box that opens the simple page's finder, and the city list (pattern: every-option page
    ends with find-a-doctor). A plain GET form, so it works without this page loading the finder script."""
    if not c.get("finder"):
        return ""
    e = lambda s: html.escape(s, quote=True)
    action = finder_href.split("#")[0]
    city = f'<p class="small"><a href="{e(city_hub)}">{e(d["city_link"])}</a></p>' if city_hub else ""
    return (f'<section class="find-end" id="find" aria-labelledby="find-h"><h2 id="find-h">{e(d["find_heading"])}</h2>'
            f'<form class="zip" method="get" action="{e(action)}#finder" role="search" aria-label="Find doctors by ZIP code">'
            '<div class="f"><label for="end-zip">Your ZIP code</label>'
            '<input id="end-zip" name="zip" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{5}" maxlength="5" placeholder="e.g. 60611" required></div>'
            f'<button type="submit">Find doctors</button></form>{city_links}{city}</section>')


def schema(c, d, origin, publisher):
    """MedicalWebPage and BreadcrumbList from the text the page shows (pattern: docs/condition-pattern.md; no FAQ markup)."""
    url = origin + d["path"]
    page = {"@context": "https://schema.org", "@type": "MedicalWebPage", "name": d["h1"], "headline": d["h1"],
            "description": d["description"], "url": url, "inLanguage": "en-US", "lastReviewed": d["reviewed"],
            "audience": {"@type": "Patient"},
            "about": {"@type": "MedicalCondition", "name": c["condition_name"],
                      **({"alternateName": c["condition_alt"]} if c.get("condition_alt") else {}),
                      "possibleTreatment": [{"@type": "MedicalTherapy", "name": o["name"]} for o in c["options"]]},
            "publisher": {"@type": "Organization", "name": publisher, "url": origin + "/"}}
    crumbs = [("Home", "/"), (c.get("nav_name", c["condition_name"]), f'/{c["slug"]}/'), ("Every option", d["path"])]
    bc = {"@context": "https://schema.org", "@type": "BreadcrumbList",
          "itemListElement": [{"@type": "ListItem", "position": i, "name": n, "item": origin + u} for i, (n, u) in enumerate(crumbs, 1)]}
    return condition.ld(page) + "\n" + condition.ld(bc)
