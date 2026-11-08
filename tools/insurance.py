#!/usr/bin/env python3
"""The insurance pages (ai-hq job platform-condition-pages-0005; his "Yes", 2026-11-08 09:00 CT): one coverage page per
procedure, /<condition>/insurance/, and the dataset hub, /insurance/. Data: content/insurance/coverage-YYYY-MM.toml,
copy: content/insurance/pages.toml. These pages stay noindex, out of the sitemap, and unlinked from live pages until he
says otherwise; publishing is launch. Cards, in a fixed order, never a table: phones come first."""
import datetime, html, json, pathlib, re, tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA, COPY = ROOT / "content/insurance/coverage-2026-11.toml", ROOT / "content/insurance/pages.toml"
ROBOTS = '<meta name="robots" content="noindex">\n'
CSS = ["/assets/insurance.css"]
JS = ["/assets/insurance.js"]   # opens the card details at 768 px and up; with no script the details still open on tap
# A shape for every label, so the meaning never rests on color. Text always says it too.
ICON = {
    "conditions": '<path d="M5 13l4 4 7-9"/><path d="M19 17h.01"/>', "covered": '<path d="M5 13l4 4 10-11"/>',
    "not_covered": '<path d="M6 6l12 12M18 6L6 18"/>', "no_policy": '<path d="M6 12h12"/>',
    "case_by_case": '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', "not_checked": '<circle cx="12" cy="12" r="8" stroke-dasharray="3 4"/>'}


def e(s):
    return html.escape(s, quote=True)


def load():
    with open(DATA, "rb") as a, open(COPY, "rb") as b:
        return tomllib.load(a), tomllib.load(b)


def long_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def chip(kind, copy):
    return (f'<span class="ins-chip ins-{kind}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[kind]}</svg>{e(copy["chips"][kind])}</span>')


def policy_line(cell, data):
    p = data["policies"][cell["policy"]]
    bits = [f'Checked {long_date(cell["checked"])}', f'<a href="{e(p["link"])}" rel="noopener">{e(p["name"])}</a>']
    if p["dated"]:
        bits.append(e(p["dated"]))
    if cell.get("notice"):
        bits.append(f'<a href="{e(data["notice_url"])}" rel="noopener">{e(data["notice_label"])}</a>')
    return " · ".join(bits)


def split_lead(text):
    """(first sentence, the rest): the first sentence is the card's visible line on phones, except the cards in
    full_summary (pages.toml), whose whole text stays visible because the first sentence misleads alone. Nothing is reworded."""
    m = re.match(r"(.+?[.!?])\s+(?=[A-Z])(.*)$", text, re.S)
    return (m.group(1), m.group(2)) if m else (text, "")


def card(key, proc, data, copy, fold=True):
    """A card. fold=True (the three coverage pages, phone-length job 0008): the chip and first sentence are the summary
    of a native <details>; all text stays in the HTML. fold=False: the hub's HAE cards, unchanged (folding the hub is his open call)."""
    c = data["cells"][proc][key]
    items = f'<ul>{"".join(f"<li>{e(i)}</li>" for i in c["items"])}</ul>' if c.get("items") else ""
    meta = f'<p class="ins-meta">{policy_line(c, data)}</p>'
    head = f'<article class="card ins-card" id="{proc}-{key}"><h3>{e(data["names"][key])}</h3>'
    if not fold:
        return f'{head}{chip(c["chip"], copy)}<p>{e(c["text"])}</p>{items}{meta}</article>'
    lead, rest = (c["text"], "") if f"{proc}-{key}" in copy["full_summary"] else split_lead(c["text"])   # see pages.toml
    more = f"<p>{e(rest)}</p>" if rest else ""
    return (f'{head}<details class="ins-more"><summary>{chip(c["chip"], copy)}<span class="ins-lead">{e(lead)}</span></summary>'
            f'{more}{items}{meta}</details></article>')


def jump(p, data, copy):
    """Top of the coverage pages: tap your insurer, go to its card. Plain links in the cards' fixed order; no script."""
    links = "".join(f'<li><a href="#{p["key"]}-{i}">{e(copy["jump_names"].get(i, data["names"][i]))}</a></li>' for i in data["insurers"])
    return (f'<nav class="ins-jump" aria-labelledby="ins-jump-label"><p id="ins-jump-label">{e(copy["jump_label"])}</p><ul>{links}</ul>'
            f'<p class="ins-jump-no"><a href="#if-no">What if my insurer says no?</a></p></nav>')


