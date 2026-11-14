// Written by tools/build.py from content/conditions.json and content/procedures.json (tools/registry.py).
// Edit those, not this file.
export const ALL = ["ufe", "pae", "gae", "pelvic", "hae"];
export const PATIENT = {"ufe": "fibroid embolization", "pae": "prostate artery embolization", "gae": "knee artery embolization", "pelvic": "pelvic vein embolization and stenting", "hae": "hemorrhoid embolization"};
export const CONDITION = {"ufe": "fibroid", "pae": "enlarged prostate", "gae": "knee arthritis", "pelvic": "chronic pelvic pain", "hae": "bleeding hemorrhoids"};
export const CONDITION_LABEL = {"ufe": "Fibroids", "pae": "Enlarged prostate", "gae": "Knee arthritis", "pelvic": "Chronic pelvic pain", "hae": "Bleeding hemorrhoids"};
export const HUB_LABEL = {"ufe": "Fibroid embolization doctors", "pae": "Prostate artery embolization doctors", "gae": "Knee embolization doctors", "pelvic": "Pelvic vein embolization and stenting doctors", "hae": "Hemorrhoid embolization doctors"};
export const COLOR = {"ufe": "t-fibroids", "pae": "t-pae", "gae": "t-gae", "pelvic": "t-cpp", "hae": "t-hem"};
export const PAGE_OF = {"ufe": "/fibroids/", "pae": "/enlarged-prostate/", "gae": "/knee-arthritis/", "pelvic": "/chronic-pelvic-pain/", "hae": "/hemorrhoids/"};
export const OPTIONS_OF = {"ufe": "/fibroids/every-option/", "pae": "/enlarged-prostate/every-option/", "gae": "/knee-arthritis/every-option/", "pelvic": "/chronic-pelvic-pain/every-option/", "hae": "/hemorrhoids/every-option/"};
export const COMPARE_LINK = {"ufe": "Compare fibroid embolization with myomectomy, hysterectomy, and medicines", "pae": "Compare prostate artery embolization with TURP, laser surgery, office procedures, and medicines", "gae": "Compare knee embolization with knee replacement, shots, and medicines", "pelvic": "Compare pelvic vein embolization with stenting, medicines, and surgery", "hae": "Compare hemorrhoid embolization with banding, other office treatments, and surgery"};
export const LONG_NAME = {"gae": "Genicular (knee) artery embolization"};
export const CITY_SLUGS = ["fibroids", "enlarged-prostate", "knee-arthritis", "chronic-pelvic-pain", "hemorrhoids"];
export const PROC_OF_PATH = {"fibroids": "ufe", "enlarged-prostate": "pae", "knee-arthritis": "gae", "chronic-pelvic-pain": "pelvic", "hemorrhoids": "hae"};
