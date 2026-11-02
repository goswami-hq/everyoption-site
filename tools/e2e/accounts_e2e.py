#!/usr/bin/env python3
"""Job 11 browser walk-through of physician accounts, against local servers only (made-up people, local stand-ins).

  node tools/dev-server.mjs 8791 &                          # accounts not open (as on the dev site)
  node tools/dev-server.mjs 8792 --accounts --doximity &    # desktop run
  node tools/dev-server.mjs 8793 --accounts --doximity &    # phone run (fresh people)
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/accounts_e2e.py OUT_DIR
Flows: not open; Is this you? from a card; basic path (sign-up, code on the page, attest) with steps and time; levels
(contact fields locked on basic); ID check to full; photo; invite a colleague; invitation path with steps and time; add
a login email; revoke a bad inviter; takeover by ID; published-email invitation; Doximity proof; shared email; waitlist;
undo. Writes results.json and PNGs to OUT_DIR. A step is one thing the doctor does: a click, a tick, or one field typed.
"""
import json, os, re, struct, sys, time, zlib
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
CLOSED = "http://localhost:8791"
RUNS = {"desktop": ("http://localhost:8792", {"width": 1280, "height": 900}),
        "phone": ("http://localhost:8793", {"width": 390, "height": 844})}
R = {"checks": [], "console_errors": [], "paths": {}}
ANN, BEN, CARA, DAN, GIL = "1999000015", "1999000023", "1999000031", "1999000049", "1999000072"


def check(name, ok, detail=""):
    R["checks"].append({"check": name, "ok": bool(ok), "detail": str(detail)[:300]})
    print(("OK  " if ok else "FAIL") + " " + name + (f" ({detail})" if detail and not ok else ""))


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


def wait_status(pg, text, timeout=5000):
    pg.wait_for_function("t => document.getElementById('acct-status').textContent.includes(t)", arg=text, timeout=timeout)


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
    pg.wait_for_function("!document.querySelector('#results').hasAttribute('aria-busy')"); pg.wait_for_timeout(200)
    check("closed: UFE finder still finds doctors", pg.locator("li.card").count() > 0)
    check("closed: finder makes no account request", not [u for u in reqs if "/api/" in u], reqs)
    href = pg.locator("li.card p.claim a", has_text="Is this you?").first.get_attribute("href")
    check("closed: a card's Is this you? opens the account page with the NPI", re.match(r"^/account/\?npi=\d{10}&procedure=ufe&name=", href or ""), href)
    reqs.clear()
    pg.goto(CLOSED + href); pg.wait_for_timeout(300)
    check("closed: account page says not open yet", pg.is_visible("#acct-closed") and "not open yet" in pg.inner_text("#acct-closed"))
    fix = pg.get_attribute("#closed-claim", "href")
    check("closed: its correction-form link carries the NPI", fix and fix.startswith("/claim/?npi="), fix)
    check("closed: only the status call reaches the server", [u for u in reqs if "/api/" in u] == [CLOSED + "/api/account/status"], reqs)
    r = pg.request.post(CLOSED + "/api/account/signup", data={"npi": ANN, "email": "a@b.example", "agree": True}, headers={"Origin": CLOSED})
    check("closed: sign-up API answers 503, stores nothing", r.status == 503)
    shot(pg, "closed-account-390")
    pg.click("#closed-claim"); pg.wait_for_selector("#claim-form")
    check("closed: correction form opens", pg.is_visible("#claim-form"))
    ctx.close()


def basic_path(b, label, base, vp, npi, email, proc):
    """The basic path from a card's Is this you? link: returns (steps, seconds)."""
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-basic")
    steps = 0
    t0 = time.monotonic()
    pg.goto(f"{base}/account/?npi={npi}&procedure={proc}&name=x"); steps += 1           # the click on the card
    pg.wait_for_function("document.getElementById('s-who') && !document.getElementById('s-who').hidden")
    who = pg.inner_text("#s-who")
    pg.check(f"#signup-form input[name=procedures][value={proc}]"); steps += 1
    pg.fill("#s-email", email); steps += 1
    pg.check("#s-agree"); steps += 1
    pg.click("#signup-form button[type=submit]"); steps += 1
    pg.wait_for_selector("#c-code")
    pg.fill("#c-code", code_for(pg, base, email)); steps += 1
    pg.click("#code-form button[type=submit]"); steps += 1
    pg.wait_for_selector("#acct-level")
    secs = time.monotonic() - t0
    return ctx, pg, who, steps, secs


