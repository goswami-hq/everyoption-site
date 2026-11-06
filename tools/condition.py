#!/usr/bin/env python3
"""Condition education pages (job 12): one content file per condition in content/conditions/<slug>.toml becomes
site/<slug>/index.html. tools/build.py calls build_all(); tools/readability.py reads the same files.

Inline markup in any text field (kept small on purpose):
  [^key]          a numbered marker pointing at the reference with that key (numbered by first use on the page)
  [words](/path/) a link
  **words**       bold
Everything else is plain text and is HTML-escaped.

To add a condition: copy content/conditions/fibroids.toml, change the words, run python3 tools/build.py and
python3 tools/readability.py <slug>. Nothing else changes.
"""
import html, json, pathlib, re, tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "conditions"

LINK = re.compile(r"\[([^\]^][^\]]*)\]\(([^)\s]+)\)")
MARK = re.compile(r"\[\^([a-z0-9-]+)\]")
BOLD = re.compile(r"\*\*(.+?)\*\*")

def load(slug):
    with open(CONTENT / f"{slug}.toml", "rb") as fh:
        c = tomllib.load(fh)
    c.setdefault("sections", []); c.setdefault("faq", []); c.setdefault("refs", []); c.setdefault("terms", []); c.setdefault("categories", [])
    return c


def slugs():
    return sorted(p.stem for p in CONTENT.glob("*.toml"))


def plain(s):
    """Text as a reader sees it: markers dropped, links reduced to their words, bold marks removed."""
    s = MARK.sub("", s)
    s = LINK.sub(r"\1", s)
    s = BOLD.sub(r"\1", s)
    return re.sub(r"\s+([.,;:!?])", r"\1", re.sub(r"[ \t]+", " ", s)).strip()


class Refs:
    """Numbers references by first use and renders markers."""

    def __init__(self, refs):
        self.by_key = {r["key"]: r for r in refs}
        self.order = []

    def num(self, key):
        if key not in self.by_key:
            raise KeyError(f"marker [^{key}] has no reference")
        if key not in self.order:
            self.order.append(key)
        return self.order.index(key) + 1

    def group(self, keys):
        """One marker group for a run of sources (design review 2026-11-06, his words: "the citation numbers are
        congested"). Numbers go in order, separated by commas; three or more in a row become a range (10–15), the
        usual style in medical writing. Every number shown is its own link."""
        nums = sorted({self.num(k) for k in keys})
        runs, out = [], []
        for n in nums:
            if runs and n == runs[-1][1] + 1:
                runs[-1][1] = n
            else:
                runs.append([n, n])
        a = lambda n: f'<a href="#ref-{n}" aria-label="Reference {n}">{n}</a>'
        for lo, hi in runs:
            if hi - lo >= 2:
                out.append(f'{a(lo)}<span class="to" aria-hidden="true">–</span><span class="vh"> to </span>{a(hi)}')
            else:
                out.extend(a(n) for n in range(lo, hi + 1))
        return '<sup class="ref">' + '<span class="sep" aria-hidden="true">, </span>'.join(out) + "</sup>"

    def inline(self, s):
        out, pos = [], 0
        for m in re.finditer(r"(?:\[\^[a-z0-9-]+\])+|\[[^\]^][^\]]*\]\([^)\s]+\)|\*\*.+?\*\*", s):
            out.append(html.escape(s[pos:m.start()], quote=False))
            t = m.group(0)
            if t.startswith("[^"):
                out.append(self.group(MARK.findall(t)))
            elif t.startswith("**"):
                out.append(f"<strong>{self.inline(t[2:-2])}</strong>")
            else:
                lm = LINK.match(t)
                out.append(f'<a href="{html.escape(lm.group(2), quote=True)}">{html.escape(lm.group(1), quote=False)}</a>')
            pos = m.end()
        out.append(html.escape(s[pos:], quote=False))
        return "".join(out)


def tail(s):
    """Markers move to the end of the sentence group, so the reading text stays clean."""
    keys = list(dict.fromkeys(MARK.findall(s)))
    body = MARK.sub("", s).strip()
    return re.sub(r"\s+([.,;:!?])", r"\1", body) + "".join(f"[^{k}]" for k in keys)


def paras(refs, items):
    return "".join(f"<p>{refs.inline(tail(p))}</p>" for p in items)


def bullets(refs, items):
    return "<ul>" + "".join(f"<li>{refs.inline(tail(p))}</li>" for p in items) + "</ul>" if items else ""


