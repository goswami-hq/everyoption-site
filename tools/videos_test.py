"""Videos (ai-hq job platform-web-design-0019): the list's rules, the test entry's guard, and the built pages.
  python3 tools/videos_test.py     (after python3 tools/build.py)
"""
import os, pathlib, re, sys, tempfile, unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import videos  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
SLUGS = {"fibroids", "knee-arthritis"}

ENTRY = '''[[video]]
key = "{key}"
title = "A film"
description = "One line."
condition = "{cond}"
order = {order}
youtube_id = "{yt}"
upload_date = "{date}"
seconds = 95
aspect = "9:16"
still = "video-brand-film"
still_alt = "A still."
transcript = "brand-film.txt"
page = "/about/"
{extra}
'''


def toml(*entries):
    f = tempfile.NamedTemporaryFile("w", suffix=".toml", delete=False)
    f.write("".join(ENTRY.format(**{"key": "a", "cond": "about", "order": 1, "yt": "", "date": "", "extra": "", **e}) for e in entries))
    f.close()
    return f.name


class ListRules(unittest.TestCase):
    def test_test_entry_refused_on_release(self):
        p = toml(dict(key="t", yt=videos.TEST_ID, date="2026-11-16", extra="test_only = true"))
        videos.load(p, release=False, slugs=SLUGS)
        with self.assertRaises(SystemExit) as c:
            videos.load(p, release=True, slugs=SLUGS)
        self.assertIn("test_only entry on a release build", str(c.exception))

    def test_release_mode_from_env(self):
        old = os.environ.get("EO_RELEASE")
        os.environ["EO_RELEASE"] = "1"
        try:
            self.assertTrue(videos.release_mode())
        finally:
            os.environ.pop("EO_RELEASE") if old is None else os.environ.__setitem__("EO_RELEASE", old)

    def test_test_id_only_for_test_entries(self):
        with self.assertRaises(SystemExit):
            videos.load(toml(dict(yt=videos.TEST_ID, date="2026-11-16")), release=False, slugs=SLUGS)
        with self.assertRaises(SystemExit):
            videos.load(toml(dict(yt="abcdefghijk", date="2026-11-16", extra="test_only = true")), release=False, slugs=SLUGS)

    def test_bad_id_condition_and_date(self):
        for e in (dict(yt="short", date="2026-11-16"), dict(cond="nope"), dict(yt="abcdefghijk", date="")):
            with self.assertRaises(SystemExit):
                videos.load(toml(e), release=False, slugs=SLUGS)

    def test_no_id_never_shows(self):
        rows = videos.load(toml(dict(key="a"), dict(key="b", cond="fibroids")), release=False, slugs=SLUGS)
        self.assertEqual(videos.shown(rows), [])
        band = videos.home_band(rows)
        self.assertIn("watch-compact", band)
        self.assertNotIn("vid-play", band)
        self.assertEqual(band.count('class="chan"'), 4)

    def test_order_brand_first_then_playlist(self):
        rows = videos.load(toml(dict(key="k2", cond="knee-arthritis", order=2, yt="bbbbbbbbbbb", date="2026-11-16"),
                                dict(key="k1", cond="knee-arthritis", order=1, yt="ccccccccccc", date="2026-11-16"),
                                dict(key="f", cond="fibroids", yt="ddddddddddd", date="2026-11-16"),
                                dict(key="b", yt="aaaaaaaaaaa", date="2026-11-16")), release=False, slugs=SLUGS)
        self.assertEqual([v["key"] for v in videos.shown(rows)], ["b", "f", "k1", "k2"])
        self.assertIn('class="watch"', videos.home_band(rows))

    def test_film_loads_nothing_from_youtube(self):
        rows = videos.load(toml(dict(yt="aaaaaaaaaaa", date="2026-11-16")), release=False, slugs=SLUGS)
        h = videos.film(rows[0])
        self.assertNotIn("<iframe", h)
        self.assertEqual(re.findall(r'src="([^"]+)"', h), ["/assets/media/video-brand-film-540.jpg"])
        self.assertIn('aria-label="Play the film: A film (1 minute 35 seconds)"', h)
        self.assertIn("<details", h)

    def test_schema(self):
        rows = videos.load(toml(dict(yt="aaaaaaaaaaa", date="2026-11-16")), release=False, slugs=SLUGS)
        s = videos.schema(rows)
        for k in ('"@type": "VideoObject"', '"duration": "PT1M35S"', '"uploadDate": "2026-11-16"',
                  '"embedUrl": "https://www.youtube-nocookie.com/embed/aaaaaaaaaaa"', '"thumbnailUrl"', '"transcript"'):
            self.assertIn(k, s)

    def test_length(self):
        self.assertEqual(videos.length(31), "31 seconds")
        self.assertEqual(videos.length(60), "1 minute")
        self.assertEqual(videos.length(150), "2 minutes 30 seconds")


class Built(unittest.TestCase):
    """The build as it stands: the menu item and page exist only with a shown film; header icons on every page."""

    def setUp(self):
        self.rows = videos.load()
        self.home = (SITE / "index.html").read_text(encoding="utf-8")

    def test_page_and_menu_follow_the_list(self):
        on = bool(videos.shown(self.rows))
        self.assertEqual((SITE / "videos" / "index.html").exists(), on)
        self.assertEqual('href="/videos/"' in re.search(r'<nav class="top".*?</nav>', self.home, re.S).group(0), on)
        headers = (SITE / "_headers").read_text(encoding="utf-8")
        self.assertEqual(videos.FRAME_SRC in headers, on)

    def test_header_icons_named(self):
        for n in ("YouTube", "TikTok", "Instagram", "X"):
            self.assertIn(f'aria-label="Every Option on {n}"', self.home)

    def test_organization_sameas_unchanged(self):
        same = re.search(r'"sameAs": \[(.*?)\]', self.home).group(1)
        self.assertEqual(same.count("http"), 4)

    def test_footer_line_kept(self):
        self.assertIn('<p id="follow" class="follow"><strong>Follow Every Option:</strong>', self.home)

    def test_no_test_entry_in_sitemap(self):
        self.assertEqual("/videos/" in (SITE / "sitemap-pages.xml").read_text(encoding="utf-8"), bool(videos.real(self.rows)))


if __name__ == "__main__":
    unittest.main()
