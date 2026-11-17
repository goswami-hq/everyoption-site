#!/usr/bin/env python3
"""Job 11 browser walk-through of physician accounts, against local servers only (made-up people, local stand-ins).

  node tools/dev-server.mjs 8791 &                          # accounts not open (as on the dev site)
  node tools/dev-server.mjs 8792 --accounts --doximity &    # desktop run
  node tools/dev-server.mjs 8793 --accounts --doximity &    # phone run (fresh people)
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/accounts_e2e.py OUT_DIR
Flows (job 22): not open; entry page; find yourself by name (new doctor, no NPI typed) with steps and time; Is this
you? from a card; partial path (sign-up, code, add a procedure) with steps and time; partial edits offices and link,
photo locked; ID check to full; photo (phone sizes, EXIF turn, HEIC, unreadable, remove, owner only); invite a
colleague; invitation path with steps and time; add a login email; revoke a bad inviter; takeover by ID; Doximity
proof; shared email; waitlist; undo; remove a procedure. Needs macOS sips for the photo files. Writes results.json and PNGs to OUT_DIR. A step is one thing the doctor does: a click, a tick, or one field typed.
"""
import json, os, re, struct, sys, time, zlib
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
CLOSED = "http://localhost:8791"
RUNS = {"desktop": ("http://localhost:8792", {"width": 1280, "height": 900}),
        "phone": ("http://localhost:8793", {"width": 390, "height": 844})}
R = {"checks": [], "console_errors": [], "paths": {}}
ANN, BEN, CARA, DAN, GIL = "1999000015", "1999000023", "1999000031", "1999000049", "1999000072"


SECRET_VALUES = []          # job 21: filled from the live config; removed from any text before it is cut or kept


def scrub(text):
    text = str(text)
    if "Call log:" in text:     # Playwright request errors list the request headers after this line
        text = text.split("Call log:")[0]
    for v in SECRET_VALUES:
        if v:
            text = text.replace(v, "[key removed]")
    return text


def check(name, ok, detail=""):
    detail = scrub(detail)
    R["checks"].append({"check": name, "ok": bool(ok), "detail": detail[:300]})
    print(("OK  " if ok else "FAIL") + " " + name + (f" ({detail[:300]})" if detail and not ok else ""))


def png_file(path, w=160, h=160):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    raw = b"".join(b"\0" + bytes([200, 120, 90]) * w for _ in range(h))
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) +
            chunk(b"tEXt", b"Comment\0taken at 12 Elm St") + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    open(path, "wb").write(data)
    return path


def outbox(pg, base):
    return json.loads(pg.request.get(base + "/__outbox").text())


def code_for(pg, base, to):
    for m in reversed(outbox(pg, base)):
        if m["to"] == to:
            c = re.search(r"Your Every Option code is (\d{6})\.", m["text"])
            if c:
                return c.group(1)
    return None


def accept_invite(pg, base, email, wrong_first=False, label=""):
    """Job platform-launch-0009: the invitation page asks for a login email and its 6-digit code. Returns steps taken."""
    steps = 0
    if pg.get_attribute("#i-email", "readonly") is None:           # a published-email invitation keeps its address
        pg.fill("#i-email", email); steps += 1
    to = pg.input_value("#i-email")
    pg.check("#i-agree"); steps += 1
    pg.click("#invite-form button[type=submit]"); steps += 1
    pg.wait_for_selector("#c-code")
    if wrong_first:
        right = code_for(pg, base, to)
        pg.fill("#c-code", "000000" if right != "000000" else "000001"); clear(pg); pg.click("#code-form button[type=submit]")
        wait_status(pg, "wrong")
        check(f"{label}: a wrong invitation code is refused plainly, nothing made", "wrong, expired, or already used" in msgs(pg)
              and not any(a.get("email") == to for a in store(pg, base).get("accounts", [])))
    pg.fill("#c-code", code_for(pg, base, to)); steps += 1
    clear(pg); pg.click("#code-form button[type=submit]"); steps += 1
    return steps


def store(pg, base):
    return json.loads(pg.request.get(base + "/__accounts").text())


def acct(pg, base, **match):
    for a in store(pg, base).get("accounts", []):
        if all(a.get(k) == v for k, v in match.items()):
            return a
    return None


def wait_js(pg, expr, arg=None, timeout=30000):
    """Poll with evaluate. The live site's CSP has no 'unsafe-eval', and Playwright's wait_for_function uses eval in the page
    (first live run, 2026-11-03: EvalError on /fibroids/). evaluate is not blocked (clear() ran on the live site)."""
    end = time.monotonic() + timeout / 1000
    while True:
        if pg.evaluate(expr, arg):
            return
        if time.monotonic() >= end:
            raise TimeoutError(f"wait_js: not true after {timeout} ms: {expr[:80]}")
        pg.wait_for_timeout(100)


# Job platform-directory-0037: in Your account a message shows on the line under the button that caused it (.act-msg);
# the top line (#acct-status) keeps page-level events. These helpers read both, so each check finds its message wherever
# the page puts it; the place itself is checked where it matters (flows: insurance, and the jump links).
MSG_JS = "[document.getElementById('acct-status')].concat([...document.querySelectorAll('.act-msg')]).map(e => e ? e.textContent : '').join(' | ')"


def msgs(pg):
    return pg.evaluate("() => " + MSG_JS)


def wait_status(pg, text, timeout=5000):
    wait_js(pg, "t => (" + MSG_JS + ").includes(t)", arg=text, timeout=timeout)


def mark(pg):
    """Before an action whose answer redraws the account page: remember the current page head."""
    pg.evaluate("window.__e2eHead = document.getElementById('acct-head')")


def wait_saved(pg, text, timeout=15000):
    """The page shows its status line first, then reloads the profile and redraws everything (account.js: say, then load).
    Wait for both, so the next click lands on the new page. Live run 2026-11-08T00:28Z: Page.click timed out in step 3
    (inferred redraw race, not proven; records/runs/2026-11-07-sign-up-test-fix-the-second-procedure-timeout-add-the-pelvic.md).
    Call mark(pg) before the action."""
    wait_status(pg, text, timeout)
    wait_js(pg, "() => { const h = document.getElementById('acct-head'); return !!h && h !== window.__e2eHead; }", timeout=timeout)


def add_proc(pg, proc):
    """Add one procedure, then wait for the redraw: that procedure on, and every other Add button attached and visible."""
    pg.click(f".add[data-proc={proc}]")
    pg.wait_for_selector(f"#attest-{proc}", state="visible"); pg.click(f"#attest-{proc}")
    pg.wait_for_selector(f"#proc-{proc}.on", state="visible")
    for b in pg.locator("li.proc:not(.on) .add").all():
        b.wait_for(state="visible")


def upcoming_first():
    """The first item of the first group on the private tick list (content/upcoming-procedures.json; never typed here)."""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    with open(os.path.join(root, "content", "upcoming-procedures.json"), encoding="utf-8") as fh:
        groups = json.load(fh)["groups"]   # the page shows only groups with an item left (tools/registry.py upcoming_groups)
    return next(i["slug"] for g in groups for i in g["items"] if not i.get("promoted_to"))


def clear(pg):
    pg.evaluate("[document.getElementById('acct-status')].concat([...document.querySelectorAll('.act-msg')]).forEach(e => { if (e) e.textContent = ''; })")


def shot(pg, name):
    pg.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=True)


def watch(pg, label):
    pg.on("console", lambda m: m.type == "error" and R["console_errors"].append(f"{label}: {m.text}"))
    pg.on("pageerror", lambda e: R["console_errors"].append(f"{label}: pageerror {e}"))


def fits(pg, label):
    over = pg.evaluate("""() => [...document.querySelectorAll('#acct-out form, #acct-out .notice, #acct-out input, #acct-out button')]
      .filter(e => e.offsetParent && e.getBoundingClientRect().right > window.innerWidth + 1).length""")
    check(f"{label}: nothing runs past the screen edge", over == 0, over)


def closed_site(b):
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page(); watch(pg, "closed")
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url))
    pg.goto(CLOSED + "/fibroids/"); pg.fill("#zip", "60611"); pg.click("#zip-form button")
    wait_js(pg, "!document.querySelector('#results').hasAttribute('aria-busy')"); pg.wait_for_timeout(200)
    check("closed: UFE finder still finds doctors", pg.locator("li.card").count() > 0)
    check("closed: finder makes no account request (job 25: only the public overlay)", not [u for u in reqs if "/api/" in u and "/api/listings?procedure=" not in u], reqs)
    href = pg.locator("li.card p.claim a", has_text="Is this you?").first.get_attribute("href")
    check("closed: a card's Is this you? opens the account page with the NPI", re.match(r"^/account/\?npi=\d{10}&procedure=ufe&name=", href or ""), href)
    reqs.clear()
    pg.goto(CLOSED + href); pg.wait_for_timeout(300)
    check("closed: account page says not open yet", pg.is_visible("#acct-closed") and "not open yet" in pg.inner_text("#acct-closed"))
    fix = pg.get_attribute("#closed-report", "href")
    check("closed: offers the report form, with the NPI", fix and fix.startswith("/report/?npi="), fix)
    check("closed: no link to the removed /claim/ form", pg.locator('a[href^="/claim"]').count() == 0)
    check("closed: the closed notice names the report form", "report form" in pg.inner_text("#acct-closed"))
    check("closed: only the status call reaches the server", [u for u in reqs if "/api/" in u] == [CLOSED + "/api/account/status"], reqs)
    r = pg.request.post(CLOSED + "/api/account/signup", data={"specialty": "ir", "npi": ANN, "email": "a@b.example", "agree": True}, headers={"Origin": CLOSED})
    check("closed: sign-up API answers 503, stores nothing", r.status == 503)
    shot(pg, "closed-account-390")
    pg.click("#closed-report"); pg.wait_for_selector("#report-form")
    check("closed: report form opens with the doctor shown", pg.is_visible("#report-form") and pg.is_visible("#r-doc-known")
          and not pg.is_visible("#r-name"))
    ctx.close()


def photo_files():
    """Job 22: phone-like photos made with macOS sips: a portrait JPEG over 10 MB, a landscape JPEG whose EXIF says
    "turn 90 degrees" (shown portrait), an iPhone-style HEIC, and a text file named .jpg."""
    import random, subprocess
    d = os.path.join(OUT, "_photos"); os.makedirs(d, exist_ok=True)
    def png(path, w, h, noise):
        def chunk(t, x):
            return struct.pack(">I", len(x)) + t + x + struct.pack(">I", zlib.crc32(t + x) & 0xffffffff)
        rnd = random.Random(7)
        row = lambda: b"\0" + (rnd.randbytes(w * 3) if noise else bytes([200, 120, 90]) * w)
        raw = b"".join(row() for _ in range(h))
        open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) +
                               chunk(b"IDAT", zlib.compress(raw, 1)) + chunk(b"IEND", b""))
    big = os.path.join(d, "phone-portrait.jpg")
    if not os.path.exists(big):
        png(os.path.join(d, "big.png"), 3024, 4032, True)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "100", os.path.join(d, "big.png"), "--out", big], check=True, capture_output=True)
    side = os.path.join(d, "sideways-exif6.jpg")
    png(os.path.join(d, "land.png"), 400, 300, False)
    subprocess.run(["sips", "-s", "format", "jpeg", os.path.join(d, "land.png"), "--out", side + ".raw"], check=True, capture_output=True)
    j = open(side + ".raw", "rb").read()
    tiff = b"II*\0" + struct.pack("<I", 8) + struct.pack("<H", 1) + struct.pack("<HHII", 0x0112, 3, 1, 6) + struct.pack("<I", 0)
    app1 = b"Exif\0\0" + tiff
    open(side, "wb").write(j[:2] + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1 + j[2:])
    heic = os.path.join(d, "iphone.heic")
    subprocess.run(["sips", "-s", "format", "heic", os.path.join(d, "land.png"), "--out", heic], check=True, capture_output=True)
    junk = os.path.join(d, "not-a-photo.jpg"); open(junk, "w").write("hello")
    return {"big": big, "side": side, "heic": heic, "junk": junk}


def signup_steps(pg, email):
    """From the sign-up form for one NPI: yes, email, one tick, send. Returns the number of steps."""
    pg.check("#s-ir-yes"); pg.fill("#s-email", email); pg.check("#s-agree"); pg.click("#s-send")
    return 4


def basic_path(b, label, base, vp, npi, email, proc):
    """From a card's Is this you? link to a procedure added: returns (ctx, page, who text, steps, seconds)."""
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-basic")
    steps = 0
    t0 = time.monotonic()
    pg.goto(f"{base}/account/?npi={npi}&procedure={proc}&name=x"); steps += 1           # the click on the card
    pg.wait_for_selector("#s-who")
    who = pg.inner_text("#s-who")
    staff = pg.evaluate("/staff|practice manager|on behalf/i.test(document.getElementById('acct').innerText)")
    asks_procs = pg.locator("#signup-form input[name=procedures]").count()
    steps += signup_steps(pg, email)
    pg.wait_for_selector("#c-code")
    pg.fill("#c-code", code_for(pg, base, email)); steps += 1
    pg.click("#code-form button[type=submit]"); steps += 1
    pg.wait_for_selector("#acct-level")
    first_view = pg.inner_text("#see-line") if pg.locator("#see-line").count() else ""
    if pg.locator(f".add[data-proc={proc}]").count():
        pg.click(f".add[data-proc={proc}]"); steps += 1
        pg.click(f"#attest-{proc}"); steps += 1
        pg.wait_for_selector(f"#proc-{proc}.on")
    secs = time.monotonic() - t0
    R.setdefault("prefill", {})[label] = {"asks_procs": asks_procs, "staff": staff, "first_view": first_view}
    return ctx, pg, who, steps, secs


