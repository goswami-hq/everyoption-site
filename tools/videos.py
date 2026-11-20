#!/usr/bin/env python3
"""Every Option's videos: content/videos.toml read, checked and drawn (ai-hq job platform-web-design-0019; his words,
HQ chat 2026-11-16: "Let's find a way to have the social media pages more prominently featured on the site instead of a
small link", "I like the YouTube idea", "Build it on the site").

- A video with no YouTube ID never shows. With none shown, /videos/ and its menu item are not built, and the home band
  shows the channel buttons only.
- Nothing from YouTube loads before a tap: each film is our own still image inside a link to youtube.com; with
  JavaScript (src-assets/videos.js) the tap swaps in the youtube-nocookie.com player in the same box.
- A test_only entry (dev site layout check) is refused when the build runs on main or with EO_RELEASE=1:

  python3 tools/videos.py --release-check     # exits 1 if any test entry is in the list or in site/
"""
import html, json, os, pathlib, re, subprocess, sys, tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIST = ROOT / "content" / "videos.toml"
WORDS = ROOT / "content" / "videos"
MEDIA = ROOT / "src-assets" / "media"
ORIGIN = "https://everyoptionmd.com"
ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
TEST_ID = "TESTONLY000"
TEST_MARK = "data-test-only"   # on every element drawn from a test entry; --release-check looks for it in site/
EMBED = "https://www.youtube-nocookie.com/embed/"
FRAME_SRC = "frame-src https://www.youtube-nocookie.com"


def upload_datetime(day):
    """Google wants uploadDate as a datetime with a time zone (Search Console, 2026-11-20:
    "Datetime property uploadDate is missing a timezone"). Noon Central on the upload day."""
    import datetime as _dt
    from zoneinfo import ZoneInfo
    d = _dt.datetime.fromisoformat(day + "T12:00:00").replace(tzinfo=ZoneInfo("America/Chicago"))
    return d.isoformat()
REQUIRED = ("key", "title", "description", "condition", "order", "youtube_id", "upload_date", "seconds", "aspect",
            "still", "still_alt", "transcript", "page")

# His brand accounts (ai-hq ops/accounts.md), each with what a visitor gets there. Order: YouTube first (his words
# 2026-11-16 22:44 CT: "I like the YouTube idea"), then TikTok, Instagram, X, as the job lists them.
CHANNELS = [
    ("YouTube", "https://www.youtube.com/@everyoptionmd", "Our films in full, in one place."),
    ("TikTok", "https://www.tiktok.com/@every.option.md", "Short videos on treatments you may not have heard of."),
    ("Instagram", "https://www.instagram.com/everyoptionmd", "Short videos and pictures, one treatment at a time."),
    ("X", "https://x.com/EveryOption_MD", "Updates from Every Option."),
]

ICONS = {   # 24 x 24, drawn here, currentColor
    "YouTube": '<path fill="currentColor" fill-rule="evenodd" d="M6.5 5h11A4.5 4.5 0 0 1 22 9.5v5a4.5 4.5 0 0 1-4.5 4.5h-11A4.5 4.5 0 0 1 2 14.5v-5A4.5 4.5 0 0 1 6.5 5zM10 8.8v6.4l5.6-3.2z"/>',
    "TikTok": '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M14 3v11.6a3.6 3.6 0 1 1-3.6-3.6M14 3c.4 2.6 2.5 4.6 5 4.8"/>',
    "Instagram": '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/></g><circle cx="17.4" cy="6.6" r="1.3" fill="currentColor"/>',
    "X": '<path fill="currentColor" d="M4 3.5h4.6l11.4 17h-4.6z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M19.2 3.8 13.6 10.2M10.4 13.8 4.8 20.2"/>',
}
PLAY = ('<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="31" fill="currentColor"/>'
        '<path d="M26 20.5v23l19-11.5z" fill="var(--play-ink, #fff)"/></svg>')


def e(s):
    return html.escape(str(s), quote=True)


def icon(name, size=20):
    return (f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" aria-hidden="true" focusable="false">'
            f'{ICONS[name]}</svg>')


def branch():
    try:
        return subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True,
                              text=True, timeout=10).stdout.strip()
    except Exception:
        return ""


def release_mode():
    """True when the build must be launch-safe: on main, or with EO_RELEASE=1 (the launch check sets it)."""
    return os.environ.get("EO_RELEASE") == "1" or branch() == "main"


