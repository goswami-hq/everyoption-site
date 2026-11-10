# The page reference: how every Every Option page is built

The one place page conventions live: page types, their order from the top, what sits on the first screen, shared parts,
fixed wording, clinical rulings every page follows, visual rules, and the checks. Build a new page from this file, not
from memory or an old page. His words, 2026-11-09 22:05 CT: "The page structure and all these conventions we've
established - do we have a written document or source file that describes everything in detail? So when we build a new
page we aren't scrambling", then "Yes" (22:06) to rebuilding this file as that reference (L625). Rebuilt by job
platform-web-design-0009 from every platform decision since 2026-10-25 (first written by job platform-main-0016 on
2026-11-06, his words: "Whatever schema we use for fibroids should be saved so we can mimic it for every other
condition", L498). Fibroids is the worked example. Addresses follow `docs/addresses.md`.

**Keeping it current.** When his answer sets or changes how pages are built (a layout, a shared part, a label, a
placement, a first-screen rule, a clinical ruling every page follows), the same site commit updates this file with the
date and his words, and extends `tools/pattern.py` (or the browser check) when the rule can be checked (page pipeline
step 9, his yes 2026-11-09 22:06 CT). A superseded rule is deleted here, not kept beside the new one.

**How rules are cited.** Each rule gives its date, his words, and "L<n>": the line in ai-hq `vault/decisions.md`. The
full inventory (every rule, its source, status, code location and check) is ai-hq
`projects/platform/design/page-reference-2026-11-09/inventory.md`. Questions still open with him are named where they
apply and are not rules yet.

**The checks, by short name.**

| Name | What | When |
| --- | --- | --- |
| `pattern` | `tools/pattern.py`: built pages and a few source files; fails the build. Tests: `python3 tools/pattern_test.py` | every `python3 tools/build.py` |
| `first-screen` | `tools/e2e/first_screen_e2e.py`: Chromium at 390 x 844, light and dark, on the local build (how to run: its docstring) | page pipeline check step; not run by the build |
| node tests | `node --test tools/*.test.mjs`, named by file below | page pipeline check step |
| `readability` | `python3 tools/readability.py <slug>` (section grade at most 9, aim about 7) | page pipeline check step |

"Not checked" means no test fails when the rule breaks; a person checks it at review.

## The rule in one line

Each page type owns its own searches and its own job. The simple page answers "what are my options" with the finder on
top; the every-option page answers "how do they compare"; city pages answer "who does it near me"; coverage pages answer
"will my insurance pay". No two pages of one condition share a search target or three words in a row of title or H1
(`pattern`).

## Search targets: how to pick them

1. Write candidates from each page type's template below. 2. Pull US volumes (DataForSEO Google Ads search volume, one
call, about $0.09 for 47 phrasings on 2026-11-06; `scripts/dataforseo_volumes.py` in ai-hq). 3. Give each phrasing to
exactly one page; the first target of a page must appear in its title. 4. Record them in `targets = [...]` in the page's
toml (`pattern` checks that targets exist, the first is in the title, title and description lengths, and no shared
phrasing or targets between the two pages).

Fibroid volumes (US, monthly, DataForSEO 2026-11-06): fibroid treatment 22,200; fibroid medication 14,800; what are
fibroids 14,800; fibroid treatment options 3,600; how to shrink fibroids 1,900; fibroid specialist near me 880; best
treatment for fibroids 720; myomectomy recovery time 720; myomectomy vs hysterectomy 590; alternatives to hysterectomy
320; fibroid treatment without surgery 320; uterine fibroid embolization near me 260; non surgical fibroid treatment
210; ufe recovery time 210; ufe vs myomectomy 170; ufe vs hysterectomy 140; fibroid doctor nyc 90; single cities about
10 each. Raw file: ai-hq-data `dataforseo/keywords-2026-11-06/`. Prostate and knee volumes (2026-11-07) sit beside
`targets` in each condition toml; raw files in ai-hq-data `dataforseo/keywords-2026-11-07/`.

