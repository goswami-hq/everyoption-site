# The condition page pattern

His words, 2026-11-06: "Yes" (give the simple and every-option pages separate search targets, starting with fibroids)
and "Whatever schema we use for fibroids should be saved so we can mimic it for every other condition". Written by
job platform-main-0016. Fibroids is the worked example throughout. Addresses follow `docs/addresses.md`.

Enforced by `tools/pattern.py` (runs at the end of every build; fails it) and `tools/condition-pattern.test.mjs`
(city pages). Tests of the check itself: `python3 tools/pattern_test.py`. A page type a condition does not have yet is
skipped; a draft simple page without `targets` gets only the structured-data checks until it adopts the pattern.

## The rule in one line

Each page type owns its own searches. The simple page answers "what are my options"; the every-option page answers
"how do they compare"; city pages answer "who does it near me". No two pages of one condition share a search target or
three words in a row of title or H1.

## Search targets: how to pick them

1. Write candidates from the templates below. 2. Pull US volumes (DataForSEO Google Ads search volume, one call, about
$0.09 for 47 phrasings on 2026-11-06; `scripts/dataforseo_volumes.py` in ai-hq). 3. Give each phrasing to exactly one
page; the first target of a page must appear in its title. 4. Record them in `targets = [...]` in the page's toml.

Fibroid volumes (US, monthly, DataForSEO 2026-11-06): fibroid treatment 22,200; fibroid medication 14,800; what are
fibroids 14,800; fibroid treatment options 3,600; how to shrink fibroids 1,900; fibroid specialist near me 880; best
treatment for fibroids 720; myomectomy recovery time 720; myomectomy vs hysterectomy 590; alternatives to hysterectomy
320; fibroid treatment without surgery 320; uterine fibroid embolization near me 260; non surgical fibroid treatment
210; ufe recovery time 210; ufe vs myomectomy 170; ufe vs hysterectomy 140; fibroid doctor nyc 90; single cities about
10 each. Raw file: ai-hq-data `dataforseo/keywords-2026-11-06/`.

Adopted (job platform-main-0024, his words 2026-11-07: "Let's build the rest of the pages to be similar"): prostate and
knee pass the whole check, box included; chronic pelvic pain (`/chronic-pelvic-pain/`) has the simple page only (no
every-option page or city pages until his review calls and a doctor list). Their volumes (DataForSEO 2026-11-07) are in
each condition toml beside `targets`; raw files in ai-hq-data `dataforseo/keywords-2026-11-07/`. City pages for PAE (8
metros) and GAE (4) follow the same rule as UFE (`content/metros.json`, `pages` per procedure); a condition still a draft
keeps its city pages noindex and out of the sitemap (`cities.drafts()`). A condition page with no doctor list yet sits in
the home list from `PAGE_ONLY` in `tools/build.py` ("Doctor list coming"), not in the ZIP dropdown.

## Page types

### 1. Simple page `/<condition>/`

- **Job:** the short, plain answer to "what are my options", with the IR option first and the finder at the top.
- **Targets (template):** "<condition> treatment options"; "<condition> treatment"; "<condition> treatment without
  surgery"; "alternatives to <surgery>"; "non surgical <condition> treatment"; "what is <condition>".
  Fibroids: `fibroid treatment options` (first), fibroid treatment, fibroid treatment without surgery, alternatives to
  hysterectomy, non surgical fibroid treatment.
- **Title:** "<Condition> Treatment Options, <qualifier> | Every Option", 65 characters or fewer with the brand.
  Fibroids: "Fibroid Treatment Options, With or Without Surgery | Every Option" (65).
- **Description:** 110 to 160 characters; names the options and what the page tells (how invasive, how well it works,
  side effects). Fibroids (155): "Your fibroid treatment options, including ones without surgery and alternatives to
  hysterectomy: how invasive each is, how well it works, and side effects."
- **H1:** the patient's goal, not the title. Fibroids: "Shrink fibroids without surgery". Must share no three words in
  a row with the every-option title or H1.
- **Section order:** H1 and ZIP finder; "What is <condition>?" box (top of the right column on desktop, after the
  finder and the folded Doctors by city on phones; see Shared rules); lead procedure (open) with diagram; plain answer; urgent line; "Your other
  <condition> treatment options" (categories folded: Medicines; Less invasive treatments, IR first; Surgery) with the
  every-option link at its top; Doctors by city block under the finder results; Learn more (sections, Common questions,
  References); "Page last reviewed <date>".
- **Coverage link** (job platform-condition-pages-0013, his words 2026-11-08 21:35 CT: "actual links to the insurance pages
  everywhere"): under the lead option's finder button, text = the coverage page's H1 (one source: `content/procedures.json`
  `coverage`). A procedure with no coverage page (pelvic) has no link. Also on: every-option (lead option, contents list),
  city pages (after the answer; after "Is <ABBR> right for me?"), finder results (above the list), doctor profile (under the
  plans field), home (under the condition list; hub), footer and wide-screen menu (hub). Placements and rejections:
  ai-hq `projects/platform/design/insurance-links-2026-11-08/`.