def legend(kinds, copy):
    rows = "".join(f'<div><dt>{chip(k, copy)}</dt><dd>{e(copy["legend"][k])}</dd></div>' for k in copy["chips"] if k in kinds)
    return f'<dl class="ins-legend">{rows}</dl>'


def header_notice(copy):
    return f'<div class="notice ins-notice"><p><strong>{e(copy["plan_line"])}</strong></p><p>{e(copy["advice_line"])}</p></div>'


def says_no(copy):
    """The shared section. Returns (html, references html): citations number in order of first use."""
    order, out = [], []
    def num(m):
        k = m.group(1)
        if k not in order:
            order.append(k)
        n = order.index(k) + 1
        return f'<sup class="ref"><a href="#ref-{n}" aria-label="Source {n}">{n}</a></sup>'
    for s in copy["says_no"]["steps"]:
        text = re.sub(r"\{ref:([a-z0-9]+)\}", num, s["text"])   # the only inline markup is a trusted link in pages.toml
        out.append(f'<h3>{e(s["heading"])}</h3><p>{text}</p>')
    refs = "".join(f'<li id="ref-{i}">{e(copy["sources"][k]["cite"])} <a href="{e(copy["sources"][k]["url"])}" rel="noopener">{e(copy["sources"][k]["url"])}</a></li>'
                   for i, k in enumerate(order, 1))
    unused = set(copy["sources"]) - set(order)
    if unused:
        raise ValueError(f"insurance: sources listed but never cited: {sorted(unused)}")
    return (f'<h2 id="if-no">What if my insurer says no?</h2><p>{e(copy["says_no"]["intro"])}</p>' + "".join(out),
            f'<details class="ins-sources"><summary><h2 id="sources">Sources ({len(order)})</h2></summary><ol class="refs">{refs}</ol></details>')


def crumbs(items):
    lis = "".join(f'<li><a href="{u}">{e(n)}</a></li>' if u else f'<li aria-current="page">{e(n)}</li>' for n, u in items)
    return f'<nav class="crumbs" id="top" aria-label="Breadcrumb"><ol>{lis}</ol></nav>'


def reviewed(copy):
    return f'<p class="small muted">Page last reviewed {long_date(copy["reviewed"])}.</p>'


def procedure_body(p, data, copy):
    cards = "".join(card(k, p["key"], data, copy) for k in data["insurers"])
    kinds = {data["cells"][p["key"]][k]["chip"] for k in data["insurers"]}
    no, refs = says_no(copy)
    asks = "".join(f'<li>{e(a["text"])}</li>' for a in copy["asks"])
    return (crumbs([("Home", "/"), (p["condition"], f'/{p["slug"]}/'), ("Insurance coverage", None)]) +
            f'<h1>{e(p["h1"])}</h1><p class="lede">{e(p["answer"])}</p>{header_notice(copy)}{jump(p, data, copy)}'
            f'<h2 id="by-insurer">Coverage by insurer</h2>{legend(kinds, copy)}<div class="ins-cards">{cards}</div>'
            f'<h2 id="ask">Questions to ask your plan</h2><ul>{asks}</ul>{no}'
            f'<h2 id="next">Next steps</h2><ul class="ins-links"><li><a href="/{p["slug"]}/">{e(p["guide"])}</a></li>'
            f'<li><a href="/{p["slug"]}/every-option/">{e(p["compare"])}</a></li><li><a href="/{p["slug"]}/#finder">{e(p["finder"])}</a></li>'
            f'<li><a href="/insurance/">See every procedure and how we checked</a></li></ul>{refs}{reviewed(copy)}')


def hub_row(i, proc, label, href, data, copy):
    c = data["cells"][proc][i]
    p = data["policies"][c["policy"]]
    what = "Policy list" if c["chip"] == "no_policy" and not p["dated"] else "Policy"
    short = f'<span class="ins-meta">{e(c["short"])}</span>' if c.get("short") else ""   # no bare "Covered": its condition sits beside it
    return (f'<div class="ins-row"><dt><a href="{href}">{e(label)}</a></dt><dd>{chip(c["chip"], copy)}{short}'
            f'<span class="ins-meta"><a href="{e(p["link"])}" rel="noopener" aria-label="{e(data["names"][i])} {what.lower()} for {e(label)}">{what}</a> · Checked {long_date(c["checked"])}</span></dd></div>')


