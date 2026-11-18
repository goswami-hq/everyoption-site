#!/usr/bin/env python3
"""The embolization explainer (ai-hq job platform-condition-pages-0020; his words, HQ chat 2026-11-11 14:25 CT: "Across
all the embo pages, we need to explain what embolization is simply and the types of things we use as embolic agents
simply (what they're made of etc)").

One source, content/embolization.toml: the shared opening, the gelatin line, the material cards and each condition's
own material list. Two renderers read it:
  simple_fold(refs, slug)   the closed "What is embolization?" fold in the short guide's lead option (tools/condition.py)
  deep_section(refs, slug)  "What is used to block the blood flow?" inside the in-depth page's embolization option
                            (tools/options.py); this page's materials first and marked, the rest under "Other materials
                            doctors use"
A condition listed in the file must carry both on every page it has; tools/pattern.py fails the build otherwise.
The text uses the condition files' inline markup ([^key] markers, **bold**); its references are the file's [[ref]]
entries, merged into each page's own list (keys start "emb-" so they never meet a page's keys).
"""
import html, pathlib, tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "content" / "embolization.toml"
_DATA = None


def data():
    global _DATA
    if _DATA is None:
        with open(SOURCE, "rb") as fh:
            _DATA = tomllib.load(fh)
        ids = {m["id"] for m in _DATA["material"]}
        for c in _DATA["condition"]:
            bad = [m for m in c["materials"] if m not in ids]
            if bad:
                raise ValueError(f"content/embolization.toml: {c['slug']} names unknown materials {bad}")
    return _DATA


def conditions():
    return {c["slug"]: c for c in data()["condition"]}


def refs():
    """The explainer's references, added to each page's own list (condition.Refs numbers them by first use)."""
    return data().get("ref", [])


def _cond(slug):
    return conditions().get(slug)


def _icon(m, size):
    if not m.get("icon"):   # a material with no picture yet (medical glue, 2026-11-11) keeps the card's text column
        return ""
    # decorative: the card's heading names the material, so the picture carries no text of its own
    return (f'<img class="embo-ic" src="/assets/media/{html.escape(m["icon"], quote=True)}.webp" width="{size}" height="{size}" '
            f'alt="" loading="lazy" decoding="async">')


def _mat(mid):
    return next(m for m in data()["material"] if m["id"] == mid)


def simple_fold(refs_, slug, tail):
    """The short guide's fold, or "" for a condition not in the file. `tail` is condition.tail (markers to the end)."""
    c = _cond(slug)
    if not c:
        return ""
    d = data()
    t = lambda s: refs_.inline(tail(s))
    pics = "".join(_icon(_mat(m), 48) for m in c["materials"] if _mat(m).get("icon"))
    body = (f'<p>{t(d["opening"])}</p><div class="embo-line"><span class="embo-ics" aria-hidden="true">{pics}</span>'
            f'<p>{t(c["line"])}</p></div>' + (f'<p>{t(d["gelatin"])}</p>' if c.get("gelatin") else ""))
    return (f'<details class="topic embo-what" id="what-is-embolization"><summary>{html.escape(d["fold_heading"])}</summary>'
            f'<div class="fold-body">{body}</div></details>')


def _used_line(m, slug):
    """Which conditions use this material: this page's first, in bold; the others as links to their pages."""
    cs = [c for c in data()["condition"] if m["id"] in c["materials"]]
    here = [c for c in cs if c["slug"] == slug]
    others = [c for c in cs if c["slug"] != slug]
    link = lambda c: f'<a href="{html.escape(c["page"], quote=True)}">{html.escape(c["label"])}</a>'
    out = ""
    if here:
        out += f'<strong class="used-here">Used for {html.escape(here[0]["label"])}</strong>'
    if others:
        names = [link(c) for c in others]
        joined = names[0] if len(names) == 1 else (" and ".join(names) if len(names) == 2 else ", ".join(names[:-1]) + ", and " + names[-1])
        out += ("<span class=\"used-also\">" + ("Also used for " if here else "Used for ") + joined + "</span>")
    return f'<p class="used">{out}</p>'


def _card(refs_, m, slug, tail, mine):
    t = lambda s: refs_.inline(tail(s))
    term = f' <span class="embo-term">({html.escape(m["term"])})</span>' if m.get("term") else ""
    return (f'<li class="agent{" this" if mine else ""}">{_icon(m, 64)}<div class="agent-txt">'
            f'<h5>{html.escape(m["name"])}{term}</h5><p>{t(m["made"])}</p><p class="stays">{t(m["stays"])}</p>'
            f'{_used_line(m, slug)}</div></li>')


def deep_section(refs_, slug, tail):
    """The in-depth section, or "" for a condition not in the file. Reference markers number in reading order: this
    page's cards, then the others, then the closing line."""
    c = _cond(slug)
    if not c:
        return ""
    d = data()
    t = lambda s: refs_.inline(tail(s))
    order = c["materials"] + [m["id"] for m in d["material"] if m["id"] not in c["materials"]]
    opening = f'<p>{t(d["deep_opening"])}</p>' + (f'<p>{t(c["deep_note"])}</p>' if c.get("deep_note") else "")
    mine = "".join(_card(refs_, _mat(i), slug, tail, True) for i in order if i in c["materials"])
    rest = "".join(_card(refs_, _mat(i), slug, tail, False) for i in order if i not in c["materials"])
    close = f'<p>{t(d["deep_gelatin"])}</p>' if d.get("deep_gelatin") else ""
    other = (f'<details class="embo-other" data-fold-phone open><summary>{html.escape(d["other_heading"])}</summary>'
             f'<ul class="agents">{rest}</ul></details>' if rest else "")
    return (f'<section class="embo-agents" id="embolic-materials" aria-labelledby="embolic-materials-h">'
            f'<h4 id="embolic-materials-h">{html.escape(d["deep_heading"])}</h4>{opening}<ul class="agents">{mine}</ul>{other}{close}</section>')


def texts(slug, deep=False):
    """The reading text, for tools/readability.py (the fold) and the review's scoring."""
    c, d = _cond(slug), data()
    if not c:
        return []
    if not deep:
        return [d["opening"], c["line"]] + ([d["gelatin"]] if c.get("gelatin") else [])
    out = [d["deep_opening"]] + ([c["deep_note"]] if c.get("deep_note") else [])
    for m in d["material"]:
        out += [m["made"], m["stays"]]
    return out + ([d["deep_gelatin"]] if d.get("deep_gelatin") else [])
