#!/usr/bin/env python3
"""Job 21 (review rounds 1 and 2): where the live test's keys can go. Local servers only, made-up key values.
  1. Cloudflare Access headers go only to https on the dev site's host: also across a redirect within it, never to
     another host a redirect names, never over plain http.
  2. The Supabase secret key is never sent on through a redirect.
  3. A key inside error text is removed before the text is cut, so no piece of it is kept.
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/access_headers_check.py
"""
import http.server, os, sys, threading
sys.argv = ["x", "/tmp/eo21-access-check"]; os.makedirs(sys.argv[1], exist_ok=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import accounts_e2e as A
from playwright.sync_api import sync_playwright

seen, fails = [], []


def ok(name, cond, detail=""):
    print(("OK   " if cond else "FAIL ") + name + ("" if cond else f" ({detail})"))
    cond or fails.append(name)


class H(http.server.BaseHTTPRequestHandler):
    def go(self):
        seen.append((self.server.server_port, self.path, self.headers.get("CF-Access-Client-Secret"), self.headers.get("apikey")))
        hops = {"/hop-out": "http://127.0.0.1:8902/landing", "/hop-in": "/page", "/rest/v1/rpc/eo_test_count": "http://127.0.0.1:8902/stolen"}
        if self.path in hops:
            self.send_response(302); self.send_header("Location", hops[self.path]); self.end_headers(); return
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers(); self.wfile.write(b"<p>ok</p>")
    do_GET = do_POST = go

    def log_message(self, *a):
        pass


for port in (8901, 8902):
    threading.Thread(target=http.server.HTTPServer(("127.0.0.1", port), H).serve_forever, daemon=True).start()

cfg = {"base": "http://127.0.0.1:8901", "access_id": "ID1", "access_secret": "SEC1-access-secret-made-up",
       "email_user": "a@b.c", "email_tag": "x1234", "supabase_url": "http://127.0.0.1:8901", "supabase_key": "sb_secret_MADEUPKEY123",
       "npi": "1999000031"}
s = A.LiveSite(cfg)
A.tls()

# 1a: the real rule refuses plain http, even on the right host
ok("Access headers: plain http on the dev site's host is refused", not s.ours("http://127.0.0.1:8901/x"))
ok("Access headers: https on the dev site's host is allowed", s.ours("https://127.0.0.1:8901/x"))
ok("Access headers: https on another host is refused", not s.ours("https://127.0.0.1:8902/x"))
# 1b: hops, with the scheme rule relaxed for these local http servers only
s.ours = lambda u: u.startswith("http://127.0.0.1:8901/")
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(); s.attach(ctx); pg = ctx.new_page()
    pg.goto("http://127.0.0.1:8901/hop-in"); pg.goto("http://127.0.0.1:8901/hop-out")
    b.close()
ok("Access headers: sent to the dev site, also after a redirect within it",
   all(x[2] == cfg["access_secret"] for x in seen if x[0] == 8901), seen)
ok("Access headers: a redirect to another host is followed without them",
   any(x[0] == 8902 for x in seen) and not any(x[2] for x in seen if x[0] == 8902), seen)

# 2: the secret key and a redirect
seen.clear()
try:
    s.gate("127.0.0.1"); raised = ""
except A.SetupFailed as e:
    raised = str(e)
ok("Supabase key: a redirect stops the call as a setup failure", "unexpected redirect" in raised, raised)
ok("Supabase key: the other host never receives it", not any(x[0] == 8902 for x in seen), seen)

# 3: a key across the 200-character cut leaves no piece behind
A.SECRET_VALUES[:] = [cfg["access_secret"], cfg["supabase_key"]]
text = "x" * 190 + cfg["access_secret"] + " more\nCall log:\n  - CF-Access-Client-Secret: " + cfg["access_secret"]
kept = A.scrub(text)[:200]
A.check("made-up check", False, text)
stored = A.R["checks"][-1]["detail"]
pieces = [cfg["access_secret"][i:i + 8] for i in range(len(cfg["access_secret"]) - 7)]
ok("Error text: no 8-character piece of a key survives the cut", not any(q in kept or q in stored for q in pieces), stored)

print("PASS" if not fails else "FAIL")
sys.exit(1 if fails else 0)
