#!/usr/bin/env python3
"""The tap-on-a-list-box and choose branches of run_task, end to end against a stub page in a real browser (walkthrough
2026-11-15 finding 1; review round 1, fix 5). The patient model is replaced by a script, so no model is called; the page is
served from a temporary folder on a free local port. Needs Playwright's Chromium; skipped when it cannot start.
  python3 tools/walkthrough/test_choose_live.py
"""
import http.server, json, os, socketserver, sys, tempfile, threading, types, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stub</title></head><body><main>
<h1>Coverage</h1>
<label for="who">Your insurer</label>
<select id="who" onchange="if (this.value === 'go') location.href = '/next.html'">
<option value="" disabled selected>Select your insurer</option>
<option value="a">Aetna</option>
<option value="am" label="Aetna Medicare Advantage">Aetna
   Medicare   Advantage</option>
<option value="go">Next page</option>
</select>
<label for="zip">Your ZIP code</label><input id="zip" inputmode="numeric">
<p><a href="/next.html">A plain link</a></p>
</main></body></html>"""
NEXT = "<!doctype html><html lang='en'><head><title>Next</title></head><body><main><h1>Next</h1></main></body></html>"


class Live(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # run.py points Playwright at the _hqbrowser wrapper (macOS mini only). This test drives a stub page on a temporary
        # local port with the runner's own route guard, so it starts Playwright's own driver instead.
        os.environ.pop("PLAYWRIGHT_NODEJS_PATH", None)
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise unittest.SkipTest("no Playwright")
        cls.dir = tempfile.mkdtemp()
        open(os.path.join(cls.dir, "index.html"), "w").write(PAGE)
        open(os.path.join(cls.dir, "next.html"), "w").write(NEXT)
        handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=cls.dir, **k)
        http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
        cls.httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.origin = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        cls.pw = sync_playwright().start()
        try:
            cls.browser = cls.pw.chromium.launch()
        except Exception as ex:
            cls.pw.stop(); raise unittest.SkipTest(f"Chromium will not start here: {ex}")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.httpd.shutdown()

    def walk(self, script):
        out = tempfile.mkdtemp()
        moves = iter(script)
        real = run.ask_patient
        run.ask_patient = lambda *a, **k: (next(moves), 0.0)
        try:
            a = types.SimpleNamespace(origin=self.origin, out=out, axe="/nonexistent-axe.js", model="stub")
            persona = {"id": "p", "device": "phone390", "mode": "sighted", "start": "/index.html", "who": "x"}
            task = {"id": "t", "function": "check insurance", "goal": "pick", "tap_budget": 8, "finish": {"url_re": "never-met"}, "words": []}
            run.run_task(self.browser, "chromium", persona, task, a, run.Spend(1), out, "system")
        finally:
            run.ask_patient = real
        with open(os.path.join(out, "chromium", "p", "t", "steps.jsonl")) as fh:
            return [json.loads(l) for l in fh]

    def test_branches(self):
        box = {"tap_words": "Your insurer", "where": "top", "down_pct": 15, "across_pct": 50}
        steps = self.walk([
            dict(action="choose", option="Aetna", **box),                         # 0 not opened yet
            dict(action="choose", option="x", tap_words="Your ZIP code", where="middle", down_pct=25, across_pct=20),   # 1 a text box
            dict(action="tap", **box),                                             # 2 opens: choices listed
            dict(action="choose", option="Cigna", **box),                          # 3 not on the list: miss, list stays open
            dict(action="choose", option="Aetna Medicare Advantage plan", **box),  # 4 longest option inside the words, by label
            dict(action="tap", **box),                                             # 5 open again
            dict(action="type", text="60611", tap_words="Your ZIP code", where="middle", down_pct=25, across_pct=20),  # 6 closes the list
            dict(action="choose", option="Aetna", **box),                          # 7 not open any more
            dict(action="choose", option="x", tap_words="A plain link", where="lower", down_pct=35, across_pct=20),     # 8 a link's words
            dict(action="tap", **box),                                             # 9
            dict(action="choose", option="Next page", **box),                      # 10 change handler navigates
            dict(action="done"),
        ])
        r = [s.get("result", "") for s in steps]
        self.assertIn("not open", r[0])
        self.assertIn("not a list box", r[1])
        self.assertTrue(r[2].startswith("a list opened with these choices: Aetna; Aetna Medicare Advantage; Next page"), r[2])
        self.assertTrue(r[3].startswith('no single choice matches "Cigna"'), r[3])
        self.assertEqual(r[4], 'chose "Aetna Medicare Advantage"')
        self.assertIn("typed", r[6])
        self.assertIn("not open", r[7])
        self.assertIn("could not find a list box", r[8])
        self.assertEqual(steps[8]["named"]["resolved_how"], "plain_text")
        self.assertEqual(steps[8]["url"], "/index.html")
        self.assertIn('chose "Next page", and the page changed to /next.html', r[10])
        self.assertEqual([s["taps"] for s in steps[:11]], [1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10])   # typing costs no tap


if __name__ == "__main__":
    unittest.main()
