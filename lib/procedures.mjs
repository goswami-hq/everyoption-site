// Written by tools/build.py from content/procedures.json. Edit that file, not this one.
export const PROCEDURES = [{"key": "ufe", "abbr": "UFE", "name": "Uterine fibroid embolization", "coverage": {"path": "/fibroids/insurance/", "link": "Does insurance cover fibroid embolization?"}, "stage": "public"}, {"key": "pae", "abbr": "PAE", "name": "Prostate artery embolization", "coverage": {"path": "/enlarged-prostate/insurance/", "link": "Does insurance cover prostate embolization?"}, "stage": "public"}, {"key": "gae", "abbr": "GAE", "name": "Genicular artery embolization", "coverage": {"path": "/knee-arthritis/insurance/", "link": "Does insurance cover knee embolization?"}, "stage": "public"}, {"key": "pelvic", "abbr": "", "short": "pelvic vein embolization and stenting", "name": "Pelvic vein embolization and stenting", "stage": "listed"}, {"key": "hae", "abbr": "HAE", "name": "Hemorrhoid artery embolization", "stage": "listed"}];
export const PROCS = PROCEDURES.map((p) => p.key);
// The name in running text: the abbreviation, else the procedure's short words (job platform-directory-0009).
export const PROC_SHORT = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr || p.short || p.name.toLowerCase()]));
export const PROC_LONG = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr ? `${p.name} (${p.abbr})` : p.name]));
// Stage per procedure (tools/registry.py): "listed" is what "draft" meant before; "public" has every surface on (UFE, PAE, GAE).
export const STAGE = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.stage]));
export const DRAFT_PROCS = PROCEDURES.filter((p) => p.stage === "listed").map((p) => p.key);
// The coverage page and its link text, for a procedure that has one (job platform-condition-pages-0013).
export const COVERAGE = Object.fromEntries(PROCEDURES.filter((p) => p.coverage).map((p) => [p.key, p.coverage]));
