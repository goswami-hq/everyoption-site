#!/usr/bin/env python3
"""Reading-level test for condition pages (job 12): Flesch-Kincaid grade per section of content/conditions/<slug>.toml.

  python3 tools/readability.py fibroids          # table per section; exit 1 if a section is over the bar
  python3 tools/readability.py fibroids --worst 8 # also list the 8 hardest sentences

Flesch-Kincaid grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59.
Medical names in the content file's [[terms]] list are left out of the count (the words, not the sentence), because no
plain word replaces them; the page must explain each one in plain words where it first appears, and this test checks
that the explanation sits in the same paragraph. The score is a tool, not the goal: read each section as a patient would.
Syllables are counted by vowel groups with the usual English corrections; numbers count as one word of one syllable.
The comparison table's short cells and the reference list are not prose and are not scored.
"""
import re, sys
import condition

BAR, AIM = 6.0, 4.0
WORD = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*|\d+(?:[.,]\d+)*")


def syllables(w):
    w = w.lower().replace("’", "'")
    if w[0].isdigit():
        return 1
    w = re.sub(r"'s$|'t$|'ll$|'re$|'ve$|'d$|'m$", "", w)
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$", "", w)   # silent endings: makes, used, take
    w = re.sub(r"^y", "", w)
    n = len(re.findall(r"[aeiouy]{1,2}", w))
    if re.search(r"[^aeiouy]le$", w):
        n += 1
    return max(1, n)


def sentences(text):
    t = condition.plain(text)
    t = re.sub(r"\b(e\.g|i\.e|vs|Dr|U\.S)\.", lambda m: m.group(0).replace(".", ""), t)
    parts = re.split(r"(?<=[.!?])\s+|\s*;\s+|\s+[—–]\s+|:\s+(?=[A-Z])", t)
    return [p.strip() for p in parts if WORD.search(p or "")]


def strip_terms(s, terms):
    for t in sorted(terms, key=len, reverse=True):
        s = re.sub(r"(?i)\b" + re.escape(t) + r"s?\b", " ", s)   # a term covers its plural
    return s


def grade(sents, terms):
    words = syl = 0
    for s in sents:
        ws = WORD.findall(strip_terms(s, terms))
        words += len(ws)
        syl += sum(syllables(w) for w in ws)
    if not words or not sents:
        return None, 0, 0
    return 0.39 * (words / len(sents)) + 11.8 * (syl / words) - 15.59, len(sents), words


def blocks(c):
    """(section name, [text...]) in page order."""
    out = [("Direct answer", [c["answer"]]), ("Comparison (intro)", [c["compare_intro"]])]
    for s in c["sections"]:
        if s.get("place", "before") == "before":
            out.append((s["heading"], s.get("text", []) + s.get("list", []) + s.get("after", [])))
    out.append((c["options_heading"], [c["options_intro"]]))
    for o in c["options"]:
        out.append(("Option: " + o["name"], [o[k] for k, _ in condition.FIELDS if o.get(k)] + ([o["next"]] if o.get("next") else [])))
    for s in c["sections"]:
        if s.get("place") == "after":
            out.append((s["heading"], s.get("text", []) + s.get("list", []) + s.get("after", [])))
    out.append((c["faq_heading"], [x for q in c["faq"] for x in (q["q"], q["a"])]))
    out.append((c["find_heading"], c["find_text"]))
    return out


def option_words(c):
    return {o["name"]: len(WORD.findall(" ".join(condition.plain(o[k]) for k, _ in condition.FIELDS if o.get(k))))
            for o in c["options"]}


def term_check(c):
    """Each listed term (or its plural) is on the page, and the section or option where it first appears also holds its
    stated plain explanation. Headings count as part of their section."""
    groups = [[c["answer"]], [c["compare_intro"]]]
    for s in c["sections"]:
        if s.get("place", "before") == "before":
            groups.append([s["heading"]] + s.get("text", []) + s.get("list", []) + s.get("after", []))
    groups.append([c["options_heading"], c["options_intro"]])
    for o in c["options"]:
        groups.append([o["heading"]] + ([o["aka"]] if o.get("aka") else []) + [o[k] for k, _ in condition.FIELDS if o.get(k)])
    for s in c["sections"]:
        if s.get("place") == "after":
            groups.append([s["heading"]] + s.get("text", []) + s.get("list", []) + s.get("after", []))
    groups.append([x for q in c["faq"] for x in (q["q"], q["a"])])
    groups.append([c["find_heading"]] + c["find_text"])
    problems = []
    for t in c["terms"]:
        pat = r"(?i)\b" + re.escape(t["term"]) + r"s?\b"
        first = next((g for g in groups if re.search(pat, " ".join(condition.plain(x) for x in g))), None)
        if first is None:
            problems.append(f"term not on page: {t['term']}")
        elif t["explain"].lower() not in " ".join(condition.plain(x) for x in first).lower():
            problems.append(f"term {t['term']!r}: the section where it first appears lacks {t['explain']!r}")
    return problems


def report(slug, worst=0):
    c = condition.load(slug)
    terms = [t["term"] for t in c["terms"]]
    rows, fails, all_sents = [], [], []
    for name, texts in blocks(c):
        sents = [s for t in texts for s in sentences(t)]
        g, n, w = grade(sents, terms)
        rows.append((name, g, n, w))
        if g is not None and g > BAR:
            fails.append(name)
        all_sents += [(grade([s], terms)[0], name, s) for s in sents]
    whole = grade([s for _, _, s in all_sents], terms)[0]
    print(f"{'Section':58} {'grade':>6} {'sent':>5} {'words':>6}")
    for name, g, n, w in rows:
        print(f"{name[:58]:58} {'' if g is None else f'{g:6.1f}':>6} {n:5d} {w:6d}")
    print(f"{'Whole page':58} {whole:6.1f}")
    print(f"{'Whole page, medical names counted too':58} {grade([s for _, _, s in all_sents], [])[0]:6.1f}")
    print(f"Bar {BAR} per section, aim {AIM}. Medical names left out of the count: {', '.join(terms)}")
    ow = option_words(c)
    long = {k: v for k, v in ow.items() if v > 120}
    print("Words per option:", ", ".join(f"{k} {v}" for k, v in ow.items()))
    problems = term_check(c) + [f"option over 120 words: {k} ({v})" for k, v in long.items()]
    problems += [f"section over grade {BAR}: {n}" for n in fails]
    aw = len(WORD.findall(condition.plain(c["answer"])))
    if not 40 <= aw <= 60:
        problems.append(f"direct answer is {aw} words, not 40 to 60")
    if worst:
        print(f"\nHardest {worst} sentences:")
        for g, name, s in sorted(all_sents, key=lambda x: -(x[0] or 0))[:worst]:
            print(f"  {g:5.1f}  [{name[:30]}] {s}")
    for p in problems:
        print("PROBLEM:", p)
    return rows, problems


if __name__ == "__main__":
    args = sys.argv[1:]
    w = int(args[args.index("--worst") + 1]) if "--worst" in args else 0
    names = [a for a in args if not a.startswith("--") and not a.isdigit()] or condition.slugs()
    bad = False
    for slug in names:
        print(f"== {slug}")
        _, problems = report(slug, w)
        bad |= bool(problems)
    sys.exit(1 if bad else 0)