def entry_and_find(b, label, base, vp):
    """Job 22: one entry page; find yourself by name; no NPI needed."""
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-entry")
    pg.goto(base + "/account/"); pg.wait_for_selector("#go-start")
    check(f"{label}: entry page offers Get started and Sign in, nothing else to fill", pg.is_visible("#go-start") and pg.is_visible("#login-form")
          and pg.locator("#acct-out input").count() == 1)
    check(f"{label}: entry page does not say Confirm your listing", "Confirm your listing" not in pg.inner_text("#acct"))
    fits(pg, f"{label} entry"); shot(pg, f"{label}-0-entry")
    steps = 1; t0 = time.monotonic()
    pg.click("#go-start"); steps += 1
    pg.fill("#f-name", "Cara Newdoc"); steps += 1
    pg.click("#f-go"); steps += 1
    pg.wait_for_selector(".pick-row")
    rows = pg.inner_text("#f-results")
    check(f"{label}: name search finds a doctor not on the site from the registry", "Cara Newdoc" in rows and "Madison, WI" in rows, rows)
    pg.fill("#f-name", "Eve Nursetest"); pg.click("#f-go"); pg.wait_for_selector("#f-none")
    check(f"{label}: non-physicians are not offered", pg.locator(".pick-row").count() == 0)
    pg.fill("#f-name", "Ann Testone"); pg.select_option("#f-state", "IL"); pg.click("#f-go"); pg.wait_for_selector(".pick-row")
    check(f"{label}: a listed doctor shows what they are listed for", "On Every Option for UFE and PAE" in pg.inner_text("#f-results"))
    check(f"{label}: results show only public registry fields", not re.search(r"\d{3}[-) ]\d{3}-?\d{4}|Street|Road", pg.inner_text("#f-results")))
    shot(pg, f"{label}-0-find")
    pg.fill("#f-name", "Cara Newdoc"); pg.select_option("#f-state", ""); pg.click("#f-go"); pg.wait_for_selector(".pick-row")
    pg.click(".pick-row >> nth=0"); steps += 1
    pg.wait_for_selector("#s-who")
    check(f"{label}: tapping yourself fills the NPI (no NPI typed)", CARA in pg.inner_text("#s-who") and "Not on Every Option yet" in pg.inner_text("#s-who"))
    pg.click("#s-send"); wait_status(pg, "yes or no")
    check(f"{label}: sending without the yes or no is refused plainly", pg.get_attribute("#s-ir", "aria-invalid") == "true")
    clear(pg); steps += signup_steps(pg, "cara@home.example")
    pg.wait_for_selector("#c-code"); pg.fill("#c-code", code_for(pg, base, "cara@home.example")); pg.click("#code-form button[type=submit]"); steps += 2
    pg.wait_for_selector("#see-line")
    R["paths"][f"{label}-new-doctor-by-name"] = {"steps": steps, "seconds": round(time.monotonic() - t0, 2)}
    check(f"{label}: sign-up success does not claim confirmed by physician", "confirmed by physician" not in msgs(pg).lower(), msgs(pg))
    check(f"{label}: first sign-in leads to choosing procedures", "not on any procedure list" in pg.inner_text("#see-line"), pg.inner_text("#see-line"))
    pg.click(".add[data-proc=pae]"); pg.click("#attest-pae"); pg.wait_for_selector("#proc-pae.on")
    pg.fill("#o0-practice", "Newdoc IR"); pg.fill("#o0-street", "2 Test Ave"); pg.fill("#o0-city", "Madison"); pg.select_option("#o0-state", "WI")
    pg.fill("#o0-zip", "53703"); pg.fill("#o0-phone", "608 555 0100"); pg.fill("#p-book", "newdoc-ir.example")
    clear(pg); pg.click("#office-form button[type=submit]"); wait_status(pg, "Saved")
    c = [x for x in json.loads(pg.request.get(base + "/__confirmed").text()) if x["npi"] == CARA][0]
    check(f"{label}: a new doctor on partial access sets an office, phone and link on day one, in Likely",
          c["offices"][0]["phone"] == "6085550100" and c["booking_url"] == "https://newdoc-ir.example/" and c["confirmed"] is False, c)
    check(f"{label}: the preview has the confirm-this-office line", "Details not confirmed by this doctor. Check with the office before you go." in pg.inner_text("#see"))
    fits(pg, f"{label} new doctor account"); shot(pg, f"{label}-0-new-doctor")
    ctx.close()


def photos(b, label, base, vp):
    """Job 22: phone photos shrink in the browser to fit 2 MB; sideways and unreadable files handled."""
    f = photo_files()
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-photo")
    pg.goto(base + "/__invite?kind=owner&npi=1999000106")
    r = json.loads(pg.inner_text("pre") if pg.locator("pre").count() else pg.inner_text("body"))
    pg.goto(r["url"].replace("http://localhost:" + base.rsplit(":", 1)[1], base)); pg.wait_for_selector("#invite-form")
    accept_invite(pg, base, "hal@home.example"); pg.wait_for_selector("#photo-pick")
    size = os.path.getsize(f["big"])
    pg.set_input_files("#photo", f["big"]); wait_status(pg, "Photo saved", 20000)
    wait_js(pg, "document.getElementById('photo-now').naturalWidth > 0")
    dims = pg.evaluate("[document.getElementById('photo-now').naturalWidth, document.getElementById('photo-now').naturalHeight]")
    check(f"{label}: a {size / 1e6:.1f} MB phone photo is shrunk in the browser and saved, shown to its owner", size > 10e6 and dims == [1200, 1600], [size, dims])
    pg.set_input_files("#photo", f["side"]); wait_status(pg, "Photo saved", 10000)
    wait_js(pg, "document.getElementById('photo-now').naturalWidth > 0")
    dims = pg.evaluate("[document.getElementById('photo-now').naturalWidth, document.getElementById('photo-now').naturalHeight]")
    check(f"{label}: a photo stored sideways with an EXIF turn is saved upright (portrait)", dims == [300, 400], dims)
    pg.set_input_files("#photo", f["heic"]); wait_status(pg, "HEIC", 10000)
    check(f"{label}: a HEIC this browser cannot open gets a plain message", "JPEG" in msgs(pg))
    pg.set_input_files("#photo", f["junk"]); wait_status(pg, "could not read", 10000)
    check(f"{label}: a file that is not a photo gets a plain message", "JPEG or PNG" in msgs(pg))
    shot(pg, f"{label}-6-photo")
    pg.once("dialog", lambda d: d.accept())
    pg.click("#photo-remove"); wait_status(pg, "Photo removed")
    # The page says "Photo removed" first, then reloads the profile and redraws (as the live run below waits for).
    # Job platform-directory-0036: the account page grew, the redraw took longer than this check, and the phone run failed.
    try:
        wait_js(pg, "!document.querySelector('img#photo-now')", timeout=10000)
    except Exception:
        pass
    check(f"{label}: remove takes the photo off", pg.locator("img#photo-now").count() == 0)
    other = b.new_context(viewport=vp).new_page()
    check(f"{label}: the photo is not served to anyone signed out", other.request.get(base + "/api/account/photo").status == 401)
    ctx.close()