- **First-screen comparison link** (walkthrough finding 1, his words 2026-11-09: "1-4 changes let's do them"): "Compare
  your options" beside "How it works", to the every-option page; a condition with no every-option page has none. The
  link in "Your other options" stays.
- **Links out (required):** every-option page, descriptive anchor naming the comparisons (fibroids: "Compare them side
  by side: embolization vs. myomectomy, hysterectomy, and medicines"); city list and each city page (Doctors by city
  block); references. **Links in:** home card, every-option page, every city page, city hub breadcrumb.
- **Breadcrumbs:** none shown (top level).
- **Structured data:** MedicalWebPage (name and headline = H1, description, url, lastReviewed, audience Patient, about
  MedicalCondition with possibleTreatment per option, publisher). No FAQ markup.

### 2. Every-option page `/<condition>/every-option/`

- **Job:** every option compared side by side, tied number for number to the simple page (`tools/options.py`).
- **Targets (template):** "<procedure> vs <surgery>"; "<surgery A> vs <surgery B>"; "<procedure> vs <surgery>
  recovery"; "<condition> medication"; "best treatment for <condition>"; "<procedure> recovery time".
  Fibroids: `ufe vs myomectomy` (first), myomectomy vs hysterectomy, ufe vs hysterectomy, fibroid medication, best
  treatment for fibroids, ufe recovery time, myomectomy recovery time.
- **Title:** "<Procedure> vs. <Surgery A> vs. <Surgery B>, Compared | Every Option", 65 or fewer. Fibroids: "UFE vs.
  Myomectomy vs. Hysterectomy, Compared | Every Option" (60).
- **Description:** 110 to 160; the comparison and its axes. Fibroids (149): "Fibroid embolization (UFE) vs. myomectomy,
  hysterectomy, and medicines: recovery, results, risks, and which treatments keep the uterus, side by side."
- **H1:** "<Condition> treatments compared, side by side".
- **Section headings phrased as the comparisons** (`compare_headings` in the options toml; the simple page keeps the
  plain category names): table "Compared at a glance: recovery and which keep the uterus"; "Fibroid medicines
  compared"; "Embolization vs. other less invasive treatments"; "Myomectomy vs. hysterectomy, and other surgery". A
  heading that restates a claim must match the page text and the tie file; prefer headings that name the comparison
  without a claim.
- **Section order:** breadcrumbs; H1; first-screen view of the grid (`glance_peek`: the procedure and its main comparators, in grid order;
  `glance_peek_columns`: "How sure we are", the option's whole certainty word or its full effect phrase when it has none,
  and Recovery; the cell text the grid uses; walkthrough finding 2, his yes 2026-11-09); finder button; lede; link to the simple page; contents list ("On this page":
  every section, and each category's options by name; `src-assets/deep-nav.js` pins a copy while reading, a rail from
  1180 px and a bar below, with "Back to top"); "What is <condition>?" box (the same content as the simple page's, not a
  copy); glance table; one section per category (each option: its grid row as a summary, intro, how well it works, side
  effects and risks, what experts say); find-a-doctor block; urgent line; references; "Page last reviewed <date>".
- **Grid (his words, 2026-11-07: "how well does it work? For each option"):** the first column after the name is "How
  well it works": the option's certainty word from its detail (the simple page's word; none if the simple page uses
  none) and a short effect phrase in the glance row's `works`, numbers only as ledger facts. `works_note` under the grid
  says the figures come from different studies and do not rank. A blank cell or a certainty word typed into the cell
  fails the build (`tools/options-grid.test.mjs`).
