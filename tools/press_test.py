"""Press page (ai-hq job platform-web-design-0020, his yes 2026-11-26): the lists come from the site's data, the footer
links to it on every page, and the sitemap names it.
  python3 tools/press_test.py     (after python3 tools/build.py)
Rules, not counts: a new condition or reviewer must show here with no edit to the page or to this test.
"""
import html, pathlib, re, sys, unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import reviewer  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"


def read(p):
    return (SITE / p).read_text(encoding="utf-8")


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


class SharedReviewers(unittest.TestCase):
    """About's "Our reviewers" and the press page's "Our team" read one list (reviewer.REVIEWERS)."""

    def test_a_new_reviewer_shows_on_both(self):
        extra = {"name": "Test Person", "degree": "DO", "specialty": "vascular surgery", "title": "Physician Reviewer",
                 "id": "test-person", "training": [("Residency", "Test University", "Surgery")]}
        reviewer.REVIEWERS.append(extra)
        try:
            about, team = reviewer.about_section(), reviewer.team_items()
        finally:
            reviewer.REVIEWERS.remove(extra)
        self.assertIn('id="test-person"', about)
        self.assertIn("Physician Reviewer at Every Option", about)
        self.assertIn("<li>Test Person, DO, vascular surgery. Physician Reviewer at Every Option.</li>", team)
        for r in reviewer.REVIEWERS:
            self.assertIn(f'id="{r["id"]}"', about)
            self.assertIn(f"{r['name']}, {r['degree']}, {r['specialty']}.", team)

    def test_reviewed_by_line_links_to_an_about_entry(self):
        self.assertEqual(reviewer.ANCHOR, "/about/#" + reviewer.REVIEWERS[0]["id"])
        self.assertIn(f'id="{reviewer.REVIEWERS[0]["id"]}"', read("about/index.html"))


class BuiltPage(unittest.TestCase):
    def setUp(self):
        self.press = read("press/index.html")

    def test_title_and_description(self):
        self.assertIn("<title>Press | Every Option</title>", self.press)
        desc = re.search(r'<meta name="description" content="([^"]*)">', self.press).group(1)
        first = text(re.search(r"<h2>About Every Option</h2>\s*<p>(.*?)</p>", self.press, re.S).group(1))
        self.assertTrue(first.startswith(html.unescape(desc)), "description is the first About sentence")
        self.assertTrue(html.unescape(desc).endswith("."))

    def test_conditions_match_the_conditions_page(self):
        cards = [text(h) for h in re.findall(r'<li class="cond-card[^"]*"><h2>(.*?)</h2>', read("conditions/index.html"))]
        block = re.search(r"<h2>Conditions we cover</h2>\s*<ul>(.*?)</ul>", self.press, re.S).group(1)
        self.assertTrue(cards)
        self.assertEqual([text(li) for li in re.findall(r"<li>(.*?)</li>", block)], cards)

    def test_team_matches_about_reviewers(self):
        names = [text(n) for n in re.findall(r'<p class="reviewer-name"><strong>(.*?)</strong>', read("about/index.html"))]
        team = re.search(r'<ul class="team">(.*?)</ul>', self.press, re.S).group(1)
        items = [text(li) for li in re.findall(r"<li>(.*?)</li>", team)]
        self.assertTrue(names)
        self.assertEqual(len(items), len(names))
        for n, li in zip(names, items):
            self.assertTrue(li.startswith(n + ", "), (n, li))

    def test_links(self):
        for href in ('href="/conditions/"', 'href="/insurance/"', 'href="/about/#reviewers"',
                     'href="https://www.sirweb.org/patients/"', 'href="mailto:hello@everyoptionmd.com"'):
            self.assertIn(href, self.press)
        self.assertIn('id="reviewers"', read("about/index.html"))
        self.assertEqual(self.press.count("<h1>"), 1)

    def test_footer_links_press_beside_about_everywhere(self):
        pages = [p for p in SITE.rglob("*.html") if '<footer class="site">' in p.read_text(encoding="utf-8")]
        self.assertTrue(pages)
        for p in pages:
            self.assertIn('<a href="/about/">About</a> · <a href="/press/">Press</a>', p.read_text(encoding="utf-8"), str(p))
        for shell in ("lib/directory-shell.mjs",):
            self.assertIn('<a href=\\"/press/\\">Press</a>', (ROOT / shell).read_text(encoding="utf-8"), shell)

    def test_menu_unchanged(self):
        nav = re.search(r'<nav class="top"[^>]*>(.*?)</nav>', self.press, re.S).group(1)
        self.assertNotIn("/press/", nav)

    def test_sitemap(self):
        self.assertIn("<loc>https://everyoptionmd.com/press/</loc>", read("sitemap-pages.xml"))


if __name__ == "__main__":
    unittest.main()