def flows(b, label, base, vp):
    entry_and_find(b, label, base, vp)
    # 1 basic path: Ann from her card
    ctx, pg, who, steps, secs = basic_path(b, label, base, vp, ANN, "ann@home.example", "ufe")
    R["paths"][f"{label}-basic"] = {"steps": steps, "seconds": round(secs, 2)}
    check(f"{label}: Is this you? shows the NPPES name, nothing typed", "Ann Testone" in who and "On Every Option for UFE and PAE" in who, who)
    check(f"{label}: sign-up asks no procedures", R["prefill"][label]["asks_procs"] == 0)
    check(f"{label}: no staff option on the sign-up", not R["prefill"][label]["staff"])
    check(f"{label}: a listed doctor is told their listing still shows until they choose", "still shows under Likely performs" in R["prefill"][label]["first_view"], R["prefill"][label]["first_view"])
    check(f"{label}: sign-up gives partial access", "Partial access" in pg.inner_text("#acct-level"))
    a = acct(pg, base, npi=ANN)
    check(f"{label}: account from NPPES, partial, procedure attested when added", a and a["name"] == "Ann Testone" and a["level"] == "basic" and
          [p for p in store(pg, base)["profiles"] if p["npi"] == ANN][0]["attested"] == ["ufe"] and
          any(x["npi"] == ANN and x["procedure"] == "ufe" for x in store(pg, base)["attestations"]))
    check(f"{label}: partial: offices and link open, photo locked, no invitations", pg.is_visible("#p-book") and pg.is_visible("#photo-locked")
          and not pg.is_visible("#photo-pick") and not pg.is_visible("#invite-create"))
    fits(pg, f"{label} partial account")
    shot(pg, f"{label}-1-basic")
    # a note and insurances, with the screen
    pg.click("#proc-ufe .proc-note summary")
    pg.fill("#b-ufe", "The best UFE in Chicago, guaranteed."); clear(pg); pg.click("#proc-ufe .proc-note button")
    wait_js(pg, "document.getElementById('why-b-ufe').textContent.length > 0")
    check(f"{label}: screen blocks a promise word", "promise" in pg.inner_text("#why-b-ufe"))
    pg.fill("#b-ufe", "I perform UFE at Lakeside in Chicago. Call the office to ask whether it fits you.")
    clear(pg); pg.click("#proc-ufe .proc-note button"); wait_status(pg, "Note saved")
    pg.check("#insurance-form input[value=Aetna]"); clear(pg)
    # Job platform-directory-0037 (his yes 2026-11-13, call 7): the message shows under the button that saved, focus
    # stays on it, and the page does not jump to the top.
    # The button sits just above the notice bar (or the screen's bottom), as the walkthrough of 2026-11-14 had it.
    pg.locator("#ins-save").scroll_into_view_if_needed()
    pg.evaluate("""() => { const b = document.getElementById('ins-save').getBoundingClientRect(), n = document.querySelector('.eo-notice');
      const floor = n ? n.getBoundingClientRect().top : innerHeight; window.scrollBy(0, b.bottom - (floor - 6)); }""")
    pg.wait_for_timeout(100); y0 = pg.evaluate("scrollY"); top0 = pg.evaluate("document.getElementById('ins-save').getBoundingClientRect().top")
    mark(pg); pg.click("#ins-save"); wait_saved(pg, "Saved")
    wait_js(pg, "() => document.getElementById('msg-ins').textContent.includes('Saved')")
    after = pg.evaluate("""() => ({ y: scrollY, top: document.getElementById('ins-save').getBoundingClientRect().top,
      focus: document.activeElement && document.activeElement.id, status: document.getElementById('acct-status').textContent,
      msg: document.getElementById('msg-ins').childNodes[0] ? document.getElementById('msg-ins').childNodes[0].textContent : '', live: document.getElementById('msg-ins').getAttribute('aria-live'),
      under: document.getElementById('msg-ins').getBoundingClientRect().top >= document.getElementById('ins-save').getBoundingClientRect().bottom,
      bar: !!document.querySelector('.eo-notice'),
      clear: document.getElementById('msg-ins').getBoundingClientRect().bottom <= (document.querySelector('.eo-notice') ? document.querySelector('.eo-notice').getBoundingClientRect().top : innerHeight) })""")
    check(f"{label}: insurance: 'Saved.' shows under Save insurance, in a polite live line", after["msg"] == "Saved." and after["live"] == "polite" and after["under"], after)
    check(f"{label}: insurance: the top line stays empty", after["status"] == "", after)
    check(f"{label}: insurance: the message is in sight, above the notice bar (walkthrough 2026-11-14 saw it hidden)", after["clear"], after)
    check(f"{label}: insurance: focus stays on Save insurance", after["focus"] == "ins-save", after)
    check(f"{label}: insurance: the page did not scroll to the top (the button moved at most 150 px, to show the message)", y0 > 300 and after["y"] > 300 and -5 <= top0 - after["top"] <= 150, (y0, top0, after))
    # Job platform-directory-0038 (his call 10, "Yes to all" 2026-11-14 08:43 CT): an Undo beside "Saved." does what
    # History's Undo does for that save; focus stays on Save insurance; the button goes at the next action.
    u = pg.evaluate("""() => { const b = document.getElementById('undo-ins'); return b ? { inMsg: document.getElementById('msg-ins').contains(b),
      text: b.textContent, h: Math.round(b.getBoundingClientRect().height), focus: document.activeElement && document.activeElement.id } : null; }""")
    check(f"{label}: insurance: an Undo button sits beside 'Saved.', 44 px tall, focus not moved to it", u and u["inMsg"] and u["text"] == "Undo" and u["h"] >= 44 and u["focus"] == "ins-save", u)
    pg.screenshot(path=os.path.join(OUT, f"{label}-1a-saved-undo-light.png"))
    pg.emulate_media(color_scheme="dark"); pg.wait_for_timeout(100); pg.screenshot(path=os.path.join(OUT, f"{label}-1a-saved-undo-dark.png")); pg.emulate_media(color_scheme="light")
    top1 = pg.evaluate("document.getElementById('ins-save').getBoundingClientRect().top")
    mark(pg); pg.click("#undo-ins"); wait_saved(pg, "Undone")
    wait_js(pg, "() => document.getElementById('msg-ins').textContent.includes('Undone')")
    mine = [x for x in store(pg, base)["profiles"] if x["npi"] == ANN][0]
    ud = pg.evaluate("""() => ({ focus: document.activeElement && document.activeElement.id, msg: document.getElementById('msg-ins').textContent,
      aetna: document.querySelector('#insurance-form input[value=Aetna]').checked, undo: !!document.getElementById('undo-ins'),
      top: document.getElementById('ins-save').getBoundingClientRect().top, status: document.getElementById('acct-status').textContent })""")
    check(f"{label}: insurance: Undo beside 'Saved.' puts back what was there (Aetna off, on the page and in the store)", not ud["aetna"] and not (mine.get("insurances") or []), (ud, mine.get("insurances")))
    check(f"{label}: insurance: after Undo, 'Undone.' shows in the same line, focus stays on Save insurance, the page stays put", ud["msg"] == "Undone." and ud["focus"] == "ins-save" and not ud["undo"] and ud["status"] == "" and abs(top1 - ud["top"]) <= 150, (top1, ud))
    edits = json.loads(pg.request.get(base + "/api/account/edits").text())["edits"]
    check(f"{label}: insurance: the Undo is recorded like History's (an undo edit of the insurance save)", any(e["field"] == "insurances" and e.get("undo_of") for e in edits), [(e["field"], bool(e.get("undo_of"))) for e in edits[:4]])
    pg.check("#insurance-form input[value=Aetna]"); clear(pg)
    mark(pg); pg.click("#ins-save"); wait_saved(pg, "Saved")
    wait_js(pg, "() => !!document.getElementById('undo-ins')")
    pg.click("#insurance-panel > h2"); pg.wait_for_timeout(100)
    check(f"{label}: insurance: the Undo beside 'Saved.' goes at the next action", not pg.evaluate("!!document.getElementById('undo-ins')"))
    # Job platform-directory-0037 (his yes 2026-11-13, call 6): the contents list at the top; each link reaches its panel
    # and moves focus to its heading; Back to top returns.
    jl = pg.evaluate("() => [...document.querySelectorAll('#acct-toc a[data-jump]')].map(a => [a.getAttribute('data-jump'), a.textContent])")
    heads = pg.evaluate("""() => [...document.querySelectorAll('section.acct-panel[id], #also-form, details#history')].map(p => [p.id,
      (p.id === 'history' ? p.querySelector('summary h2') : p.querySelector(p.id === 'also-form' ? 'h3' : ':scope > h2')).textContent])""")
    check(f"{label}: jump list: one link per panel shown, in page order, in each panel's own heading words", jl == heads and len(jl) >= 8, (jl, heads))
    for pid, name in jl:
        if not pg.is_visible("#acct-toc"):
            pg.evaluate("window.scrollTo(0, 0)")
        pg.click(f"#acct-toc a[data-jump='{pid}']"); pg.wait_for_timeout(400)
        got = pg.evaluate("""id => { const p = document.getElementById(id), a = document.activeElement, r = p.getBoundingClientRect();
          return { top: Math.round(r.top), inPanel: p.contains(a), tag: a.tagName, url: location.hash, open: p.tagName !== 'DETAILS' || p.open, end: scrollY + innerHeight >= document.documentElement.scrollHeight - 2 }; }""", pid)
        check(f"{label}: jump link '{name}' reaches its panel, focus on its heading", (0 <= got["top"] <= 120 or (got["end"] and 0 <= got["top"] < 500)) and got["inPanel"] and got["tag"] in ("H2", "H3", "SUMMARY") and got["url"] == "" and got["open"], got)
    pg.evaluate("window.scrollTo(0, document.getElementById('insurance-panel').offsetTop)"); pg.wait_for_timeout(200)
    check(f"{label}: the pinned contents show once the list has scrolled away", pg.is_visible(".acct-dock"))
    pg.click("#insurance-panel .to-top"); pg.wait_for_timeout(150)
    check(f"{label}: Back to top goes to the top", pg.evaluate("scrollY") < 5 and pg.evaluate("document.activeElement.tagName") == "H1")
    shot(pg, f"{label}-1b-jump-list")
    conf = json.loads(pg.request.get(base + "/__confirmed").text())
    mine = [x for x in conf if x["npi"] == ANN][0]
    check(f"{label}: partial note and insurance reach the export, in Likely", mine["blurbs"].get("ufe", "").startswith("I perform UFE") and mine["insurances"] == ["Aetna"] and mine["confirmed"] is False)
    r = pg.request.post(base + "/api/account/photo", data=b"\xff\xd8\xff", headers={"Origin": base, "Content-Type": "image/jpeg"})
    check(f"{label}: server refuses a photo on partial even outside the page", r.status == 403)
    # 2 ID check to full
    pg.click("#check-id"); pg.wait_for_url(re.compile(r"/__identity/")); pg.click("text=Pass, name matches")
    pg.wait_for_selector("#photo-pick")
    check(f"{label}: ID check gives full access, Confirmed", "Full access" in pg.inner_text("#acct-level") and "Confirmed by physician" in pg.inner_text("#see-line"))
    pg.fill("#p-book", "https://lakesideir.example/book")
    pg.fill("#o0-practice", "Lakeside IR"); pg.fill("#o0-street", "100 Test Plaza"); pg.fill("#o0-city", "Chicago"); pg.select_option("#o0-state", "IL"); pg.fill("#o0-zip", "60611"); pg.fill("#o0-phone", "312-555-0100")
    clear(pg); pg.click("#office-form button[type=submit]"); wait_status(pg, "Saved")
    pg.set_input_files("#photo", png_file(os.path.join(OUT, f"_upload-{label}.png"))); wait_status(pg, "Photo saved", 10000)
    prof = [p for p in store(pg, base)["profiles"] if p["npi"] == ANN][0]
    check(f"{label}: full: link, office and photo saved", prof["booking_url"] and prof["offices"][0]["phone"] == "3125550100" and prof["photo_key"])
    check(f"{label}: job 16: the street address got coordinates once, on save", prof["offices"][0].get("geo") == "address" and prof["offices"][0].get("lat"))
    pg.click("#add-office"); pg.fill("#o1-practice", "Lakeside South"); pg.fill("#o1-street", "9 Unknown Street"); pg.fill("#o1-city", "Chicago")
    pg.select_option("#o1-state", "IL"); pg.fill("#o1-zip", "60605")
    clear(pg); pg.click("#office-form button[type=submit]"); wait_status(pg, "couldn't find the street address for Lakeside South")
    check(f"{label}: job 16: an address not found is saved and the doctor is told plainly", "center of that office's ZIP code" in msgs(pg))
    pg.click("#add-office"); pg.fill("#o2-practice", "No Street IR"); pg.fill("#o2-city", "Evanston"); pg.select_option("#o2-state", "IL"); pg.fill("#o2-zip", "60201")
    clear(pg); pg.click("#office-form button[type=submit]"); wait_status(pg, "needs a street address")
    check(f"{label}: job 16: a new office without a street is refused in plain words", "street address" in msgs(pg))
    shot(pg, f"{label}-2-full")
    # 3 invite a colleague (Gil)
    pg.fill("#v-npi", GIL); clear(pg); pg.click("#invite-create button[type=submit]"); wait_status(pg, "Invitation link made")
    link = pg.input_value("#invite-link")
    check(f"{label}: invitation link made from the account page, 4 left", "#invite=" in link and "4 left" in msgs(pg))
    # undo the photo (History is folded away until opened)
    pg.click("#history summary"); pg.wait_for_selector("#history li")
    hist = pg.inner_text("#history")
    check(f"{label}: History uses plain dates and words", "Account created" in hist and not re.search(r"\d{1,2}/\d{1,2}/\d{4}", hist), hist[:200])
    pg.locator("#history li", has_text="Photo").locator("button.undo").first.click(); wait_status(pg, "Undone")
    check(f"{label}: undo puts the photo back to none", [p for p in store(pg, base)["profiles"] if p["npi"] == ANN][0]["photo_key"] is None)
    # remove a procedure: the attestation record stays
    pg.once("dialog", lambda d: d.accept())
    pg.click("#proc-ufe .remove"); wait_status(pg, "UFE removed")
    check(f"{label}: a procedure can be removed; its attestation record stays", [p for p in store(pg, base)["profiles"] if p["npi"] == ANN][0]["attested"] == []
          and any(x["npi"] == ANN and x["procedure"] == "ufe" for x in store(pg, base)["attestations"]))
    ctx.close()

    # 4 invitation path: Gil opens the link
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-invite")
    steps = 0; t0 = time.monotonic()
    pg.goto(link.replace("http://localhost:8787", base)); steps += 1                   # the click on the link
    pg.wait_for_selector("#invite-form")
    view = pg.inner_text("#invite-form")
    shot(pg, f"{label}-3a-invitation-page")
    steps += accept_invite(pg, base, "gil@home.example", wrong_first=True, label=label)
    pg.wait_for_selector("#acct-level")
    R["paths"][f"{label}-invitation"] = {"steps": steps, "seconds": round(time.monotonic() - t0, 2)}
    check(f"{label}: invitation opens to the doctor's listing with one agreement", "Gil Fourtest" in view and "On Every Option for UFE" in view and "I am Gil Fourtest" in view, view)
    check(f"{label}: invitation page asks for a login email we send a code to", "Enter an email you'll keep. We send it a 6-digit code." in view, view)
    check(f"{label}: invitation gives full access with the confirmed login email", "Full access" in pg.inner_text("#acct-level") and acct(pg, base, npi=GIL)["email"] == "gil@home.example")
    check(f"{label}: login email set: that section is not marked", "need" not in (pg.get_attribute("#email-panel", "class") or ""))
    fits(pg, f"{label} invitation dashboard")
    shot(pg, f"{label}-3-invited")
    # change the login email later (still by code)
    pg.fill("#e-email", "gil2@home.example"); clear(pg); pg.click("#email-form button[type=submit]"); pg.wait_for_selector("#c-code")
    pg.fill("#c-code", code_for(pg, base, "gil2@home.example")); clear(pg); pg.click("#code-form button[type=submit]"); wait_status(pg, "Login email saved")
    check(f"{label}: login email changed by code", acct(pg, base, npi=GIL)["email"] == "gil2@home.example")
    # 5 revoke a bad inviter (Ann) in one step: Gil drops to partial
    r = json.loads(pg.request.get(base + f"/__revoke?who={ANN}").text())
    pg.reload(); pg.wait_for_selector("#acct-level")
    check(f"{label}: one-step revoke drops the inviter and Gil to partial", r.get("ok") and len(r["revoked"]) == 2 and "Partial access" in pg.inner_text("#acct-level"), r)
    # 6 Doximity proof brings Gil back to full (name unique among radiologists)
    pg.click("#dox-link"); pg.fill("input[name=first]", "Gil"); pg.fill("input[name=last]", "Fourtest"); pg.fill("input[name=id]", f"dx-{label}")
    pg.click("text=Continue"); pg.wait_for_selector("#dox-yes"); pg.click("#dox-yes"); wait_status(pg, "Confirmed by Doximity")
    pg.wait_for_selector("#acct-level")
    check(f"{label}: Doximity counts as proof (name, specialty, unique)", acct(pg, base, npi=GIL)["proof"] == "doximity" and "Full access" in pg.inner_text("#acct-level"))
    ctx.close()

    # 7 takeover: a squatter on Ben, then the real Ben proves by ID
    sq_ctx, sq, _, _, _ = basic_path(b, label + "-squat", base, vp, BEN, "squatter@x.example", "gae")
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-takeover")
    pg.goto(f"{base}/account/?npi={BEN}"); pg.wait_for_selector("#s-who")
    check(f"{label}: a held listing says so before sign-up", "already has an account" in pg.inner_text("#s-who"))
    signup_steps(pg, "ben@home.example")
    pg.wait_for_selector("#c-code")
    check(f"{label}: second claimant told plainly", "already has an account" in msgs(pg))
    pg.fill("#c-code", code_for(pg, base, "ben@home.example")); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#check-id")
    shot(pg, f"{label}-4-claimant")
    pg.click("#check-id"); pg.wait_for_url(re.compile(r"/__identity/")); pg.click("text=Pass, name matches"); pg.wait_for_selector("#procs")
    old = acct(pg, base, email="squatter@x.example")
    check(f"{label}: ID-proven doctor takes the listing over; old account loses it and is told",
          acct(pg, base, npi=BEN)["email"] == "ben@home.example" and old["npi"] is None and
          any(m["to"] == "squatter@x.example" and "no longer holds" in m["text"] for m in outbox(pg, base)))
    pg.click("#history summary"); pg.wait_for_selector("#history li")
    hist = pg.inner_text("#history")
    check(f"{label}: the earlier account's edits stay listed and undoable", "earlier account" in hist and pg.locator("#history button.undo").count() > 0)
    sq.reload(); sq.wait_for_selector("#signup-form")
    check(f"{label}: the squatter is signed out", sq.is_visible("#signup-form"))
    sq_ctx.close(); ctx.close()

    # 9 shared email and waitlist
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-misc")
    pg.goto(f"{base}/account/?npi={GIL}"); pg.wait_for_selector("#s-who")
    signup_steps(pg, "ben@home.example")
    wait_status(pg, "already has an Every Option account")
    check(f"{label}: a shared email is told plainly", "Sign in with it, or use a different email" in msgs(pg))
    pg.goto(f"{base}/account/?npi={DAN}"); pg.wait_for_selector("#s-who")
    pg.check("#s-ir-no"); pg.fill("#s-other", "Orthopaedic surgery"); pg.fill("#s-email", "dan@ortho.example"); pg.check("#s-agree"); clear(pg); pg.click("#s-send")
    pg.wait_for_selector("#waitlist")
    check(f"{label}: a non-IR goes on the waitlist", any(w["npi"] == DAN for w in store(pg, base).get("waitlist", [])))
    shot(pg, f"{label}-5-waitlist")
    ctx.close()
    photos(b, label, base, vp)
    invitations_0009(b, label, base, vp)


