#!/usr/bin/env python3
"""tools/pattern.py fails on the breaks it exists for (run after a build): python3 tools/pattern_test.py"""
import pathlib, shutil, sys, tempfile, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import condition, pattern

SITE = pattern.SITE


class PatternTest(unittest.TestCase):
    def site(self, edit=None):
        tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        for slug in condition.slugs():
            (tmp / slug).mkdir()
            shutil.copy(SITE / slug / "index.html", tmp / slug / "index.html")
        (tmp / "fibroids" / "every-option").mkdir()
        shutil.copy(SITE / "fibroids/every-option/index.html", tmp / "fibroids/every-option/index.html")
        if edit:
            path, old, new = edit
            f = tmp / path
            t = f.read_text(encoding="utf-8")
            self.assertIn(old, t)
            f.write_text(t.replace(old, new), encoding="utf-8")
        return pattern.check(tmp)[0]

    def test_fibroids_pass_and_drafts_skip(self):
        errs, checked = pattern.check()
        self.assertEqual(errs, [])
        self.assertIn("fibroids: simple and every-option", checked)
        self.assertTrue(any("knee-arthritis" in c and "skipped" in c for c in checked))

    def test_shared_title_phrasing_fails(self):
        errs = self.site(("fibroids/every-option/index.html", "<title>UFE vs. Myomectomy vs. Hysterectomy, Compared",
                          "<title>Fibroid Treatment Options Compared"))
        self.assertTrue(any("share phrasing" in e for e in errs), errs)
        self.assertTrue(any("chases the other page" in e for e in errs), errs)

    def test_same_h1_fails(self):
        errs = self.site(("fibroids/every-option/index.html", "<h1>Fibroid treatments compared, side by side</h1>",
                          "<h1>Shrink fibroids without surgery</h1>"))
        self.assertTrue(any("h1" in e and "share phrasing" in e for e in errs), errs)

    def test_missing_links_fail(self):
        errs = self.site(("fibroids/index.html", 'href="/fibroids/every-option/"', 'href="/nowhere/"'))
        self.assertTrue(any("no descriptive link to /fibroids/every-option/" in e for e in errs), errs)
        errs = self.site(("fibroids/every-option/index.html", '<section class="find-end"', '<section class="gone"'))
        self.assertTrue(any("find-a-doctor" in e for e in errs), errs)
        errs = self.site(("fibroids/every-option/index.html", 'href="/fibroids/doctors/">Fibroid', 'href="/x/">Fibroid'))
        self.assertTrue(any("city list" in e for e in errs), errs)

    def test_structured_data_fails(self):
        errs = self.site(("fibroids/every-option/index.html", '"@type": "BreadcrumbList"', '"@type": "Thing"'))
        self.assertTrue(any("no BreadcrumbList" in e for e in errs), errs)
        errs = self.site(("knee-arthritis/index.html", '"@type": "MedicalWebPage"', '"@type": "FAQPage"'))
        self.assertTrue(any("knee-arthritis simple: no MedicalWebPage" in e for e in errs), errs)


if __name__ == "__main__":
    unittest.main()
