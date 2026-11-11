// Written by tools/build.py from content/procedures.json. Edit that file, not this one.
export const PROCEDURES = [{"key": "ufe", "abbr": "UFE", "name": "Uterine fibroid embolization", "coverage": {"path": "/fibroids/insurance/", "link": "Does insurance cover fibroid embolization?"}}, {"key": "pae", "abbr": "PAE", "name": "Prostate artery embolization", "coverage": {"path": "/enlarged-prostate/insurance/", "link": "Does insurance cover prostate embolization?"}}, {"key": "gae", "abbr": "GAE", "name": "Genicular artery embolization", "coverage": {"path": "/knee-arthritis/insurance/", "link": "Does insurance cover knee embolization?"}}, {"key": "pelvic", "abbr": "", "short": "pelvic vein treatment", "name": "Pelvic vein treatment", "draft": true}, {"key": "hae", "abbr": "HAE", "name": "Hemorrhoid artery embolization", "draft": true}];
export const PROCS = PROCEDURES.map((p) => p.key);
// The name in running text: the abbreviation, else the procedure's short words (job platform-directory-0009).
export const PROC_SHORT = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr || p.short || p.name.toLowerCase()]));
export const PROC_LONG = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr ? `${p.name} (${p.abbr})` : p.name]));
export const DRAFT_PROCS = PROCEDURES.filter((p) => p.draft).map((p) => p.key);
// The coverage page and its link text, for a procedure that has one (job platform-condition-pages-0013).
export const COVERAGE = Object.fromEntries(PROCEDURES.filter((p) => p.coverage).map((p) => [p.key, p.coverage]));