def invitations_0009(b, label, base, vp):
    """Job platform-launch-0009: email and code on every invitation; the counting rule; published stays partial."""
    ALEK, IVY = "1999000114", "1999000122"
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-inv9")
    r = json.loads(pg.request.get(base + f"/__invite?kind=owner&npi={ALEK}").text())
    pg.goto(r["url"].replace("http://localhost:8787", base)); pg.wait_for_selector("#invite-form")
    view = pg.inner_text("#invite-form")
    check(f"{label}: inv9: his invitation shows the name and full-access wording and asks for an email",
          "Wiśniewska-Kowalczyk" in view and "full access" in view and "Enter an email you'll keep. We send it a 6-digit code." in view, view[:300])
    shot(pg, f"{label}-9a-invitation")
    pg.check("#i-agree"); clear(pg); pg.click("#invite-form button[type=submit]")
    wait_status(pg, "check your email")
    check(f"{label}: inv9: no email, no code sent", not pg.locator("#c-code").count() and not acct(pg, base, npi=ALEK))
    accept_invite(pg, base, "alek@home.example")
    pg.wait_for_selector("#acct-level")
    check(f"{label}: inv9: his invitation gives full access, Confirmed, with the confirmed email",
          "Full access" in pg.inner_text("#acct-level") and acct(pg, base, npi=ALEK)["email"] == "alek@home.example")
    add_proc(pg, "ufe")
    card = [x for x in json.loads(pg.request.get(base + "/__confirmed").text()) if x["npi"] == ALEK]
    check(f"{label}: inv9: with UFE ticked the card is Confirmed", bool(card) and card[0]["confirmed"], card)
    check(f"{label}: inv9: the invite box shows 5 left", "5 of 5 left" in pg.inner_text("#invite-left"))
    for npi in (ANN, BEN, CARA, GIL, "1999000106"):
        pg.fill("#v-npi", npi); clear(pg); pg.click("#invite-create button[type=submit]"); wait_status(pg, "Invitation link made")
    check(f"{label}: inv9: after 5 links the box shows 0 left and the button is off",
          "0 of 5 left" in pg.inner_text("#invite-left") and pg.is_disabled("#invite-go"))
    x = json.loads(pg.request.get(base + f"/__test/expire?npi={ALEK}").text())
    pg.reload(); pg.wait_for_selector("#invite-left")
    check(f"{label}: inv9: expired unused links give their slots back", x.get("expired") == 5 and "5 of 5 left" in pg.inner_text("#invite-left")
          and not pg.is_disabled("#invite-go"), x)
    pg.fill("#v-npi", DAN); clear(pg); pg.click("#invite-create button[type=submit]"); wait_status(pg, "radiologists")
    check(f"{label}: inv9: a non-radiologist is refused", "Invitations are for radiologists" in msgs(pg))
    pg.fill("#v-npi", ALEK); clear(pg); pg.click("#invite-create button[type=submit]"); wait_status(pg, "own NPI")
    check(f"{label}: inv9: own NPI is refused", "That is your own NPI." in msgs(pg))
    shot(pg, f"{label}-9b-invite-box")
    # sign out, sign in again with the same email and a code
    pg.click("#signout"); pg.wait_for_selector("#l-email")
    pg.fill("#l-email", "alek@home.example"); clear(pg); pg.click("#l-send"); pg.wait_for_selector("#c-code")
    pg.fill("#c-code", code_for(pg, base, "alek@home.example")); clear(pg); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#acct-level")
    check(f"{label}: inv9: signs in again with the same email and code, still full", "Full access" in pg.inner_text("#acct-level"))
    ctx.close()
    # published-email invitation: the address is fixed, partial, no invitations
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-inv9p")
    r = json.loads(pg.request.get(base + f"/__invite?kind=published&npi={IVY}&email=ivy@pubtest-ir.example").text())
    pg.goto(r["url"].replace("http://localhost:8787", base)); pg.wait_for_selector("#invite-form")
    check(f"{label}: inv9: a published-email invitation shows its address, fixed", pg.input_value("#i-email") == "ivy@pubtest-ir.example"
          and pg.get_attribute("#i-email", "readonly") is not None and "partial access" in pg.inner_text("#invite-form"))
    accept_invite(pg, base, None)
    pg.wait_for_selector("#acct-level")
    check(f"{label}: inv9: published-email invitation gives partial, Likely, no invitations", "Partial access" in pg.inner_text("#acct-level")
          and not pg.locator("#invite-create").count() and acct(pg, base, npi=IVY)["email"] == "ivy@pubtest-ir.example")
    shot(pg, f"{label}-9c-published")
    ctx.close()


# ---------------------------------------------------------------------------------------------------------------------
# Job 21: the same walk-through, live on the dev site (one doctor, real email, real database), or on a local server
# with stand-ins. Started by ai-hq scripts/every_option_live_test.py, which reads the keys from the mini's keychain
# and passes them as JSON on stdin, never in arguments, environment or files:
#   <browser venv>/bin/python tools/e2e/accounts_e2e.py --live OUT_DIR < config.json
# Config: mode ("live" or "local"), base, first, last, state, npi, zip, email_user, email_tag; live only:
# access_id, access_secret, gmail_password, supabase_url, supabase_key, publishable_key; optional break (one check
# made to expect the wrong thing, to prove a failure is reported). Exit 0 all passed, 1 a check failed, 3 setup failed.
# The test-only database functions (reset, promote, count) are in ai-hq projects/platform/accounts/job21/, not here.

class SetupFailed(Exception):
    pass


def test_email(cfg):
    return cfg["email_user"].replace("@", f"+eo21-{cfg['email_tag']}@")


def tls():
    """Certificate and host name checked (Python's imaplib default checks neither; review round 1)."""
    import ssl
    c = ssl.create_default_context()
    assert c.verify_mode == ssl.CERT_REQUIRED and c.check_hostname
    return c


class LiveSite:
    """The dev site behind Cloudflare Access, its database through the test-only functions, and the Gmail inbox."""

    SENDER = "no-reply@everyoptionmd.com"

    def __init__(self, cfg):
        import urllib.parse
        self.cfg, self.base = cfg, cfg["base"].rstrip("/")
        self.host = urllib.parse.urlsplit(self.base).netloc
        self.ours = lambda u: (lambda x: x.scheme == "https" and x.netloc == self.host)(urllib.parse.urlsplit(u))
        self.access = {"CF-Access-Client-Id": cfg["access_id"], "CF-Access-Client-Secret": cfg["access_secret"]}
        self.seen = set()
        self.email = test_email(cfg)

    # Access headers go only to the dev site's own host. Playwright carries headers set in continue_() across redirects
    # (review round 1) and does not route redirect hops, so each request to the host is fetched here with redirects
    # off: a redirect within the host is followed here with the headers (up to 5 hops); a redirect to any other host is
    # handed to the browser as is and followed without them (checked against two local servers, 2026-11-03).
    def attach(self, ctx):
        import urllib.parse
        from playwright._impl._errors import TargetClosedError
        def add(route):
            # A request still in flight when its context closes (a lazy image after a search page is shut) raises
            # TargetClosedError here, which Playwright re-raises at the next browser call and so failed a live run
            # (ai-hq job platform-web-design-0017, 2026-11-16, step 3). The context is gone: nothing to fulfil.
            try:
                fetch_and_fulfill(route)
            except TargetClosedError:
                pass
        def fetch_and_fulfill(route):
            url = route.request.url
            if not self.ours(url):
                return route.continue_()
            resp = route.fetch(headers={**route.request.headers, **self.access}, max_redirects=0)
            for _ in range(5):
                loc = resp.headers.get("location")
                if not (300 <= resp.status < 400 and loc):
                    break
                url = urllib.parse.urljoin(url, loc)
                if not self.ours(url):
                    break
                resp = route.fetch(url=url, method="GET", headers={**route.request.headers, **self.access}, max_redirects=0)
            route.fulfill(response=resp)
        ctx.route("**/*", add)

    def headers(self, extra=None):
        return {**self.access, **(extra or {})}

    def _open(self, req):
        """The secret key goes to the configured Supabase host only: no redirect is followed, no proxy is used."""
        import urllib.request, urllib.error
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None                          # a 3xx then surfaces as an HTTPError, handled below
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
        try:
            return json.loads(opener.open(req, timeout=30).read() or b"null")
        except urllib.error.HTTPError as e:      # status and the database's message only; never the request headers
            if 300 <= e.code < 400:
                raise SetupFailed(f"Supabase {req.full_url.split('/v1/')[-1]}: unexpected redirect (HTTP {e.code}); key not sent on") from None
            raise SetupFailed(f"Supabase {req.full_url.split('/v1/')[-1]}: HTTP {e.code} {scrub(e.read()[:200].decode('utf-8', 'replace'))}") from None

    def _db(self, fn, body):
        import urllib.request
        url = self.cfg["supabase_url"].rstrip("/") + "/rest/v1/rpc/" + fn
        return self._open(urllib.request.Request(url, json.dumps(body).encode(), {"apikey": self.cfg["supabase_key"], "Content-Type": "application/json"}))

    def _storage(self, method, path, body):
        import urllib.request
        url = self.cfg["supabase_url"].rstrip("/") + "/storage/v1/" + path
        return self._open(urllib.request.Request(url, json.dumps(body).encode(), {"apikey": self.cfg["supabase_key"], "Content-Type": "application/json"}, method=method))

    # Job platform-launch-0009: the colleague row and its lapse, test project only, with the same key the reset uses.
    def _rest(self, method, path, body=None):
        import urllib.request
        url = self.cfg["supabase_url"].rstrip("/") + "/rest/v1/" + path
        return self._open(urllib.request.Request(url, None if body is None else json.dumps(body).encode(),
                          {"apikey": self.cfg["supabase_key"], "Content-Type": "application/json", "Prefer": "return=representation"}, method=method))

    def account_id(self):
        rows = self._rest("GET", f"accounts?select=id&npi=eq.{self.cfg['npi']}") or []
        return rows[0]["id"] if rows else None

    def colleague_row(self, target_npi):
        """One doctor's invitation from his test account, through the same locked count (eo_insert_doctor_invite)."""
        import hashlib, secrets, datetime
        exp = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)).isoformat()
        r = self._db("eo_insert_doctor_invite", {"p_token_hash": hashlib.sha256(secrets.token_hex(32).encode()).hexdigest(),
                                                 "p_npi": target_npi, "p_inviter": self.account_id(), "p_expires_at": exp})
        return bool(r)

    def expire_colleague(self):
        aid = self.account_id()
        past = "2026-01-01T00:00:00Z"
        rows = self._rest("PATCH", f"invitations?inviter_account_id=eq.{aid}&used_at=is.null", {"expires_at": past}) or []
        return len(rows)

    def make_invite(self):
        return self.cfg.get("invite_url")

    def photo_objects(self):
        rows = self._storage("POST", "object/list/photos", {"prefix": self.cfg["npi"], "limit": 1000}) or []
        return [f"{self.cfg['npi']}/{r['name']}" for r in rows if r.get("name")]

    def gate(self, ip=None):
        """eo_test_count exists only in the project where test-reset.sql was run: no answer, no Storage call."""
        return self._db("eo_test_count", {"p_npi": self.cfg["npi"], "p_ip": ip, "p_email": self.email})

    def reset(self, ip):
        self.gate(ip)
        objs = self.photo_objects()
        if objs:
            self._storage("DELETE", "object/photos", {"prefixes": objs})
        out = self._db("eo_test_reset", {"p_npi": self.cfg["npi"], "p_ip": ip, "p_email": self.email})
        return {"deleted": out, "photos_deleted": len(objs)}

    def promote(self):
        return self._db("eo_test_promote", {"p_npi": self.cfg["npi"]})

    def remaining(self, ip=None):
        r = self.gate(ip) or {}
        r["photo_objects"] = len(self.photo_objects())
        return r

    def ip(self, pg):
        r = pg.request.get(self.base + "/cdn-cgi/trace", headers=self.headers(), max_redirects=0)
        m = re.search(r"^ip=(\S+)$", r.text(), re.M) if r.status == 200 else None
        if not m:
            raise SetupFailed(f"Cloudflare Access did not let the service token in (status {r.status})")
        return m.group(1)

    def code(self, to, timeout=150):
        """The newest 6-digit code mailed to `to`, only from the site's sender; read-only, each message used once."""
        import email, email.policy, email.utils, imaplib
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            try:
                M = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30, ssl_context=tls())
                M.login(self.cfg["email_user"], self.cfg["gmail_password"])
            except imaplib.IMAP4.error:
                raise SetupFailed("Gmail refused the app password") from None
            try:
                for box in ("INBOX", '"[Gmail]/Spam"'):
                    if M.select(box, readonly=True)[0] != "OK":
                        continue
                    _, ids = M.search(None, "FROM", f'"{self.SENDER}"', "TO", f'"{to}"')
                    for i in reversed(ids[0].split()):
                        _, data = M.fetch(i, "(BODY.PEEK[])")
                        msg = email.message_from_bytes(data[0][1], policy=email.policy.default)
                        if email.utils.parseaddr(msg.get("From", ""))[1].lower() != self.SENDER:
                            continue
                        if to.lower() not in [a.lower() for _, a in email.utils.getaddresses(msg.get_all("To", []))]:
                            continue
                        mid = msg.get("Message-ID", "") + i.decode()
                        if mid in self.seen:
                            continue
                        part = msg.get_body(("plain",)) or msg
                        c = re.search(r"Your Every Option code is (\d{6})\.", part.get_content() if part.get_content_type() == "text/plain" else "")
                        if c:
                            self.seen.add(mid)
                            return c.group(1)
            finally:
                try: M.logout()
                except Exception: pass
            time.sleep(6)
        return None

    def public_key_blocked(self, pg, photo_key):
        """The public (publishable) key reads no table and no photo, while test rows and a photo exist."""
        url, k = self.cfg["supabase_url"].rstrip("/"), self.cfg["publishable_key"]
        H = {"apikey": k}
        out = {}
        for t in ("accounts", "profiles", "login_links", "codes", "invitations", "radiologist_names", "sessions",
                  "identity_checks", "attestations", "edits", "exceptions", "waitlist", "rate_hits"):
            r = pg.request.get(f"{url}/rest/v1/{t}?select=*&limit=1", headers=H)
            out[t] = r.status if r.status != 200 else ("empty" if r.text().strip() == "[]" else "ROWS")
        r = pg.request.post(f"{url}/storage/v1/object/list/photos", headers={**H, "Content-Type": "application/json"},
                            data=json.dumps({"prefix": self.cfg["npi"], "limit": 10}))
        out["photos list"] = r.status if r.status != 200 else ("empty" if r.text().strip() == "[]" else "ROWS")
        for fn in ("eo_test_reset", "eo_test_promote", "eo_test_count"):
            r = pg.request.post(f"{url}/rest/v1/rpc/{fn}", headers={**H, "Content-Type": "application/json"},
                                data=json.dumps({"p_npi": "0000000000"}))
            out[f"rpc {fn}"] = r.status if r.status in (401, 403, 404) else f"CALLED {r.status}"
        for kind in ("public", "authenticated"):
            r = pg.request.get(f"{url}/storage/v1/object/{kind}/photos/{photo_key}", headers=H)
            out[f"photo {kind}"] = r.status if r.status != 200 else "READ"
        return all(v not in ("ROWS", "READ") and not str(v).startswith("CALLED") for v in out.values()), out


