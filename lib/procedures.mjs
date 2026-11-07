// Written by tools/build.py from content/procedures.json. Edit that file, not this one.
export const PROCEDURES = [{"key": "ufe", "abbr": "UFE", "name": "Uterine fibroid embolization"}, {"key": "pae", "abbr": "PAE", "name": "Prostate artery embolization"}, {"key": "gae", "abbr": "GAE", "name": "Genicular artery embolization"}, {"key": "pelvic", "abbr": "", "short": "pelvic vein treatment", "name": "Pelvic vein treatment", "draft": true}];
export const PROCS = PROCEDURES.map((p) => p.key);
// The name in running text: the abbreviation, else the procedure's short words (job platform-directory-0009).
export const PROC_SHORT = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr || p.short || p.name.toLowerCase()]));
export const PROC_LONG = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr ? `${p.name} (${p.abbr})` : p.name]));
export const DRAFT_PROCS = PROCEDURES.filter((p) => p.draft).map((p) => p.key);
