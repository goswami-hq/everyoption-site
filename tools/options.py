#!/usr/bin/env python3
"""The deep "every option" page per condition (first: fibroids). His words, 2026-11-05: the simple and deep pages are
not exact copies, but are "tied together in the numbers and sources and relative phrasings".

content/options/<slug>.toml      the deep page's own text
content/options/<slug>.facts.toml the tie: each number or comparison, its wording on each page, and its references
check() fails the build when either page states a number the ledger does not hold, or a ledger line no longer matches
the simple page's text or citations. The deep page takes references only from the simple page's list.
"""
import html, pathlib, re, tomllib
import condition

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "content" / "options"
PH = re.compile(r"\{([fg]):([a-z0-9-]+)\}")
NUM = re.compile(r"\d|\bout of\b|%|\bpercent\b", re.I)
SIMPLE_FIELDS = ("what", "invasive", "works", "side")


class TieError(ValueError):
    pass


def slugs():
    return sorted(p.stem for p in DIR.glob("*.toml") if not p.stem.endswith(".facts"))


def load(slug, simple=None, deep=None, facts=None):
    read = lambda p: tomllib.loads(p.read_text(encoding="utf-8"))
    return (simple or condition.load(slug), deep or read(DIR / f"{slug}.toml"), facts or read(DIR / f"{slug}.facts.toml"))


def _norm(s):
    return re.sub(r"\s+", " ", condition.MARK.sub("", s)).replace(" ,", ",").replace(" .", ".").strip().lower()


def _simple_texts(c):
    """(option id or "", text) for every field of the simple page that patients read as a claim."""
    for o in c["options"]:
        for k in SIMPLE_FIELDS:
            yield o["id"], o[k]
    for s in c["sections"]:
        for k in ("text", "list", "after"):
            for t in s.get(k, []):
                yield "", t
    for q in c["faq"]:
        yield "", q["a"]
    yield "", c["answer"]
    yield "", c["finder_intro"].replace("**", "")


def check(c, d, f):
    facts, errs = {x["id"]: x for x in f["fact"]}, []
    texts = list(_simple_texts(c))
    keys = {r["key"] for r in c["refs"]}
    for x in f["fact"]:
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
    phrases = sorted((x["simple"].lower() for x in f["fact"]), key=len, reverse=True)
    for opt, t in texts:
        rest = _norm(t)
        for p in phrases:
            rest = rest.replace(p, " ")
        if NUM.search(rest):
            errs.append(f'simple page number with no ledger line ({opt or "page"}): "{rest[:120]}"')
    ids = {o["id"] for o in c["options"]}
    for dt in d["detail"]:
        if dt["option"] not in ids:
            errs.append(f'deep page option unknown: {dt["option"]}')
        for k in ("intro", "works", "risks", "fit"):
            t = dt.get(k, "")
            for m in PH.finditer(t):
                if m.group(2) not in facts:
                    errs.append(f'{dt["option"]}.{k}: unknown fact {m.group(2)}')
            bare = condition.MARK.sub("", PH.sub("", t))
            if NUM.search(bare):
                errs.append(f'{dt["option"]}.{k}: number outside the ledger: "{bare[:120]}"')
            if t and not (condition.MARK.search(t) or PH.search(t)):
                errs.append(f'{dt["option"]}.{k}: no source')
            for key in condition.MARK.findall(t):
                if key not in keys:
                    errs.append(f'{dt["option"]}.{k}: reference {key} is not on the simple page')
    for g in d["glance"]:
        for k in ("involves", "recovery", "uterus", "fibroids"):
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
        return x["deep"] + "".join(f"[^{r}]" for r in x["refs"]) if m.group(1) == "f" else x["deep"].capitalize()
    return PH.sub(one, t)


def _cap(s):
    """A sentence that begins with a filled-in fact still begins with a capital."""
    return re.sub(r"(^|[.:?!]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), s) if s else s


def render(c, d, f, diagram_fn, finder_href):
    check(c, d, f)
    facts = {x["id"]: x for x in f["fact"]}
    refs, names = condition.Refs(c["refs"]), {o["id"]: o["name"] for o in c["options"]}
    txt = lambda s: refs.inline(condition.tail(_cap(_fill(s, facts))))
    e = lambda s: html.escape(s, quote=False)
    det = {x["option"]: x for x in d["detail"]}
    cols = ("Treatment", "What it involves", "Recovery", "Keeps uterus?", "Treats the fibroids?")
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
                     f'{cell(1, "involves")}{cell(2, "recovery")}{cell(3, "uterus")}{cell(4, "fibroids")}</tr>')
        groups += f'<tbody role=rowgroup><tr class=grp role=row><th colspan=5 scope=rowgroup role=rowheader>{e(k["name"])}</th></tr>{rows}</tbody>'
    table = (f'<div class="table-scroll" tabindex="0" role="region" aria-label="{e(d["glance_heading"])}"><table class="glance" role=table>'
             f'<thead role=rowgroup><tr role=row>{head}</tr></thead>{groups}</table></div>')
    sections = ""
    for k in c["categories"]:
        items = ""
        for i in k["options"]:
            x = det[i]
            lead = i == c.get("diagram_at")
            rows = f'<h4>How well does it work?</h4><p>{txt(x["works"])}</p><h4>Side effects and risks</h4><p>{txt(x["risks"])}</p>'
            if x.get("fit"):
                rows += f'<h4>What experts say</h4><p>{txt(x["fit"])}</p>'
            pic = diagram_fn(c["diagram"], vary=False) if x.get("diagram") else ""
            cta = f'<p class="cta"><a class="btn" href="{finder_href}">{e(c["finder_button"])}</a></p>' if lead else ""
            items += f'<article class="deep-option{" lead-option" if lead else ""}" id="{i}"><h3>{e(names[i])}</h3><p>{txt(x["intro"])}</p>{pic}{rows}{cta}</article>'
        sections += f'<section id="{k["id"]}"><h2>{e(k["name"])}</h2><p>{txt(k["summary"])}</p>{items}</section>'
    import datetime
    when = datetime.date.fromisoformat(d["reviewed"])
    body = (f'<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/{c["slug"]}/">{e(c.get("nav_name", c["condition_name"]))}</a></li>'
            f'<li><span aria-current="page">Every option</span></li></ol></nav><h1>{e(d["h1"])}</h1><p class="lede">{e(d["lede"])}</p>'
            f'<p class="cta"><a class="btn" href="{finder_href}">{e(c["finder_button"])}</a></p>'
            f'<h2 id="glance">{e(d["glance_heading"])}</h2><p class="small muted">{e(d["glance_note"])}</p>{table}{sections}'
            f'<p class="urgent-line">{e(c["urgent"])}</p>')
    # The references fold uses the simple page's fold styling (design review 2026-11-06: it showed a bare browser arrow).
    body += f'<div class="condition deep-refs">{condition.references(refs)}</div>'
    body += f'<p class="small muted">{e(c["not_advice"])} Page last reviewed {when.strftime("%B")} {when.day}, {when.year}.</p>'
    return body