class LocalSite(LiveSite):
    """The same flow on node tools/dev-server.mjs --accounts: outbox for mail, /__test/* for the database functions."""

    def __init__(self, cfg):
        self.cfg, self.base, self.seen = cfg, cfg["base"].rstrip("/"), set()

    def attach(self, ctx):
        pass

    def headers(self, extra=None):
        return dict(extra or {})

    def _get(self, path):
        import urllib.request
        return json.loads(urllib.request.urlopen(self.base + path, timeout=10).read())

    def reset(self, ip):
        return self._get(f"/__test/reset?npi={self.cfg['npi']}")

    def promote(self):
        return self._get(f"/__test/promote?npi={self.cfg['npi']}")["promoted"]

    def remaining(self, ip=None):
        return self._get(f"/__test/count?npi={self.cfg['npi']}")["remaining"]

    def ip(self, pg):
        return "127.0.0.1"

    def code(self, to, timeout=10):
        for i, m in reversed(list(enumerate(self._get("/__outbox")))):
            c = re.search(r"Your Every Option code is (\d{6})\.", m["text"])
            if m["to"] == to and c and i not in self.seen:
                self.seen.add(i)
                return c.group(1)
        return None

    def public_key_blocked(self, pg, photo_key):
        return None, "not testable locally (no database here)"

    def colleague_row(self, target_npi):
        return True                       # locally the account page makes it (the fixture registry knows the NPI)

    def expire_colleague(self):
        return self._get(f"/__test/expire?npi={self.cfg['npi']}")["expired"]

    def make_invite(self):
        r = self._get(f"/__invite?kind=owner&npi={self.cfg['npi']}&trainee=1")
        return r["url"].replace("http://localhost:8787", self.base) if r.get("url") else None


def live_run(cfg):
    SECRET_VALUES[:] = [cfg.get(k) for k in ("access_id", "access_secret", "gmail_password", "supabase_key") if cfg.get(k)]
    site = LocalSite(cfg) if cfg.get("mode") == "local" else LiveSite(cfg)
    base, npi, brk = site.base, cfg["npi"], cfg.get("break", "")
    first, last = cfg["first"], cfg["last"]
    email_addr = test_email(cfg)
    office = {"practice": "Every Option Test Office", "street": "1 Test Plaza", "city": cfg.get("city", "Chicago"),
              "state": cfg["state"], "zip": cfg["zip"], "phone": "3125550199"}
    note = "Automated test note. This text is removed after every test run."
    R["live"] = {"base": base, "mode": cfg.get("mode", "live"), "email": email_addr, "steps": []}
    fails = []
    current = {"pg": None}

    def lcheck(name, ok, detail=""):
        if brk and brk == name:
            ok = not ok                       # the deliberately broken check: proves a failure is reported
        check(name, ok, detail)
        if not ok and current["pg"] is not None and len(fails) < 8:
            p = os.path.join(OUT, f"fail-{len(fails) + 1:02d}.png")
            try:
                current["pg"].screenshot(path=p, full_page=True); fails.append({"check": name, "shot": p})
            except Exception:
                fails.append({"check": name, "shot": ""})
        return ok

    def step(s):
        R["live"]["steps"].append(s); print("--", s)

    def api(pg, method, path, body=None, raw=None, ctype="application/json"):
        h = site.headers({"Origin": base, "Content-Type": ctype})
        data = raw if raw is not None else (json.dumps(body or {}) if method != "GET" else None)
        return pg.request.fetch(base + path, method=method, headers=h, data=data, max_redirects=0)

    def find_card(pg, tier, want_photo=False, timeout=95, gone=False, who=None):
        """A patient (fresh signed-out browser, empty cache) searches the UFE finder by the office ZIP until the card is
        in `tier` (or gone). Returns the seconds taken or None; `pg` is left on the last search page for screenshots."""
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            pc = pg.context.browser.new_context(viewport={"width": 1280, "height": 900}); site.attach(pc)
            q = pc.new_page(); current["pg"] = q
            q.goto(base + "/fibroids/"); q.fill("#zip", cfg["zip"])
            if q.locator("#radius").count(): q.select_option("#radius", "25")
            q.click("#zip-form button")
            wait_js(q, "!document.querySelector('#results').hasAttribute('aria-busy')", timeout=20000)
            q.wait_for_timeout(300)
            cards = q.locator("#results li.card", has_text=who or f"{first} {last}")
            inside = q.locator(f"section.{tier} li.card", has_text=who or f"{first} {last}")
            found = None
            if gone and cards.count() == 0:
                found = round(time.monotonic() - t0, 1)
            elif not gone and inside.count():
                ok = True
                if want_photo:
                    inside.first.scroll_into_view_if_needed()
                    try:
                        wait_js(q, "e => { const i = e.querySelector('img.photo'); return !!i && i.complete }",
                                            arg=inside.first.element_handle(), timeout=5000)
                    except Exception:
                        pass
                    ok = q.evaluate("e => { const i = e.querySelector('img.photo'); return !!i && i.complete && i.naturalWidth > 0 }",
                                    inside.first.element_handle())
                if ok:
                    found = round(time.monotonic() - t0, 1)
            if found is not None or time.monotonic() - t0 >= timeout - 8:
                last_search["page"], last_search["ctx"] = q, pc
                return found
            pc.close(); current["pg"] = pg
            pg.wait_for_timeout(8000)
        return None

    last_search = {}

    def done_search():
        if last_search.get("ctx"):
            last_search["ctx"].close(); last_search.clear()
        current["pg"] = pg

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        site.attach(ctx)
        pg = ctx.new_page(); watch(pg, "live"); current["pg"] = pg
        try:
            if cfg.get("reset_only"):           # the runner's clean-up after a run stopped at its time limit
                raise SetupFailed("reset only")
            # 1 reset, then Access
            step("1 Access and reset")
            ip = site.ip(pg)
            R["live"]["reset_before"] = site.reset(ip)
            r = pg.request.get(base + "/api/account/status", headers=site.headers(), max_redirects=0)
            if r.status != 200 or not r.json().get("open"):
                raise SetupFailed(f"accounts are not open on the site (status {r.status})")
            # 2 Physicians page, Get started, find him by name, yes to IR, sign up, code from the inbox
            step("2 sign-up by name")
            t0 = time.monotonic()
            pg.goto(base + "/"); pg.click("header a[href='/account/']"); pg.wait_for_selector("#go-start")
            pg.click("#go-start"); pg.fill("#f-name", f"{first} {last}")
            if cfg.get("state"): pg.select_option("#f-state", cfg["state"])
            pg.click("#f-go"); pg.wait_for_selector(".pick-row, #f-none", timeout=30000)
            row = pg.locator(".pick-row", has_text=last)
            lcheck("live: the name search finds him in the NPI Registry", row.count() >= 1, pg.inner_text("#f-results")[:200])
            row.first.click(); pg.wait_for_selector("#s-who")
            lcheck("live: choosing himself fills his NPI (none typed)", npi in pg.inner_text("#s-who"))
            signup_steps(pg, email_addr)
            pg.wait_for_selector("#c-code", timeout=30000)
            c = site.code(email_addr)
            if not c:
                raise SetupFailed("no sign-up code reached the inbox from the site's sender within 150 s")
            pg.fill("#c-code", c); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#acct-level", timeout=30000)
            R["live"]["signup_seconds"] = round(time.monotonic() - t0, 1)
            lcheck("live: sign-up by code gives partial access", "Partial access" in pg.inner_text("#acct-level"), pg.inner_text("#acct-level"))
            # 3 partial access: add and remove, note, office, phone, link; refresh; photo refused; finder in Likely
            step("3 partial access")
            for proc in ("ufe", "pae"):
                add_proc(pg, proc)
            mark(pg); pg.once("dialog", lambda d: d.accept()); pg.click("#proc-pae .remove"); wait_saved(pg, "PAE removed", 15000)
            # pelvic (database change 2026-11-07-pelvic-procedure.sql, applied 2026-11-07): add, on, remove
            pelvic_err = ""
            try:
                add_proc(pg, "pelvic")
            except Exception as e:
                pelvic_err = type(e).__name__ + ": " + scrub(e)[:200]
            pelvic_on = pg.locator("#proc-pelvic.on").count() == 1
            lcheck("live: pelvic vein embolization and stenting can be added (the test database allows pelvic)", pelvic_on and not pelvic_err, pelvic_err)
            if pelvic_on:
                mark(pg); pg.once("dialog", lambda d: d.accept()); pg.click("#proc-pelvic .remove"); wait_saved(pg, "embolization and stenting removed", 15000)
            # hae (database change 2026-11-11-hae-procedure.sql; his words 2026-11-11: "Let's do the database changes"): add, on, remove
            hae_err = ""
            try:
                add_proc(pg, "hae")
            except Exception as e:
                hae_err = type(e).__name__ + ": " + scrub(e)[:200]
            hae_on = pg.locator("#proc-hae.on").count() == 1
            lcheck("live: hemorrhoid embolization can be added (the test database allows hae)", hae_on and not hae_err, hae_err)
            if hae_on:
                mark(pg); pg.once("dialog", lambda d: d.accept()); pg.click("#proc-hae .remove"); wait_saved(pg, "HAE removed", 15000)
            # private ticks for procedures not on the site yet (database change 2026-11-13-also-performs.sql; ai-hq job
            # platform-directory-0036): open the first group, tick its first item, save, refresh, still ticked; untick, save
            also = {}
            try:
                slug = upcoming_first()
                pg.click("#also-g-0 > summary"); pg.check(f"#a-{slug}")
                also["count shown"] = pg.inner_text("#also-n-0").strip() == "1 ticked"
                mark(pg); pg.click("#also-save"); wait_saved(pg, "Saved", 15000)
                pg.reload(); pg.wait_for_selector("#acct-level", timeout=30000)
                also["closed after refresh"] = pg.evaluate("!document.getElementById('also-g-0').open")
                also["still ticked"] = pg.is_checked(f"#a-{slug}") and pg.inner_text("#also-n-0").strip() == "1 ticked"
                also["no procedure added"] = pg.locator(f"#proc-{slug}").count() == 0
                pg.click("#also-g-0 > summary"); pg.uncheck(f"#a-{slug}")
                mark(pg); pg.click("#also-save"); wait_saved(pg, "Saved", 15000)
                pg.reload(); pg.wait_for_selector("#acct-level", timeout=30000)
                also["unticked after refresh"] = not pg.is_checked(f"#a-{slug}")
            except Exception as e:
                also["error"] = type(e).__name__ + ": " + scrub(e)[:200]
            lcheck("live: a procedure not on the site yet can be ticked, stays ticked after a refresh, and unticked (the test database has also_performs)",
                   also and all(v is True for v in also.values()), also)
            pg.click("#proc-ufe .proc-note summary"); pg.fill("#b-ufe", note); clear(pg)
            mark(pg); pg.click("#proc-ufe .proc-note button"); wait_saved(pg, "Note saved", 15000)
            pg.fill("#o0-practice", office["practice"]); pg.fill("#o0-street", office["street"]); pg.fill("#o0-city", office["city"])
            pg.select_option("#o0-state", office["state"]); pg.fill("#o0-zip", office["zip"]); pg.fill("#o0-phone", office["phone"])
            pg.fill("#p-book", "https://example.com/every-option-test")
            clear(pg); mark(pg); pg.click("#office-form button[type=submit]"); wait_saved(pg, "Saved", 20000)
            pg.reload(); pg.wait_for_selector("#acct-level", timeout=30000)
            kept = {"ufe on": pg.locator("#proc-ufe.on").count() == 1, "pae off": pg.locator("#proc-pae.on").count() == 0,
                    "pelvic off": pg.locator("#proc-pelvic.on").count() == 0,
                    "hae off": pg.locator("#proc-hae.on").count() == 0,
                    "note": pg.input_value("#b-ufe") == note, "office": pg.input_value("#o0-practice") == office["practice"],
                    "phone": re.sub(r"\D", "", pg.input_value("#o0-phone")) == office["phone"],
                    "link": "example.com/every-option-test" in pg.input_value("#p-book")}
            lcheck("live: after a refresh, the procedure, removal, note, office, phone and link stayed", all(kept.values()), kept)
            lcheck("live: the page shows partial access, photo locked",
                   "Partial access" in pg.inner_text("#acct-level") and pg.is_visible("#photo-locked") and not pg.is_visible("#photo-pick"))
            r = api(pg, "POST", "/api/account/photo", raw=b"\xff\xd8\xff", ctype="image/jpeg")
            lcheck("live: the server refuses a photo on partial access", r.status == 403, r.status)
            shot(pg, "live-1-partial")
            secs = find_card(pg, "tier-b")
            q = last_search.get("page") or pg
            card = q.locator("section.tier-b li.card", has_text=f"{first} {last}")
            lcheck("live: the card shows in Likely performs within about 90 s of saving", secs is not None, secs)
            lcheck("live: the card has the confirm-this-office line", card.count() and "Details not confirmed by this doctor. Check with the office before you go." in card.first.inner_text())
            R["live"]["likely_seconds"] = secs
            shot(q, "live-2-likely"); done_search()
            pg.goto(base + "/account/"); pg.wait_for_selector("#acct-level", timeout=30000)
            mark(pg); pg.once("dialog", lambda d: d.accept()); pg.click("#proc-ufe .remove"); wait_saved(pg, "UFE removed", 15000)
            secs = find_card(pg, "tier-b", gone=True)
            lcheck("live: after removing UFE the card leaves the UFE list", secs is not None, secs)
            R["live"]["removed_seconds"] = secs; done_search()
            # 4 full access set in the test database; photo upload, see, replace; Confirmed with photo; remove
            step("4 full access and photo")
            lcheck("live: the test account was raised to full in the test database", site.promote() == 1)
            pg.goto(base + "/account/"); pg.wait_for_selector("#acct-level", timeout=30000)
            lcheck("live: the page shows full access", "Full access" in pg.inner_text("#acct-level"), pg.inner_text("#acct-level"))
            add_proc(pg, "ufe")
            mark(pg); pg.set_input_files("#photo", png_file(os.path.join(OUT, "_live-photo-1.png"), 160, 160)); wait_saved(pg, "Photo saved", 30000)
            wait_js(pg, "document.getElementById('photo-now') && document.getElementById('photo-now').naturalWidth > 0", timeout=20000)
            w1 = pg.evaluate("document.getElementById('photo-now').naturalWidth")
            lcheck("live: the photo uploads and its owner sees it", w1 > 0, w1)
            mark(pg); pg.set_input_files("#photo", png_file(os.path.join(OUT, "_live-photo-2.png"), 240, 240)); wait_saved(pg, "Photo saved", 30000)
            wait_js(pg, "document.getElementById('photo-now') && document.getElementById('photo-now').naturalWidth > 0", timeout=20000)
            pg.reload(); pg.wait_for_selector("#acct-level", timeout=30000)
            wait_js(pg, "document.getElementById('photo-now') && document.getElementById('photo-now').naturalWidth > 0", timeout=20000)
            w2 = pg.evaluate("document.getElementById('photo-now').naturalWidth")
            lcheck("live: replacing the photo shows the new one", w2 != w1, [w1, w2])
            shot(pg, "live-3-full")
            secs = find_card(pg, "tier-a", want_photo=True)
            q = last_search.get("page") or pg
            lcheck("live: the card moves to Confirmed with its photo", secs is not None, secs)
            R["live"]["confirmed_seconds"] = secs
            shot(q, "live-4-confirmed")
            src = q.locator("section.tier-a li.card", has_text=f"{first} {last}").locator("img.photo")
            src = src.first.get_attribute("src") if src.count() else ""
            done_search()
            m = re.match(r"^/api/photo/(\d{10})-([0-9a-f]+)\.(jpg|png|webp)$", src or "")
            # 5 the public key reads no table and no photo (checked here, while test rows and a photo exist)
            ok, detail = site.public_key_blocked(pg, f"{m.group(1)}/{m.group(2)}.{m.group(3)}" if m else "none")
            if ok is None:
                R["live"]["public_key"] = detail
            else:
                lcheck("live: the public key reads no table, not the photos bucket, and cannot call the test functions", ok, detail)
            pg.goto(base + "/account/"); pg.wait_for_selector("#photo-remove", timeout=30000)
            pg.once("dialog", lambda d: d.accept()); pg.click("#photo-remove"); wait_status(pg, "Photo removed", 15000)
            # the page says "Photo removed" first, then reloads the profile: on the live site that takes a moment
            try:
                wait_js(pg, "!document.querySelector('img#photo-now')", timeout=15000); off = True
            except TimeoutError:
                off = False
            lcheck("live: remove takes the photo off", off)
            out_ctx = b.new_context(); site.attach(out_ctx); out = out_ctx.new_page()
            r = out.request.get(base + "/api/account/photo", headers=site.headers(), max_redirects=0)
            lcheck("live: a signed-out visitor cannot see the photo", r.status == 401, r.status)
            gone_s = None
            if src:
                t0 = time.monotonic()
                while time.monotonic() - t0 < 95:
                    if out.request.get(base + src, headers=site.headers(), max_redirects=0).status == 404:
                        gone_s = round(time.monotonic() - t0, 1); break
                    out.wait_for_timeout(8000)
            lcheck("live: the removed photo's public address stops working", gone_s is not None, gone_s)
            out_ctx.close()
            # 4b job platform-web-design-0018: one degree change and one goes-by change, each its own save (each sends one
            # alert to the directory alerts channel); the finder card shows "Goes-by Last, Degree"; the profile shows the
            # registry line. The test rows, these included, go at the reset.
            step("4b degree and goes-by")
            pg.goto(base + "/account/"); pg.wait_for_selector("#name-form", timeout=30000)
            names = {}
            try:
                pg.select_option("#n-degree", "MD MPH"); clear(pg); mark(pg); pg.click("#name-save"); wait_saved(pg, "Saved", 15000)
                pg.fill("#n-goes-by", "Test"); clear(pg); mark(pg); pg.click("#name-save"); wait_saved(pg, "Saved", 15000)
                pg.reload(); pg.wait_for_selector("#name-form", timeout=30000)
                names["degree kept"] = pg.input_value("#n-degree") == "MD MPH"
                names["goes-by kept"] = pg.input_value("#n-goes-by") == "Test"
                names["shown"] = f"test {last}, md mph".lower() in pg.inner_text("#name-shown").lower()
                names["last-name line"] = "Your last name is the one the NPI Registry showed when you signed up" in pg.inner_text("#name-last")
            except Exception as e:
                names["error"] = type(e).__name__ + ": " + scrub(e)[:200]
            lcheck("live: one degree change and one goes-by change save and stay after a refresh (the test database has the name columns)",
                   names and all(v is True for v in names.values()), names)
            secs = find_card(pg, "tier-a", who=f"Test {last}, MD MPH")
            q = last_search.get("page") or pg
            lcheck("live: the finder card shows the goes-by name and degree within about 90 s", secs is not None, secs)
            href = ""
            if secs is not None:
                a = q.locator("section.tier-a li.card", has_text=f"Test {last}, MD MPH").locator("h3 a")
                href = a.first.get_attribute("href") if a.count() else ""
                lcheck("live: the card has no registry line", "Listed in the NPI Registry" not in q.locator("section.tier-a li.card", has_text=f"Test {last}").first.inner_text())
            shot(q, "live-5-name"); done_search()
            prof = {}
            if href:
                t0 = time.monotonic()
                while time.monotonic() - t0 < 95:
                    pg.goto(base + href); body = pg.inner_text("main") if pg.locator("main").count() else pg.inner_text("body")
                    prof = {"h1": pg.inner_text("h1"), "registry line": "Listed in the NPI Registry (the national list" in body}
                    if prof["registry line"] and prof["h1"].lower() == f"test {last}, md mph".lower():
                        break
                    pg.wait_for_timeout(8000)
            lcheck("live: the profile shows the goes-by name and degree, and the registry-name line",
                   bool(prof) and prof.get("registry line") is True and prof.get("h1", "").lower() == f"test {last}, md mph".lower(), prof)
            pg.goto(base + "/account/"); pg.wait_for_selector("#acct-level", timeout=30000)
            # 5 sign out, sign in again
            step("5 sign out and in")
            pg.click("#signout"); pg.wait_for_selector("#login-form", timeout=20000)
            pg.fill("#l-email", email_addr); pg.click("#l-send"); pg.wait_for_selector("#c-code", timeout=30000)
            c = site.code(email_addr)
            lcheck("live: a sign-in code arrives", bool(c))
            if c:
                pg.fill("#c-code", c); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#acct-level", timeout=30000)
                lcheck("live: signed in again, still full access", "Full access" in pg.inner_text("#acct-level"))
        except SetupFailed as e:
            if not cfg.get("reset_only"):
                R["live"]["setup_failed"] = scrub(e)
            print("SETUP FAILED", e)
        except Exception as e:                       # a step that could not run counts as a failed check
            lcheck(f"live: step ran without error ({R['live']['steps'][-1] if R['live']['steps'] else 'start'})", False, type(e).__name__ + ": " + scrub(e)[:200])
        finally:
            # 6 reset, rate limit rows included; the database is left without test rows
            step("6 reset and check empty")
            try:
                R["live"]["reset_after"] = site.reset(site.ip(pg))
                left = site.remaining(site.ip(pg))
                R["live"]["remaining"] = left
                lcheck("live: the test database is left with no test rows", left and not any(left.values()), left)
            except Exception as e:
                R["live"]["reset_failed"] = type(e).__name__ + ": " + scrub(e)[:200]
                check("live: reset after the run", False, R["live"]["reset_failed"])
            ctx.close(); b.close()
    R["live"]["fail_shots"] = fails
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    text = json.dumps(R, indent=1)
    for k in ("access_id", "access_secret", "gmail_password", "supabase_key"):      # never write a key, whatever happened
        if cfg.get(k) and cfg[k] in text:
            text = text.replace(cfg[k], "[key removed]")
    open(os.path.join(OUT, "results.json"), "w").write(text)
    print(f"{R['passed']} of {R['total']} checks")
    if R["live"].get("setup_failed") or R["live"].get("reset_failed"):
        return 3
    return 0 if R["passed"] == R["total"] else 1


