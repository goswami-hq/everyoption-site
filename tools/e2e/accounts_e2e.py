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


def wait_status(pg, text, timeout=5000):
    wait_js(pg, "t => document.getElementById('acct-status').textContent.includes(t)", arg=text, timeout=timeout)


def clear(pg):
    pg.evaluate("document.getElementById('acct-status').textContent = ''")


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
    check(f"{label}: sign-up success does not claim confirmed by physician", "confirmed by physician" not in pg.inner_text("#acct-status").lower(), pg.inner_text("#acct-status"))
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
    pg.check("#i-agree"); pg.click("#invite-form button[type=submit]"); pg.wait_for_selector("#photo-pick")
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
    check(f"{label}: a HEIC this browser cannot open gets a plain message", "JPEG" in pg.inner_text("#acct-status"))
    pg.set_input_files("#photo", f["junk"]); wait_status(pg, "could not read", 10000)
    check(f"{label}: a file that is not a photo gets a plain message", "JPEG or PNG" in pg.inner_text("#acct-status"))
    shot(pg, f"{label}-6-photo")
    pg.once("dialog", lambda d: d.accept())
    pg.click("#photo-remove"); wait_status(pg, "Photo removed")
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
    pg.check("#insurance-form input[value=Aetna]"); clear(pg); pg.click("#insurance-form button[type=submit]"); wait_status(pg, "Saved")
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
    check(f"{label}: job 16: an address not found is saved and the doctor is told plainly", "center of that office's ZIP code" in pg.inner_text("#acct-status"))
    pg.click("#add-office"); pg.fill("#o2-practice", "No Street IR"); pg.fill("#o2-city", "Evanston"); pg.select_option("#o2-state", "IL"); pg.fill("#o2-zip", "60201")
    clear(pg); pg.click("#office-form button[type=submit]"); wait_status(pg, "needs a street address")
    check(f"{label}: job 16: a new office without a street is refused in plain words", "street address" in pg.inner_text("#acct-status"))
    shot(pg, f"{label}-2-full")
    # 3 invite a colleague (Gil)
    pg.fill("#v-npi", GIL); clear(pg); pg.click("#invite-create button[type=submit]"); wait_status(pg, "Invitation link made")
    link = pg.input_value("#invite-link")
    check(f"{label}: invitation link made from the account page, 4 left", "#invite=" in link and "4 left" in pg.inner_text("#acct-status"))
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
    pg.check("#i-agree"); steps += 1
    pg.click("#invite-form button[type=submit]"); steps += 1
    pg.wait_for_selector("#acct-level")
    R["paths"][f"{label}-invitation"] = {"steps": steps, "seconds": round(time.monotonic() - t0, 2)}
    check(f"{label}: invitation opens to the doctor's listing with one agreement", "Gil Fourtest" in view and "On Every Option for UFE" in view and "I am Gil Fourtest" in view, view)
    check(f"{label}: invitation gives full access with no email asked", "Full access" in pg.inner_text("#acct-level") and acct(pg, base, npi=GIL)["email"] is None)
    check(f"{label}: no login email: that section is marked", "need" in (pg.get_attribute("#email-panel", "class") or ""))
    fits(pg, f"{label} invitation dashboard")
    shot(pg, f"{label}-3-invited")
    # add a login email later
    pg.fill("#e-email", "gil@home.example"); clear(pg); pg.click("#email-form button[type=submit]"); pg.wait_for_selector("#c-code")
    pg.fill("#c-code", "000000" if code_for(pg, base, "gil@home.example") != "000000" else "000001"); clear(pg); pg.click("#code-form button[type=submit]")
    wait_status(pg, "wrong")
    check(f"{label}: a wrong code is refused plainly", "wrong, expired, or already used" in pg.inner_text("#acct-status"))
    pg.fill("#c-code", code_for(pg, base, "gil@home.example")); clear(pg); pg.click("#code-form button[type=submit]"); wait_status(pg, "Login email saved")
    check(f"{label}: login email added by code", acct(pg, base, npi=GIL)["email"] == "gil@home.example")
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
    check(f"{label}: second claimant told plainly", "already has an account" in pg.inner_text("#acct-status"))
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
    check(f"{label}: a shared email is told plainly", "Sign in with it, or use a different email" in pg.inner_text("#acct-status"))
    pg.goto(f"{base}/account/?npi={DAN}"); pg.wait_for_selector("#s-who")
    pg.check("#s-ir-no"); pg.fill("#s-other", "Orthopaedic surgery"); pg.fill("#s-email", "dan@ortho.example"); pg.check("#s-agree"); clear(pg); pg.click("#s-send")
    pg.wait_for_selector("#waitlist")
    check(f"{label}: a non-IR goes on the waitlist", any(w["npi"] == DAN for w in store(pg, base).get("waitlist", [])))
    shot(pg, f"{label}-5-waitlist")
    ctx.close()
    photos(b, label, base, vp)


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
        def add(route):
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

    def find_card(pg, tier, want_photo=False, timeout=95, gone=False):
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
            cards = q.locator("#results li.card", has_text=f"{first} {last}")
            inside = q.locator(f"section.{tier} li.card", has_text=f"{first} {last}")
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
                pg.click(f".add[data-proc={proc}]"); pg.click(f"#attest-{proc}"); pg.wait_for_selector(f"#proc-{proc}.on")
            pg.once("dialog", lambda d: d.accept()); pg.click("#proc-pae .remove"); wait_status(pg, "PAE removed", 15000)
            pg.click("#proc-ufe .proc-note summary"); pg.fill("#b-ufe", note); clear(pg)
            pg.click("#proc-ufe .proc-note button"); wait_status(pg, "Note saved", 15000)
            pg.fill("#o0-practice", office["practice"]); pg.fill("#o0-street", office["street"]); pg.fill("#o0-city", office["city"])
            pg.select_option("#o0-state", office["state"]); pg.fill("#o0-zip", office["zip"]); pg.fill("#o0-phone", office["phone"])
            pg.fill("#p-book", "https://example.com/every-option-test")
            clear(pg); pg.click("#office-form button[type=submit]"); wait_status(pg, "Saved", 20000)
            pg.reload(); pg.wait_for_selector("#acct-level", timeout=30000)
            kept = {"ufe on": pg.locator("#proc-ufe.on").count() == 1, "pae off": pg.locator("#proc-pae.on").count() == 0,
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
            pg.once("dialog", lambda d: d.accept()); pg.click("#proc-ufe .remove"); wait_status(pg, "UFE removed", 15000)
            secs = find_card(pg, "tier-b", gone=True)
            lcheck("live: after removing UFE the card leaves the UFE list", secs is not None, secs)
            R["live"]["removed_seconds"] = secs; done_search()
            # 4 full access set in the test database; photo upload, see, replace; Confirmed with photo; remove
            step("4 full access and photo")
            lcheck("live: the test account was raised to full in the test database", site.promote() == 1)
            pg.goto(base + "/account/"); pg.wait_for_selector("#acct-level", timeout=30000)
            lcheck("live: the page shows full access", "Full access" in pg.inner_text("#acct-level"), pg.inner_text("#acct-level"))
            pg.click(".add[data-proc=ufe]"); pg.click("#attest-ufe"); pg.wait_for_selector("#proc-ufe.on")
            pg.set_input_files("#photo", png_file(os.path.join(OUT, "_live-photo-1.png"), 160, 160)); wait_status(pg, "Photo saved", 30000)
            wait_js(pg, "document.getElementById('photo-now') && document.getElementById('photo-now').naturalWidth > 0", timeout=20000)
            w1 = pg.evaluate("document.getElementById('photo-now').naturalWidth")
            lcheck("live: the photo uploads and its owner sees it", w1 > 0, w1)
            pg.set_input_files("#photo", png_file(os.path.join(OUT, "_live-photo-2.png"), 240, 240)); wait_status(pg, "Photo saved", 30000)
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


def live_main():
    global OUT
    OUT = sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    return live_run(json.loads(sys.stdin.read()))


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
