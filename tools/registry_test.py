#!/usr/bin/env python3
"""The registry's build checks (ai-hq job platform-directory-0032): every declared optional part's file exists, an
undeclared part is left out cleanly, and keys obey the issued and reserved lists.  python3 tools/registry_test.py"""
import copy, os, pathlib, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import registry

SITE = pathlib.Path(__file__).resolve().parent.parent / "site"


class RegistryChecks(unittest.TestCase):
    def setUp(self):
        self.saved = copy.deepcopy((registry.PROCEDURES, registry.CONDITIONS, registry.KEYS, registry.UPCOMING))

    def tearDown(self):
        registry.PROCEDURES[:], registry.CONDITIONS[:] = self.saved[0], self.saved[1]
        registry.KEYS.clear(); registry.KEYS.update(self.saved[2])
        registry.UPCOMING.clear(); registry.UPCOMING.update(self.saved[3])
        self.relink()

    def relink(self):
        registry.BY_KEY.clear(); registry.BY_KEY.update({p["key"]: p for p in registry.PROCEDURES})
        registry.BY_SLUG.clear(); registry.BY_SLUG.update({c["slug"]: c for c in registry.CONDITIONS})

    def errs(self):
        self.relink()
        return registry.check(str(SITE))

    def test_registry_as_committed_is_sound(self):
        self.assertEqual(self.errs(), [])

    def test_listed_procedure_needs_draft_pages(self):
        # job platform-directory-0035: stage listed is noindex, and the pages carry it as draft = true
        registry.BY_KEY["ufe"]["stage"] = "listed"   # fibroids.toml has no draft line
        self.assertTrue(any("content/conditions/fibroids.toml needs draft = true" in e for e in self.errs()), self.errs())

    def test_declared_animation_needs_its_drawing(self):
        p = registry.BY_KEY["pelvic"]
        p["parts"]["animation"] = copy.deepcopy(registry.BY_KEY["ufe"]["parts"]["animation"])
        self.assertTrue(any("anim-pelvic.svgfrag is missing" in e for e in self.errs()), self.errs())

    def test_declared_banner_needs_its_scene(self):
        registry.BY_KEY["hae"]["parts"]["banner"] = True
        self.assertTrue(any("proc-banner.js has no hae scene" in e for e in self.errs()), self.errs())

    def test_declared_life_strip_needs_its_scene(self):
        # the daily-life strip (2026-11-11): parts.banner == "life" is drawn by site/assets/life-strip.js
        self.assertEqual(registry.life_strips(), {"ufe", "pae", "gae", "hae"})   # hae since 2026-11-12 (the long roll)
        self.assertEqual(self.errs(), [])
        registry.BY_KEY["pelvic"]["parts"]["banner"] = "life"
        self.assertTrue(any("life-strip.js has no pelvic scene" in e for e in self.errs()), self.errs())

    def test_declared_coverage_page_must_be_built(self):
        registry.BY_KEY["hae"]["parts"]["coverage"] = {"path": "/hemorrhoids/insurance/", "link": "x"}
        self.assertTrue(any("coverage page /hemorrhoids/insurance/" in e for e in self.errs()), self.errs())

    def test_declared_payer_table_needs_rows(self):
        registry.BY_KEY["pelvic"]["parts"]["payer_table"] = True
        self.assertTrue(any("no pelvic rows" in e for e in self.errs()), self.errs())

    def test_city_pages_must_match_metros(self):
        del registry.BY_KEY["hae"]["parts"]["city_pages"]
        self.assertTrue(any("content/metros.json procs" in e for e in self.errs()), self.errs())

    def test_undeclared_banner_is_left_out_of_the_built_page(self):
        with_banner = registry.banners()
        for c in registry.CONDITIONS:
            k = c["procedures"][0]
            html = (SITE / c["slug"] / "index.html").read_text(encoding="utf-8")
            self.assertEqual('<div class="page-strip">' in html, k in with_banner and registry.has(k, "animation"), c["slug"])

    def test_reserved_words_and_site_folders_are_refused(self):
        for bad in ("api", "insurance", "doctors", "how-we-know"):
            p = copy.deepcopy(registry.BY_KEY["hae"]); p["key"] = bad; p["conditions"] = []
            registry.PROCEDURES.append(p); registry.KEYS["issued"].append(bad)
            self.assertTrue(any("reserved word" in e or "2 to 16 lowercase" in e for e in self.errs()), (bad, self.errs()))
            registry.PROCEDURES.pop(); registry.KEYS["issued"].pop()

    def test_unissued_key_is_refused(self):
        p = copy.deepcopy(registry.BY_KEY["hae"]); p["key"] = "ivc"; p["conditions"] = []
        registry.PROCEDURES.append(p)
        self.assertTrue(any("not in content/procedure-keys.json" in e for e in self.errs()), self.errs())

    def test_unknown_stage_and_part_are_refused(self):
        registry.BY_KEY["hae"]["stage"] = "draft"
        registry.BY_KEY["hae"]["parts"]["photo"] = True
        e = self.errs()
        self.assertTrue(any("stage 'draft'" in x for x in e) and any("unknown parts" in x for x in e), e)

    # ---- ai-hq job platform-directory-0036: the private "not on the site yet" list (content/upcoming-procedures.json)
    def first_item(self):
        return registry.UPCOMING["groups"][0]["items"][0]

    def test_upcoming_slug_twice_is_refused(self):
        g = registry.UPCOMING["groups"][0]
        g["items"].append(copy.deepcopy(g["items"][0]))
        self.assertTrue(any("listed twice" in e for e in self.errs()), self.errs())

    def test_upcoming_slug_equal_to_a_key_or_reserved_word_is_refused(self):
        for bad, why in ((registry.KEYS["issued"][0], "equals an issued procedure key"), (registry.KEYS["reserved"][0], "reserved word")):
            it = {"slug": bad, "name": "X", "for": "y"}
            registry.UPCOMING["groups"][0]["items"].append(it); registry.UPCOMING["issued"].append(bad)
            self.assertTrue(any(why in e for e in self.errs()), (bad, self.errs()))
            registry.UPCOMING["groups"][0]["items"].pop(); registry.UPCOMING["issued"].pop()

    def test_upcoming_unissued_and_deleted_slugs_are_refused(self):
        registry.UPCOMING["groups"][0]["items"].append({"slug": "zz-new-thing", "name": "X", "for": "y"})
        self.assertTrue(any("not in content/upcoming-procedures.json 'issued'" in e for e in self.errs()), self.errs())
        registry.UPCOMING["groups"][0]["items"].pop()
        registry.UPCOMING["groups"][0]["items"].pop(0)   # an issued slug whose item was deleted
        self.assertTrue(any("has no item" in e for e in self.errs()), self.errs())

    def test_upcoming_bad_slug_shape_is_refused(self):
        for bad in ("Upper-Case", "two--hyphens", "-lead", "trail-", "under_score"):
            self.first_item()["slug"] = bad
            registry.UPCOMING["issued"][0] = bad
            self.assertTrue(any("a slug is lowercase" in e for e in self.errs()), (bad, self.errs()))

    def test_promoted_item_leaves_the_tick_list_and_needs_an_issued_key(self):
        s = self.first_item()["slug"]
        self.first_item()["promoted_to"] = "zzq"
        self.assertTrue(any("promoted_to 'zzq' is not an issued" in e for e in self.errs()), self.errs())
        self.first_item()["promoted_to"] = registry.KEYS["issued"][0]
        self.assertEqual(self.errs(), [])
        self.assertNotIn(s, registry.upcoming_slugs())
        self.assertIn(s, registry.UPCOMING["issued"], "a promoted slug stays issued")

    def test_account_sub_must_be_short_text(self):
        registry.BY_KEY["hae"]["account_sub"] = ""
        self.assertTrue(any("account_sub" in e for e in self.errs()), self.errs())


if __name__ == "__main__":
    unittest.main()