def load(path=LIST, release=None, slugs=None):
    """Every entry, checked. Raises SystemExit with every problem found."""
    with open(path, "rb") as fh:
        rows = tomllib.load(fh).get("video", [])
    release = release_mode() if release is None else release
    if slugs is None:
        import registry
        slugs = set(registry.BY_SLUG)
    errs, keys = [], set()
    for i, v in enumerate(rows):
        who = v.get("key", f"entry {i + 1}")
        for f in REQUIRED:
            if f not in v:
                errs.append(f"{who}: missing {f}")
        if errs:
            continue
        if v["key"] in keys:
            errs.append(f"{who}: key used twice")
        keys.add(v["key"])
        vid = v["youtube_id"]
        if vid and not ID_RE.match(vid):
            errs.append(f"{who}: youtube_id {vid!r} is not an 11-character YouTube ID")
        if vid and not re.match(r"^\d{4}-\d{2}-\d{2}$", v["upload_date"]):
            errs.append(f"{who}: a video with a youtube_id needs upload_date (YYYY-MM-DD)")
        if v["condition"] != "about" and v["condition"] not in slugs:
            errs.append(f"{who}: condition {v['condition']!r} is not a condition slug or 'about'")
        if v["aspect"] not in ("9:16", "16:9", "1:1"):
            errs.append(f"{who}: aspect must be 9:16, 16:9 or 1:1")
        if not (WORDS / v["transcript"]).is_file():
            errs.append(f"{who}: transcript content/videos/{v['transcript']} not found")
        for w in (540, 1080):
            if not (MEDIA / f"{v['still']}-{w}.jpg").is_file():
                errs.append(f"{who}: still src-assets/media/{v['still']}-{w}.jpg not found")
        test = bool(v.get("test_only"))
        if test and vid != TEST_ID:
            errs.append(f"{who}: a test_only entry must use the made-up ID {TEST_ID}")
        if not test and vid == TEST_ID:
            errs.append(f"{who}: the made-up ID {TEST_ID} is only for test_only entries")
        if test and release:
            errs.append(f"{who}: test_only entry on a release build (main or EO_RELEASE=1); remove it from content/videos.toml")
    if errs:
        raise SystemExit("content/videos.toml:\n  " + "\n  ".join(errs))
    return rows


def shown(rows):
    """Videos that show: a YouTube ID, sorted by section (brand film first, then conditions in registry order) and order."""
    import registry
    rank = {s: i + 1 for i, s in enumerate(registry.BY_SLUG)}
    return sorted((v for v in rows if v["youtube_id"]), key=lambda v: (0 if v["condition"] == "about" else rank[v["condition"]], v["order"]))


def real(rows):
    return [v for v in shown(rows) if not v.get("test_only")]


def length(sec):
    m, s = divmod(int(sec), 60)
    parts = ([f"{m} minute{'s' if m != 1 else ''}"] if m else []) + ([f"{s} second{'s' if s != 1 else ''}"] if s or not m else [])
    return " ".join(parts)


def iso_len(sec):
    m, s = divmod(int(sec), 60)
    return f"PT{m}M{s}S" if m else f"PT{s}S"


def words(v):
    return [l.strip() for l in (WORDS / v["transcript"]).read_text(encoding="utf-8").splitlines() if l.strip()]


def still(v, ver=lambda u: u):
    small, big = f"/assets/media/{v['still']}-540.jpg", f"/assets/media/{v['still']}-1080.jpg"
    w, h = (540, 960) if v["aspect"] == "9:16" else ((960, 540) if v["aspect"] == "16:9" else (540, 540))
    return (f'<img src="{ver(small)}" srcset="{ver(small)} 540w, {ver(big)} 1080w" sizes="(max-width: 600px) 80vw, 340px" '
            f'alt="" width="{w}" height="{h}" loading="lazy" decoding="async">')


def film(v, ver=lambda u: u, level=3, page_link=True, page_name=None):
    """One film: our still with a play button (a link to YouTube; videos.js loads the player in place on tap), its title,
    length, one line, the words in a fold, and a link to its page."""
    test = bool(v.get("test_only"))
    mark = f' {TEST_MARK}' if test else ""
    t = e(v["title"])
    label = f"Play the film: {v['title']} ({length(v['seconds'])})"
    flag = ('<p class="vid-test">Test only: shows the layout on the dev site. Not a real video; it never ships.</p>'
            if test else "")
    link = ""
    if page_link and v["page"]:
        link = f'<p class="vid-more"><a href="{e(v["page"])}">{e(page_name or v["page"])}</a></p>'
    body = "".join(f"<p>{e(l)}</p>" for l in words(v))
    note = f'\n<p class="vid-note">{e(v["note"])}</p>' if v.get("note") else ""   # his item 5 A, 2026-11-17
    # credit (optional): the sound credit line, e.g. "Music and sound generated with AI (Stable Audio)" (ai-hq launch
    # approval 2026-11-18, his yes 09:00 CT).
    note += f'\n<p class="vid-note vid-credit">{e(v["credit"])}</p>' if v.get("credit") else ""
    a = v["aspect"].replace(":", " / ")
    return f"""<figure class="vid" data-aspect="{e(v['aspect'])}"{mark}>
<div class="vid-frame" style="aspect-ratio: {a}"><a class="vid-play" href="https://www.youtube.com/watch?v={e(v['youtube_id'])}" data-yt="{e(v['youtube_id'])}" data-title="{t}" aria-label="{e(label)}" rel="noopener" target="_blank">{still(v, ver)}<span class="vid-btn">{PLAY}</span></a></div>
<figcaption>{flag}<h{level} class="vid-title">{t}</h{level}>
<p class="vid-len">{e(length(v['seconds']))}</p>
<p class="vid-line">{e(v['description'])}</p>{note}
<details class="vid-words"><summary>Read the words in the film</summary><div class="vid-words-in">{body}</div></details>
{link}</figcaption></figure>"""


