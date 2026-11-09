#!/usr/bin/env python3
"""Turn a walkthrough run folder into a per-task table and one trace file per task (for grading from logs, not code).

  python3 -I tools/walkthrough/summarize.py <run dir> <output dir>

Writes results-table.md and traces.md. Reads only results.json and each task's steps.jsonl and step axe files."""
import json, os, sys

RUN, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
data = json.load(open(os.path.join(RUN, "results.json")))
rows = data["results"]
table = ["| Persona | Task | Function | Device | Status | Taps / budget | Scrolls | Back | Fails | Cost |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
for r in rows:
    table.append("| {persona} | {task} | {function} | {device} | {status} | {taps} / {budget} | {scrolls} | {backs} | {fails} | ${cost_usd} |".format(**{**dict(device="", taps="", budget="", scrolls="", backs="", fails="", cost_usd=""), **r}))
count = {}
for r in rows:
    count[r.get("status")] = count.get(r.get("status"), 0) + 1
head = [f"Run: {RUN}", f"Model: {data.get('model')}; spend ${data.get('spend_usd')} in {data.get('calls')} patient calls; engine(s): {sorted(set(r.get('engine') for r in rows))}", f"Status counts: {count}", ""]
open(os.path.join(OUT, "results-table.md"), "w", encoding="utf8").write("\n".join(head + table) + "\n")

axe_ids = {}
trace = []
for r in rows:
    tdir = os.path.join(RUN, r.get("engine", ""), r["persona"], r["task"])
    trace.append(f'\n## {r["persona"]} / {r["task"]} ({r.get("function")}): {r.get("status")}, taps {r.get("taps")} of {r.get("budget")}, outcome {r.get("outcome")}, final {r.get("final_url")}')
    if r.get("page_errors"):
        trace.append(f'Page errors: {r["page_errors"]}')
    if r.get("blocked"):
        trace.append(f'Outside requests blocked: {r["blocked"]}')
    path = os.path.join(tdir, "steps.jsonl")
    if not os.path.exists(path):
        trace.append("(no steps)"); continue
    for line in open(path, encoding="utf8"):
        d = json.loads(line)
        t = d.get("target")
        tgt = (t.get("aria") or "") + (f' [{t.get("w")}x{t.get("h")}]' if t.get("w") else "") if isinstance(t, dict) else t
        trace.append(f'- {d["step"]:02d} `{d["url"]}` **{d["action"]}** {tgt or ""} | looking for: {d.get("looking_for", "")} | {d.get("thinking", "")} | why: {d.get("why", "")} | -> {d.get("result", "")} | finish met: {d.get("finish_met_now")}')
        axe_path = os.path.join(tdir, f'step-{d["step"]:02d}-axe.json')
        if os.path.exists(axe_path):
            for v in json.load(open(axe_path)).get("violations", []):
                k = (v["id"], v.get("impact"))
                axe_ids.setdefault(k, {"pages": set(), "help": v.get("help"), "nodes": v.get("count", 0), "example": None})
                axe_ids[k]["pages"].add(d["url"].split("#")[0].split("?")[0])
                axe_ids[k]["example"] = axe_ids[k]["example"] or (v.get("nodes") or [None])[0]
open(os.path.join(OUT, "traces.md"), "w", encoding="utf8").write("# Task traces (from the runner's logs)\n" + "\n".join(trace) + "\n")
axe = ["| Rule | Impact | Help | Pages | Example |", "| --- | --- | --- | --- | --- |"]
for (rid, impact), v in sorted(axe_ids.items(), key=lambda x: -len(x[1]["pages"])):
    axe.append(f'| {rid} | {impact} | {v["help"]} | {len(v["pages"])}: {", ".join(sorted(v["pages"])[:6])} | {json.dumps(v["example"])[:200] if v["example"] else ""} |')
open(os.path.join(OUT, "axe-summary.md"), "w", encoding="utf8").write("# axe-core 4.14.0 violations across every step of the run\n\n" + "\n".join(axe) + "\n")
print(count, "axe rules with violations:", len(axe_ids))