Which conditions have which pages (2026-11-09): fibroids, enlarged prostate and knee arthritis have simple,
every-option, city and coverage pages (his words 2026-11-07, L525: "Let's build the rest of the pages to be similar").
Chronic pelvic pain has the simple page with the finder and four city pages (2026-11-07, L533: "Yes to both changes and
the builder"), no every-option page and no coverage page yet (pelvic insurance is to-do W24 with the pelvic build,
L617). Draft conditions stay noindex and out of the sitemap (`cities.drafts()`; node `cities-job42.test.mjs`). A
condition page with no doctor list yet sits in the home list from `PAGE_ONLY` in `tools/build.py` ("Doctor list
coming"), not in the ZIP dropdown. The site launches only on his explicit word (2026-11-06, L490).

## Page types

Each type: its job, targets, title rules, order from the top, what must sit on the first screen at 390 x 844, required
parts, links, structured data. "First screen" means the bottom edge of the part is at or above 844 px with the page
scrolled to the top, in light and dark.

### 1. Simple page `/<condition>/`

- **Job:** the short, plain answer to "what are my options", with the IR option first and the finder at the top (his
  words 2026-11-02, L323: "we want the dr finder to be the easier click").
- **Targets (template):** "<condition> treatment options"; "<condition> treatment"; "<condition> treatment without
  surgery"; "alternatives to <surgery>"; "non surgical <condition> treatment"; "what is <condition>". Fibroids:
  `fibroid treatment options` (first), fibroid treatment, fibroid treatment without surgery, alternatives to
  hysterectomy, non surgical fibroid treatment.
- **Title:** "<Condition> Treatment Options, <qualifier> | Every Option", 65 characters or fewer with the brand. Fibroids:
  "Fibroid Treatment Options, With or Without Surgery | Every Option" (65). **Description:** 110 to 160 characters; names
  the options and what the page tells. **H1:** the patient's goal, not the title (fibroids: "Shrink fibroids without
  surgery"); no three words in a row shared with the every-option title or H1. `pattern` checks the title, the
  description and the shared phrasing; "the patient's goal" is not checked.
- **Order from the top** (`pattern` checks the order of the parts marked *):
  1. header and menu; condition banner strip (hidden under 360 px);
  2. *H1, a short finder intro, *the links row "How it works" and "Compare your options", the *ZIP finder (ZIP box,
     distance, button "Find doctors");
  3. "Doctors by city" fold (a condition with city pages; open on desktop and with JavaScript off, closed under 760 px,
     `src-assets/city-fold.js`);
  4. *"What is <condition>?" box (after the finder and the city fold on phones; top of the right column on desktop);
  5. *lead option: "What is <procedure>?" heading with a 40 to 60 word answer, the "How it works" animation fold, "How
     well does it work?" and "Side effects" folds, the finder button, the coverage link;
  6. plain answer paragraph; urgent line;
  7. *"Your other <condition> treatment options": three folded groups (Medicines; Less invasive treatments, IR first;
     Surgery), then the outlined "Compare them side by side: …" control to the every-option page;
  8. *Learn more (sections, "What should I ask my doctor?" opening "You can ask about any option on this page, even one
     your doctor does not offer." (agreed list item 6, his "Yes to all" 2026-11-07; not checked), Common questions,
     *References);
  9. *"Page last reviewed <Month D, YYYY>"; footer.
- **First screen at 390 x 844 (`first-screen`):** H1; "Compare your options" (where an every-option page exists); the ZIP
  box and the "Find doctors" button. Button bottom on 2026-11-09: 749 (fibroids), 778 (prostate), 755 (knee), 727
  (pelvic).
- **Compare link on the first screen** (walkthrough fix 1, his words 2026-11-09 11:49 CT, L601: "1-4 changes let's do
  them, also run through the design skill"): `<a class="find-compare">Compare your options</a>` beside "How it works",
  before the finder, to the every-option page; none on a condition without one. The "Compare them side by side"
  control in "Your other options" stays. `pattern`, `first-screen`, node `walkthrough-fixes.test.mjs`.
- **Coverage link** (his words 2026-11-08 21:35 CT, L583: "We also need actual links to the insurance pages
  everywhere"): in the lead option, under its finder button; text is the coverage page's H1 (one source:
  `content/procedures.json` `coverage`; `tools/condition.py coverage_link`). None on a condition with no coverage page
  (pelvic). `pattern`, node `insurance.test.mjs`. Open with him: prostate (his 2026-11-05 "No need to add" insurance
  lines; ai-hq `projects/platform/content/page-reviews/2026-11-08-insurance-links/list-for-him.md` item 3).
- **Links out (required):** every-option page (descriptive anchor naming the comparisons; fibroids: "Compare them side by
  side: embolization vs. myomectomy, hysterectomy, and medicines"; `pattern`); the coverage page (`pattern`); the city
  list and each city page (node `cities-job42.test.mjs`, "links: /fibroids/ lists the cities in plain HTML");
  references (`pattern` checks the block is present). **Links in:** home card (node `walkthrough-fixes.test.mjs`),
  every-option page (`pattern`), every city page and the city hub breadcrumb (not checked).
- **Breadcrumbs:** none (top level). **Structured data:** MedicalWebPage (name and headline = H1, description, url,
  lastReviewed, audience Patient, about MedicalCondition with possibleTreatment per option, publisher). No FAQ markup.
  `pattern` checks that MedicalWebPage is present and FAQPage absent; its fields are not checked.

### 2. Every-option page `/<condition>/every-option/`

- **Job:** every option compared side by side, tied number for number to the simple page (`tools/options.py`; node
  `options-*.test.mjs`). Simple and deep pages are separate text, tied in numbers, sources and relative phrasing (his
  words 2026-11-05, L476); study details and scientific terms go here, not on the simple page (L481).
- **Targets (template):** "<procedure> vs <surgery>"; "<surgery A> vs <surgery B>"; "<procedure> vs <surgery>
  recovery"; "<condition> medication"; "best treatment for <condition>"; "<procedure> recovery time". Fibroids: `ufe vs
  myomectomy` (first), myomectomy vs hysterectomy, ufe vs hysterectomy, fibroid medication, best treatment for fibroids,
  ufe recovery time, myomectomy recovery time.
- **Title:** "<Procedure> vs. <Surgery A> vs. <Surgery B>, Compared | Every Option", 65 or fewer. **Description:** 110 to
  160. **H1:** "<Condition> treatments compared, side by side". `pattern`.
- **Section headings phrased as the comparisons** (`compare_headings`; the simple page keeps plain category names);
  a heading that restates a claim must match the page text and the tie file.
- **Order from the top** (`pattern` checks breadcrumbs, H1, the at-a-glance view, the finder button, lede, the link to
  the simple page, contents list, the box, glance table, find-a-doctor block, references and "Page last reviewed", in
  that order; the banner strip, "How to read this page" and the urgent line are not checked):
  1. header and menu; banner strip; breadcrumbs;
  2. H1;
  3. at-a-glance view (`glance_peek`): caption "At a glance: N of M treatments", the procedure and its main comparators
     in grid order, columns "What the evidence says" and Recovery with the grid's own cell text, then the link "See all M
     and how well each works";
  4. the finder button ("Find a doctor for <procedure>", to `/<condition>/#finder`);
  5. lede (the first search target answered in 40 to 60 words), the link to the simple page ("New to <condition>?
     Start with the short guide …"), "How to read this page";
  6. contents list ("On this page": every section and each category's options; `src-assets/deep-nav.js` pins a copy
     while reading, a rail from 1180 px and a bar below, with "Back to top");
  7. "What is <condition>?" box (same content as the simple page's, from the same toml section);
  8. glance table with "How well it works" first; then one section per category (each option: its grid row as a
     summary, intro, how well it works, side effects and risks, what experts say);
  9. find-a-doctor block (ZIP box to `/<condition>/#finder` and the city list link); urgent line; references; "Page last
     reviewed"; footer.
- **First screen at 390 x 844 (`first-screen`):** H1, the at-a-glance caption, "See all M" and the finder button.
  One rule for all comparison pages on phones: the tightened at-a-glance table (15 px text, less padding) so the finder
  button ends inside the first screen (his words 2026-11-09 21:46 CT, L621: "Ok fix the prostate page dr finder button
  / Just make sure it's consistent w other pages"; site 34d7466). Button bottom on 2026-11-09: fibroids 779, prostate
  795, knee 799. The rule is set at 390 x 844; on a 375 x 812 phone the knee button ends 11 px below (L621).
- **At-a-glance view** (walkthrough fix 2, L601; caption and link his 5B, 2026-11-09 21:42 CT, L620: "Item 5. b"): the
  caption states the slice, the link the full count; N is the number of rows shown, M the number of options in the
  grid. Never list an option whose certainty word certifies no benefit (walkthrough fix 2, L601; written in the job's
  design review; not checked). `pattern` (caption, link, row counts), node
  `walkthrough-fixes.test.mjs` (order, cells match the grid).
- **Grid** (his words 2026-11-07, L524: "the grids, while fine, are missing the most important info - how well does it
  work? For each option"): the first column after the name is "How well it works": the option's certainty word from
  the simple page (none if the simple page uses none) and a short effect phrase from the glance row's `works`, numbers
  only as ledger facts. `works_note` says the figures come from different studies and do not rank. On phones the table
  becomes one card per treatment; a table from 641 px. A blank cell or a typed certainty word fails the build (node
  `options-grid.test.mjs`).
- **Insurance line under the lead treatment's heading** (his 2A, 2026-11-09 19:22 CT, L618: "A, but only if it clears
  the design skill for clutter"; it passed a design review for clutter, ai-hq
  `projects/platform/design/walkthrough-v2-batch-2026-11-09/`): fixed text "Does insurance cover it? →"
  (`tools/condition.py coverage_near`, same `coverage` path); the coverage link at the option's end stays. `pattern`.
- **Links out (required):** simple page; find-a-doctor block with the ZIP box and the city list (fibroids: "Fibroid
  embolization doctors by city" to `/fibroids/doctors/`); the coverage page. **Links in:** simple page, every city page.
  `pattern`.
- **Breadcrumbs:** Home > <Condition> > Every option. **Structured data:** MedicalWebPage and BreadcrumbList; no FAQ
  markup. `pattern`.

### 3. City hub `/<condition>/doctors/`

- **Job:** every city page and every state for the procedure. **Target:** "<procedure> doctors by city"; "where can I
  get <procedure>".
- **Title:** "Where can I get <procedure> (<ABBR>)? Doctors by city | Every Option". **Description:** "Doctors listed for
  <procedure>, by city and state. Free, nearest first, not a ranking."
- **Order:** breadcrumbs; H1 question; answer line (counts); Cities; States; ZIP search link; "A blank is not a no";
  not-a-ranking line; listings date and "Page last reviewed". Rendered on request (`lib/cities.mjs`); node
  `condition-pattern.test.mjs`, `cities-job42.test.mjs`.
- **Breadcrumbs:** Home > <Condition> > <Condition> embolization doctors. **Structured data:** BreadcrumbList.
- Open with him: one "Doctors by city" index for every procedure (ai-hq
  `projects/platform/design/architecture-2026-11-06/list-for-him.md` change 2); until then the footer's "Doctors by
  city" goes to `/fibroids/doctors/`.

### 4. City page `/<condition>/doctors/<metro>/`

- **Job:** who does the procedure near one place, nearest first. Live: account changes show within the cache time (his
  words 2026-11-05, L437: "it shouldn't be a static page, it should dynamically update"). A metro gets a page at 8 or
  more doctors within 25 miles of its fixed center (`content/metros.json`).
- **Targets:** "<procedure> near me" (served by the finder), "<procedure> <city>", "<condition> doctor <city>".
- **Title:** "Who does <procedure> <near City>? | Every Option". **Description:** "<n> doctors within <r> miles of
  <City> are listed for <procedure>. Free, nearest first, not a ranking."
- **Order:** breadcrumbs; H1 question; answer; local facts (4 to 6 lines, every number a recount of the list); "Which
  doctors <near City> do <ABBR>?": the "Confirmed by physician" box (shown even at 0, the same as the ZIP search, his
  words 2026-11-05, L475: "they should have the same confirmed by physician 0 nearby box"), then Likely; town groups
  (5 or more towns) with jump links; own-ZIP link; "Is <ABBR> right for me?" with both condition links and the coverage
  link; other procedures here; nearby cities; "A blank is not a no"; listings date and "Page last reviewed".
- **First screen at 390 x 844 (`first-screen`):** H1 and the answer.
- **Cards:** see "Doctor cards" below. Every card is on the page with JavaScript off (node `cities-job42.test.mjs`,
  `cities-facts-towns.test.mjs`).
- **Links out (required):** simple page, every-option page where one exists, each listed doctor's profile, nearby city
  pages, the hub, the coverage page. **Breadcrumbs:** Home > <Condition> > <Condition> embolization doctors > <Metro>.
  **Structured data:** BreadcrumbList and ItemList (each profile URL, in page order).

### 5. Doctor profile `/doctors/<name>-<npi>/`

- **Job:** one doctor's procedures, offices and status; shared across conditions (`lib/directory.mjs`). **Target:** the
  doctor's name (plus "<procedure>").
- **Parts:** breadcrumbs Home > Find a doctor by name > name; H1 the name; "Interventional radiologist" badge; the group
  line stated once above a plain procedure list (L410); offices (practice, city, state, phone; the street shows only
  when the office row has one, see the street rule under Doctor cards); "Call", "Doctor's website ↗" as an outlined button (L410); plans the doctor entered and the
  coverage links under them; "Video visits" badge only on Confirmed profiles that said yes (his words 2026-11-06, L522:
  "It should be only on confirmed profiles and it should be prominent visually"); "Is this you? Claim this free profile"
  and the report link. No reviews and no patient names anywhere (2026-11-01, L307). A profile with no known procedure
  reads "We don't yet know which procedures this doctor performs. Call and ask about:" (his words 2026-11-03, L409:
  "We need a better label"; `tools/e2e/directory_e2e.py`, node `directory-job27.test.mjs`); profiles do not carry
  "Based on public information online. Call the office to confirm." (L415, 2026-11-04: "Agree"; that line stays as the
  Likely group's note in the finder and on city pages; not checked).
- **First screen (`first-screen`):** H1.
- **Index rule:** noindex until a procedure is known or the profile is claimed (his words 2026-11-05, L438: "Yes
  agree"); the A to Z directory holds Confirmed, Likely and nearby doctors only (2026-11-03, L405: "only groups A B C,
  nobody else"). **Structured data:** Person (jobTitle, knowsAbout for confirmed procedures, workLocation). Node
  `directory-job27.test.mjs`, `telehealth.test.mjs`, `profile-links.test.mjs`.
- Open with him: insurance on profiles (his direction "only 'Call the office to ask which plans they accept'" against
  the plans field shown today; ai-hq `projects/platform/content/page-reviews/2026-11-08-insurance/list-for-him.md`
  item 3).

### 6. Insurance hub `/insurance/` and coverage pages `/<condition>/insurance/`

- **Three layers** (his yes 2026-11-08, L567): a short answer on each condition page, one coverage page per procedure,
  one hub. Today the coverage link stands in for the short answer while that block is open with him (below).
  Not public until launch: noindex and out of every sitemap (node `insurance.test.mjs`). Open with him: the short answer
  block "Will insurance cover it?" on each condition page (ai-hq
  `projects/platform/content/page-reviews/2026-11-08-insurance/list-for-him.md` item 1).
- **Coverage page order:** breadcrumbs Home > <Condition> > Insurance coverage; H1 = the link text everywhere ("Does
  insurance cover fibroid embolization?"; `pattern`); lede; jump list before the cards with the "What if my insurer says
  no?" link up top; 12 insurer cards in a fixed order, each with a status chip (words and a shape), a date and a link,
  details closed in the HTML; the "says no" section open; sources folded at every width (his words 2026-11-08 11:54 CT,
  L579: "Collapse sources for sure"); link to the hub; "Page last reviewed". `pattern` (order, H1), node
  `insurance.test.mjs` (cards, folds, sources).
- **Hub:** H1, lede, changes coming, coverage by procedure (a link to every coverage page, `pattern`), the every-insurer
  grid open (on phones one compact row per insurer with four labelled chips, L581), HAE cards folded on phones (L580),
  questions to ask your plan, how we checked, "Page last reviewed".
- **Fixed wording:** traditional Medicare cells read "No specific Medicare policy; decided case by case" (his words
  2026-11-08, L564: "use the label that's more honest"); rows not checked read "Looked <date>" (L582); no Medicaid (his
  words 2026-11-08, L561: "Just take out Medicaid altogether"); the table records his reading with policy name, link and
  date, never the payer's own wording. No Medicaid: node `insurance.test.mjs` ("no pelvic or Medicaid data"); the
  Medicare and "Looked <date>" wording are not checked.
- **Where the links go** (L583): simple page (lead option), every-option page (under the lead heading and at the
  option's end, contents list), city pages (after the answer and in "Is <ABBR> right for me?"), finder results (above
  the list), profiles (under plans), home (under the condition list, to the hub), footer ("Insurance coverage") and the
  wide-screen menu. Not in the phone menu (his words 2026-11-08 22:27 CT, L584: "Leave it for now but park it as a
  possible to do item to revisit"; `first-screen`).

### 7. Directory `/doctors/` and A to Z `/doctors/<letter>/`

- **Job:** find a doctor by name. H1 "Find a doctor by name"; name search; a link to every letter page (`pattern`); each
  letter page lists every shown doctor's profile link from the one address source (node `profile-links.test.mjs`). No
  exact name, city and state twice (his words 2026-11-04: "make sure we don't have exact duplicates in our directory";
  node `directory-job38.test.mjs`). Not a ranking; listings are free.

### Pages outside this pattern

"For physicians" (`/account/`), "Report an error" (`/report/`) and "How we know" are built in `tools/build.py` and
checked by their own node tests (`accounts-*.test.mjs`, `report.test.mjs`), not by `pattern`. Their fixed wording
(agreed list items 3 and 17, his "Yes to all" 2026-11-07): the physician page opens "Claim your free listing. …"; the
report button reads "Send report". Terms of service and privacy pages are required (his words 2026-11-01, L310: "We
will also eventually need a terms of agreement /service agreement etc") and not built yet; they wait on his attorney
review before launch.

### 8. Home `/`

- **Order:** header and menu; the banner in the "Introduction" landmark (`pattern`); H1 "You have more options than you
  know." (his words 2026-11-01); the line saying what the listed doctors' procedures are, fit for every image-guided
  treatment, not only embolization (his words 2026-11-07, L537: "Currently it's mostly embolization, but for pelvic pain
  we also stent"); the ZIP finder with the condition dropdown; "Choose a condition" (`id="conditions"`, the menu's
  target) with one card per condition (name, procedure subline, "<n> doctors listed" or "Doctor list coming"); "And more
  options coming soon."; the insurance hub link (`pattern`); "Who runs this"; "How it works"; footer.
- **Banner:** the ride film, dark in every theme, no labels, no replay control (his 7B, 2026-11-09 19:22 CT, L618;
  `pattern`, `first-screen`). Condition banners keep their own replay. Banners keep their current story and layout; only
  the art style moves toward the brand (his words 2026-11-09, L594: "I like the banners as they are currently").
- **Card names:** "Fibroids", "Enlarged prostate", "Arthritis pain" with the subline "Genicular (knee) artery
  embolization (GAE)" (his words 2026-11-04, L419 and L420), "Chronic pelvic pain" (his words 2026-11-04, L426). A card
  opens its simple page; a condition with a comparison page carries `data-compare` for the Conditions loop (node
  `walkthrough-fixes.test.mjs`).

## Shared parts

- **Condition pages stay script-free** of third parties: a video is a thumbnail that loads YouTube only on tap; no
  analytics script (his words 2026-11-05, L442: "Agree with 5/6"). Node `cities-job42.test.mjs` ("no third-party
  script on condition pages").

- **Header and menu.** Logo to home; six items in this order: Home, Conditions, Insurance, Directory, How we know, For
  physicians (`pattern`). "Conditions" goes to `/#conditions`; from a condition's simple page it goes to
  `/?from=<slug>#conditions`, which marks that condition's card so the reader is not sent back to the same page
  (walkthrough fix 4, L601; `pattern`, node `walkthrough-fixes.test.mjs`). On phones under 560 px the Insurance item is
  hidden and the other five sit on one row (L584; `first-screen`). The physician entry is a clear item at the top (his
  words 2026-11-03: "a clear page at the top that physicians can click on").
- **Banner strip.** Condition pages show the banner version of their procedure animation, hidden under 360 px;
  stylized, not anatomically exact (his words 2026-11-02: "aren't supposed to be anatomically exact"). One animation
  per procedure: `tools/e2e/anim_e2e.py`; the strip itself is not checked.
- **"What is <condition>?" box** (his words 2026-11-06, L519: "I like the box because it explains what fibroids are and
  what typical symptoms include … But it does make a lot of scrolling", then "B2 yes"). On every condition's simple and
  every-option pages: the heading "What is <condition>?" (or "What are …?"), the definition with its citation, a "Common
  symptoms" label carrying the symptom sentence's citations, the symptoms as a plain bulleted list (no pills; his words
  2026-11-09 16:20 CT, L617: "4. Fix that, no pills"; site 0b07f9d), and a "When to see a doctor" fold (fibroids and knee end it
  "A doctor can check what is causing your symptoms and go over your options.", agreed list item 5, 2026-11-07; prostate
  and pelvic word it their own way) One source: the condition toml's section
  with `place = "box"` (`text`, `symptoms`, `symptoms_cite`, `see_doctor`), rendered by `condition.what_box()`; styles
  in `src-assets/condition-box.css`. `pattern` fails a page without the box, its "What is …?" heading, a definition
  paragraph, a symptom list of two or more items, or the "When to see a doctor" fold, and a symptom list styled as
  pills; the "Common symptoms" label and the citations are not checked. A draft condition without the box content is
  skipped and named.
- **Compare link.** "Compare your options" on the simple page's first screen; "Compare them side by side: …" as an
  outlined control with an arrow below the option groups, so it reads as a link and not a heading (his words 2026-11-09:
  "reads as not clearly a link and seems more like the heading given its position over the 3 options"; ai-hq
  `projects/platform/design/knee-compare-link-2026-11-09/`). City pages: "Compare <procedure> with …" where an
  every-option page exists (`OPTIONS_OF`, `COMPARE_LINK` in `lib/cities.mjs`).
- **At-a-glance table and view.** See the every-option page.
- **Finder.** ZIP box, distance, "Find doctors". After a search the page scrolls to the results; the results lead with
  the doctors, the "See all treatment options" link comes after the list (walkthrough fix 3, L601), and the sticky "Find
  a doctor" bar never covers the first card. Groups in this order: "Confirmed by physician" (shown even when empty:
  "Confirmed by physician: 0 nearby."; his words 2026-11-01, L301: "display confirmed by physician even when empty"),
  "Likely performs this procedure" (his words 2026-11-01, L299: "B should be 'likely performs this procedure'"),
  "Interventional radiologists nearby" only on thin results (L325), "Nearest doctors farther away". Distance uses the
  doctor's confirmed office address (his words 2026-11-02, L324: "distances should use the actual address"). Account
  changes show live, not through a daily export (his words 2026-11-03, L361: "I want live"), and a doctor who removes a
  procedure leaves that list even when a public page names it (L360: "yes a doctors removal should take them off the
  list"); node `listings-job25.test.mjs`, `directory-job27.test.mjs`, `tools/e2e/live_e2e.py`. No SIR Doctor Finder link
  or data (his words 2026-11-02, L329: "Shelf it for now"; not checked). Node
  `finder-job16.test.mjs`, `tools/e2e/fixes_e2e.py`.
- **Doctor cards** (finder, city pages; the same parts on profiles):
  - the name is a link to the profile, underlined so it reads as a link (his 3A, 2026-11-09 19:22 CT, L618: "Honestly I
    didn't know dr names were clickable until now"); the profile address comes from one source, the build's address,
    never built in a browser script (L618: "need to make sure the links stay from one source of truth"; node
    `profile-links.test.mjs`; underline `first-screen` on a city page);
  - "Interventional radiologist" badge where it applies; distance; practice; city and state. Street: his rule of
    2026-10-28 (L291) took street addresses off the rendered views; today the finder, city pages and profiles show the
    street when the office row has one (`src-assets/finder.js`, `lib/cities.mjs`, `lib/directory.mjs`). Open with him
    (list-for-him question 3); not checked;
  - every Likely and nearby card carries the same one line and no qualifier of its own: "Details not confirmed by this
    doctor. Check with the office before you go." (his yes 2026-11-04, L413; node `directory-job27.test.mjs`);
  - buttons "Call <phone>" and "Doctor's website ↗" (screen readers: "Doctor's website, opens in a new tab"; opens a new
    tab; his words 2026-11-09 21:42 CT, L620: "Item 3. Doctor's website"; `pattern` and node
    `doctor-site-label.test.mjs` on the three files that write it, `first-screen` on a city page);
  - "✓ Confirmed by physician" tag only on Confirmed cards; "Video visits" badge only on Confirmed cards that said yes;
  - "Is this you? Claim this free profile" and the report link on unconfirmed cards.
  - No evidence quotes, grades, billing language or reviews on any card (his words 2026-11-01, L300: "patients don't
    care about any of that").
- **Insurance links.** See page type 6. The text is always the coverage page's H1, from `content/procedures.json`.
- **Urgent line.** One short catch-all line per condition, in the toml's `urgent`, ending "…, or feel very sick or
  faint, call 911." (his words 2026-11-01: "911 advice should be super catch all generic"). Fibroids: "If you have
  severe bleeding, severe pain, a fever, or feel very sick or faint, call 911."; the other conditions name their own
  warning signs. A soft filled box. Not checked.
- **References.** Numbered by first use; markers grouped as ranges, small with an enlarged tap area; a tapped source is
  tinted and shows "Back to the text". On every condition and every-option page (`pattern` checks the block is
  present). Strong physician and journal sources (his words 2026-11-01).
- **Footer.** "Education, not medical advice. Talk to your doctor about your own care. In an emergency, call 911."; the
  report line ("Report an error" and the errors email); the disclosure "Every Option is run by a practicing
  interventional radiologist. Listings are free, and no one can pay to be listed, ranked higher, or sent patients." (his
  yes 2026-10-25 to the one-line disclosure, no name, L244); links "Find a doctor by name", "Doctors by city",
  "Insurance coverage", "How we know"; "Follow Every Option" with the four social accounts. `pattern` checks on every built page
  the disclaimer, the disclosure and the links to `/report/`, `/doctors/`, `/insurance/` and `/how-we-know/`; the
  "Doctors by city" and social links are not checked.
- **"Page last reviewed <Month D, YYYY>".** On simple, every-option, city hub, city, coverage and insurance hub pages,
  from `reviewed` in the toml (city pages: `CITIES.reviewed`). `pattern` on the built ones. Home and the directory carry
  none; "How we know" says "Last reviewed <date>" (`tools/build.py`).

## Labels and fixed wording

Exact strings; change one only on his word, then update the code and this table in the same commit.

| String | Where it shows | Written in |
| --- | --- | --- |
| "Compare your options" | simple page first screen | `tools/build.py` `COMPARE_LINK` |
| "Compare them side by side: …" | simple page, below the option groups | condition toml `options_link` |
| "At a glance: N of M treatments" / "See all M and how well each works" | every-option first screen | `tools/options.py` (peek) |
| "What the evidence says", "Recovery" (view); "How well it works" (grid) | every-option | `tools/options.py` |
| "Find a doctor for <procedure>" | finder buttons | condition toml `finder_button` |
| "Does insurance cover it? →" | under the lead treatment's heading, every-option | `tools/condition.py coverage_near` |
| coverage page H1, e.g. "Does insurance cover fibroid embolization?" | every coverage link | `content/procedures.json` |
| "Will insurance cover it?" | home, city pages, profiles | `tools/build.py`, `lib/directory.mjs` |
| "Doctor's website ↗" / "Doctor's website, opens in a new tab" | cards, profiles | `src-assets/finder.js`, `lib/cities.mjs`, `lib/directory.mjs` |
| "Details not confirmed by this doctor. Check with the office before you go." | Likely and nearby cards | `src-assets/finder.js`, `lib/cities.mjs` |
| "Confirmed by physician", "Likely performs this procedure", "Interventional radiologists nearby", "Nearest doctors farther away" | finder groups | `src-assets/finder.js`, `tools/build.py` |
| "Confirmed by physician: 0 nearby." | finder and city pages | `src-assets/finder.js`, `lib/cities.mjs` |
| "Is this you? Claim this free profile" | unconfirmed cards, profiles | `lib/directory.mjs`, `lib/cities.mjs` |
| "We don't yet know which procedures this doctor performs. Call and ask about:" | profile with no known procedure | `lib/directory.mjs` |
| "Video visits" (badge), "Video visits only" (switch) | Confirmed cards, finder | `lib/telehealth.mjs`, `src-assets/finder.js` |
| "See all treatment options" | after finder results | `src-assets/finder.js` |
| "What is <procedure>?", "How well does it work?", "Side effects" | lead option | `tools/condition.py` |
| "Your other <condition> treatment options" | simple page | condition toml `options_heading` |
| "Medicines", "Less invasive treatments", "Surgery" | option groups | condition toml (his words 2026-11-01, L321) |
| "When to see a doctor", "Common symptoms" | the box | `tools/condition.py what_box` |
| "On this page", "Back to top" | every-option contents | `tools/options.py`, `src-assets/deep-nav.js` |
| menu: Home, Conditions, Insurance, Directory, How we know, For physicians | header | `tools/build.py` `NAV` |
| "Page last reviewed <Month D, YYYY>." | see Shared parts | `tools/build.py`, `tools/options.py`, `tools/insurance.py`, `lib/cities.mjs` |
| "Doctor list coming" | home card without a finder | `tools/build.py` `PAGE_ONLY` |

## Clinical rulings and wording every page follows

- **GAE is same-day, without a hedge.** "You go home the same day", never "Most people …", in the finder intro, option
  box, comparison grid and deep intro (his words 2026-11-09 13:35 CT, L607: "GAE should just be you go home the same
  day, not "most" / It's not like UFE or PAE where sometimes we keep people / GAE is strictly outpatient"; his ruling
  from clinical knowledge, citations kept). `pattern` fails a knee page that hedges it.
- **Recovery is shown as the stay plus the return to activity** where both are known (knee replacement: "Home in 1 to 4
  days; daily activities in 3 to 6 weeks", his words 2026-11-09 13:28 CT, L605: "if there is enough room, then A");
  PAE "back to normal activities within a few days; avoid heavy activity about a week" (his words 2026-11-05: "most of
  our PAE patients are recovered after a day or two"). Not checked.
- **One name per procedure.** "Genicular (knee) artery embolization (GAE)" at first mention, H2 and hero; "knee
  embolization" may follow (his words 2026-11-05, L441: "Agree about GAE name"); "less invasive", not "minimally
  invasive" (L441: "Agree about less invasive"). Not checked.
- **IR option first, with conviction where the evidence supports it; surgery is one option among all** (his words
  2026-11-01, L321: "we don't have to force an artificial neutrality"; brand constraint 2026-10-04: "there are plenty of
  people who need surgery still"). Not checked.
- **Evidence on simple pages says what it means for the patient**, by the certainty ladder ("Strong evidence shows",
  "Good evidence suggests", "Early results are encouraging", "Early studies suggest …"), no trial mechanics (his words
  2026-11-05, L481: "All of these specific details we can include on the in depth page"); a word he does not believe is
  not used (his words 2026-11-07, L536: "I don't want to say something I don't believe in"). Certainty words tie between
  the simple page and the grid (node `options-*.test.mjs`).
- **Numbers:** few, one plain figure per point, as the simplest fraction ("1 out of 4", not "25 out of 100"; his words
  2026-11-07, L534: "It's easier for someone to visualize 1 out 4 vs 25 out of 100"), with a word beside each risk
  number ("uncommon"). Open with him: "1 in 5" and "1 out of 5" both appear today (ai-hq
  `projects/platform/design/page-reference-2026-11-09/list-for-him.md` question 1). Tied numbers: node tie tests.
- **Wording:** short, plain, whole sentences, modeled on his UFE text (his words 2026-11-02, L334: "Use this type of
  phrasing for everything"); plain but not childlike, each section grade 9 or lower, aim about 7 (L318; `readability`);
  American spelling and the Oxford comma (his words 2026-11-01, L319); never discourage exercise (his words 2026-11-06,
  L486: "I don't want to discourage exercise in anyone"); care-navigation lines such as "a doctor can evaluate you" need
  no source (his words 2026-11-07, L538: "you don't need a source to say a dr can evaluate you").
- **Each option answers:** how invasive, how likely to help, side effects; no trial trivia (his words 2026-11-01, L320).
  Each option uses the same card; only the IR option is highlighted (his words 2026-11-02, L331).
- **No physician name** on public pages or in structured data until he decides (2026-11-01, L316: his name only if truly needed, then he
  decides). Not checked.
- **No FAQ markup** (Google ended FAQ rich results on 2026-05-07; TechWyse,
  https://www.techwyse.com/news/ai-search/google-faq-rich-results-deprecated-2026). The visible Common questions stay. `pattern`.
- **A pattern job changes no clinical claim, number or source.** Titles, descriptions, headings, link text and layout
  only.

## Visual rules

- **No pills or tag shapes for text that cannot be tapped.** Symptoms are a plain bulleted list (L617; `pattern`). Open
  with him: whether this extends to the "✓ Confirmed by physician" tag and the "Video visits" badge, both rounded shapes
  today (list-for-him question 2).
- **Links look like links.** Text links underlined; doctor names underlined (L618); the comparison control outlined
  with an arrow; links are judged by sight in the walkthrough's affordance check.
- **Tap targets at least 44 px tall** (house standard from the design reviews, ai-hq
  `projects/platform/design/insurance-links-2026-11-08/` and `knee-compare-link-2026-11-09/`) (controls 48 px; the comparison control 54 px). `first-screen` checks the ZIP
  button, "Compare your options", "See all M", the comparison finder button and "Does insurance cover it? →".
- **Light and dark.** Every page works in both (house standard, same reviews); the home banner is dark in every theme. Text contrast at least 4.5:1.
  `first-screen` runs every check in both schemes; contrast is not checked by it (the walkthrough's axe pass covers it).
- **No sideways scroll** from 320 to 1440 px (same house standard; `first-screen` at 390, `tools/e2e/anim_e2e.py` on
  the animation pages).
- **Folds.** Option groups and options start closed; the lead option is open with its "How it works" fold closed (his
  words 2026-11-03, L399: "fibroid explainer stays folded"); the box's "When to see a doctor" is closed; the city fold is
  closed under 760 px. Native `<details>`; with JavaScript off everything can open. `tools/e2e/condition_e2e.py`.
- **Motion:** calm; any hover or press animation is off under `prefers-reduced-motion`. Animations are stylized, not
  anatomically exact. `tools/e2e/anim_e2e.py` checks that reduced motion stays still and one animation per
  procedure; the rest is not checked.
- **House look:** the home keeps the dark top with the vessel spine; other pages keep the original theme and cards with
  the new fonts and logo (his words 2026-11-03: the card layouts, cues and color theme "were better"; the unified look
  W13 is parked, 2026-11-09). Calm, simple, trustworthy, warm, conveying hope (his words 2026-11-01). Not checked.
- **Pictures:** no identifiable faces, license recorded (his word 2026-11-02, L322: "Yes"); no AI images; doctor photos
  only from Confirmed accounts (2026-11-01, L311: "Yes picture plan works"). `tools/e2e/ui_e2e.py` checks photos have
  size and alt; the rest is not checked.

## What to check before landing

1. `python3 tools/build.py` (runs `pattern`; fails the build).
2. `python3 tools/pattern_test.py`.
3. `node --test tools/*.test.mjs` (stop any preview on port 8799 first). No new failure against the starting commit.
4. `python3 tools/readability.py <slug>` per changed condition.
5. `first-screen` on the local build (see its docstring), light and dark at 390 x 844.
6. For a substantial change (new page, navigation, template, finder, form, first-screen order): the patient walkthrough
   for the personas whose tasks touch it (`patient-walkthrough` skill).
7. Screenshots at 1440 and 390 of each changed page; look at them.

## Checklist for a new condition

1. Simple page toml: the `place = "box"` section (definition, symptoms as a plain list, see-a-doctor line, each with its
   sources); `targets` (first target in the title), title 65 or fewer with brand, description 110 to 160, H1 as the
   patient's goal, `options_heading` "Your other <condition> treatment options", `finder_button`, `options_link`
   ("Compare them side by side: …"), the three groups with the IR option first in "Less invasive treatments".
2. If an every-option page exists: `targets` disjoint from the simple page's; comparison title and H1;
   `compare_headings` for each category; `glance_peek` (the procedure and its main comparators) and
   `glance_peek_columns`; `simple_link`, `find_heading`, `city_link`; `options_page` on the simple page. Check the finder
   button still ends inside 844 px at 390 (`first-screen`).
3. Procedure in `content/procedures.json`; a `coverage` entry only when its coverage page exists (the link text is that
   page's H1).
4. City pages: add the condition's every-option path to `OPTIONS_OF` and its anchor to `COMPARE_LINK` in
   `lib/cities.mjs`; metros in `content/metros.json`.
5. Clinical rulings above (same-day wording, recovery as stay plus activity, one procedure name).
6. Pull volumes for the candidate phrasings and record them in the job's run log in this file's style.
7. Run "What to check before landing".
8. If the new page sets or changes a convention, update this file in the same commit (step 9 of the page pipeline).