def flows(b, label, base, vp):
    # 1 basic path: Ann from her card
    ctx, pg, who, steps, secs = basic_path(b, label, base, vp, ANN, "ann@home.example", "ufe")
    R["paths"][f"{label}-basic"] = {"steps": steps, "seconds": round(secs, 2)}
    check(f"{label}: Is this you? shows the NPPES name, nothing typed", "Ann Testone" in who and "Listed on Every Option for UFE, PAE" in who, who)
    check(f"{label}: basic path signs in and shows basic access", "Basic access" in pg.inner_text("#acct-level"))
    a = acct(pg, base, npi=ANN)
    check(f"{label}: account from NPPES, basic, attested at sign-up", a and a["name"] == "Ann Testone" and a["level"] == "basic" and
          [p for p in store(pg, base)["profiles"] if p["npi"] == ANN][0]["attested"] == ["ufe"])
    check(f"{label}: basic: contact fields and photo locked, no invitations", pg.is_visible("#contact-locked") and not pg.is_visible("#p-book")
          and not pg.is_visible("#photo-form") and not pg.is_visible("#invite-create"))
    fits(pg, f"{label} basic dashboard")
    shot(pg, f"{label}-1-basic")
    # a blurb and insurances on basic, with the screen
    pg.fill("#b-ufe", "The best UFE in Chicago, guaranteed."); clear(pg); pg.click("#profile-form button[type=submit]")
    pg.wait_for_function("document.getElementById('why-b-ufe').textContent.length > 0")
    check(f"{label}: screen blocks a promise word", "promise" in pg.inner_text("#why-b-ufe"))
    pg.fill("#b-ufe", "I perform UFE at Lakeside in Chicago. Call the office to ask whether it fits you.")
    pg.check("#profile-form input[value=Aetna]"); clear(pg); pg.click("#profile-form button[type=submit]"); wait_status(pg, "Saved")
    conf = json.loads(pg.request.get(base + "/__confirmed").text())
    check(f"{label}: basic note and insurance reach the confirmed export", conf and conf[0]["blurbs"].get("ufe", "").startswith("I perform UFE") and conf[0]["insurances"] == ["Aetna"])
    r = pg.request.put(base + "/api/account/profile", data={"booking_url": "https://lakesideir.example/book"}, headers={"Origin": base})
    check(f"{label}: server refuses a contact edit on basic even outside the page", r.status == 403)
    # 2 ID check to full
    pg.click("#check-id"); pg.wait_for_url(re.compile(r"/__identity/")); pg.click("text=Pass, name matches")
    pg.wait_for_selector("#p-book")
    check(f"{label}: ID check gives full access", "Full access" in pg.inner_text("#acct-level"))
    pg.fill("#p-book", "https://lakesideir.example/book")
    pg.fill("#o0-practice", "Lakeside IR"); pg.fill("#o0-street", "100 Test Plaza"); pg.fill("#o0-city", "Chicago"); pg.fill("#o0-state", "IL"); pg.fill("#o0-zip", "60611"); pg.fill("#o0-phone", "312-555-0100")
    clear(pg); pg.click("#profile-form button[type=submit]"); wait_status(pg, "Saved")
    pg.set_input_files("#photo", png_file(os.path.join(OUT, f"_upload-{label}.png"))); clear(pg); pg.click("#photo-form button[type=submit]")
    wait_status(pg, "Photo saved")
    prof = [p for p in store(pg, base)["profiles"] if p["npi"] == ANN][0]
    check(f"{label}: full: booking link, office and photo saved", prof["booking_url"] and prof["offices"][0]["phone"] == "3125550100" and prof["photo_key"])
    check(f"{label}: job 16: the street address got coordinates once, on save", prof["offices"][0].get("geo") == "address" and prof["offices"][0].get("lat"))
    pg.click("#add-office"); pg.fill("#o1-practice", "Lakeside South"); pg.fill("#o1-street", "9 Unknown Street"); pg.fill("#o1-city", "Chicago")
    pg.fill("#o1-state", "IL"); pg.fill("#o1-zip", "60605")
    clear(pg); pg.click("#profile-form button[type=submit]"); wait_status(pg, "couldn't find the street address for Lakeside South")
    check(f"{label}: job 16: an address not found is saved and the doctor is told plainly", "center of that office's ZIP code" in pg.inner_text("#acct-status"))
    pg.click("#add-office"); pg.fill("#o2-practice", "No Street IR"); pg.fill("#o2-city", "Evanston"); pg.fill("#o2-state", "IL"); pg.fill("#o2-zip", "60201")
    clear(pg); pg.click("#profile-form button[type=submit]"); wait_status(pg, "needs a street address")
    check(f"{label}: job 16: a new office without a street is refused in plain words", "street address" in pg.inner_text("#acct-status"))
    shot(pg, f"{label}-2-full")
    # 3 invite a colleague (Gil)
    pg.fill("#v-npi", GIL); clear(pg); pg.click("#invite-create button[type=submit]"); wait_status(pg, "Invitation link made")
    link = pg.input_value("#invite-link")
    check(f"{label}: invitation link made from the account page, 4 left", "#invite=" in link and "4 left" in pg.inner_text("#acct-status"))
    # undo the photo
    pg.locator("#history li", has_text="Photo").locator("button.undo").first.click(); wait_status(pg, "Undone")   # job 16: newer office edits sit above it
    check(f"{label}: undo puts the photo back to none", [p for p in store(pg, base)["profiles"] if p["npi"] == ANN][0]["photo_key"] is None)
    ctx.close()

    # 4 invitation path: Gil opens the link
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-invite")
    steps = 0; t0 = time.monotonic()
    pg.goto(link.replace("http://localhost:8787", base)); steps += 1                   # the click on the link
    pg.wait_for_selector("#invite-form")
    view = pg.inner_text("#invite-form")
    pg.check("#invite-form input[name=procedures][value=ufe]"); steps += 1
    pg.check("#i-agree"); steps += 1
    pg.click("#invite-form button[type=submit]"); steps += 1
    pg.wait_for_selector("#acct-level")
    R["paths"][f"{label}-invitation"] = {"steps": steps, "seconds": round(time.monotonic() - t0, 2)}
    check(f"{label}: invitation opens to the doctor's listing with one agreement", "Gil Fourtest" in view and "Listed for UFE" in view and "I am Gil Fourtest" in view)
    check(f"{label}: invitation gives full access with no email asked", "Full access" in pg.inner_text("#acct-level") and acct(pg, base, npi=GIL)["email"] is None)
    fits(pg, f"{label} invitation dashboard")
    shot(pg, f"{label}-3-invited")
    # add a login email later
    pg.fill("#e-email", "gil@home.example"); clear(pg); pg.click("#email-form button[type=submit]"); pg.wait_for_selector("#c-code")
    pg.fill("#c-code", "000000" if code_for(pg, base, "gil@home.example") != "000000" else "000001"); clear(pg); pg.click("#code-form button[type=submit]")
    wait_status(pg, "wrong")
    check(f"{label}: a wrong code is refused plainly", "wrong, expired, or already used" in pg.inner_text("#acct-status"))
    pg.fill("#c-code", code_for(pg, base, "gil@home.example")); clear(pg); pg.click("#code-form button[type=submit]"); wait_status(pg, "Login email saved")
    check(f"{label}: login email added by code", acct(pg, base, npi=GIL)["email"] == "gil@home.example")
    # 5 revoke a bad inviter (Ann) in one step: Gil drops to basic
    r = json.loads(pg.request.get(base + f"/__revoke?who={ANN}").text())
    pg.reload(); pg.wait_for_selector("#acct-level")
    check(f"{label}: one-step revoke drops the inviter and Gil to basic", r.get("ok") and len(r["revoked"]) == 2 and "Basic access" in pg.inner_text("#acct-level"), r)
    # 6 Doximity proof brings Gil back to full (name unique among radiologists)
    pg.click("#dox-link"); pg.fill("input[name=first]", "Gil"); pg.fill("input[name=last]", "Fourtest"); pg.fill("input[name=id]", f"dx-{label}")
    pg.click("text=Continue"); pg.wait_for_selector("#dox-yes"); pg.click("#dox-yes"); wait_status(pg, "Confirmed by Doximity")
    pg.wait_for_selector("#acct-level")
    check(f"{label}: Doximity counts as proof (name, specialty, unique)", acct(pg, base, npi=GIL)["proof"] == "doximity" and "Full access" in pg.inner_text("#acct-level"))
    ctx.close()

    # 7 takeover: a squatter on Ben, then the real Ben proves by ID
    sq_ctx, sq, _, _, _ = basic_path(b, label + "-squat", base, vp, BEN, "squatter@x.example", "gae")
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-takeover")
    pg.goto(f"{base}/account/?npi={BEN}"); pg.wait_for_function("!document.getElementById('s-who').hidden")
    check(f"{label}: a held listing says so before sign-up", "already has an account" in pg.inner_text("#s-who"))
    pg.fill("#s-email", "ben@home.example"); pg.check("#s-agree"); clear(pg); pg.click("#signup-form button[type=submit]")
    pg.wait_for_selector("#c-code")
    check(f"{label}: second claimant told plainly", "already has an account" in pg.inner_text("#acct-status"))
    pg.fill("#c-code", code_for(pg, base, "ben@home.example")); pg.click("#code-form button[type=submit]"); pg.wait_for_selector("#check-id")
    shot(pg, f"{label}-4-claimant")
    pg.click("#check-id"); pg.wait_for_url(re.compile(r"/__identity/")); pg.click("text=Pass, name matches"); pg.wait_for_selector("#attest-form")
    old = acct(pg, base, email="squatter@x.example")
    check(f"{label}: ID-proven doctor takes the listing over; old account loses it and is told",
          acct(pg, base, npi=BEN)["email"] == "ben@home.example" and old["npi"] is None and
          any(m["to"] == "squatter@x.example" and "no longer holds" in m["text"] for m in outbox(pg, base)))
    hist = pg.inner_text("#history")
    check(f"{label}: the earlier account's edits stay listed and undoable", "by an earlier account" in hist and pg.locator("#history button.undo").count() > 0)
    sq.reload(); sq.wait_for_selector("#signup-form")
    check(f"{label}: the squatter is signed out", sq.is_visible("#signup-form"))
    sq_ctx.close(); ctx.close()

    # 8 published-email invitation: basic
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-published")
    r = json.loads(pg.request.get(base + f"/__invite?kind=published&npi={CARA}&email=cara.newdoc@practice.example").text())
    pg.goto(r["url"].replace("http://localhost:" + base.rsplit(":", 1)[1], base)); pg.wait_for_selector("#invite-form")
    pg.check("#invite-form input[name=procedures][value=gae]"); pg.check("#i-agree"); pg.click("#invite-form button[type=submit]")
    pg.wait_for_selector("#acct-level")
    check(f"{label}: published-email invitation gives basic, its address the login", "Basic access" in pg.inner_text("#acct-level")
          and acct(pg, base, npi=CARA)["email"] == "cara.newdoc@practice.example")
    ctx.close()

    # 9 shared email and waitlist
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-misc")
    pg.goto(f"{base}/account/?npi={GIL}"); pg.wait_for_function("!document.getElementById('s-who').hidden")
    pg.fill("#s-email", "ben@home.example"); pg.check("#s-agree"); clear(pg); pg.click("#signup-form button[type=submit]")
    wait_status(pg, "already has an Every Option account")
    check(f"{label}: a shared email is told plainly", "Sign in with it, or use a different email" in pg.inner_text("#acct-status"))
    pg.goto(f"{base}/account/?npi={DAN}"); pg.wait_for_function("!document.getElementById('s-who').hidden")
    pg.fill("#s-email", "dan@ortho.example"); pg.check("#s-agree"); clear(pg); pg.click("#signup-form button[type=submit]")
    wait_status(pg, "waitlist")
    check(f"{label}: a non-radiologist goes on the waitlist", any(w["npi"] == DAN for w in store(pg, base).get("waitlist", [])))
    shot(pg, f"{label}-5-waitlist")
    ctx.close()


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
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
