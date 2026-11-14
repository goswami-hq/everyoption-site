#!/usr/bin/env python3
"""Tests for sight-first tapping, the affordance comparison and the seeded random draw (job platform-web-design-0007). Run with the install's python, as test_run_origin.py says."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run

VW, VH = 390, 844


def ctl(n, vis, y=100, x=20, w=300, h=44, href="/x/", tag="a", **kw):
    return dict(n=n, vis=vis, text=kw.pop("text", vis), tag=tag, href=href, x=x, y=y, w=w, h=h, type="", value=kw.pop("value", ""), placeholder=kw.pop("placeholder", ""), label=kw.pop("label", ""), **kw)


class Resolve(unittest.TestCase):
    def test_exact_words(self):
        c = ctl(1, "Compare them side by side", href="/knee/every-option/")
        self.assertEqual(run.resolve("Compare them side by side", "", None, None, [c], VW, VH)[0]["n"], 1)

    def test_case_and_punctuation(self):
        self.assertEqual(run.resolve('"find a doctor."', "", None, None, [ctl(1, "Find a doctor")], VW, VH)[0]["n"], 1)

    def test_fragment_of_a_card(self):
        c = ctl(1, "Knee embolization: Details above and what happens next", href="#a")
        self.assertEqual(run.resolve("Knee embolization", "", None, None, [c], VW, VH)[1], "text")

    def test_heading_is_a_miss_even_with_a_link_nearby(self):
        controls = [ctl(1, "See what else there is", y=120)]
        t, how = run.resolve("Your other knee arthritis treatment options", "middle", 15, 50, controls, VW, VH, ["Your other knee arthritis treatment options", "See what else there is"])
        self.assertIsNone(t); self.assertEqual(how, "plain_text")

    def test_plain_words_never_resolved_by_position(self):
        # The point sits on a link, but the words are plain text on the page: a real tap on those words does nothing.
        controls = [ctl(1, "Find a doctor", y=380)]
        t, how = run.resolve("recovery takes about a week", "", 47, 50, controls, VW, VH, ["recovery takes about a week", "Find a doctor"])
        self.assertIsNone(t); self.assertEqual(how, "plain_text")

    def test_two_same_labels_split_by_position(self):
        controls = [ctl(1, "Call", y=100, href="tel:1"), ctl(2, "Call", y=700, href="tel:2")]
        self.assertEqual(run.resolve("Call", "lower down", 85, 50, controls, VW, VH)[0]["n"], 2)

    def test_two_same_labels_no_position_is_ambiguous(self):
        controls = [ctl(1, "Call", y=100, href="tel:1"), ctl(2, "Call", y=700, href="tel:2")]
        t, how = run.resolve("Call", "", None, None, controls, VW, VH)
        self.assertIsNone(t); self.assertEqual(how, "ambiguous")

    def test_same_destination_needs_no_position(self):
        controls = [ctl(1, "Find a doctor", y=100, href="/f/"), ctl(2, "Find a doctor", y=700, href="/f/")]
        t, how = run.resolve("Find a doctor", "", None, None, controls, VW, VH)
        self.assertIsNotNone(t); self.assertIn("same destination", how)

    def test_icon_by_position(self):
        c = ctl(1, "", x=340, y=10, w=40, h=40, text="Menu", href="", tag="button")
        self.assertEqual(run.resolve("three lines", "top right corner", 3, 92, [c], VW, VH)[1], "position")

    def test_nothing_named(self):
        t, how = run.resolve("Blue ribbon", "", None, None, [ctl(1, "Find a doctor")], VW, VH)
        self.assertIsNone(t); self.assertEqual(how, "no_match")

    def test_typing_goes_to_a_field(self):
        controls = [ctl(1, "Search", tag="button"), ctl(2, "", tag="input", href="", placeholder="ZIP code", y=200)]
        self.assertEqual(run.resolve("ZIP code", "", None, None, controls, VW, VH, want_field=True)[0]["n"], 2)

    def test_only_field_on_screen(self):
        controls = [ctl(2, "", tag="input", href="", label="Your ZIP code", y=200)]
        self.assertEqual(run.resolve("the box for my area", "", None, None, controls, VW, VH, want_field=True)[1], "only field on screen")


class Compare(unittest.TestCase):
    def screen(self, controls, listed, shot="s0", **kw):
        return {"controls": controls, "listed": listed, "vh": VH, "shot": shot, **kw}

    def test_link_nobody_listed(self):
        r = run.compare_page([self.screen([ctl(1, "Compare them side by side")], [])])
        self.assertEqual([x["words"] for x in r["does_not_look_tappable"]], ["Compare them side by side"])

    def test_listed_control_is_clean(self):
        r = run.compare_page([self.screen([ctl(1, "Find a doctor")], [{"words": "Find a doctor", "sure": "clear"}])])
        self.assertEqual(r["does_not_look_tappable"], []); self.assertEqual(r["looks_tappable_is_not"], [])

    def test_listed_but_not_a_control(self):
        r = run.compare_page([self.screen([ctl(1, "Find a doctor")], [{"words": "Find a doctor", "sure": "clear"}, {"words": "Learn more about recovery"}])])
        self.assertEqual([x["words"] for x in r["looks_tappable_is_not"]], ["Learn more about recovery"])

    def test_listed_on_another_screen_counts(self):
        c = ctl(1, "Find a doctor")
        r = run.compare_page([self.screen([c], [], "s0"), self.screen([c], [{"words": "Find a doctor"}], "s1")])
        self.assertEqual(r["does_not_look_tappable"], [])

    def test_control_cut_off_at_the_fold_proves_nothing(self):
        r = run.compare_page([self.screen([ctl(1, "Find a doctor", y=820, h=44)], [])])
        self.assertEqual(r["does_not_look_tappable"], [])

    def test_a_checker_error_proves_nothing(self):
        r = run.compare_page([self.screen([ctl(1, "Find a doctor")], [], error="timeout")])
        self.assertEqual(r["does_not_look_tappable"], [])

    def test_unsure_listing_is_reported(self):
        r = run.compare_page([self.screen([ctl(1, "Find a doctor")], [{"words": "Find a doctor", "sure": "unclear"}])])
        self.assertEqual([x["words"] for x in r["unclear"]], ["Find a doctor"]); self.assertEqual(r["does_not_look_tappable"], [])


class Random(unittest.TestCase):
    personas = [{"id": "a", "who": "A", "mode": "sighted", "words": []}, {"id": "b", "who": "B", "mode": "sighted", "words": []},
                {"id": "sr", "who": "S", "mode": "screen_reader", "words": []}, {"id": "ex", "who": "E", "mode": "explore", "situation": "s", "tap_budget": 4},
                {"id": "physician", "who": "P", "mode": "sighted", "words": []}]
    pages = {"home": ["/"], "condition": ["/knee-arthritis/", "/fibroids/"], "every-option": ["/fibroids/every-option/"], "insurance": ["/insurance/"], "doctor-profile": ["/doctors/a/"], "directory": ["/doctors/"], "city": ["/fibroids/doctors/a/"]}

    def test_same_seed_same_draw(self):
        self.assertEqual(run.draw_random_tracks(7, 6, self.personas, self.pages), run.draw_random_tracks(7, 6, self.personas, self.pages))

    def test_different_seed_differs(self):
        self.assertNotEqual(run.draw_random_tracks(7, 6, self.personas, self.pages), run.draw_random_tracks(8, 6, self.personas, self.pages))

    def test_no_screen_reader_or_explorer_and_only_the_physician_claims(self):
        for seed in range(50):
            for t in run.draw_random_tracks(seed, 6, self.personas, self.pages):
                self.assertIn(t["base_persona"], ("a", "b", "physician"))
                if t["tasks"][0]["function"] == "claim a profile":
                    self.assertEqual(t["base_persona"], "physician")
                self.assertEqual(t["kind"], "random")
                self.assertIn(t["device"], run.DEVICES)

    def test_explorer_expansion(self):
        p = run.expand_persona({"id": "e", "who": "E", "mode": "explore", "situation": "knee", "tap_budget": 8, "device": "phone390", "start": "/"})
        self.assertEqual(p["kind"], "explorer"); self.assertEqual(p["tasks"][0]["goal"], "knee"); self.assertEqual(p["tasks"][0]["finish"], {})

    def test_no_explorer_in_fixed_panel_kind(self):
        self.assertEqual(run.expand_persona({"id": "a", "tasks": []})["kind"], "fixed")


class PageKey(unittest.TestCase):
    def test_keys(self):
        self.assertEqual(run.page_key("/fibroids/?zip=60614&r=50#finder"), "/fibroids/?r&zip")
        self.assertEqual(run.page_key("/fibroids/#options"), "/fibroids/")
        self.assertEqual(run.page_key("/doctors/arthur-1/"), "/doctors/*/")


if __name__ == "__main__":
    unittest.main()
