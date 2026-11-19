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
ANCHOR = "/about/#reviewer"


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
            "worksFor": {"@id": origin + "/#organization"}}


def about_section():
    """The reviewer section on the About page, the target of every line's link. New patient-facing text: on the dev site
    for his sign-off; naming the training programs is his call (open question in the wording draft)."""
    return f"""<h2 id="reviewer">Who reviews the condition pages</h2>
<p><strong>{html.escape(NAME)}, {DEGREE}</strong>, {TITLE}, Every Option.</p>
<p>Medical school at Emory University. Radiology residency at the University of Chicago. Interventional radiology fellowship at Northwestern University.</p>
<p>He checks each condition page against its sources before it goes live, and again when it changes.</p>"""
