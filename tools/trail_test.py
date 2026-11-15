"""Fix B (his yes, 2026-11-15): every built page but the home page and the moved stubs shows the trail at the top, it
starts at Home, ends on the page itself, and a condition's word in it is that condition's registry label.
  python3 tools/trail_test.py     (after python3 tools/build.py)
"""
import pathlib, re, sys, unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import registry  # noqa: E402

SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
TRAIL = re.compile(r'<nav class="crumbs"[^>]*aria-label="Breadcrumb"><ol>(.*?)</ol></nav>', re.S)


def pages():
    for f in sorted(SITE.rglob("index.html")) + [SITE / "404.html"]:
        rel = "/" + str(f.relative_to(SITE).parent).replace(".", "").strip("/")
        rel = (rel.rstrip("/") + "/") if f.name == "index.html" else "/404"
        yield rel.replace("//", "/"), f.read_text(encoding="utf-8")


class Trail(unittest.TestCase):
    def test_every_page_but_home(self):
        seen = 0
        for path, t in pages():
            if path == "/" or "This page moved" in t:
                continue
            seen += 1
            m = TRAIL.search(t.split('<main id="main">', 1)[-1])
            self.assertTrue(m, f"{path}: no trail")
            items = re.findall(r"<li>(.*?)</li>", m.group(1))
            self.assertIn('<a href="/">Home</a>', items[0], path)
            self.assertIn('aria-current="page"', items[-1], path)
            self.assertEqual(sum('aria-current="page"' in x for x in items), 1, path)
            slug = path.strip("/").split("/")[0]
            if slug in registry.BY_SLUG and len(items) > 1:
                word = re.sub(r"<[^>]+>", "", items[1])
                self.assertEqual(word, registry.BY_SLUG[slug]["label"], f"{path}: condition word")
            # the trail is the first thing in the page's main column
            body = t.split('<main id="main"><div class="wrap">', 1)[-1].lstrip()
            self.assertTrue(body.startswith('<nav class="crumbs"'), f"{path}: something sits above the trail")
        self.assertGreater(seen, 40)


if __name__ == "__main__":
    unittest.main()