- **Links out (required):** simple page, descriptive anchor (fibroids: "New to fibroids? Start with the short guide to
  your fibroid treatment options"); find-a-doctor block at the end: a ZIP box (GET to `/<condition>/#finder`) and the
  city list (fibroids: "Fibroid embolization doctors by city" to `/fibroids/doctors/`). **Links in:** simple page, every
  city page.
- **Breadcrumbs:** Home > <Condition> > Every option.
- **Structured data:** MedicalWebPage (as the simple page, from this page's H1, description and reviewed date) and
  BreadcrumbList. No FAQ markup.

### 3. City hub `/<condition>/doctors/`

- **Job:** every city page and every state for the procedure.
- **Target (template):** "<procedure> doctors by city"; "where can I get <procedure>". Fibroids: where can I get
  fibroid embolization.
- **Title:** "Where can I get <procedure> (<ABBR>)? Doctors by city | Every Option". **Description:** "Doctors listed
  for <procedure>, by city and state. Free, nearest first, not a ranking."
- **Section order:** breadcrumbs; H1 question; answer line (counts); Cities; States; ZIP search link; "A blank is not a
  no"; not-a-ranking line; listings date and "Page last reviewed".
- **Links:** out to every city page and the simple page's finder; in from the simple page (Doctors by city), the
  every-option page's find block, every city page's breadcrumb, the footer.
- **Breadcrumbs:** Home > <Condition> > <Condition> embolization doctors. **Structured data:** BreadcrumbList.

### 4. City page `/<condition>/doctors/<metro>/`

- **Job:** who does the procedure near one place, nearest first.
- **Targets (template):** "<procedure> near me" (served by the finder), "<procedure> <city>", "<condition> doctor
  <city>", "<condition> specialist near me". Fibroids New York: fibroid doctor nyc (90), uterine fibroid embolization nyc
  (10).
- **Title:** "Who does <procedure> <near City>? | Every Option". **Description:** "<n> doctors within <r> miles of
  <City> are listed for <procedure>. Free, nearest first, not a ranking."
- **Section order:** breadcrumbs; H1 question; answer; local facts; "Which doctors <near City> do <ABBR>?" (Confirmed,
  then Likely); towns; own-ZIP link; "Is <ABBR> right for me?" with both condition links; other procedures here; nearby
  cities; "A blank is not a no"; listings date and "Page last reviewed".
- **Links out (required):** simple page ("Read about your <condition> treatment options"), every-option page where one
  exists (fibroids: "Compare fibroid embolization with myomectomy, hysterectomy, and medicines"), each listed doctor's
  profile, nearby city pages, the hub. **Links in:** hub, simple page, every-option page (through the hub), profiles.
- **Breadcrumbs:** Home > <Condition> > <Condition> embolization doctors > <Metro>.
- **Structured data:** BreadcrumbList and ItemList (each listed doctor's profile URL, in page order).

### 5. Doctor profile `/doctors/<name>-<npi>/`

- **Job:** one doctor's procedures, offices and status; shared across conditions (rendered by `lib/directory.mjs`).
- **Target:** the doctor's name (plus "<procedure>"). **Title and description:** as the directory sets them now.
- **Structured data:** Person (jobTitle, knowsAbout for confirmed procedures, workLocation). Noindex until a procedure
  or a claim (directory rule). Not checked per condition by `tools/pattern.py`.

## Shared rules

- **"What is <condition>?" box** (job platform-condition-pages-0004; his words 2026-11-06: "The description of the
  condition needs to come higher than it already is ... also need to not clutter everything", then "B2 yes"). On every
  condition's simple and every-option pages: the heading "What is <condition>?" (or "What are ...?"), the definition
  with its citation, a "Common symptoms" label carrying the symptom sentence's citations, the symptoms as tags, and a
  "When to see a doctor" fold. One source: the condition toml's section with `place = "box"` (`text`, `symptoms`,
  `symptoms_cite`, `see_doctor`; fibroids is the worked example), rendered by `condition.what_box()` on both pages.
  Styles in `src-assets/condition-box.css` (copied into `site/assets/` by the build). The Doctors by city list is a fold,
  open on desktop and with JavaScript off, closed under 760 px (`src-assets/city-fold.js`). `tools/pattern.py` fails a
  page without the box or with any part missing; a draft condition without the box content is skipped and named.

- **Information-gain sentence** (content-strategy gate): every simple and every-option page holds at least one line no
  ranking page has. Fibroids: the plain-frequency side-by-side of recovery and keeping the uterus, number-tied to the
  simple page's sources, and the free nearest-first list of every embolization doctor, Confirmed and Likely.
- **"Page last reviewed <Month D, YYYY>"** on every page type, from `reviewed` in the toml (city pages: `CITIES.reviewed`).
- **No FAQ markup.** Google ended FAQ rich results on 2026-05-07 (schema skill). The visible Common questions stay.
- **No clinical claim, number or source changes in a pattern job.** Titles, descriptions, headings and link text only.

## Checklist for a new condition (run in the page job)

1. Simple page toml: the `place = "box"` section (definition, symptoms as tags, see-a-doctor line, each with its
   existing sources); `targets` (first target in the title), title 65 or fewer with brand, description 110 to 160, H1
   as the patient's goal, `options_heading` "Your other <condition> treatment options".
2. If an every-option page exists: `targets` disjoint from the simple page's; comparison title and H1;
   `compare_headings` for each category; `simple_link`, `find_heading`, `city_link`; `options_page` and `options_link`
   on the simple page.
3. City pages: add the condition's every-option path to `OPTIONS_OF` and its anchor to `COMPARE_LINK` in
   `lib/cities.mjs`.
4. Pull volumes for the candidate phrasings and record them in this file's style in the job's run log.
5. `python3 tools/build.py` (runs `tools/pattern.py`); `node --test tools/*.test.mjs`; `python3 tools/pattern_test.py`;
   `python3 tools/readability.py <slug>`.
6. Screenshots at 1440 and 390 of the simple, every-option and one city page; look at them.
