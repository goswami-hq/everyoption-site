#!/usr/bin/env python3
"""The procedures seed build check (ai-hq job platform-directory-0033): the seed in supabase/schema.sql and the
migrations equals the registry's issued keys.  python3 tools/procedures_sql_test.py"""
import json, os, pathlib, shutil, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import procedures_sql as g

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIG = "2026-11-11-procedures-table.sql"


class SeedCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / "supabase", self.tmp / "supabase")
        (self.tmp / "content").mkdir()
        shutil.copy(ROOT / "content" / "procedure-keys.json", self.tmp / "content")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def edit(self, rel, old, new):
        p = self.tmp / rel
        t = p.read_text()
        self.assertIn(old, t)
        p.write_text(t.replace(old, new, 1))

    def test_committed_seed_matches_the_registry(self):
        self.assertEqual(g.check(ROOT), [])
        self.assertEqual(g.seeded((ROOT / "supabase" / "schema.sql").read_text()), g.issued(ROOT))

    def test_extra_key_in_the_migration_fails(self):
        self.edit(f"supabase/migrations/{MIG}", "('hae')", "('hae'), ('zzz')")
        self.assertTrue(any("never issued ['zzz']" in e for e in g.check(self.tmp)), g.check(self.tmp))

    def test_missing_key_in_schema_fails_and_the_generator_restores_it(self):
        self.edit("supabase/schema.sql", ", ('hae')", "")
        self.assertTrue(g.check(self.tmp))
        g.write_schema(self.tmp)
        self.assertEqual(g.check(self.tmp), [])

    def test_a_new_issued_key_needs_a_new_migration(self):
        p = self.tmp / "content" / "procedure-keys.json"
        k = json.loads(p.read_text()); k["issued"].append("newproc"); p.write_text(json.dumps(k))
        g.write_schema(self.tmp)
        self.assertTrue(any("no row for issued keys ['newproc']" in e for e in g.check(self.tmp)))
        self.assertEqual(g.new_migration(self.tmp / "supabase" / "migrations" / "2099-01-01-procedures-newproc.sql", self.tmp), ["newproc"])
        self.assertEqual(g.check(self.tmp), [])


if __name__ == "__main__":
    unittest.main()