def hub_body(data, copy):
    hub, pages = copy["hub"], copy["pages"]
    rows = []
    for i in data["insurers"]:
        r = "".join(hub_row(i, p["key"], p["hub_label"], f'/{p["slug"]}/insurance/#{p["key"]}-{i}', data, copy) for p in pages)
        r += hub_row(i, "hae", hub["hae_label"], f"#hae-{i}", data, copy)
        note = f'<p class="ins-meta">{e(data["hub_notes"][i])}</p>' if i in data["hub_notes"] else ""
        rows.append(f'<section class="card ins-hub-card"><h3>{e(data["names"][i])}</h3>{note}<dl>{r}</dl></section>')
    kinds = {data["cells"][k][i]["chip"] for k in data["cells"] for i in data["insurers"]}
    links = "".join(f'<li><a href="/{p["slug"]}/insurance/">{e(p["hub_label"])}: coverage by insurer, with conditions</a></li>' for p in pages)
    notice = f'<a href="{e(data["notice_url"])}" rel="noopener">{e(data["notice_label"])}</a>'
    changes = "".join(f'<li>{e(c).replace("{notice}", notice)}</li>' for c in hub["changes"])
    method = "".join(f"<p>{e(m)}</p>" for m in hub["method"])
    asks = "".join(f'<li>{e(a["text"])}</li>' for a in copy["asks"])
    hae = "".join(card(i, "hae", data, copy, fold=False) for i in data["insurers"])
    return (crumbs([("Home", "/"), ("Insurance coverage", None)]) + f'<h1>{e(hub["h1"])}</h1><p class="lede">{e(hub["answer"])}</p>{header_notice(copy)}'
            f'<h2 id="changes">Changes coming soon</h2><ul>{changes}</ul>'
            f'<h2 id="by-procedure">Coverage by procedure</h2><ul class="ins-links">{links}<li><a href="#hae">{e(hub["hae_label"])}: coverage by insurer, with conditions</a></li></ul>'
            f'<h2 id="dataset">Every insurer, every procedure</h2>{legend(kinds, copy)}<div class="ins-hub">{"".join(rows)}</div>'
            f'<h2 id="hae">Hemorrhoid embolization (HAE) by insurer</h2><div class="ins-cards">{hae}</div>'
            f'<h2 id="ask">Questions to ask your plan</h2><ul>{asks}</ul>'
            f'<h2 id="method">How we checked</h2>{method}<p><strong>Next check:</strong> {e(data["next_check"])}.</p>{reviewed(copy)}')


def ld(d):
    return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False).replace("</", "<\\/") + "</script>"


def breadcrumb(origin, crumbs_):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i, "name": n, "item": origin + u} for i, (n, u) in enumerate(crumbs_, 1)]}


def org(origin):
    return {"@type": "Organization", "@id": origin + "/#organization", "name": "Every Option", "url": origin + "/"}


def procedure_schema(p, copy, origin):
    path = f'/{p["slug"]}/insurance/'
    page = {"@context": "https://schema.org", "@type": "MedicalWebPage", "name": p["h1"], "headline": p["h1"], "description": p["description"],
            "url": origin + path, "inLanguage": "en-US", "lastReviewed": copy["reviewed"], "audience": {"@type": "Patient"}, "publisher": org(origin)}
    return ld(page) + "\n" + ld(breadcrumb(origin, [("Home", "/"), (p["condition"], f'/{p["slug"]}/'), ("Insurance coverage", path)]))


def hub_schema(data, copy, origin):
    hub = copy["hub"]
    ds = {"@context": "https://schema.org", "@type": "Dataset", "name": hub["dataset_name"], "description": hub["dataset_description"],
          "url": origin + "/insurance/", "dateModified": copy["reviewed"], "temporalCoverage": f'{data["checked_from"]}/{data["checked_to"]}',
          "isAccessibleForFree": True, "inLanguage": "en-US", "creator": org(origin), "publisher": org(origin),
          "variableMeasured": ["Insurer", "Procedure", "Coverage status", "Coverage conditions", "Policy link", "Date checked"]}
    return ld(ds) + "\n" + ld(breadcrumb(origin, [("Home", "/"), ("Insurance coverage", "/insurance/")]))


def write_all(page, write, origin):
    data, copy = load()
    for p in copy["pages"]:
        path = f'/{p["slug"]}/insurance/'
        write(f'{p["slug"]}/insurance/index.html',
              page(path, p["title"], p["description"], procedure_body(p, data, copy), css=CSS, scripts=JS, head=ROBOTS + procedure_schema(p, copy, origin),
                   cls=f'prose-page insurance-page t-{p["color"]}'))
    write("insurance/index.html", page("/insurance/", copy["hub"]["title"], copy["hub"]["description"], hub_body(data, copy), css=CSS,
                                       head=ROBOTS + hub_schema(data, copy, origin), cls="prose-page insurance-page"))
