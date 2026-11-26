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
        # every built page the check reads (job platform-web-design-0009 added home, insurance, coverage, directory)
        for f in SITE.glob("**/index.html"):
            rel = f.relative_to(SITE)
            if rel.parts[0] in ("index.html", "insurance", "doctors") or rel.parts[-2:-1] in (("every-option",), ("insurance",)):
                (tmp / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(f, tmp / rel)
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
        # job platform-main-0024: prostate and knee now pass the whole pattern, box included (no skip)
        self.assertIn("knee-arthritis: simple and every-option", checked)
        self.assertIn("enlarged-prostate: simple and every-option", checked)
        # job platform-condition-pages-0023: the pelvic in-depth page came, so every condition now has both pages
        self.assertIn("chronic-pelvic-pain: simple and every-option", checked)

    def test_shared_title_phrasing_fails(self):
        errs = self.site(("fibroids/every-option/index.html", "<title>Uterine Fibroid Embolization vs. Myomectomy",
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


    def test_box_missing_or_incomplete_fails(self):
        # job platform-condition-pages-0004: the "What is <condition>?" box on both fibroid pages
        for path in ("fibroids/index.html", "fibroids/every-option/index.html"):
            errs = self.site((path, '<section class="what-box"', '<section class="gone"'))
            self.assertTrue(any('no "What are fibroids?" box' in e for e in errs), errs)
            errs = self.site((path, '<ul class="what-tags"', '<ul class="gone"'))
            self.assertTrue(any("no symptom list" in e for e in errs), errs)
            errs = self.site((path, "<summary>When to see a doctor</summary>", "<summary>More</summary>"))
            self.assertTrue(any("When to see a doctor" in e for e in errs), errs)

    def test_published_condition_without_box_content_fails(self):
        c = condition.load("knee-arthritis")
        c.pop("draft", None)   # knee is indexed since launch day (2026-11-18)
        # job platform-main-0024: knee has the box now; take its content away to test the rule
        c["sections"] = [x for x in c["sections"] if x.get("place") != "box"]
        orig = condition.load
        condition.load = lambda slug: c if slug == "knee-arthritis" else orig(slug)
        self.addCleanup(setattr, condition, "load", orig)
        errs = self.site(("knee-arthritis/index.html", '<section class="what-box"', '<section class="gone"'))
        self.assertTrue(any(e.startswith("knee-arthritis simple: no") and "box" in e for e in errs), errs)

    # ---- job platform-web-design-0009: page parts, fixed wording, rulings (docs/condition-pattern.md)

    def test_all_page_types_checked(self):
        errs, checked = pattern.check()
        self.assertEqual(errs, [])
        last = checked[-1]
        for part in ("home", "insurance hub", "UFE coverage page", "directory and"):
            self.assertIn(part, last)

    def test_compare_link_missing_or_late_fails(self):
        errs = self.site(("fibroids/index.html", '<a class="find-compare" href="/fibroids/every-option/">Deep dive, every option</a>', ""))
        self.assertTrue(any('no first-screen "Deep dive, every option"' in e for e in errs), errs)
        # no condition is left without an every-option page (job platform-condition-pages-0023), so the rule is checked on
        # the pelvic simple page read as if it had none
        f = SITE / "chronic-pelvic-pain" / "index.html"
        errs = pattern.simple_parts("chronic-pelvic-pain simple", pattern.page_parts(f), condition.load("chronic-pelvic-pain"),
                                    "chronic-pelvic-pain", None)
        self.assertTrue(any("compare link with no every-option page" in e for e in errs), errs)

    def test_no_finder_condition_compare_link_fails(self):
        # job platform-condition-pages-0014 wrote this for hemorrhoids with no doctor list (hero-compare under the intro).
        # Since job platform-directory-0029 every condition page has a finder, so the check runs on the hemorrhoid
        # finder's compare link; the no-finder branch in tools/pattern.py stays for a future page without one.
        errs = self.site(("hemorrhoids/index.html", '<a class="find-compare" href="/hemorrhoids/every-option/">Deep dive, every option</a>', ''))
        self.assertTrue(any(e.startswith("hemorrhoids simple: no first-screen") for e in errs), errs)

    def test_glance_caption_and_count_fail(self):
        errs = self.site(("fibroids/every-option/index.html", "At a glance: 3 of 10 treatments", "At a glance: 3 treatments"))
        self.assertTrue(any("caption" in e for e in errs), errs)
        errs = self.site(("fibroids/every-option/index.html", "See all 10 and how well each works", "See all and how well each works"))
        self.assertTrue(any('"See all 10' in e for e in errs), errs)

    def test_insurance_lines_fail(self):
        errs = self.site(("fibroids/every-option/index.html", '<p class="cov-near">', '<p class="gone">'))
        self.assertTrue(any("Does insurance cover it?" in e for e in errs), errs)
        errs = self.site(("fibroids/index.html", "Does insurance cover fibroid embolization?</a></p>", "Insurance</a></p>"))
        self.assertTrue(any("in the lead option" in e for e in errs), errs)
        errs = self.site(("fibroids/insurance/index.html", "<h1>Does insurance cover fibroid embolization?</h1>", "<h1>Coverage</h1>"))
        self.assertTrue(any("differs from the link text" in e for e in errs), errs)

    def test_order_and_chrome_fail(self):
        errs = self.site(("fibroids/every-option/index.html", '<div class="glance-peek">', '<div class="gone">'))
        self.assertTrue(any("at-a-glance view missing" in e for e in errs), errs)
        errs = self.site(("fibroids/index.html", '<a href="/conditions/" aria-current="true">Conditions</a>', '<a href="/#conditions">Conditions</a>'))
        self.assertTrue(any('"Conditions" does not go to /conditions/' in e for e in errs), errs)
        errs = self.site(("index.html", '<p class="cov-link home-cov">', '<p class="gone">'))
        self.assertTrue(any("home: no insurance hub link" in e for e in errs), errs)
        errs = self.site(("doctors/index.html", 'href="/doctors/a/"', 'href="/doctors/x/"'))
        self.assertTrue(any("no link to the A page" in e for e in errs), errs)

    def test_gae_same_day_hedge_fails(self):
        errs = self.site(("knee-arthritis/index.html", "You go home the same day", "Most people go home the same day"))
        self.assertTrue(any("strictly outpatient" in e for e in errs), errs)

    def test_frequency_in_fails(self):
        errs = self.site(("chronic-pelvic-pain/index.html", "about 2 out of 100", "about 2 in 100"))
        self.assertTrue(any('write "out of"' in e for e in errs), errs)

    def test_embolization_explainer_missing_or_moved_fails(self):
        # job platform-condition-pages-0020: the fold on every short guide, the materials section on every in-depth page
        errs = self.site(("hemorrhoids/index.html", 'id="what-is-embolization"', 'id="gone"'))
        self.assertTrue(any('hemorrhoids simple: no "What is embolization?" fold' in e for e in errs), errs)
        errs = self.site(("chronic-pelvic-pain/index.html", '<details class="topic embo-what" id="what-is-embolization">',
                          '<details class="topic embo-what" id="what-is-embolization" open>'))
        self.assertTrue(any("must start closed" in e for e in errs), errs)
        errs = self.site(("knee-arthritis/every-option/index.html", 'id="embolic-materials"', 'id="gone"'))
        self.assertTrue(any("knee-arthritis every-option: no \"What is used to block the blood flow?\" section" in e for e in errs), errs)
        errs = self.site(("fibroids/every-option/index.html", '<li class="agent this">', '<li class="agent">'))
        self.assertTrue(any("not first and marked" in e for e in errs), errs)

    def test_finder_names_its_procedure(self):
        # ai-hq job platform-directory-0038 (his call 12, "Yes to all" 2026-11-14 08:43 CT): every simple-page finder names
        # its procedure in one line under "Find a doctor near you", built from the registry; a finder without it fails
        for slug in condition.slugs():
            c = condition.load(slug)
            if not c.get("finder"):
                continue
            want = condition.finder_names(c)
            hub = condition.registry.BY_KEY[c["finder"]]["hub_label"].removesuffix(" doctors")
            self.assertEqual(want.lower(), (condition.FINDER_WHO + hub).lower())
            errs = self.site((f"{slug}/index.html", f'<p class="find-proc">{want}</p>', ""))
            self.assertTrue(any(f"{slug} simple: the finder does not name its procedure" in e for e in errs), errs)
        errs = self.site(("fibroids/index.html", '<p class="find-proc">Interventional radiologists who perform fibroid embolization</p>',
                          '<p class="find-proc">Interventional radiologists who perform knee embolization</p>'))
        self.assertTrue(any("fibroids simple: the finder does not name its procedure" in e for e in errs), errs)

    def test_every_option_find_block_names_its_procedure(self):
        # same job: the every-option find-a-doctor heading names the procedure, and the city link has words
        errs = self.site(("hemorrhoids/every-option/index.html", '<h2 id="find-h">Find a hemorrhoid embolization doctor</h2>',
                          '<h2 id="find-h">Find a doctor</h2>'))
        self.assertTrue(any("hemorrhoids every-option: the find-a-doctor heading does not name its procedure" in e for e in errs), errs)
        errs = self.site(("fibroids/every-option/index.html", '>Fibroid embolization doctors by city</a>', '></a>'))
        self.assertTrue(any("fibroids every-option: the city list link is not" in e for e in errs), errs)

    def test_every_option_find_link_after_glance(self):
        # ai-hq job platform-directory-0039 (his call 4, "Your picks" 2026-11-14 15:46 CT): every comparison page has a
        # "Find a <procedure> doctor" link to #find right after the at-a-glance list, in the find heading's words
        import options
        for slug in options.slugs():
            c = condition.load(slug)
            if not c.get("finder"):
                continue
            head = options.load(slug)[1]["find_heading"]
            link = f'<p class="glance-find"><a href="#find">{head}</a></p>'
            errs = self.site((f"{slug}/every-option/index.html", link, ""))
            self.assertTrue(any(f"{slug} every-option: no \"{head}\" link to #find right after the at-a-glance list" in e
                                for e in errs), errs)
        errs = self.site(("knee-arthritis/every-option/index.html", '<a href="#find">Find a knee embolization doctor</a></p>',
                          '<a href="#find">Find a doctor</a></p>'))
        self.assertTrue(any("knee-arthritis every-option: no" in e for e in errs), errs)

    def test_source_rules_fail(self):
        tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        for f in pattern.SITE_LABEL_FILES + ["src-assets/condition-box.css"]:
            (tmp / f).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(pattern.ROOT / f, tmp / f)
        self.assertEqual(pattern.source_rules(tmp), [])
        f = tmp / "lib/cities.mjs"
        f.write_text(f.read_text(encoding="utf-8").replace("Doctor's website", "Doctor's page"), encoding="utf-8")
        css = tmp / "src-assets/condition-box.css"
        css.write_text(css.read_text(encoding="utf-8").replace("list-style: disc;", "list-style: none; border-radius: 999px;"), encoding="utf-8")
        errs = pattern.source_rules(tmp)
        self.assertTrue(any("lib/cities.mjs" in e for e in errs), errs)
        self.assertTrue(any("pills" in e for e in errs), errs)


if __name__ == "__main__":
    unittest.main()