def fold(cls, title, inner, id_=""):
    i = f' id="{id_}"' if id_ else ""
    return f'<details class="{cls}"{i}><summary>{html.escape(title)}</summary><div class="fold-body">{inner}</div></details>'


def section(refs, s):
    body = paras(refs, s.get("text", [])) + bullets(refs, s.get("list", [])) + paras(refs, s.get("after", []))
    return fold("topic", s["heading"], body, s["id"])


FIELDS = [("invasive", "How invasive is it?"), ("works", "How well does it work?"), ("side", "Side effects")]


def option(refs, o, extra, cls="option"):
    rows = "".join(f"<div><dt>{label}</dt><dd>{refs.inline(tail(o[k]))}</dd></div>" for k, label in FIELDS)
    return fold(cls, o["name"], f'<p>{refs.inline(tail(o["what"]))}</p><dl class="facts">{rows}</dl>{extra}', o["id"])


def lead_option(refs, c, diagram_fn):
    """The condition's IR procedure: a short summary with its details folded (his yes to the redesign, 2026-11-03)."""
    o = next(x for x in c["options"] if x["id"] == c["diagram_at"])
    t = lambda k: refs.inline(tail(o[k])).replace(chr(10), "<br>")
    # job platform-main-0010: a page with no finder or diagram of its own (the pelvic page) leaves both out
    pic = diagram_fn(c["diagram"], vary=False) if c.get("diagram") else ""
    how = fold("topic how-fold", "How it works", f'{pic}<p>{t("invasive")}</p>')
    cta = f'<p class="cta"><a class="btn" href="#finder">{html.escape(c["finder_button"])}</a></p>' if c.get("finder") else ""
    return (f'<section class="lead-option" id="{html.escape(o["id"])}"><h2>About {html.escape(o["name"][0].lower() + o["name"][1:])}</h2>'
            f'<p>{refs.inline(tail(o["what"]))}</p>{how}{fold("topic", "How well does it work?", "<p>" + t("works") + "</p>")}'
            f'{fold("topic", "Side effects", "<p>" + t("side") + "</p>")}'
            f'<p class="small muted proc-vary">Results vary from person to person. Talk to a doctor about whether this is right for you.</p>'
            f'{cta}</section>')


def categories(refs, c):
    by_id = {o["id"]: o for o in c["options"]}
    out = ""
    for k in c["categories"]:
        opts = ""
        for i in k["options"]:
            if i == c.get("diagram_at"):
                # the full text sits above in the lead section, so this row only points there
                opts += (f'<a class="option-link" href="#{html.escape(i)}"><span>{html.escape(by_id[i]["name"])}</span>'
                         f'<span class="option-note">Details above</span></a>')
                continue
            opts += option(refs, by_id[i], "", "option featured" if i == k.get("highlight") else "option")
        out += fold("group featured-group" if k.get("highlight") else "group", k["name"], f'<p>{refs.inline(tail(k["summary"]))}</p>{opts}', k["id"])
    see = (f'<p class="see-every"><a href="{html.escape(c["options_page"])}">{html.escape(c.get("options_link", "See every option side by side"))}</a></p>' if c.get("options_page") else "")
    return f'<section id="options"><h2>{html.escape(c["options_heading"])}</h2>{see}{out}</section>'


def faq(refs, c):
    items = "".join(f'<div class="qa"><h3>{html.escape(q["q"])}</h3>{paras(refs, [q["a"]])}</div>' for q in c["faq"])
    return fold("topic", c["faq_heading"], items, "faq")


def references(refs):
    lis = ""
    for i, key in enumerate(refs.order, 1):
        r = refs.by_key[key]
        link = f' <a href="{html.escape(r["url"], quote=True)}" rel="noopener">{html.escape(r["url"])}</a>' if r.get("url") else ""
        lis += f'<li id="ref-{i}" tabindex="-1">{html.escape(r["cite"])}{link}</li>'
    return fold("topic", "References", f'<p class="small muted">The small numbers on this page point to these sources.</p><ol class="refs">{lis}</ol>', "references")


