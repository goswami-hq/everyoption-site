#!/usr/bin/env python3
"""The site-equals-views check (ai-hq job platform-directory-0034, procedure registry job 3).

The doctor lists in site/data/<key>.json and the nearby list site/data/ir-roster.json are written only by goswami-hq/ai-hq
`scripts/every_option_export.py all`: the national views plus his listing decisions (ai-hq
projects/platform/directory/listing-decisions.csv). The site cannot read ai-hq at build time, so the export also writes
site/data/listings-fingerprint.json: per list, the rows, a hash of the NPIs in order and a hash of the whole list
(keys sorted, without the "path" field the build stamps on). The build stops when a list differs from it.

Catches: a hand edit of a list (a card added, dropped or changed), a partial or stale copy of one list, a procedure in
the registry with no exported list, a list copied in without its fingerprint.
Cannot catch: the views or the decisions file changing in ai-hq without a fresh export (that is ai-hq's
scripts/every_option_drift.py), or a list and its fingerprint edited together by hand.

  python3 tools/listings_check.py        # also run by every python3 tools/build.py
Standard library only.
"""
import hashlib, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINGERPRINT = "listings-fingerprint.json"
NEARBY = "nearby"
ROSTER = "ir-roster.json"


def canonical(d):
    """Same as ai-hq every_option_export.canonical."""
    d = dict(d, people=[{k: v for k, v in p.items() if k != "path"} for p in d.get("people", [])])
    return json.dumps(d, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def one(d):
    return {"rows": len(d["people"]),
            "npis_sha256": hashlib.sha256("\n".join(p["npi"] for p in d["people"]).encode()).hexdigest(),
            "list_sha256": hashlib.sha256(canonical(d)).hexdigest()}


def stages(root=ROOT):
    """key -> stage, for every procedure in the registry."""
    with open(os.path.join(root, "content", "procedures.json"), encoding="utf-8") as fh:
        return {p["key"]: p.get("stage") for p in json.load(fh)}


def keys(root=ROOT):
    return list(stages(root))


def check(site=None, root=ROOT):
    """Errors ([] when every list equals its fingerprint)."""
    site = site or os.path.join(root, "site")
    data = os.path.join(site, "data")
    fp_path = os.path.join(data, FINGERPRINT)
    if not os.path.exists(fp_path):
        return [f"site/data/{FINGERPRINT} is missing: run ai-hq scripts/every_option_export.py all --site <this worktree>"]
    with open(fp_path, encoding="utf-8") as fh:
        fp = json.load(fh)
    want = dict(fp.get("procedures", {}))
    # A procedure at stage "page" needs no list yet (plan review item 2); found by the fake-procedure guard test
    # (tools/new_procedure_test.py, ai-hq job platform-directory-0035). If the export already wrote one, it is checked.
    st = stages(root)
    files = {k: k + ".json" for k in st if st[k] != "page" or k in want}
    if NEARBY in fp:
        want[NEARBY] = fp[NEARBY]
        files[NEARBY] = ROSTER
    errs = [f"{k}: in the fingerprint but not in content/procedures.json" for k in fp.get("procedures", {}) if k not in st]
    for k, f in files.items():
        if k not in want:
            errs.append(f"{k}: no fingerprint (the list was not written by the ai-hq export)")
            continue
        path = os.path.join(data, f)
        if not os.path.exists(path):
            errs.append(f"{k}: site/data/{f} is missing")
            continue
        with open(path, encoding="utf-8") as fh:
            got = one(json.load(fh))
        w = want[k]
        if got == w:
            continue
        what = []
        if got["rows"] != w["rows"]:
            what.append(f"{got['rows']} rows, the export wrote {w['rows']}")
        elif got["npis_sha256"] != w["npis_sha256"]:
            what.append("same row count, different doctors or order")
        if got["list_sha256"] != w["list_sha256"] and not what:
            what.append("same doctors, a card's fields differ")
        errs.append(f"{k}: site/data/{f} differs from the export ({'; '.join(what)}); a list is changed only by the ai-hq "
                    "export, from the views plus listing-decisions.csv")
    return errs


def require(site=None, root=ROOT):
    errs = check(site, root)
    if errs:
        raise SystemExit("listings: the doctor lists differ from the ai-hq export's fingerprint:\n  " + "\n  ".join(errs))


if __name__ == "__main__":
    e = check()
    print("\n".join(e) if e else "listings: every list equals its fingerprint")
    sys.exit(1 if e else 0)