def invite_run(cfg):
    """Job platform-launch-0009: his invitation on the dev site, at phone size. The runner made the invitation (ai-hq
    scripts/eo_hand_edit.py invite, test project) after resetting his test account, and passes the link here in memory
    only (invite_url); it is scrubbed from every line and file this test writes."""
    import urllib.parse
    SECRET_VALUES[:] = [cfg.get(k) for k in ("access_id", "access_secret", "gmail_password", "supabase_key") if cfg.get(k)]
    site = LocalSite(cfg) if cfg.get("mode") == "local" else LiveSite(cfg)
    base, npi, brk = site.base, cfg["npi"], cfg.get("break", "")
    email_addr = test_email(cfg)
    FIXTURE = "1999000015"                 # a made-up NPI: never a real colleague's
    R["live"] = {"base": base, "mode": cfg.get("mode", "live"), "flow": "invite", "email": email_addr, "steps": []}
    fails, current = [], {"pg": None}

    def lcheck(name, ok, detail=""):
        if brk and brk == name:
            ok = not ok
        check(name, ok, detail)
        if not ok and current["pg"] is not None and len(fails) < 8:
            p = os.path.join(OUT, f"fail-{len(fails) + 1:02d}.png")
            try:
                current["pg"].screenshot(path=p, full_page=True); fails.append({"check": name, "shot": p})
            except Exception:
                fails.append({"check": name, "shot": ""})
        return ok

    def step(x):
        R["live"]["steps"].append(x); print("--", x)

    def listed(pg, want_confirmed=True, timeout=90):
        """Seconds until /api/listings?procedure=ufe carries his NPI as confirmed (or, want_confirmed False, does not)."""
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            r = pg.request.get(base + "/api/listings?procedure=ufe&t=" + str(int(time.time())), headers=site.headers(), max_redirects=0)
            txt = r.text() if r.status == 200 else ""
            found = False
            try:
                stack = [json.loads(txt)]
                while stack:
                    x = stack.pop()
                    if isinstance(x, dict):
                        if x.get("npi") == npi and x.get("confirmed") is True:
                            found = True
                        stack.extend(x.values())
                    elif isinstance(x, list):
                        stack.extend(x)
            except ValueError:
                pass
            if found == want_confirmed:
                return round(time.monotonic() - t0, 1)
            pg.wait_for_timeout(6000)
        return None

    def left(pg):
        pg.reload(); pg.wait_for_selector("#invite-left", timeout=30000)
        m = re.search(r"You have (\d+) of (\d+) left", pg.inner_text("#invite-left"))
        return (int(m.group(1)), int(m.group(2))) if m else None

    link = site.make_invite()
    if link:
        tok = urllib.parse.urlsplit(link).fragment.split("=", 1)[-1]
        SECRET_VALUES.append(tok); SECRET_VALUES.append(link)
    vp = {"width": 390, "height": 844}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport=vp, is_mobile=True, has_touch=True)
        site.attach(ctx)
        pg = ctx.new_page(); watch(pg, "invite"); current["pg"] = pg
        try:
            step("1 access; his test account reset by the runner before the invitation was made")
            ip = site.ip(pg)
            if not link:
                raise SetupFailed("no invitation link was handed to the test")
            before = site.remaining(ip) or {}
            lcheck("invite: before the run his NPI holds no account (only the new invitation row)",
                   not before.get("accounts") and not before.get("profiles") and before.get("invitations") == 1, before)
            step("2 open the invitation at phone size")
            pg.goto(link); pg.wait_for_selector("#invite-form", timeout=30000)
            view = pg.inner_text("#invite-form")
            lcheck("invite: the page shows his name", f"{cfg['first']} {cfg['last']}".lower() in view.lower(), view[:200])
            lcheck("invite: the page shows the full-access wording", "This invitation gives full access" in view, view[:300])
            lcheck("invite: the page asks for an email we send a code to", "Enter an email you'll keep. We send it a 6-digit code." in view)
            shot(pg, "invite-1-page")
            pg.fill("#i-email", email_addr); pg.check("#i-agree"); pg.click("#i-send")
            pg.wait_for_selector("#c-code", timeout=30000)
            shot(pg, "invite-2-code")
            lcheck("invite: no account is made before the code", not (site.remaining(ip) or {}).get("accounts"))
            c = site.code(email_addr)
            if not c:
                raise SetupFailed("no invitation code reached the inbox within 150 s")
            pg.fill("#c-code", c); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#acct-level", timeout=30000)
            step("3 full access and Confirmed")
            lcheck("invite: account level is Full", "Full access" in pg.inner_text("#acct-level"), pg.inner_text("#acct-level"))
            shot(pg, "invite-3-account")
            add_proc(pg, "ufe")
            pg.wait_for_selector("#see-line", timeout=20000)
            lcheck("invite: How patients see you says Confirmed", "Shown under Confirmed by physician for UFE" in pg.inner_text("#see-line"), pg.inner_text("#see-line"))
            secs = listed(pg, True)
            R["live"]["confirmed_seconds"] = secs
            lcheck("invite: within 90 s /api/listings?procedure=ufe carries his NPI as confirmed", secs is not None, secs)
            lr = left(pg)
            lcheck("invite: the invite box shows 5 left", lr == (5, 5), lr)
            shot(pg, "invite-4-confirmed")
            step("4 one colleague link (made-up NPI; never opened, never sent), then its lapse")
            pg.fill("#v-npi", FIXTURE); pg.click("#invite-create button[type=submit]")
            pg.wait_for_timeout(2500)
            page_made = pg.locator("#invite-link").count() > 0
            if cfg.get("mode") != "local":
                lcheck("invite: the account page refuses an NPI the national registry does not know", not page_made and "not an individual's NPI" in msgs(pg), msgs(pg)[:200])
                lcheck("invite: a colleague invitation row is made through the locked count (test project)", site.colleague_row(FIXTURE))
            else:
                lcheck("invite: a colleague link is made from the account page", page_made)
            lr = left(pg)
            lcheck("invite: the box shows 4 left", lr == (4, 5), lr)
            shot(pg, "invite-5-four-left")
            n = site.expire_colleague()
            lr = left(pg)
            lcheck("invite: once expired, the unused link gives its slot back (5 left)", n == 1 and lr == (5, 5), [n, lr])
            step("5 sign out, sign in again with the same email and a code")
            pg.click("#signout"); pg.wait_for_selector("#login-form", timeout=20000)
            pg.fill("#l-email", email_addr); pg.click("#l-send"); pg.wait_for_selector("#c-code", timeout=30000)
            c = site.code(email_addr)
            lcheck("invite: a sign-in code arrives", bool(c))
            if c:
                pg.fill("#c-code", c); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#acct-level", timeout=30000)
                lcheck("invite: lands on his account, still Full", "Full access" in pg.inner_text("#acct-level") and npi in pg.inner_text("main"))
                shot(pg, "invite-6-signed-in-again")
        except SetupFailed as e:
            R["live"]["setup_failed"] = scrub(e)
            print("SETUP FAILED", scrub(e))
        except Exception as e:
            lcheck(f"invite: step ran without error ({R['live']['steps'][-1] if R['live']['steps'] else 'start'})", False, type(e).__name__ + ": " + scrub(e)[:200])
        finally:
            step("6 reset and check empty; the finder no longer shows him as confirmed")
            try:
                R["live"]["reset_after"] = site.reset(site.ip(pg))
                rem = site.remaining(site.ip(pg))
                R["live"]["remaining"] = rem
                lcheck("invite: the test database is left with no test rows (account and invitation rows gone)", rem and not any(rem.values()), rem)
                gone = listed(pg, False, timeout=100)
                lcheck("invite: after the reset /api/listings no longer shows him as confirmed", gone is not None, gone)
            except Exception as e:
                R["live"]["reset_failed"] = type(e).__name__ + ": " + scrub(e)[:200]
                check("invite: reset after the run", False, R["live"]["reset_failed"])
            ctx.close(); b.close()
    R["live"]["fail_shots"] = fails
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    text = scrub(json.dumps(R, indent=1))
    open(os.path.join(OUT, "results.json"), "w").write(text)
    print(f"{R['passed']} of {R['total']} checks")
    if R["live"].get("setup_failed") or R["live"].get("reset_failed"):
        return 3
    return 0 if R["passed"] == R["total"] else 1


