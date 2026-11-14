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

Job platform-condition-pages-0017 (his hemorrhoid in-depth edits, 2026-11-10: "Bullet points for clear takeaways and
comparisons are much more readable"): a list field whose items carry markers is a marked list. "* " opens a bullet,
"- " a bullet nested under the one before, and an unmarked item is a paragraph (a study introduced in plain sentences
before its bullets). A list with no markers renders as before. In a marked list an item may take its source from the
list's other items. `abstract_label = false` on a page stops printing "(abstract only)" (he deleted the line that
explained it; how each number was read stays in the ledger's `read`). A detail with `ruled` carries his own line in
place of a certainty-word opening: its `works` opens with the simple page's first sentence for that option, and its
certainty word must still be on the ladder. A glance row's `card_<column>` replaces that cell in the option's summary
card only.

Job platform-condition-pages-0023 (the chronic pelvic pain in-depth page, his signed-off Doc of 2026-11-13; his go: "Don't
change the layout of the page from our established templates"): no new layout element; three data options so the same
layout carries his Doc's words. `categories` on the deep page replaces the simple page's groups for this page only (the
pelvic short guide leads with two treatments in `lead_pair`, outside any group; each deep group may carry its own
`heading`, `summary` (may be empty) and `note`). `names` renames an option in the grid, the at-a-glance view and the
contents list; `titles` renames its section heading. An empty `lede` prints none (his Doc has none). For an option the
simple page shows in `lead_pair`, the certainty word is read from that part's "**<Label>.**" line whose label starts
with the option's id ("**Stenting.**" for `stent`), since that is the line the short guide shows.
"""
import datetime, html, pathlib, re, tomllib
import condition
from legal import FINDER_TERMS   # W32, job platform-launch-0005

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "content" / "options"
PH = re.compile(r"\{([fgd]):([a-z0-9-]+)\}")
# "out of" counts as a number only after a number word ("nine out of ten"); a digit is caught by \d. The bare phrase
# misread "Nothing is cut out of your body" (signed-off pelvic text, job platform-condition-pages-0023).
NUM = re.compile(r"\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred|thousand|half|a few)\s+out\s+of\b|%|\bpercent\b", re.I)
SIMPLE_FIELDS = ("what", "invasive", "works", "side")
DETAIL_FIELDS = ("intro", "works", "evidence", "risks", "selection", "fit", "unknown")
# The certainty ladder (ai-hq projects/platform/content/evidence-writing-rules.md), used the same way for every option.
LADDER = ("strong evidence shows", "good evidence suggests", "early studies suggest", "early results are encouraging",
          "studies disagree", "not yet well studied")
GLANCE_COLS = (("involves", "What it involves"), ("recovery", "Recovery"), ("uterus", "Keeps uterus?"),
               ("fibroids", "Treats the fibroids?"))
# His words, 2026-11-07: "the grids, while fine, are missing the most important info - how well does it work? For each
# option". Every grid's first column after the name: the option's certainty word (from its detail, which check() ties
# to the simple page) and a short effect phrase from the glance row's `works`, numbers only through the ledger.
WORKS_COL = ("works", "How well it works")
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


def _marked(items):
    return isinstance(items, list) and any(x.startswith(("* ", "- ")) for x in items)


def _strip_mark(t):
    return t[2:] if t.startswith(("* ", "- ")) else t


def marked_html(items, txt, cls="evidence"):
    """A marked list as paragraphs, bullets and nested bullets, in order."""
    out, open_ul, open_sub = [], False, False
    for raw in items:
        if raw.startswith("- ") and open_ul:
            if not open_sub:
                out[-1] = out[-1].removesuffix("</li>") + "<ul>"
                open_sub = True
            out.append(f"<li>{txt(raw[2:])}</li>")
            continue
        if open_sub:
            out.append("</ul></li>")
            open_sub = False
        if raw.startswith(("* ", "- ")):
            if not open_ul:
                out.append(f'<ul class="{cls}">')
                open_ul = True
            out.append(f"<li>{txt(raw[2:])}</li>")
        else:
            if open_ul:
                out.append("</ul>")
                open_ul = False
            out.append(f"<p>{txt(raw)}</p>")
    if open_sub:
        out.append("</ul></li>")
    if open_ul:
        out.append("</ul>")
    return "".join(out)


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
        if s.get("symptoms"):   # the box's symptom tags are read as claims too (job platform-main-0024)
            yield "", "; ".join(s["symptoms"]) + s.get("symptoms_cite", "")
    for q in c["faq"]:
        yield "", q["a"]
    yield "", c["answer"]
    yield "", c.get("finder_intro", "").replace("**", "")   # a condition with no finder (hemorrhoids) has none


def _deep_texts(d):
    """(where, text) for every deep-page field that states a claim: option details and the page's own sections."""
    for dt in d["detail"]:
        for k in DETAIL_FIELDS:
            v = dt.get(k, "")
            for t in _as_list(v):
                yield f'{dt["option"]}.{k}', _strip_mark(t), (v if _marked(v) else None)
    for sec in d.get("section", []):
        for t in sec["text"]:
            yield f'section {sec["id"]}', _strip_mark(t), (sec["text"] if _marked(sec["text"]) else None)


def _lead_works(c):
    """{option id: text} for the lead_pair lines "**<Label>.** ...": the short guide's shown words for a lead option."""
    out = {}
    for part in c.get("lead_pair", {}).get("parts", []):
        for t in part.get("text", []):
            m = re.match(r"\*\*(.+?)\.\*\*\s*(.*)$", t)
            for o in c["options"]:
                if m and m.group(1).lower().startswith(o["id"]) and part.get("heading", "").lower().startswith("how well"):
                    out[o["id"]] = m.group(2)
    return out


def cats_of(c, d):
    """The page's groups: the deep page's own `categories` when it has them, else the simple page's."""
    return d.get("categories") or c["categories"]


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
    simple_works = {o["id"]: o["works"].lower() for o in c["options"]} | {k: v.lower() for k, v in _lead_works(c).items()}
    for dt in d["detail"]:
        if dt["option"] not in ids:
            errs.append(f'deep page option unknown: {dt["option"]}')
        elif "certainty" in dt and dt.get("ruled"):
            # his own line in place of the certainty opening (creams, his words 2026-11-10: "This is my clinical judgment")
            first = re.split(r"(?<=[.!?])\s", _norm(simple_works[dt["option"]]))[0]
            if dt["certainty"].lower() not in LADDER:
                errs.append(f'{dt["option"]}: certainty "{dt["certainty"]}" is not on the ladder')
            if not _norm(PH.sub("", dt.get("works", ""))).startswith(first):
                errs.append(f'{dt["option"]}.works must open with the simple page\'s line "{first}"')
        elif "certainty" in dt:
            said = [w for w in LADDER if w in simple_works[dt["option"]]]
            want = dt["certainty"].lower()
            if said and want not in said:
                errs.append(f'{dt["option"]}: certainty "{dt["certainty"]}" is not the simple page\'s {said}')
            if not said and want:
                errs.append(f'{dt["option"]}: certainty "{dt["certainty"]}" but the simple page uses no certainty word')
            if want and not condition.MARK.sub("", PH.sub("", dt.get("works", ""))).lower().startswith(want):
                errs.append(f'{dt["option"]}.works must open with its certainty word "{dt["certainty"]}"')
    for where, t, group in _deep_texts(d):
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
        sourced = lambda u: condition.MARK.search(u) or PH.search(u)
        if t and not sourced(t) and not (group and any(sourced(u) for u in group)):
            errs.append(f'{where}: no source')
        for key in condition.MARK.findall(t):
            if key not in keys | own:
                errs.append(f'{where}: reference {key} is not on the simple page' + (" or this page" if own else ""))
    for t in _notes(d) + _as_list(d.get("read_intro", "")) + list(d.get("compare_notes", {}).values()):
        if NUM.search(condition.MARK.sub("", PH.sub("", t))):
            errs.append(f'reading note: number outside the ledger: "{t[:120]}"')
    # The lede opens with the answer (agreed list item 2, his "Fine" 2026-11-07): its numbers come only from the ledger.
    for m in PH.finditer(d["lede"]):
        if m.group(2) not in facts:
            errs.append(f'lede: unknown fact {m.group(2)}')
        elif m.group(1) == "f" and not facts[m.group(2)]["simple"]:
            errs.append(f'lede: {m.group(2)} is a deep-only fact; write it {{d:{m.group(2)}}}')
    if NUM.search(condition.MARK.sub("", PH.sub("", d["lede"]))):
        errs.append(f'lede: number outside the ledger: "{d["lede"][:120]}"')
    if d.get("categories"):
        placed = [i for k in d["categories"] for i in k["options"]]
        if sorted(placed) != sorted(ids):
            errs.append("deep page categories must hold every option of the simple page exactly once")
        for k in d["categories"]:
            for t in (k.get("summary", ""), k.get("note", "")):
                if NUM.search(condition.MARK.sub("", PH.sub("", t))):
                    errs.append(f'category {k["id"]}: number outside the ledger: "{t[:120]}"')
    det = {x["option"]: x for x in d["detail"]}
    if not d.get("works_note") or NUM.search(d.get("works_note", "")):
        errs.append("works_note: the note under the grid on how its results compare is required, with no number")
    for g in d["glance"]:
        w = g.get("works", "").strip()
        if not w:
            errs.append(f'glance {g["option"]}.works: "How well it works" is required (say what is known, never a blank)')
        if any(word in w.lower() for word in LADDER):
            errs.append(f'glance {g["option"]}.works: the certainty word comes from the option\'s detail; do not write one here')
        for m in PH.finditer(w):
            x = facts.get(m.group(2))
            if x and m.group(1) != "g" and (m.group(1) == "d") != (not x["simple"]):
                errs.append(f'glance {g["option"]}.works: {m.group(2)} is a {"shared" if x["simple"] else "deep-only"} fact; '
                            f'write it {{{"f" if x["simple"] else "d"}:{m.group(2)}}}')
        for k, _ in (WORKS_COL,) + tuple(d.get("glance_columns", GLANCE_COLS)):
            if NUM.search(PH.sub("", g.get(k, ""))):
                errs.append(f'glance {g["option"]}.{k}: number outside the ledger')
            for m in PH.finditer(g.get(k, "")):
                if m.group(2) not in facts:
                    errs.append(f'glance {g["option"]}: unknown fact {m.group(2)}')
    if {g["option"] for g in d["glance"]} != ids or {x["option"] for x in d["detail"]} != ids:
        errs.append("every option on the simple page must be in the deep page's table and details")
    if errs:
        raise TieError("simple and deep pages are out of tie:\n  " + "\n  ".join(errs))


def _fill(t, facts, label_abstract=True):
    def one(m):
        x = facts[m.group(2)]
        if m.group(1) == "g":
            return x["deep"].capitalize()
        label = " (abstract only)" if label_abstract and m.group(1) == "d" and x.get("read") == "abstract" else ""
        return x["deep"] + label + "".join(f"[^{r}]" for r in x["refs"])
    return PH.sub(one, t)


def _cap(s):
    """A sentence that begins with a filled-in fact still begins with a capital."""
    # Not after a colon (American style: lower case unless a proper noun follows) and not after "U.S."; a bold
    # label ("**Hand and fingers.** one study") still counts as a sentence end (clear-writing pass, 2026-11-07).
    # nor after "vs." ("GAE vs. a fake procedure", knee rewrite 2026-11-12)
    return re.sub(r"(^|(?<!U\.S)(?<!\bvs)[.?!](?:\*\*)?\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), s) if s else s


def _works(g, x, facts, label_abstract=True, key="works"):
    """The grid's "How well it works" cell: the certainty word in bold, then the effect phrase (abstract-only figures
    labelled as in the text). An option whose simple page uses no certainty word shows the phrase alone."""
    def one(m):
        y = facts[m.group(2)]
        return y["deep"] + (" (abstract only)" if label_abstract and m.group(1) == "d" and y.get("read") == "abstract" else "")
    phrase, cert = PH.sub(one, g.get(key) or g["works"]).strip(), x.get("certainty", "")
    phrase = html.escape(phrase[:1].upper() + phrase[1:], quote=False)
    return (f'<strong class="cert">{html.escape(cert, quote=False)}</strong> ' if cert else "") + f'<span class="eff">{phrase}</span>'



def toc(c, d, names, extra):
    """The contents list (his words, 2026-11-07: "readability and navigability on the page"): every section, and under
    each category its options, so a skimmer finds a treatment by name. deep-nav.js pins a copy while reading."""
    e = lambda s: html.escape(s, quote=False)
    li = lambda i, t, sub="": f'<li><a href="#{i}">{e(t)}</a>{sub}</li>'
    secs = lambda where: "".join(li(sec["id"], sec.get("toc", sec["heading"])) for sec in extra.get(where, []))
    items = secs("top") + li("glance", "At a glance")
    for k in cats_of(c, d):
        sub = "<ol>" + "".join(li(i, names[i]) for i in k["options"]) + "</ol>"
        items += li(k["id"], k["name"], sub) + secs(k["id"])
    cov = next((x["coverage"] for x in condition.PROCEDURES if x["key"] == c.get("finder") and x.get("coverage")), None)
    out = f'<li class="toc-out"><a href="{html.escape(cov["path"], quote=True)}">{e(cov["link"])}</a></li>' if cov else ""   # the one entry that leaves the page
    items += secs("end") + (li("find", d["find_heading"]) if c.get("finder") else "") + out + li("references", "References")
    return f'<nav class="toc" id="toc" aria-labelledby="toc-h"><p class="toc-title" id="toc-h">On this page</p><ol>{items}</ol></nav>'


def render(c, d, f, diagram_fn, finder_href, city_hub="", city_links=""):
    check(c, d, f)
    facts = {x["id"]: x for x in f["fact"]}
    refs, names = condition.Refs(c["refs"] + d.get("refs", []) + condition.embolization.refs()), {o["id"]: o["name"] for o in c["options"]} | d.get("names", {})
    titles = names | d.get("titles", {})   # section headings (and the contents list) where the Doc names them apart
    quiet = d.get("abstract_label", True)
    txt = lambda s: refs.inline(condition.tail(_cap(_fill(s, facts, quiet))))
    e = lambda s: html.escape(s, quote=False)
    det = {x["option"]: x for x in d["detail"]}
    gcols = (WORKS_COL,) + tuple(tuple(x) for x in d.get("glance_columns", GLANCE_COLS))
    cols = ("Treatment",) + tuple(label for _, label in gcols)
    heads = {**HEADINGS, **d.get("detail_headings", {})}
    glance = {g["option"]: g for g in d["glance"]}

    def value(i, key, card=False):
        g = glance[i]
        if key == "works":
            return _works(g, det[i], facts, quiet, "card_works" if card else "works")
        return e(PH.sub(lambda m: facts[m.group(2)]["deep"].capitalize(), g.get(f"card_{key}", g[key]) if card else g[key]))
    # Roles stay explicit: on a phone the table shows as one card per row (design review 2026-11-06), and some
    # browsers drop table semantics when a table's display changes. data-label names each cell on the card.
    head = "".join(f"<th scope=col role=columnheader>{t}</th>" for t in cols)
    groups = ""
    for k in cats_of(c, d):
        rows = ""
        for i in k["options"]:
            lead = " lead" if i == c.get("diagram_at") else ""
            rows += (f'<tr class="row{lead}" role=row><th scope=row role=rowheader><a href="#{i}">{e(names[i])}</a></th>'
                     + "".join(f'<td role=cell class="c-{key}" data-label="{cols[n]}">{value(i, key)}</td>' for n, (key, _) in enumerate(gcols, 1)) + '</tr>')
        groups += f'<tbody role=rowgroup><tr class=grp role=row><th colspan={len(cols)} scope=rowgroup role=rowheader>{e(k["name"])}</th></tr>{rows}</tbody>'
    table = (f'<div class="table-scroll" tabindex="0" role="region" aria-label="{e(d["glance_heading"])}"><table class="glance" role=table>'
             f'<thead role=rowgroup><tr role=row>{head}</tr></thead>{groups}</table></div>'
             f'<p class="small muted glance-after">{e(d["works_note"])}</p>')

    def peek():
        """A short view of the grid for the first screen (walkthrough finding 2, his yes 2026-11-09): the options in
        `glance_peek` and the columns in `glance_peek_columns`, cell text from the grid's own values. "certainty" is the
        option's whole certainty word, or its full effect phrase when it has none, so the view states how sure the
        evidence is; recovery alone would favour the procedure (reviewer, 2026-11-09)."""
        ids, keys = d["glance_peek"], d["glance_peek_columns"]
        labels = {**dict(gcols), "certainty": "What the evidence says"}

        def cell(i, k):
            if k != "certainty":
                return value(i, k)
            c = det[i].get("certainty", "")
            return f'<strong class="cert">{e(c)}</strong>' if c else _works(glance[i], det[i], facts, quiet)
        missing = [i for i in ids if i not in glance] + [k for k in keys if k not in labels]
        if missing:
            raise TieError(f'glance_peek: unknown option or column: {missing}')
        # `glance_peek_gloss`: a plain meaning after a surgical name on the first screen (his Doc edit 2026-11-11,
        # "Hysterectomy (surgical removal of the uterus)")
        gloss = d.get("glance_peek_gloss", {})
        rows = "".join(f'<tr><th scope=row><a href="#{i}">{e(names[i])}</a>'
                       + (f' <span class="peek-gloss">({e(gloss[i])})</span>' if i in gloss else '') + '</th>'
                       + "".join(f'<td data-label="{labels[k]}">{cell(i, k)}</td>' for k in keys) + '</tr>' for i in ids)
        heads = "".join(f"<th scope=col>{labels[k]}</th>" for k in keys)
        return (f'<div class="glance-peek"><table><caption>At a glance: {len(ids)} of {len(glance)} treatments</caption><thead><tr><th scope=col>Treatment</th>{heads}</tr></thead>'
                f'<tbody>{rows}</tbody></table><p class="peek-more"><a href="#glance">See all {len(glance)} and how well each works</a></p></div>')

    def summary(i):
        """The option's grid row, repeated at the top of its section: the answer before the detail (2026-11-07)."""
        return ('<dl class="opt-sum">' + "".join(f'<div class="c-{key}"><dt>{e(label)}</dt><dd>{value(i, key, True)}</dd></div>'
                                              for key, label in gcols) + '</dl>')

    def block(key, val, own=None):
        heads_ = {**heads, key: own} if own else heads
        if _marked(val):
            return f'<h4>{e(heads_[key])}</h4>' + marked_html(val, txt)
        if isinstance(val, list):
            return f'<h4>{e(heads_[key])}</h4><ul class="evidence">' + "".join(f"<li>{txt(v)}</li>" for v in val) + "</ul>"
        # A line break splits a long field into paragraphs (copy edit, job platform-main-0026); each keeps its sources.
        return f'<h4>{e(heads_[key])}</h4>' + "".join(f"<p>{txt(v.strip())}</p>" for v in val.split("\n") if v.strip())

    # not through _cap: "vs." is not a sentence end ("UFE vs. myomectomy")
    lede = refs.inline(condition.tail(_fill(d["lede"], facts, quiet)))   # first in reading order, so its sources number first
    # "How to read this page": the old lede's method text, then the reading notes (agreed list item 2, 2026-11-07)
    how = (f'<h2 class="reading-h">How to read this page</h2>' + "".join(f'<p class="reading-note small">{e(t)}</p>' for t in _as_list(d.get("read_intro", "")))
           if d.get("read_intro") else "")
    box = condition.what_box(refs, c)   # before the sections, so its sources number first, in reading order
    sections, extra = "", {}
    for sec in d.get("section", []):
        extra.setdefault(sec.get("after", "end"), []).append(sec)
    show = lambda sec: (f'<section id="{sec["id"]}" class="deep-extra" aria-labelledby="{sec["id"]}-h"><h2 id="{sec["id"]}-h">{e(sec["heading"])}</h2>'
                        + (marked_html(sec["text"], txt) if _marked(sec["text"]) else "".join(f"<p>{txt(t)}</p>" for t in sec["text"])) + "</section>")
    for k in cats_of(c, d):
        items = ""
        for i in k["options"]:
            x = det[i]
            lead = i == c.get("diagram_at")
            # `headings` on one option renames a block for that option only (knee rewrite, 2026-11-12: "Who it is for")
            rows = "".join(block(key, x[key], x.get("headings", {}).get(key)) for key in DETAIL_FIELDS[1:] if x.get(key))
            pic = diagram_fn(c["diagram"], vary=False) if x.get("diagram") else ""
            # "What is used to block the blood flow?" (job platform-condition-pages-0020): after the drawing, inside the
            # embolization option; "" for a condition not in content/embolization.toml
            pic += condition.embolization.deep_section(refs, c["slug"], condition.tail) if lead else ""
            # job platform-condition-pages-0014: a condition with no doctor list (hemorrhoids) has no finder button
            cta = (f'<p class="cta"><a class="btn" href="{finder_href}">{e(c["finder_button"])}</a></p>' if c.get("finder") else "") + condition.coverage_link(c) if lead else ""
            items += (f'<article class="deep-option{" lead-option" if lead else ""}" id="{i}" aria-labelledby="{i}-h"><h3 id="{i}-h">{e(titles[i])}</h3>'
                      f'{condition.coverage_near(c) if lead else ""}{summary(i)}{"".join(f"<p>{txt(v.strip())}</p>" for v in x["intro"].split(chr(10)) if v.strip())}{pic}{rows}{cta}</article>')
        # headings phrased as the comparisons this page targets (docs/condition-pattern.md); the simple page keeps k["name"]
        h2 = k.get("heading") or d.get("compare_headings", {}).get(k["id"], k["name"])
        # a second line under a group's summary, for the deep page only (prostate rewrite 2, 2026-11-12: what surgery
        # gains and what it costs, stated before the surgery options); no number, checked in check()
        note = k.get("note") or d.get("compare_notes", {}).get(k["id"], "")
        sections += (f'<section id="{k["id"]}" class="deep-cat" aria-labelledby="{k["id"]}-h"><h2 id="{k["id"]}-h">{e(h2)}</h2>{f"<p>{txt(k['summary'])}</p>" if k["summary"] else ""}'
                     + (f"<p>{e(note)}</p>" if note else "") + f'{items}</section>')
        sections += "".join(show(sec) for sec in extra.get(k["id"], []))
    sections += "".join(show(sec) for sec in extra.get("end", []))
    top = "".join(show(sec) for sec in extra.get("top", []))
    when = datetime.date.fromisoformat(d["reviewed"])
    body = (f'<nav class="crumbs" id="top" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/{c["slug"]}/">{e(c.get("nav_name", c["condition_name"]))}</a></li>'
            f'<li><span aria-current="page">Every option</span></li></ol></nav><h1>{e(d["h1"])}</h1>{peek()}'
            # The comparison and the finder button first, so the first screen on a phone reads as a comparison (the button
            # stays on it: his call 3, 2026-11-07); then the lede and the guide link.
            + (f'<p class="cta"><a class="btn" href="{finder_href}">{e(c["finder_button"])}</a></p>' if c.get("finder") else "") + (f'<p class="lede">{lede}</p>' if d["lede"] else "")
            + f'<p class="see-every see-simple"><a href="/{c["slug"]}/">{e(d["simple_link"])}</a></p>'
            # Reading notes after the finder button, so the button shows on the first screen (his call 3, 2026-11-07).
            + how + "".join(f'<p class="reading-note small">{txt(t) if (PH.search(t) or condition.MARK.search(t) or "**" in t) else e(t)}</p>' for t in _notes(d)) + f'{toc(c, d, titles, extra)}{box}{top}'
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
            f'<button type="submit">Find doctors</button></form>{FINDER_TERMS}{city_links}{city}</section>')


def schema(c, d, origin, publisher):
    """MedicalWebPage and BreadcrumbList from the text the page shows (pattern: docs/condition-pattern.md; no FAQ markup)."""
    url = origin + d["path"]
    page = {"@context": "https://schema.org", "@type": "MedicalWebPage", "name": d["h1"], "headline": d["h1"],
            "description": d["description"], "url": url, "inLanguage": "en-US", "lastReviewed": d["reviewed"],
            "audience": {"@type": "Patient"},
            "about": {"@type": "MedicalCondition", "name": c["condition_name"],
                      **({"alternateName": c["condition_alt"]} if c.get("condition_alt") else {}),
                      "possibleTreatment": [{"@type": "MedicalTherapy", "name": o["name"]} for o in c["options"]]},
            "publisher": {"@type": "Organization", "@id": origin + "/#organization", "name": publisher, "url": origin + "/"}}
    crumbs = [("Home", "/"), (c.get("nav_name", c["condition_name"]), f'/{c["slug"]}/'), ("Every option", d["path"])]
    bc = {"@context": "https://schema.org", "@type": "BreadcrumbList",
          "itemListElement": [{"@type": "ListItem", "position": i, "name": n, "item": origin + u} for i, (n, u) in enumerate(crumbs, 1)]}
    return condition.ld(page) + "\n" + condition.ld(bc)
