#!/usr/bin/env python3
"""Signed-in walkthrough tasks (ai-hq job platform-directory-0036). A model patient cannot read the emailed sign-in code,
so a task with "setup": {"invite_npi": <made-up fixture NPI>} starts from a fresh local invitation link instead: this
script asks the local dev server (node tools/dev-server.mjs <port> --accounts) for one owner invitation per such task
(/__invite, the stand-in for tools/invite.mjs) and writes a copy of the panel whose task "start" is that link. The
committed panel is unchanged; run.py reads the copy through --panel. Local stand-in accounts only; standard library.

  python3 -I tools/walkthrough/invite_starts.py --origin http://localhost:8799 --out <run folder>/panel-run.json
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", default=os.path.join(HERE, "panel.json"))
    ap.add_argument("--origin", default="http://localhost:8799")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if not re.fullmatch(r"http://(localhost|127\.0\.0\.1):\d+", a.origin):
        sys.exit("origin must be a local http server")
    d = json.load(open(a.panel, encoding="utf-8"))
    n = 0
    for p in d["personas"]:
        for t in p.get("tasks", []):
            npi = (t.get("setup") or {}).get("invite_npi")
            if not npi:
                continue
            q = urllib.parse.urlencode({"kind": "owner", "npi": npi})
            r = json.loads(urllib.request.urlopen(f"{a.origin}/__invite?{q}", timeout=10).read())
            m = re.search(r"#invite=([0-9a-f]{64})$", r.get("url", ""))
            if not m:
                sys.exit(f"task {t['id']}: no invitation for {npi}: {r.get('error') or r}")
            t["start"] = "/account/#invite=" + m.group(1)
            n += 1
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(d, fh, indent=1, ensure_ascii=False)
    print(f"{n} signed-in task starts written to {a.out}")


if __name__ == "__main__":
    main()