# ---------------------------------------------------------------------------------------------------------------------
# Job platform-launch-0010 (his "1. Yes", HQ chat 2026-11-17 15:12 CT): the owner box, live on the dev site (test
# project) or on a local server, at phone size. The runner (ai-hq scripts/every_option_live_test.py run --owner) resets
# his test account, makes his invitation with the hand-edit tool and passes the link in memory only (invite_url), plus
# the hand-edit command (hand_edit: argv list) this test uses to make his account the owner and to try a second owner.
# Two made-up NPIs (lib/accounts/preview-fixtures.mjs on the dev site, the fixture registry locally); links and tokens
# are scrubbed from every line and file, and blurred in every screenshot.
FIX_A, FIX_B = "1999000015", "1999000023"


def owner_run(cfg):
    import urllib.parse, subprocess
    SECRET_VALUES[:] = [cfg.get(k) for k in ("access_id", "access_secret", "gmail_password", "supabase_key") if cfg.get(k)]
    local = cfg.get("mode") == "local"
    site = LocalSite(cfg) if local else LiveSite(cfg)
    base, npi, brk = site.base, cfg["npi"], cfg.get("break", "")
    email_addr = test_email(cfg)
    tag = cfg["email_tag"]
    email_a = cfg["email_user"].replace("@", f"+eo21-{tag}a@")
    email_b = cfg["email_user"].replace("@", f"+eo21-{tag}b@")
    names = {FIX_A: "Testone", FIX_B: "Sampletwo"} if local else {FIX_A: "Alpha", FIX_B: "Bravo"}
    R["live"] = {"base": base, "mode": cfg.get("mode", "live"), "flow": "owner", "email": email_addr, "steps": []}
    fails, current = [], {"pg": None}
    BLUR = "#o-link, #invite-link { filter: blur(7px) !important; }"

    def lcheck(name, ok, detail=""):
        if brk and brk == name:
            ok = not ok
        check(name, ok, detail)
        if not ok and current["pg"] is not None and len(fails) < 8:
            p = os.path.join(OUT, f"fail-{len(fails) + 1:02d}.png")
            try:
                current["pg"].add_style_tag(content=BLUR)
                current["pg"].screenshot(path=p, full_page=True); fails.append({"check": name, "shot": p})
            except Exception:
                fails.append({"check": name, "shot": ""})
        return ok

    def step(x):
        R["live"]["steps"].append(x); print("--", x)

    def oshot(pg, name):
        pg.add_style_tag(content=BLUR); shot(pg, name)

    def call(pg, method, path, body=None):
        return pg.evaluate("""([m, p, b]) => fetch('/api/account/' + p, { method: m, credentials: 'same-origin',
            headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined })
            .then(r => r.text().then(t => ({ status: r.status, text: t })))""", [method, path, body])

    def hand(*args):
        """The hand-edit tool on the test project (live), or the dev server's stand-in (local)."""
        if local:
            r = site._get(f"/__test/owner?npi={args[-1]}")
            return 0 if r.get("owner") else 2
        p = subprocess.run(list(cfg["hand_edit"]) + list(args), capture_output=True, text=True, timeout=180)
        R["live"].setdefault("hand_edit", []).append({"args": list(args), "exit": p.returncode,
                                                       "tail": scrub((p.stderr or p.stdout or "").strip()[-200:])})
        return p.returncode

    def sign_in_code(pg, addr, code):
        pg.fill("#c-code", code); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#acct-level", timeout=30000)

    def accept(pg, link, addr, label):
        pg.goto(link); pg.wait_for_selector("#invite-form", timeout=30000)
        if pg.get_attribute("#i-email", "readonly") is None:
            pg.fill("#i-email", addr)
        pg.check("#i-agree"); pg.click("#i-send"); pg.wait_for_selector("#c-code", timeout=30000)
        c = site.code(addr)
        if not c:
            raise SetupFailed(f"no code reached the inbox for {label} within 150 s")
        sign_in_code(pg, addr, c)

    link = site.make_invite()
    if link:
        SECRET_VALUES.append(urllib.parse.urlsplit(link).fragment.split("=", 1)[-1]); SECRET_VALUES.append(link)
    vp = {"width": 390, "height": 844}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport=vp, is_mobile=True, has_touch=True)
        site.attach(ctx)
        try:
            ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=base)
        except Exception:
            pass
        pg = ctx.new_page(); watch(pg, "owner"); current["pg"] = pg
        others = []
        try:
            step("1 his test account from his invitation (reset by the runner first)")
            ip = site.ip(pg)
            if not link:
                raise SetupFailed("no invitation link was handed to the test")
            accept(pg, link, email_addr, "his invitation")
            lcheck("owner: his account is Full", "Full access" in pg.inner_text("#acct-level"))
            step("2 before the owner role: no owner box, and the owner routes refuse")
            lcheck("owner: no owner box before the role is set", pg.locator("#owner").count() == 0)
            r = call(pg, "GET", "owner/invites")
            lcheck("owner: the owner list refuses a non-owner (403)", r["status"] == 403 and "owner_only" in r["text"], r)
            r = call(pg, "POST", "owner/invite", {"npi": FIX_A, "kind": "full"})
            lcheck("owner: making an owner link refuses a non-owner (403)", r["status"] == 403, r)
            step("3 the hand-edit tool makes his test account the owner (test project)")
            lcheck("owner: hand-edit `owner` on his NPI succeeds", hand("--yes", "owner", npi) in (0, 3))
            pg.reload(); pg.wait_for_selector("#owner", timeout=30000)
            lcheck("owner: the owner box shows once the role is set", pg.is_visible("#owner-form"))
            step("4 a full-access link for a made-up NPI: name first, then the link once, with Copy and Share")
            pg.fill("#o-npi", FIX_A); pg.click("#o-check"); pg.wait_for_selector("#o-name", timeout=30000)
            lcheck("owner: the registry name shows before he confirms", names[FIX_A].lower() in pg.inner_text("#o-name").lower(), pg.inner_text("#o-name"))
            lcheck("owner: full access is the default", pg.is_checked("#o-full") and not pg.is_visible("#o-email"))
            oshot(pg, "owner-1-looked-up")
            pg.click("#o-go"); pg.wait_for_selector("#o-link", timeout=30000)
            link_a = pg.input_value("#o-link")
            SECRET_VALUES.append(link_a); SECRET_VALUES.append(link_a.split("#invite=")[-1])
            lcheck("owner: the link is a dev-site invitation link", bool(re.fullmatch(re.escape(base) + r"/account/#invite=[0-9a-f]{64}", link_a)))
            lcheck("owner: the link says when it expires and that it works once", "Works once, for this NPI only." in pg.inner_text("#o-expires")
                   and pg.inner_text("#o-expires").startswith("Expires "))
            pg.click("#o-copy"); pg.wait_for_timeout(500)
            got = pg.evaluate("() => navigator.clipboard.readText().catch(() => '')")
            lcheck("owner: Copy puts the link on the clipboard", got == link_a)
            pg.evaluate("() => navigator.clipboard.writeText('x')")
            has_share = pg.evaluate("() => !!navigator.share")
            if not has_share:
                pg.click("#o-share"); pg.wait_for_timeout(500)
                got = pg.evaluate("() => navigator.clipboard.readText().catch(() => '')")
                lcheck("owner: Share without a share sheet falls back to Copy", got == link_a)
            else:
                lcheck("owner: Share button present", pg.is_visible("#o-share"))
            oshot(pg, "owner-2-link-made")
            step("5 a partial-access link to a published email for the second made-up NPI")
            pg.fill("#o-npi", FIX_B); pg.click("#o-check"); pg.wait_for_selector("#o-name", timeout=30000)
            pg.check("#o-part")
            lcheck("owner: partial shows the email field and turns off the trainee tick", pg.is_visible("#o-email") and pg.is_disabled("#o-trainee"))
            pg.fill("#o-email", email_b); pg.click("#o-go"); pg.wait_for_selector("#o-link", timeout=30000)
            link_b = pg.input_value("#o-link")
            SECRET_VALUES.append(link_b); SECRET_VALUES.append(link_b.split("#invite=")[-1])
            lcheck("owner: a second, different link", link_b != link_a and "#invite=" in link_b)
            # Review round 1: withdrawing the link still on screen takes it off the screen.
            pg.wait_for_selector("#o-list li[data-status=live]", timeout=20000)
            wait_js(pg, "() => document.querySelectorAll('#o-list li[data-status=live]').length >= 2", timeout=20000)
            bid = pg.get_attribute(f"#o-list li[data-status=live]:has-text('{names[FIX_B]}')", "id").replace("o-inv-", "")
            pg.click(f"#o-wd-{bid}"); pg.wait_for_selector(f"#o-inv-{bid}[data-status=withdrawn]", timeout=20000)
            lcheck("owner: withdrawing the link just made takes it off the screen", pg.locator("#o-link").count() == 0)
            pg.wait_for_selector("#o-list li[data-status=live]", timeout=20000)
            lt = pg.inner_text("#o-list")
            lcheck("owner: the list shows both, with name, kind, made and expires", names[FIX_A] in lt and names[FIX_B] in lt and "Full access" in lt
                   and "Partial access, to " + email_b in lt and "Made " in lt and "expires " in lt, lt[:300])
            step("6 the link is not shown again: not after a reload, not in the page source or any answer")
            pg.reload(); pg.wait_for_selector("#o-list li", timeout=30000)
            wait_js(pg, "() => document.querySelectorAll('#o-list li[data-status]').length >= 2", timeout=20000)
            src = pg.content() + call(pg, "GET", "me")["text"] + call(pg, "GET", "owner/invites")["text"] + call(pg, "GET", "edits")["text"]
            toks = [link_a.split("#invite=")[-1], link_b.split("#invite=")[-1]]
            lcheck("owner: after a reload no link is on the page or in any answer", pg.locator("#o-link").count() == 0
                   and not any(t in src for t in toks) and not re.search(r"#invite=[0-9a-f]{64}", src))
            oshot(pg, "owner-3-list")
            step("7 the withdrawn partial link fails with the usual page")
            lcheck("owner: the list says Withdrawn", "Withdrawn" in pg.inner_text(f"#o-inv-{bid}"))
            c2 = b.new_context(viewport=vp, is_mobile=True, has_touch=True); site.attach(c2); others.append(c2)
            p2 = c2.new_page(); watch(p2, "owner-withdrawn")
            p2.goto(link_b); p2.wait_for_timeout(2500)
            wait_js(p2, "() => (document.getElementById('acct-status') || {}).textContent.length > 0", timeout=20000)
            lcheck("owner: the withdrawn link shows the no-longer-works message", "was withdrawn" in msgs(p2) and p2.locator("#invite-form").count() == 0, msgs(p2)[:200])
            shot(p2, "owner-4-withdrawn-link")
            step("8 the full link in a fresh browser: a test address and its code; that account is Full")
            c3 = b.new_context(viewport=vp, is_mobile=True, has_touch=True); site.attach(c3); others.append(c3)
            p3 = c3.new_page(); watch(p3, "owner-fixture"); current["pg"] = p3
            accept(p3, link_a, email_a, "the made-up doctor")
            lcheck("owner: the made-up doctor's account is Full", "Full access" in p3.inner_text("#acct-level"), p3.inner_text("#acct-level"))
            lcheck("owner: it has no owner box", p3.locator("#owner").count() == 0)
            r = call(p3, "POST", "owner/invite", {"npi": FIX_B, "kind": "full", "trainee": True})
            lcheck("owner: its owner routes refuse it, trainee tick included (403)", r["status"] == 403 and call(p3, "GET", "owner/invites")["status"] == 403, r)
            step("9 a second owner is refused: by the tool and by the database")
            lcheck("owner: hand-edit `owner` on a second account is refused", hand("--yes", "owner", FIX_A) == 2)
            if not local:
                try:
                    site._rest("PATCH", f"accounts?npi=eq.{FIX_A}", {"is_owner": True}); idx = "accepted"
                except SetupFailed as e:
                    idx = str(e)
                lcheck("owner: the database index refuses a second owner (HTTP 409)", "HTTP 409" in idx, idx[:200])
            step("10 a doctor withdraws their own link and gets its place back")
            p3.reload(); p3.wait_for_selector("#invite-left", timeout=30000)
            p3.fill("#v-npi", FIX_B); p3.click("#invite-create button[type=submit]"); p3.wait_for_selector("#invite-link", timeout=30000)
            SECRET_VALUES.append(p3.input_value("#invite-link")); SECRET_VALUES.append(p3.input_value("#invite-link").split("#invite=")[-1])
            lcheck("owner: the doctor box offers Copy and Share too", p3.is_visible("#invite-copy") and p3.is_visible("#invite-share"))
            p3.reload(); p3.wait_for_selector("#invite-list li[data-status=live]", timeout=30000)
            before = p3.inner_text("#invite-left")
            p3.click("#invite-list li[data-status=live] button"); wait_status(p3, "its place is free again", timeout=20000)
            lcheck("owner: a doctor's withdraw frees the slot (4 left, then 5)", "4 of 5 left" in before and "5 of 5 left" in p3.inner_text("#invite-left"),
                   [before[-60:], p3.inner_text("#invite-left")[-60:]])
            current["pg"] = pg
            step("11 his list shows the full link as used, by whom and when")
            pg.reload(); pg.wait_for_selector("#o-list li[data-status=used]", timeout=30000)
            lcheck("owner: the list says Used by the made-up doctor", email_a in pg.inner_text("#o-list li[data-status=used]"))
        except SetupFailed as e:
            R["live"]["setup_failed"] = scrub(e)
            print("SETUP FAILED", scrub(e))
        except Exception as e:
            lcheck(f"owner: step ran without error ({R['live']['steps'][-1] if R['live']['steps'] else 'start'})", False, type(e).__name__ + ": " + scrub(e)[:200])
        finally:
            step("12 reset and check empty")
            try:
                R["live"]["reset_after"] = site.reset(site.ip(pg))
                rem = site.remaining(site.ip(pg))
                R["live"]["remaining"] = rem
                lcheck("owner: the test database is left with no test rows", rem and not any(rem.values()), rem)
            except Exception as e:
                R["live"]["reset_failed"] = type(e).__name__ + ": " + scrub(e)[:200]
                check("owner: reset after the run", False, R["live"]["reset_failed"])
            for c in others:
                c.close()
            ctx.close(); b.close()
    R["live"]["fail_shots"] = fails
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    text = scrub(json.dumps(R, indent=1))
    open(os.path.join(OUT, "results.json"), "w").write(text)
    print(f"{R['passed']} of {R['total']} checks")
    if R["live"].get("setup_failed") or R["live"].get("reset_failed"):
        return 3
    return 0 if R["passed"] == R["total"] else 1


