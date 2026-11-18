#!/usr/bin/env python3
"""Turn a walkthrough run folder into the report's tables (for grading from logs, not code).

  python3 -I tools/walkthrough/summarize.py <run dir> <output dir> [<baseline run dir>]

Writes results-table.md (the fixed panel only; a baseline adds a before-and-after column), traces.md, axe-summary.md, explorers.md, random-tracks.md, affordance.md and misses.md. Explorers and
random tracks are never in the before-and-after table. Reads only results.json, each task's steps.jsonl and step axe files, random-tracks.json and affordance.json."""
import json, os, re, sys

RUN, OUT = sys.argv[1], sys.argv[2]
BASE = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
data = json.load(open(os.path.join(RUN, "results.json")))
all_rows = data["results"]
rows = [r for r in all_rows if r.get("kind", "fixed") == "fixed"]
before = {}
if BASE:
    for r in json.load(open(os.path.join(BASE, "results.json")))["results"]:
        before[(r["persona"], r["task"])] = r
base_note = f"Before-and-after against {BASE}: fixed panel only. Explorers and random tracks are never in this table." if BASE else ""
table = ["| Persona | Task | Function | Device | Status | Taps / budget | Before | Scrolls | Back | Misses | Fails | Outcome | Final page | Cost |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
for r in rows:
    b = before.get((r["persona"], r["task"]))
    was = f'{b.get("status")}, {b.get("taps")} taps' if b else "(none)"
    table.append("| {persona} | {task} | {function} | {device} | {status} | {taps} / {budget} | ".format(**{**dict(device="", taps="", budget=""), **r}) + was + " | {scrolls} | {backs} | {misses} | {fails} | {outcome} | `{final_url}` | ${cost_usd} |".format(**{**dict(scrolls="", backs="", misses="", fails="", outcome="", final_url="", cost_usd=""), **r}))
count = {}
for r in rows:
    count[r.get("status")] = count.get(r.get("status"), 0) + 1
head = [f"Run: {RUN}", base_note, f"Model: {data.get('model')}; spend ${data.get('spend_usd')} in {data.get('calls')} patient calls (affordance ${data.get('affordance_spend_usd', 0)}); engine(s): {sorted(set(r.get('engine') for r in rows))}", f"Status counts (fixed panel): {count}", ""]
open(os.path.join(OUT, "results-table.md"), "w", encoding="utf8").write("\n".join(head + table) + "\n")

axe_ids, trace, misses = {}, [], []
for r in all_rows:
    tdir = os.path.join(RUN, r.get("engine", ""), r["persona"], r["task"])
    trace.append(f'\n## {r["persona"]} / {r["task"]} ({r.get("function")}): {r.get("status")}, taps {r.get("taps")} of {r.get("budget")}, misses {r.get("misses")}, outcome {r.get("outcome")}, final {r.get("final_url")}')
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
        n = d.get("named") or {}
        if not n and isinstance(tgt, str) and tgt.startswith("MISS"):  # the runner writes this placeholder on a sighted step with no tap; it is not a miss
            tgt = ""
        extra = f' | named: "{n.get("tap_words", "")}" at "{n.get("where", "")}" -> {n.get("resolved_how")}' if n else ""
        trace.append(f'- {d["step"]:02d} `{d["url"]}` **{d["action"]}** {tgt or ""} | looking for: {d.get("looking_for", "")} | {d.get("thinking", "")} | why: {d.get("why", "")}{extra} | -> {d.get("result", "")} | finish met: {d.get("finish_met_now")}')
        if n.get("miss"):
            misses.append(f'| {r["persona"]} / {r["task"]} | {r.get("device")} | {d["step"]} | `{d["url"]}` | {n.get("tap_words", "")} | {n.get("where", "")} | {n.get("resolved_how")} | {d.get("looking_for", "")} |')
        axe_path = os.path.join(tdir, f'step-{d["step"]:02d}-axe.json')
        if os.path.exists(axe_path):
            for v in json.load(open(axe_path)).get("violations", []):
                k = (v["id"], v.get("impact"))
                axe_ids.setdefault(k, {"pages": set(), "help": v.get("help"), "nodes": v.get("count", 0), "example": None})
                axe_ids[k]["pages"].add(d["url"].split("#")[0].split("?")[0])
                axe_ids[k]["example"] = axe_ids[k]["example"] or (v.get("nodes") or [None])[0]
open(os.path.join(OUT, "traces.md"), "w", encoding="utf8").write("# Task traces (from the runner's logs)\n" + "\n".join(trace) + "\n")
open(os.path.join(OUT, "misses.md"), "w", encoding="utf8").write("# Sighted taps that resolved to nothing\n\nCounts as a tap; nothing happened, as with a finger on text that is not a link.\n\n| Patient | Device | Step | Page | What it named | Where | Why it missed | Looking for |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n" + "\n".join(misses) + "\n")
axe = ["| Rule | Impact | Help | Pages | Example |", "| --- | --- | --- | --- | --- |"]
for (rid, impact), v in sorted(axe_ids.items(), key=lambda x: -len(x[1]["pages"])):
    axe.append(f'| {rid} | {impact} | {v["help"]} | {len(v["pages"])}: {", ".join(sorted(v["pages"])[:6])} | {json.dumps(v["example"])[:200] if v["example"] else ""} |')
open(os.path.join(OUT, "axe-summary.md"), "w", encoding="utf8").write("# axe-core 4.14.0 violations across every step of the run\n\n" + "\n".join(axe) + "\n")

ex = ["# Explorers: no goal, no finish line. Never in before-and-after.", ""]
for r in [x for x in all_rows if x.get("kind") == "explorer"]:
    ex += [f'## {r["persona"]} ({r.get("device")}): {r.get("status")}, taps {r.get("taps")} of {r.get("budget")}, final `{r.get("final_url")}`', ""]
    path = os.path.join(RUN, r.get("engine", ""), r["persona"], r["task"], "steps.jsonl")
    for line in open(path, encoding="utf8") if os.path.exists(path) else []:
        d = json.loads(line)
        ex.append(f'- {d["step"]:02d} `{d["url"]}` **{d["action"]}** | expected: {d.get("expected", "")} | met: {d.get("met", "")} | surprise: {d.get("surprise", "")} | looking for: {d.get("looking_for", "")}')
    ex.append("")
open(os.path.join(OUT, "explorers.md"), "w", encoding="utf8").write("\n".join(ex))

rt = ["# Random tracks: reported separately, never in before-and-after.", ""]
rf = os.path.join(RUN, "random-tracks.json")
if os.path.exists(rf):
    info = json.load(open(rf))
    rt += [f"Seed: {info.get('seed')}. Pages in the pool by kind: {info.get('site_root_pages')}. Status is the patient's own word; these tracks have no finish line.", "", "| Track | From persona | Start kind | Start | Function | Device | Status | Taps / budget | Misses | Outcome | Final page |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    res = {r["persona"]: r for r in all_rows if r.get("kind") == "random"}
    for t in info.get("tracks", []):
        r = res.get(t["id"], {})
        rt.append(f'| {t["id"]} | {t["base_persona"]} | {t["start_kind"]} | `{t["start"]}` | {t["tasks"][0]["function"]} | {t["device"]} | {r.get("status")} | {r.get("taps")} / {r.get("budget")} | {r.get("misses")} | {r.get("outcome")} | `{r.get("final_url")}` |')
open(os.path.join(OUT, "random-tracks.md"), "w", encoding="utf8").write("\n".join(rt) + "\n")

af = ["# Does it look tappable: screenshot-only check against the real controls", "", "Once per distinct page and device, one pass down the page. Citation numbers are grouped: the checker lists runs like \"1, 2\", the page has separate links.", ""]
af_file = os.path.join(RUN, "affordance.json")
if os.path.exists(af_file):
    d = json.load(open(af_file))
    NUM = re.compile(r"^[\d\s,\-–]+$")
    af += [f"Calls {d.get('calls')}; spend ${d.get('spend_usd')}.", ""]
    for r in sorted(d.get("results", []), key=lambda x: (x.get("path", ""), x.get("device", ""))):
        un = [x for x in r["does_not_look_tappable"] if not NUM.match(x["words"] or "")]
        ph = [x for x in r["looks_tappable_is_not"] if not NUM.match(x["words"] or "")]
        unsure = [x for x in r["unclear"] if not NUM.match(x["words"] or "")]
        cites = len(r["does_not_look_tappable"]) - len(un)
        af.append(f'## `{r["path"]}` on {r["device"]}: {r["screens"]} screens, {r["controls"]} controls, {r.get("errors", 0)} checker errors, citation markers unlisted: {cites}')
        af += [f'- Does not look tappable: "{x["words"]}" -> {x.get("href", "")} ({x["shot"]})' for x in un]
        af += [f'- Unclear: "{x["words"]}" -> {x.get("href", "")} ({x["shot"]})' for x in unsure]
        af += [f'- Looks tappable, is not: "{x["words"]}" at {x.get("where", "")} ({x["shot"]})' for x in ph]
        af.append("")
open(os.path.join(OUT, "affordance.md"), "w", encoding="utf8").write("\n".join(af) + "\n")
print("fixed", count, "explorers", sum(1 for r in all_rows if r.get("kind") == "explorer"), "random", sum(1 for r in all_rows if r.get("kind") == "random"), "misses", len(misses), "axe rules", len(axe_ids))
