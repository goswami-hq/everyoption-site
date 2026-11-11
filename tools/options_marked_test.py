#!/usr/bin/env python3
"""Marked lists, the abstract label switch and `ruled` details on the every-option page (tools/options.py; job
platform-condition-pages-0017, his hemorrhoid in-depth edits 2026-11-10). Run: python3 tools/options_marked_test.py"""
import copy, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import options


class Marked(unittest.TestCase):
    def test_order_and_nesting(self):
        out = options.marked_html(["Lead:", "* one", "- a", "- b", "* two", "Close."], lambda s: s)
        self.assertEqual(out, '<p>Lead:</p><ul class="evidence"><li>one<ul><li>a</li><li>b</li></ul></li>'
                              '<li>two</li></ul><p>Close.</p>')

    def test_unmarked_list_is_not_marked(self):
        self.assertFalse(options._marked(["a", "b"]))
        self.assertTrue(options._marked(["a", "* b"]))


class Hemorrhoids(unittest.TestCase):
    def setUp(self):
        self.c, self.d, self.f = options.load("hemorrhoids")

    def test_ties(self):
        options.check(self.c, self.d, self.f)

    def test_no_abstract_label_when_off(self):
        html = options.render(self.c, self.d, self.f, lambda *a, **k: "", "/hemorrhoids/#finder")
        self.assertNotIn("(abstract only)", html)
        self.assertIn('<ul class="evidence"><li><strong>Fewer symptoms:</strong>', html)

    def test_abstract_label_default_on(self):
        d = copy.deepcopy(self.d)
        d.pop("abstract_label")
        html = options.render(self.c, d, self.f, lambda *a, **k: "", "/hemorrhoids/#finder")
        self.assertIn("(abstract only)", html)

    def test_ruled_line_must_open_works(self):
        d = copy.deepcopy(self.d)
        next(x for x in d["detail"] if x["option"] == "creams")["works"] = "Early studies suggest relief.[^aga]"
        with self.assertRaises(options.TieError):
            options.check(self.c, d, self.f)

    def test_marked_item_without_any_source_fails(self):
        d = copy.deepcopy(self.d)
        next(x for x in d["detail"] if x["option"] == "laser")["evidence"] = ["* No source here.", "* Nor here."]
        with self.assertRaises(options.TieError):
            options.check(self.c, d, self.f)


if __name__ == "__main__":
    unittest.main()
