#!/usr/bin/env python3
"""Tests for tools/listings_check.py (ai-hq job platform-directory-0034).

  python3 tools/listings_check_test.py
Standard library only.
"""
import json, os, shutil, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listings_check as L


def site_with(lists, roster, fp_lists=None, fp_roster=None):
    """A temporary root with content/procedures.json, site/data lists and their fingerprint."""
    root = tempfile.mkdtemp()
    os.makedirs(os.path.join(root, "content"))
    os.makedirs(os.path.join(root, "site", "data"))
    with open(os.path.join(root, "content", "procedures.json"), "w") as fh:
        json.dump([{"key": k} for k in lists], fh)
    for k, d in lists.items():
        with open(os.path.join(root, "site", "data", k + ".json"), "w") as fh:
            json.dump(d, fh)
    with open(os.path.join(root, "site", "data", L.ROSTER), "w") as fh:
        json.dump(roster, fh)
    fp = {"procedures": {k: L.one(d) for k, d in (fp_lists or lists).items()}, L.NEARBY: L.one(fp_roster or roster)}
    with open(os.path.join(root, "site", "data", L.FINGERPRINT), "w") as fh:
        json.dump(fp, fh)
    return root


A = {"procedure": "aaa", "people": [{"npi": "1000000001", "name": "A One", "phone": "1"},
                                     {"npi": "1000000002", "name": "B Two", "phone": "2"}], "held": 0}
R = {"people": [{"npi": "1000000009", "name": "N Nine"}]}


class T(unittest.TestCase):
    def tearDown(self):
        shutil.rmtree(getattr(self, "root", ""), ignore_errors=True)

    def test_equal_passes_and_path_is_ignored(self):
        stamped = dict(A, people=[dict(p, path="/doctors/x/") for p in A["people"]])
        self.root = site_with({"aaa": stamped}, R, fp_lists={"aaa": A})
        self.assertEqual(L.check(root=self.root), [])

    def test_removed_row_fails(self):
        cut = dict(A, people=A["people"][1:])
        self.root = site_with({"aaa": cut}, R, fp_lists={"aaa": A})
        e = L.check(root=self.root)
        self.assertEqual(len(e), 1)
        self.assertIn("1 rows, the export wrote 2", e[0])

    def test_changed_field_fails(self):
        ch = dict(A, people=[A["people"][0], dict(A["people"][1], phone="9")])
        self.root = site_with({"aaa": ch}, R, fp_lists={"aaa": A})
        self.assertIn("a card's fields differ", L.check(root=self.root)[0])

    def test_reordered_fails(self):
        ro = dict(A, people=A["people"][::-1])
        self.root = site_with({"aaa": ro}, R, fp_lists={"aaa": A})
        self.assertIn("different doctors or order", L.check(root=self.root)[0])

    def test_roster_edit_fails(self):
        self.root = site_with({"aaa": A}, {"people": []}, fp_roster=R)
        self.assertIn("nearby", L.check(root=self.root)[0])

    def test_procedure_without_fingerprint_fails(self):
        self.root = site_with({"aaa": A}, R)
        with open(os.path.join(self.root, "content", "procedures.json"), "w") as fh:
            json.dump([{"key": "aaa"}, {"key": "bbb"}], fh)
        self.assertTrue(any(x.startswith("bbb: no fingerprint") for x in L.check(root=self.root)))

    def test_missing_fingerprint_fails(self):
        self.root = site_with({"aaa": A}, R)
        os.remove(os.path.join(self.root, "site", "data", L.FINGERPRINT))
        self.assertIn("is missing", L.check(root=self.root)[0])

    def test_this_tree_passes(self):
        self.assertEqual(L.check(), [])


if __name__ == "__main__":
    unittest.main()
