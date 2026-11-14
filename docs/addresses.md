# Page addresses

His yes, 2026-11-06: "Yes change the addresses now" (change 1 of the architecture review, ai-hq
`projects/platform/design/architecture-2026-11-06/list-for-him.md`). Locked before launch.

## The rule

1. Every page sits under its condition's address:
   - `/<condition>/`: the simple page
   - `/<condition>/every-option/`: the deep page
   - `/<condition>/doctors/<metro>/`: a city page
   - `/<condition>/insurance/`: the coverage page for that condition's procedure (his yes, 2026-11-08; noindex until launch)
   One page sits outside a condition: `/insurance/`, the coverage hub across procedures.
   Legal pages sit outside conditions too (to-do W32, ai-hq job platform-launch-0005, 2026-11-13): `/terms/` (visitor
   terms of use), `/privacy/` (privacy policy), `/physician-terms/` (physician account terms). Linked from every page's
   footer, in the page sitemap, and noindex on the dev site by the same `_headers` rule as every other page. Their
   texts are `content/legal/`, word for word from his signed-off drafts; `tools/legal.py` builds them.
2. Addresses name the condition, never the procedure. `/knee-arthritis/`, not `/arthritis-embolization/` or `/gae/`.
3. A procedure that treats two conditions keeps one city list, under its main condition. The other
   condition's page links to that list; it does not get a second copy.

## Current condition addresses

| Condition | Address | Procedure |
| --- | --- | --- |
| Fibroids | `/fibroids/` | UFE |
| Enlarged prostate | `/enlarged-prostate/` | PAE |
| Knee arthritis | `/knee-arthritis/` | GAE (knee only) |
| Chronic pelvic pain | `/chronic-pelvic-pain/` | pelvic vein embolization (no doctor list yet) |
| Hemorrhoids | `/hemorrhoids/` | HAE (no doctor list; draft, unlinked from the home page) |

Procedure-to-page tables that must agree with this list: `PROC_PAGE` (`tools/directory.py`, written into
`lib/directory-shell.mjs`), `PAGE_OF` (`lib/cities.mjs`), `HOME_LINK` and `MOVED` (`tools/build.py`).

## Changing an address

Only on his word. When one changes: add a 301 from both the old path and the old path without its slash
to the new one in `content/redirects.txt` (the build writes `site/_redirects` from it); point any older 301 straight at the new page (no chains); move every
page under the old path to the same path under the new one, with its own 301; add the old folder to
`RENAMED` in `tools/build.py` so the build removes it; extend `tools/addresses.test.mjs`.

## Redirects in place

| From | To |
| --- | --- |
| `/arthritis-embolization/`, `/arthritis-embolization` | `/knee-arthritis/` (301, 2026-11-06) |
| `/gae/`, `/gae` | `/knee-arthritis/` (301, straight, no chain) |
| `/ufe/`, `/ufe` | `/fibroids/` (301) |
| `/pae/`, `/pae` | `/enlarged-prostate/` (301) |
| `/pelvic-vein-pain/`, `/pelvic-vein-pain` | `/chronic-pelvic-pain/` (301, 2026-11-07, job platform-main-0024) |
| `/claim/`, `/claim` | `/report/` (301) |
