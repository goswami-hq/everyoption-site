#!/usr/bin/env python3
"""Run with the install's python (run.py imports Playwright):
"/Library/Application Support/ai-hq/browser/venv/bin/python" -I tools/walkthrough/test_run_origin.py"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run


class Origin(unittest.TestCase):
    def test_accepts_local(self):
        for o in ("http://localhost:8799", "http://127.0.0.1:8799", "http://localhost:1"):
            self.assertEqual(run.check_origin(o), o)

    def test_refuses_everything_else(self):
        for o in ("https://everyoptionmd.com", "http://everyoptionmd.com:8799", "https://localhost:8799", "http://localhost", "http://localhost:8799/", "http://localhost:8799/x",
                  "http://user@localhost:8799", "http://localhost.example.com:8799", "http://localhost:8799.example.com", "http://localhost:0", "http://localhost:99999", "http://[::1]:8799",
                  "http://localhost:8799\n", "http://127.0.0.1:8799?x=1"):
            with self.assertRaises(SystemExit, msg=o):
                run.check_origin(o)


class Allowed(unittest.TestCase):
    def test_exact_origin_only(self):
        o = "http://localhost:8799"
        self.assertTrue(run.allowed(o + "/x", o))
        self.assertFalse(run.allowed("http://127.0.0.1:8799/x", o))
        self.assertFalse(run.allowed(o + ".example.com/", o))


if __name__ == "__main__":
    unittest.main()
