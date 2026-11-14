"""The three legal pages (ai-hq job platform-launch-0005, to-do W32; his words 2026-11-13 18:53 CT: "Terms and privacy
policy etc / Let's build the site pop up thing and footer and whatever else we need to for those").

The texts in content/legal/ are his signed-off bodies, word for word (ai-hq projects/platform/legal/visitor-terms-draft.md
draft 2, projects/platform/accounts/privacy-policy-draft.md draft 4, projects/platform/accounts/terms-of-service-draft.md
draft 4, all signed off 2026-11-13). Never edit a sentence here: change the signed-off text in ai-hq first, on his word.

The markdown is the small subset those texts use: one "# " title (the page H1), "## " headings, paragraphs, **bold**.
EFFECTIVE is the page's "Effective" line: November 13, 2026, the publication date on his word (2026-11-13 22:52 CT: "Just
make the date of publication today / Even if the site goes live later, that's fine"); TERMS_VERSION in lib/accounts/service.mjs
is the same date. It is no longer set at launch.
"""
import html, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EFFECTIVE = "Effective November 13, 2026"
# address -> (content file, <title>, meta description); the footer's labels are in FOOTER_LINKS
PAGES = {
    "/terms/": ("terms.md", "Terms of use | Every Option",
                "The terms for using Every Option: education only, not medical advice, and no doctor-patient relationship. "
                "How the doctor finder works and its limits."),
    "/privacy/": ("privacy.md", "Privacy policy | Every Option",
                  "What information Every Option handles and why, for people reading the site, people who send a report, "
                  "and physicians who make an account."),
    "/physician-terms/": ("physician-terms.md", "Physician terms | Every Option",
                          "The terms for physician accounts on Every Option: who may have an account, what you attest, "
                          "what you add, and what we do."),
}
# The footer line on every page (his label 2026-11-13 18:58 CT: "Physician terms").
FOOTER_LINKS = [("/terms/", "Terms of use"), ("/privacy/", "Privacy"), ("/physician-terms/", "Physician terms")]
# W32: one line directly under every "Find doctors" button (his text, 2026-11-13); tools/build.py and tools/options.py.
FINDER_TERMS = '<p class="small muted find-terms">By searching you agree to our <a href="/terms/">Terms</a>.</p>'
EMAIL = re.compile(r"\b([a-z]+@everyoptionmd\.com)\b")


def footer_line():
    return '<p class="legal-links">' + " · ".join(f'<a href="{h}">{t}</a>' for h, t in FOOTER_LINKS) + "</p>"


def text(path):
    with open(os.path.join(ROOT, "content", "legal", PAGES[path][0]), encoding="utf-8") as fh:
        return fh.read()


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return EMAIL.sub(r'<a href="mailto:\1">\1</a>', s)


def anchor(heading):
    m = re.match(r"(\d+)\.", heading)
    return "s" + m.group(1) if m else re.sub(r"[^a-z0-9]+", "-", heading.lower()).strip("-")


def body(path):
    """The page body: H1 (the text's own title), the Effective line, then the text as written."""
    out, h1 = [], None
    for block in re.split(r"\n\s*\n", text(path).strip()):
        block = " ".join(l.strip() for l in block.strip().split("\n"))
        if block.startswith("# "):
            if h1 is not None:
                raise SystemExit(f"{path}: more than one title")
            h1 = block[2:].strip()
            out.append(f"<h1>{inline(h1)}</h1>\n<p class=\"small muted legal-effective\">{EFFECTIVE}</p>")
        elif block.startswith("## "):
            h = block[3:].strip()
            out.append(f'<h2 id="{anchor(h)}">{inline(h)}</h2>')
        elif block.startswith("#"):
            raise SystemExit(f"{path}: heading level not handled: {block[:40]}")
        else:
            out.append(f"<p>{inline(block)}</p>")
    if h1 is None:
        raise SystemExit(f"{path}: no title")
    return '<div class="prose legal">\n' + "\n".join(out) + "\n</div>"


def write_all(page, write):
    for path, (_, title, desc) in PAGES.items():
        write(path.strip("/") + "/index.html", page(path, title, desc, body(path)))
