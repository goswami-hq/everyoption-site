// Written by tools/build.py from content/procedures.json. Edit that file, not this one.
export const PROCEDURES = [{"key": "ufe", "abbr": "UFE", "name": "Uterine fibroid embolization"}, {"key": "pae", "abbr": "PAE", "name": "Prostate artery embolization"}, {"key": "gae", "abbr": "GAE", "name": "Genicular artery embolization"}];
export const PROCS = PROCEDURES.map((p) => p.key);
export const PROC_SHORT = Object.fromEntries(PROCEDURES.map((p) => [p.key, p.abbr]));
export const PROC_LONG = Object.fromEntries(PROCEDURES.map((p) => [p.key, `${p.name} (${p.abbr})`]));
