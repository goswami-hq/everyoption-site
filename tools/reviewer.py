"""The one home for the medical reviewer line and the reviewer's structured data.

His words, ai-hq HQ chat 2026-11-19 (06:06 CT "Do 1 first. But let's figure out the exact phrasing"; 07:20 CT "Yes" to
building it under the title on the dev site). Wording draft: goswami-hq/ai-hq
projects/platform/marketing/reviewer-line-wording-2026-11-19.md. Condition pages (simple and in-depth) carry the line right
under the H1; the date is the page's `reviewed` field, the day he signed that page off, changed only when he reviews it again.
"""
import datetime
import html

# REVIEWERS is the one list of physician reviewers: the About page's "Our reviewers" and the press page's "Our team"
# (ai-hq job platform-web-design-0020, his yes 2026-11-26) both read it, so a new reviewer is added here once and shows on
# both. Each entry: name, degree, specialty, title (shown as "<title> at Every Option"), anchor id on /about/, training.
# The first entry is the reviewer named on the condition pages' "Reviewed by" line and in their structured data.
REVIEWERS = [
    {"name": "Abhishek Goswami", "degree": "MD", "specialty": "interventional radiology",
     "title": "Founder and Medical Director", "id": "abhishek-goswami",
     # (label, school, field); his wording, HQ chat 2026-11-19 08:53 CT
     "training": [("Medical school", "Emory University", ""),
                  ("Residency", "University of Chicago", "Radiology"),
                  ("Fellowship", "Northwestern University", "Interventional Radiology")]},
]
LEAD = REVIEWERS[0]
NAME = LEAD["name"]
DEGREE = LEAD["degree"]
SPECIALTY = LEAD["specialty"]
TITLE = LEAD["title"]
CONTACT = "accounts@everyoptionmd.com"   # the site's general contact (terms); his blurb, HQ chat 2026-11-19 08:54 CT
SECTION = "/about/#reviewers"
ANCHOR = "/about/#" + LEAD["id"]   # his own entry under "Our reviewers"; the section is /about/#reviewers


def long_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def line(iso):
    """One small line under the H1: "Reviewed by <name, MD>, interventional radiology · <date>"."""
    # "Reviewed by", not "Medically reviewed by": his choice, HQ chat 2026-11-19 09:00 CT ("less presumptuous to other physicians")
    who = f'<a href="{ANCHOR}">{html.escape(NAME)}, {DEGREE}</a>'
    return (f'<p class="reviewed-by small muted">Reviewed by {who}, {SPECIALTY} '
            f'<span aria-hidden="true">·</span> <time datetime="{html.escape(iso)}">{long_date(iso)}</time></p>')


def person(origin):
    """schema.org Person matching the visible line (a Physician type describes a practice, so Person with credentials)."""
    return {"@type": "Person", "@id": origin + ANCHOR, "name": NAME, "honorificSuffix": DEGREE, "jobTitle": TITLE,
            "knowsAbout": "Interventional radiology", "url": origin + ANCHOR,
            "alumniOf": [{"@type": "CollegeOrUniversity", "name": school} for _, school, _ in TRAINING],
            "worksFor": {"@id": origin + "/#organization"}}


TRAINING = LEAD["training"]


def about_section():
    """The reviewer section on the About page, the target of every line's link. Wording from his notes, HQ chat 2026-11-19
    08:35 CT: a physician reviews against current medical research; checked against sources before publishing and at every
    revision; an "Our reviewers" list (REVIEWERS, him as the only reviewer for now); each training line on its own line."""
    def entry(r):
        training = "".join(f"<li>{html.escape(label)}: {html.escape(school)}" + (f" ({html.escape(field)})" if field else "") + "</li>"
                           for label, school, field in r["training"])
        return f"""<div class="reviewer" id="{html.escape(r['id'])}">
<p class="reviewer-name"><strong>{html.escape(r['name'])}, {html.escape(r['degree'])}</strong><br>{html.escape(r['title'])} at Every Option</p>
<ul class="reviewer-training">{training}</ul>
</div>"""
    return f"""<h2 id="reviewers">Who reviews the condition pages</h2>
<p>A physician reviews every condition page against current medical research. We check each page against its sources before we publish it and again at every revision.</p>
<h3>Our reviewers</h3>
{chr(10).join(entry(r) for r in REVIEWERS)}
<p>Interested in being a reviewer? Reach out to us at <a href="mailto:{CONTACT}?subject=Reviewer">{CONTACT}</a>.</p>"""


def team_items():
    """The press page's "Our team" list, one <li> per reviewer: "<name>, <degree>, <specialty>. <title> at Every Option."
    (his approved press wording, draft 2, 2026-11-26)."""
    return "".join(f"<li>{html.escape(r['name'])}, {html.escape(r['degree'])}, {html.escape(r['specialty'])}. "
                   f"{html.escape(r['title'])} at Every Option.</li>" for r in REVIEWERS)