def hide_run(cfg):
    """Job platform-launch-0011: hide my profile, live on the dev site (test project, his NPI, phone 390x844) or local."""
    import subprocess
    SECRET_VALUES[:] = [cfg.get(k) for k in ("access_id", "access_secret", "gmail_password", "supabase_key") if cfg.get(k)]
    local = cfg.get("mode") == "local"
    site = LocalSite(cfg) if local else LiveSite(cfg)
    base, npi, brk = site.base, cfg["npi"], cfg.get("break", "")
    email_addr = test_email(cfg)
    limit_s = int(cfg.get("hide_wait", 90))
    R["live"] = {"base": base, "mode": cfg.get("mode", "live"), "flow": "hide", "email": email_addr, "steps": [], "seconds": {}}
    fails, current = [], {"pg": None}

    def lcheck(name, ok, detail=""):
        if brk and brk == name:
            ok = not ok
        check(name, ok, detail)
        if not ok and current["pg"] is not None and len(fails) < 8:
            p = os.path.join(OUT, f"fail-{len(fails) + 1:02d}.png")
            try:
                current["pg"].screenshot(path=p, full_page=True); fails.append({"check": name, "shot": p})
            except Exception:
                fails.append({"check": name, "shot": ""})
        return ok

    def step(x):
        R["live"]["steps"].append(x); print("--", x)

    def call(pg, method, path, body=None):
        return pg.evaluate("""([m, p, b]) => fetch('/api/account/' + p, { method: m, credentials: 'same-origin',
            headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined })
            .then(r => r.text().then(t => ({ status: r.status, text: t })))""", [method, path, body])

    def get(pg, path):
        return pg.evaluate("""(p) => fetch(p, { credentials: 'same-origin', cache: 'no-store' })
            .then(r => r.text().then(t => ({ status: r.status, text: t, robots: r.headers.get('X-Robots-Tag') || '' })))""", path)

    def listing(pg):
        r = get(pg, "/api/listings?procedure=ufe")
        try:
            return json.loads(r["text"])
        except ValueError:
            return {"people": [], "removed": [], "hidden": [], "status": r["status"]}

    def until(pg, label, test):
        t0 = time.time()
        while True:
            ok, last = test()
            if ok or time.time() - t0 > limit_s:
                R["live"]["seconds"][label] = round(time.time() - t0, 1)
                return ok, last
            pg.wait_for_timeout(5000)

    def hand(*args):
        if local:
            r = site._get(f"/__test/{args[-2]}?npi={args[-1]}")
            return 0 if "hidden" in r else 2
        p = subprocess.run(list(cfg["hand_edit"]) + list(args), capture_output=True, text=True, timeout=180)
        R["live"].setdefault("hand_edit", []).append({"args": list(args), "exit": p.returncode,
                                                       "tail": scrub((p.stderr or p.stdout or "").strip()[-200:])})
        return p.returncode

    link = site.make_invite()
    if link:
        SECRET_VALUES.append(link.split("#invite=")[-1]); SECRET_VALUES.append(link)
    vp = {"width": 390, "height": 844}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport=vp, is_mobile=True, has_touch=True)
        site.attach(ctx)
        pg = ctx.new_page(); watch(pg, "hide"); current["pg"] = pg
        try:
            step("1 his test account at Full from his invitation, with UFE and one office (reset by the runner first)")
            ip = site.ip(pg)
            if not link:
                raise SetupFailed("no invitation link was handed to the test")
            pg.goto(link); pg.wait_for_selector("#invite-form", timeout=30000)
            if pg.get_attribute("#i-email", "readonly") is None:
                pg.fill("#i-email", email_addr)
            pg.check("#i-agree"); pg.click("#i-send"); pg.wait_for_selector("#c-code", timeout=30000)
            c = site.code(email_addr)
            if not c:
                raise SetupFailed("no code reached the inbox within 150 s")
            pg.fill("#c-code", c); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#acct-level", timeout=30000)
            lcheck("hide: his account is Full", "Full access" in pg.inner_text("#acct-level"))
            add_proc(pg, "ufe")
            r = call(pg, "PUT", "profile", {"offices": [{"practice": "Every Option Test Office", "street": "100 Test Plaza", "city": "Chicago",
                                                          "state": "IL", "zip": "60611", "phone": ""}]})
            lcheck("hide: test office saved", r["status"] == 200, r)
            ok, last = until(pg, "listed_before", lambda: (lambda o: (any(x["npi"] == npi and x.get("confirmed") for x in o.get("people", [])), o))(listing(pg)))
            lcheck(f"hide: before hiding, /api/listings?procedure=ufe has him as Confirmed within {limit_s} s", ok, str(last)[:200])
            path = next((x.get("path") for x in last.get("people", []) if x["npi"] == npi), "") or f"/doctors/{npi}/"
            R["live"]["profile_path_seen"] = bool(path)
            step("2 the Hide my profile box: Update my offices beside it; the confirm step names search engines and AI answers")
            pg.reload(); pg.wait_for_selector("#hide-go", timeout=30000)
            lcheck("hide: the box shows for full access, with Update my offices", pg.is_visible("#hide-go") and pg.is_visible("#hide-offices"))
            pg.click("#hide-offices"); pg.wait_for_timeout(800)
            lcheck("hide: Update my offices goes to the offices section", pg.evaluate("() => { const r = document.getElementById('offices-panel').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }"))
            pg.locator("#hide-panel").scroll_into_view_if_needed(); pg.click("#hide-go"); pg.wait_for_selector("#hide-yes", state="visible", timeout=10000)
            lcheck("hide: the confirm step says search engines and AI answers may keep an old copy",
                   "Search engines and AI answers may keep an old copy" in pg.inner_text("#hide-confirm"))
            pg.locator("#hide-panel").screenshot(path=os.path.join(OUT, "hide-1-confirm.png"))
            pg.click("#hide-yes"); pg.wait_for_selector("#hide-show", timeout=30000)
            lcheck("hide: the page says hidden and offers Show my profile", "Your profile is hidden" in pg.inner_text("#hide-state") and pg.is_visible("#hide-show"))
            pg.locator("#hide-panel").screenshot(path=os.path.join(OUT, "hide-2-hidden.png"))
            step(f"3 within {limit_s} s: off /api/listings, and the profile address shows the not-listed page with noindex")
            ok, last = until(pg, "off_listings", lambda: (lambda o: (not any(x["npi"] == npi for x in o.get("people", [])) and npi in o.get("hidden", []), o))(listing(pg)))
            lcheck(f"hide: /api/listings?procedure=ufe lacks him within {limit_s} s", ok, str(last)[:200])
            ok, prof = until(pg, "profile_not_listed", lambda: (lambda r: ("This doctor is not listed right now." in r["text"], r))(get(pg, path)))
            lcheck(f"hide: his profile address shows the not-listed page within {limit_s} s", ok, str(prof)[:200])
            lcheck("hide: the not-listed page has noindex and nothing of his", '<meta name="robots" content="noindex">' in prof["text"]
                   and "Test Office" not in prof["text"] and "Goswami" not in prof["text"].replace("goswami-hq", "") and "ld+json" not in prof["text"], prof["text"][:200])
            step(f"4 Show my profile: back as Confirmed within {limit_s} s")
            pg.click("#hide-show"); pg.wait_for_selector("#hide-go", timeout=30000)
            ok, last = until(pg, "back_listings", lambda: (lambda o: (any(x["npi"] == npi and x.get("confirmed") for x in o.get("people", [])), o))(listing(pg)))
            lcheck(f"hide: back on /api/listings as Confirmed within {limit_s} s", ok, str(last)[:200])
            ok, prof = until(pg, "profile_back", lambda: (lambda r: ("Confirmed by physician" in r["text"], r))(get(pg, path)))
            lcheck(f"hide: his profile shows Confirmed again within {limit_s} s", ok, str(prof)[:120])
            step("5 hand-edit hide on the test project: hidden by Every Option, no Show button, the show route refuses")
            lcheck("hide: hand-edit `hide` on his NPI succeeds", hand("--yes", "hide", npi) in (0, 3))
            pg.reload(); pg.wait_for_selector("#hide-state", timeout=30000)
            lcheck("hide: the page says Hidden by Every Option, with the report form link", "Hidden by Every Option. Write to us to change this." in pg.inner_text("#hide-state")
                   and pg.locator("#hide-write").count() == 1)
            lcheck("hide: no Show my profile button", pg.locator("#hide-show").count() == 0 and pg.locator("#hide-reconfirm").count() == 0)
            r = call(pg, "POST", "show", {})
            lcheck("hide: the doctor's show is refused (403 hidden_by_us)", r["status"] == 403 and "hidden_by_us" in r["text"], r)
            pg.locator("#hide-panel").screenshot(path=os.path.join(OUT, "hide-3-by-every-option.png"))
            step("6 hand-edit unhide (show) on the test project")
            lcheck("hide: hand-edit `unhide` on his NPI succeeds", hand("--yes", "unhide", npi) in (0, 3))
            pg.reload(); pg.wait_for_selector("#hide-go", timeout=30000)
            lcheck("hide: the box is back to Hide my profile", pg.is_visible("#hide-go"))
            ok, last = until(pg, "back_after_hand", lambda: (lambda o: (any(x["npi"] == npi and x.get("confirmed") for x in o.get("people", [])), o))(listing(pg)))
            lcheck(f"hide: back on /api/listings after his unhide within {limit_s} s", ok, str(last)[:200])
        except SetupFailed as e:
            R["live"]["setup_failed"] = scrub(e)
            print("SETUP FAILED", scrub(e))
        except Exception as e:
            lcheck(f"hide: step ran without error ({R['live']['steps'][-1] if R['live']['steps'] else 'start'})", False, type(e).__name__ + ": " + scrub(e)[:200])
        finally:
            step("7 reset and check empty")
            try:
                R["live"]["reset_after"] = site.reset(site.ip(pg))
                rem = site.remaining(site.ip(pg))
                R["live"]["remaining"] = rem
                lcheck("hide: the test database is left with no test rows", rem and not any(rem.values()), rem)
            except Exception as e:
                R["live"]["reset_failed"] = type(e).__name__ + ": " + scrub(e)[:200]
                check("hide: reset after the run", False, R["live"]["reset_failed"])
            ctx.close(); b.close()
    R["live"]["fail_shots"] = fails
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    text = scrub(json.dumps(R, indent=1))
    open(os.path.join(OUT, "results.json"), "w").write(text)
    print(f"{R['passed']} of {R['total']} checks")
    if R["live"].get("setup_failed") or R["live"].get("reset_failed"):
        return 3
    return 0 if R["passed"] == R["total"] else 1


def live_main():
    global OUT
    OUT = sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    cfg = json.loads(sys.stdin.read())
    if cfg.get("flow") == "owner" and not cfg.get("reset_only"):
        return owner_run(cfg)
    if cfg.get("flow") == "hide" and not cfg.get("reset_only"):
        return hide_run(cfg)
    return invite_run(cfg) if cfg.get("flow") == "invite" and not cfg.get("reset_only") else live_run(cfg)


def main():
    if OUT == "--live":
        return live_main()
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        # Job 31: each window is its own made-up connection (dev-server X-Test-IP), under the 3-an-hour sign-up limit.
        _nc, _n = b.new_context, [0]
        def _ctx(**kw):
            _n[0] += 1
            kw["extra_http_headers"] = {**kw.get("extra_http_headers", {}), "X-Test-IP": f"203.0.113.{_n[0] % 250 + 1}"}
            return _nc(**kw)
        b.new_context = _ctx
        closed_site(b)
        for label, (base, vp) in RUNS.items():
            flows(b, label, base, vp)
        b.close()
    R["passed"] = sum(c["ok"] for c in R["checks"]); R["total"] = len(R["checks"])
    json.dump(R, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    print(f"{R['passed']} of {R['total']} checks; paths {R['paths']}; console lines {len(R['console_errors'])}")
    return 0 if R["passed"] == R["total"] else 1


if __name__ == "__main__":
    sys.exit(main())