def schema(rows):
    """One VideoObject per shown film (name, description, thumbnail, upload date, length, player address, transcript)."""
    out = []
    for v in rows:
        out.append({"@context": "https://schema.org", "@type": "VideoObject", "name": v["title"],
                    "description": v["description"], "thumbnailUrl": ORIGIN + f"/assets/media/{v['still']}-1080.jpg",
                    "uploadDate": upload_datetime(v["upload_date"]), "duration": iso_len(v["seconds"]),
                    "embedUrl": EMBED + v["youtube_id"], "transcript": " ".join(words(v)),
                    "publisher": {"@id": ORIGIN + "/#organization"}})
    return "".join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False).replace("</", "<\\/") + "</script>"
                   for x in out)


def posting(path=LIST):
    """Channels with at least one post, from content/videos.toml [channels] (true/false per channel). YouTube also
    counts as posting once a film with a YouTube ID is shown. A channel's what-you-get line shows only while it posts
    (reviewer round 1, 2026-11-16: a line describing an empty channel is not true)."""
    with open(path, "rb") as fh:
        flags = tomllib.load(fh).get("channels", {})
    return {n for n, _, _ in CHANNELS if flags.get(n.lower())}


def channels(cls="chans", live=frozenset()):
    def what(n, w):
        return f'<span class="chan-what">{e(w)}</span>' if n in live else ""
    items = "".join(f'<li><a class="chan" href="{u}" rel="noopener" target="_blank">{icon(n, 22)}'
                    f'<span><strong>{e(n)}</strong>{what(n, w)}</span></a></li>'
                    for n, u, w in CHANNELS)
    return f'<ul class="{cls}" aria-label="Every Option on social media">{items}</ul>'


def header_icons():
    """The four small icons in the header: beside the menu on wide screens, on the logo row on phones."""
    items = "".join(f'<a href="{u}" rel="noopener" target="_blank" aria-label="Every Option on {e(n)}" title="{e(n)}">{icon(n, 18)}</a>'
                    for n, u, _ in CHANNELS)
    return f'<div class="social-icons">{items}</div>'


BAND_LINE = "We make short films that explain treatments in plain language."
ABOUT_ONLY_LINE = "A short film about what Every Option is for. Films on each condition are coming."   # reviewer round 2
COMPACT_HEAD = "Follow Every Option"
COMPACT_LINE = "Our first short films are on the way. Follow us to see them."


def home_band(rows, ver=lambda u: u):
    """Home "Watch and follow": the brand film and the four channel buttons; channel buttons only, compact, until the
    brand film has a YouTube ID."""
    brand = next((v for v in shown(rows) if v["condition"] == "about"), None)
    if not brand:   # nothing to watch yet: follow only, channel names only
        return (f'<section class="watch watch-compact" aria-labelledby="watch-h"><h2 id="watch-h">{e(COMPACT_HEAD)}</h2>'
                f'<p>{e(COMPACT_LINE)}</p>{channels("chans chans-row")}</section>')
    live = posting() | {"YouTube"}
    more = '<p class="watch-all"><a href="/videos/">All videos</a></p>'
    return (f'<section class="watch" aria-labelledby="watch-h"><div class="watch-head"><h2 id="watch-h">Watch and follow</h2>'
            f'<p>{e(BAND_LINE if any(v["condition"] != "about" for v in shown(rows)) else ABOUT_ONLY_LINE)}</p></div><div class="watch-film">{film(brand, ver, page_link=False)}</div>'
            f'<div class="watch-links">{channels(live=live)}{more}</div></section>')


def release_check(site=ROOT / "site"):
    """Exit 1 if content/videos.toml has a test entry or any built page carries the test mark. The launch merge runs it."""
    with open(LIST, "rb") as fh:
        bad = [v.get("key") for v in tomllib.load(fh).get("video", []) if v.get("test_only")]
    pages = [str(p.relative_to(site)) for p in site.rglob("*.html") if TEST_MARK in p.read_text(encoding="utf-8", errors="ignore")]
    if bad or pages:
        print("FAIL: test-only video entries must not ship:", ", ".join(bad) or "-", "| built pages with them:", ", ".join(pages) or "-")
        return 1
    print("PASS: no test-only video entry in content/videos.toml or site/")
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--release-check"]:
        sys.exit(release_check())
    print(__doc__)
