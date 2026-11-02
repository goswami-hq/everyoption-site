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

    def inline(self, s):
        out, pos = [], 0
        for m in re.finditer(r"\[\^[a-z0-9-]+\]|\[[^\]^][^\]]*\]\([^)\s]+\)|\*\*.+?\*\*", s):
            out.append(html.escape(s[pos:m.start()], quote=False))
            t = m.group(0)
            if t.startswith("[^"):
                n = self.num(t[2:-1])
                out.append(f'<sup class="ref"><a href="#ref-{n}" aria-label="Reference {n}">{n}</a></sup>')
            elif t.startswith("**"):
                out.append(f"<strong>{self.inline(t[2:-2])}</strong>")
            else:
                lm = LINK.match(t)
                out.append(f'<a href="{html.escape(lm.group(2), quote=True)}">{html.escape(lm.group(1), quote=False)}</a>')
            pos = m.end()
        out.append(html.escape(s[pos:], quote=False))
        return "".join(out)


def paras(refs, items):
    return "".join(f"<p>{refs.inline(p)}</p>" for p in items)


def bullets(refs, items):
    return "<ul>" + "".join(f"<li>{refs.inline(p)}</li>" for p in items) + "</ul>" if items else ""


def section(refs, s):
    cls = ' class="urgent"' if s.get("kind") == "urgent" else ""
    body = paras(refs, s.get("text", [])) + bullets(refs, s.get("list", [])) + paras(refs, s.get("after", []))
    return f'<section id="{s["id"]}"{cls}><h2>{html.escape(s["heading"])}</h2>{body}</section>'


def option(refs, o, diagram_html):
    return (f'<details class="option" id="{o["id"]}"><summary>{html.escape(o["heading"])}</summary>'
            f'<div class="option-body">{paras(refs, o["text"])}{diagram_html or ""}</div></details>')


def categories(refs, c, diagram_fn):
    by_id = {o["id"]: o for o in c["options"]}
    cards = "".join(f'<li><a href="#{k["id"]}"><strong>{html.escape(k["name"])}</strong></a></li>' for k in c["categories"])
    out = f'<nav class="groups" aria-label="Jump to a group of options"><ul>{cards}</ul></nav>'
    for k in c["categories"]:
        opts = "".join(option(refs, by_id[i], diagram_fn(c["diagram"]) if i == c.get("diagram_at") else "") for i in k["options"])
        cta = (f'<p class="cta"><a class="btn" href="/{c["finder"]}/">{html.escape(c["finder_button"])}</a></p>'
               if c.get("diagram_at") in k["options"] else "")
        out += f'<section class="group" id="{k["id"]}"><h3>{html.escape(k["name"])}</h3><p>{refs.inline(k["summary"])}</p>{opts}{cta}</section>'
    return f'<section id="options"><h2>{html.escape(c["options_heading"])}</h2>{out}</section>'


def faq(refs, c):
    items = "".join(f'<div class="qa"><h3>{html.escape(q["q"])}</h3>{paras(refs, [q["a"]])}</div>' for q in c["faq"])
    return f'<section id="faq"><h2>{html.escape(c["faq_heading"])}</h2>{items}</section>'


def references(refs):
    lis = ""
    for i, key in enumerate(refs.order, 1):
        r = refs.by_key[key]
        link = f' <a href="{html.escape(r["url"], quote=True)}" rel="noopener">{html.escape(r["url"])}</a>' if r.get("url") else ""
        lis += f'<li id="ref-{i}">{html.escape(r["cite"])}{link}</li>'
    return (f'<section id="references"><h2>References</h2><p class="small muted">The small numbers on this page point '
            f'to these sources.</p><ol class="refs">{lis}</ol></section>')


def schema(c, url, origin, publisher):
    """MedicalWebPage and FAQPage, built from the same text the page shows (nothing added)."""
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
    faqs = {"@context": "https://schema.org", "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q["q"], "acceptedAnswer": {"@type": "Answer", "text": plain(q["a"])}}
                           for q in c["faq"]]}
    dump = lambda d: json.dumps(d, ensure_ascii=False, indent=1).replace("</", "<\\/")
    return (f'<script type="application/ld+json">{dump(page)}</script>\n'
            f'<script type="application/ld+json">{dump(faqs)}</script>')


def body(c, diagram_fn, e):
    """Built strictly in page order, so reference numbers count up from 1 down the page."""
    refs = Refs(c["refs"])
    finder = c["finder"]
    photo = (f'<figure class="photo"><img src="{e(c["photo"])}" alt="{e(c.get("photo_alt", ""))}"></figure>'
             if c.get("photo") else "")   # the photo slot: empty until a picture is chosen
    parts = [f'<h1>{html.escape(c["h1"])}</h1>{photo}<p class="lede answer">{refs.inline(c["answer"])}</p>']
    parts += [section(refs, s) for s in c["sections"] if s.get("place", "before") == "before"]
    parts.append(categories(refs, c, diagram_fn))
    parts += [section(refs, s) for s in c["sections"] if s.get("place") == "after"]
    parts.append(faq(refs, c))
    parts.append(f'<section id="find" class="find"><h2>{html.escape(c["find_heading"])}</h2>{paras(refs, c["find_text"])}'
                 f'<p class="cta"><a class="btn" href="/{finder}/">{html.escape(c["finder_button"])}</a></p></section>')
    parts.append(references(refs))
    author = (f'<p class="small muted">Reviewed by {e(c["author_name"])}'
              f'{", " + e(c["author_credentials"]) if c.get("author_credentials") else ""}.</p>' if c.get("author_name") else "")
    parts.append(f'<p class="small muted">{e(c["not_advice"])} Page last reviewed {e(c["reviewed"])}.</p>{author}')
    unused = [r["key"] for r in c["refs"] if r["key"] not in refs.order]
    if unused:
        raise ValueError(f"{c['slug']}: references listed but never cited: {unused}")
    return f'<article class="condition t-{c["colour"]}">{"".join(parts)}</article>'
