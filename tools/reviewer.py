"""The one home for the medical reviewer line and the reviewer's structured data.

His words, ai-hq HQ chat 2026-11-19 (06:06 CT "Do 1 first. But let's figure out the exact phrasing"; 07:20 CT "Yes" to
building it under the title on the dev site). Wording draft: goswami-hq/ai-hq
projects/platform/marketing/reviewer-line-wording-2026-11-19.md. Condition pages (simple and in-depth) carry the line right
under the H1; the date is the page's `reviewed` field, the day he signed that page off, changed only when he reviews it again.
"""
import datetime
import html

NAME = "Abhishek Goswami"
DEGREE = "MD"
SPECIALTY = "interventional radiology"
TITLE = "Founder and Medical Director"
CONTACT = "accounts@everyoptionmd.com"   # the site's general contact (terms); his blurb, HQ chat 2026-11-19 08:54 CT
ANCHOR = "/about/#abhishek-goswami"   # his own entry under "Our reviewers"; the section is /about/#reviewers


def long_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def line(iso):
    """One small line under the H1: "Medically reviewed by <name, MD>, interventional radiology · <date>"."""
    who = f'<a href="{ANCHOR}">{html.escape(NAME)}, {DEGREE}</a>'
    return (f'<p class="reviewed-by small muted">Medically reviewed by {who}, {SPECIALTY} '
            f'<span aria-hidden="true">·</span> <time datetime="{html.escape(iso)}">{long_date(iso)}</time></p>')


def person(origin):
    """schema.org Person matching the visible line (a Physician type describes a practice, so Person with credentials)."""
    return {"@type": "Person", "@id": origin + ANCHOR, "name": NAME, "honorificSuffix": DEGREE, "jobTitle": TITLE,
            "knowsAbout": "Interventional radiology", "url": origin + ANCHOR,
            "alumniOf": [{"@type": "CollegeOrUniversity", "name": school} for _, school, _ in TRAINING],
            "worksFor": {"@id": origin + "/#organization"}}


# (label, school, field); his wording, HQ chat 2026-11-19 08:53 CT
TRAINING = [("Medical school", "Emory University", ""),
            ("Residency", "University of Chicago", "Radiology"),
            ("Fellowship", "Northwestern University", "Interventional Radiology")]


def about_section():
    """The reviewer section on the About page, the target of every line's link. Wording from his notes, HQ chat 2026-11-19
    08:35 CT: a physician reviews against current medical research; checked against sources before publishing and at every
    revision; an "Our reviewers" list with him as the only reviewer for now; each training line on its own line."""
    training = "".join(f"<li>{html.escape(label)}: {html.escape(school)}" + (f" ({html.escape(field)})" if field else "") + "</li>"
                       for label, school, field in TRAINING)
    return f"""<h2 id="reviewers">Who reviews the condition pages</h2>
<p>A physician reviews every condition page against current medical research. We check each page against its sources before we publish it and again at every revision.</p>
<h3>Our reviewers</h3>
<div class="reviewer" id="abhishek-goswami">
<p class="reviewer-name"><strong>{html.escape(NAME)}, {DEGREE}</strong><br>{TITLE}</p>
<ul class="reviewer-training">{training}</ul>
</div>
<p>Interested in being a reviewer? Reach out to us at <a href="mailto:{CONTACT}?subject=Reviewer">{CONTACT}</a>.</p>"""
