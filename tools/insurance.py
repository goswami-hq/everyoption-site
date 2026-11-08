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


def card(key, proc, data, copy):
    c = data["cells"][proc][key]
    items = f'<ul>{"".join(f"<li>{e(i)}</li>" for i in c["items"])}</ul>' if c.get("items") else ""
    return (f'<article class="card ins-card" id="{proc}-{key}"><h3>{e(data["names"][key])}</h3>{chip(c["chip"], copy)}'
            f'<p>{e(c["text"])}</p>{items}<p class="ins-meta">{policy_line(c, data)}</p></article>')


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
            f'<h2 id="sources">Sources</h2><ol class="refs">{refs}</ol>')


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
            f'<h1>{e(p["h1"])}</h1><p class="lede">{e(p["answer"])}</p>{header_notice(copy)}'
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
    hae = "".join(card(i, "hae", data, copy) for i in data["insurers"])
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
              page(path, p["title"], p["description"], procedure_body(p, data, copy), css=CSS, head=ROBOTS + procedure_schema(p, copy, origin),
                   cls=f'prose-page insurance-page t-{p["color"]}'))
    write("insurance/index.html", page("/insurance/", copy["hub"]["title"], copy["hub"]["description"], hub_body(data, copy), css=CSS,
                                       head=ROBOTS + hub_schema(data, copy, origin), cls="prose-page insurance-page"))