def schema(c, url, origin, publisher):
    """MedicalWebPage, built from the same text the page shows (nothing added). No FAQPage: Google ended FAQ rich results
    on 2026-05-07 and the pattern (docs/condition-pattern.md) carries no FAQ markup (job platform-main-0016)."""
    page = {
        "@context": "https://schema.org", "@type": "MedicalWebPage", "name": c["h1"], "headline": c["h1"],
        "description": c["description"], "url": url, "inLanguage": "en-US", "lastReviewed": c["reviewed"],
        "audience": {"@type": "Patient"},
        "about": {"@type": "MedicalCondition", "name": c["condition_name"],
                  **({"alternateName": c["condition_alt"]} if c.get("condition_alt") else {}),
                  "possibleTreatment": [{"@type": "MedicalTherapy", "name": o["name"]} for o in c["options"]]},
        "publisher": {"@type": "Organization", "name": publisher, "url": origin + "/"},
    }
    if c.get("author_name"):
        # Off until he decides (his words, 2026-11-01: "if we truly need a name, I can figure out how to put my name on
        # it"). schema.org's "Physician" type describes a practice, so a person goes in as Person with credentials.
        who = {"@type": "Person", "name": c["author_name"]}
        if c.get("author_credentials"):
            who["honorificSuffix"] = c["author_credentials"]
        if c.get("author_role"):
            who["jobTitle"] = c["author_role"]
        page["reviewedBy"] = who
        page["author"] = who
    return ld(page)


def ld(d):
    text = json.dumps(d, ensure_ascii=False, indent=1).replace("</", "<\\/")
    return f'<script type="application/ld+json">{text}</script>'


def hero(c, finder_fn):
    """The top of a condition page: heading, plain summary, and the ZIP search."""
    if not c.get("finder"):
        return f'<section class="hero-cond"><h1>{html.escape(c["h1"])}</h1><p class="lede">{html.escape(c["hero_intro"])}</p></section>'
    find = finder_fn(c["finder"], c["finder_heading"], "#options", c["finder_intro"], c["finder_how"], split=True)
    return f'<section class="hero-cond"><h1>{html.escape(c["h1"])}</h1>{find}</section>'


def body(c, diagram_fn, e, top=""):
    """Built strictly in page order, so reference numbers count up from 1 down the page."""
    refs = Refs(c["refs"])
    lead = lead_option(refs, c, diagram_fn)
    # place = "lead": a section shown open right after the lead procedure, not folded in Learn more (job 33: the
    # arthritis page's "other joints" block, so it sits with embolization instead of below every other option)
    lead += "".join(f'<section class="lead-extra" id="{html.escape(s["id"])}"><h2>{html.escape(s["heading"])}</h2>'
                    f'{paras(refs, s.get("text", []))}{bullets(refs, s.get("list", []))}{paras(refs, s.get("after", []))}</section>'
                    for s in c["sections"] if s.get("place") == "lead")
    parts = [f'{lead}<p class="answer">{refs.inline(tail(c["answer"]))}</p>',
             f'<p class="urgent-line">{html.escape(c["urgent"])}</p>']
    parts.append(categories(refs, c))
    learn = "".join(section(refs, s) for s in c["sections"] if s.get("place") != "lead") + faq(refs, c)
    parts.append(f'<section id="learn"><h2>{html.escape(c["learn_heading"])}</h2>{learn}{{REFS}}</section>')
    parts = [p.replace("{REFS}", references(refs)) for p in parts]
    author = (f'<p class="small muted">Reviewed by {e(c["author_name"])}'
              f'{", " + e(c["author_credentials"]) if c.get("author_credentials") else ""}.</p>' if c.get("author_name") else "")
    import datetime
    d = datetime.date.fromisoformat(c["reviewed"])
    parts.append(f'<p class="small muted">Page last reviewed {d.strftime("%B")} {d.day}, {d.year}.</p>{author}')
    unused = [r["key"] for r in c["refs"] if r["key"] not in refs.order]
    if unused:
        raise ValueError(f"{c['slug']}: references listed but never cited: {unused}")
    results = ('<div class="results-col">' + top + '<div id="status" class="status" role="status" aria-live="polite">'
               'Enter your ZIP code to see doctors near you, nearest first.</div><div id="results"></div>'
               '<noscript><p class="notice">This finder needs JavaScript to sort doctors by distance.</p></noscript></div>')
    if not c.get("finder"):
        return f'<div class="cond-grid">{top}<article class="condition t-{c["color"]}">{"".join(parts)}</article></div>'
    return (f'<div class="cond-grid">{results}<article class="condition t-{c["color"]}">{"".join(parts)}</article></div>'
            '<a class="find-bar" href="#finder" hidden>Find a doctor</a>')
