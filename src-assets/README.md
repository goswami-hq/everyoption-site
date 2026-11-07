Hand-written assets the build copies into `site/assets/` (job platform-condition-pages-0004). Since tracks landed, only
the build stage may write `site/`, so CSS and JS added after that live here; `tools/build.py` copies each file and links
it with a cache-busting tag. Edit these, never their copies in `site/assets/`.

Job platform-directory-0007 moved `finder.js`, `account.js` and `site.css` here (their `site/assets/` copies are now
build output). `site/assets/telehealth.js` is written by the build from `lib/telehealth.mjs`; edit that module.
