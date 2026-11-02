#!/usr/bin/env python3
"""Job 10 browser walk-through of physician accounts, against local servers only (made-up people, local stand-ins).

  node tools/dev-server.mjs 8791 &                          # accounts not open (as on the dev site)
  node tools/dev-server.mjs 8792 --accounts --doximity &    # desktop run
  node tools/dev-server.mjs 8793 --accounts --doximity &    # phone run (fresh people)
  PLAYWRIGHT_BROWSERS_PATH=... <browser venv>/bin/python tools/e2e/accounts_e2e.py OUT_DIR
Flows: not open, sign-up, check (work email and ID), attest, edit (screen), photo, undo, new profile, waitlist,
exception (second claimant, ID name mismatch), Doximity link and sign-in. Writes results.json and PNGs to OUT_DIR.
"""
import json, os, re, struct, sys, zlib
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
CLOSED = "http://localhost:8791"
RUNS = {"desktop": ("http://localhost:8792", {"width": 1280, "height": 900}),
        "phone": ("http://localhost:8793", {"width": 390, "height": 844})}
R = {"checks": [], "console_errors": []}


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


def token(pg, base, to, kind="link"):
    for m in reversed(outbox(pg, base)):
        if m["to"] == to:
            t = re.search(r"#(?:link|check)=([0-9a-f]{64})", m["text"])
            if t:
                return t.group(1)
    return None


def store(pg, base):
    return json.loads(pg.request.get(base + "/__accounts").text())


def press(pg, sel):
    """Clear the status line, then click, so status() reads this click's answer."""
    pg.evaluate("document.getElementById('acct-status').textContent = ''")
    pg.click(sel)


def status(pg):
    pg.wait_for_function("document.getElementById('acct-status').textContent.length > 0", timeout=5000)
    return pg.inner_text("#acct-status")


def shot(pg, name):
    pg.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=True)


def watch(pg, label):
    pg.on("console", lambda m: m.type == "error" and R["console_errors"].append(f"{label}: {m.text}"))
    pg.on("pageerror", lambda e: R["console_errors"].append(f"{label}: pageerror {e}"))


def closed_site(b):
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page(); watch(pg, "closed")
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url))
    pg.goto(CLOSED + "/account/"); pg.wait_for_timeout(300)
    check("closed: account page says not open yet", pg.is_visible("#acct-closed") and "not open yet" in pg.inner_text("#acct-closed"))
    check("closed: sign-up form hidden", not pg.is_visible("#signup-form"))
    check("closed: only the status call reaches the server", [u for u in reqs if "/api/" in u] == [CLOSED + "/api/account/status"], reqs)
    r = pg.request.post(CLOSED + "/api/account/signup", data={"npi": "1999000015", "email": "a@b.example", "accept_terms": True},
                        headers={"Origin": CLOSED})
    check("closed: sign-up API answers 503, stores nothing", r.status == 503)
    shot(pg, "closed-account-390")
    reqs.clear()
    pg.goto(CLOSED + "/ufe/"); pg.fill("#zip", "60611"); pg.click("#zip-form button")
    pg.wait_for_function("!document.querySelector('#results').hasAttribute('aria-busy')"); pg.wait_for_timeout(200)
    check("closed: UFE finder still finds doctors", pg.locator("li.card").count() > 0)
    check("closed: finder makes no account request", not [u for u in reqs if "/api/" in u], reqs)
    check("closed: finder's confirmed group says nobody confirmed yet", "0 doctors" in pg.inner_text("section.tier-a"))
    pg.goto(CLOSED + "/claim/")
    check("closed: correction form still there", pg.is_visible("#claim-form"))
    ctx.close()


def flows(b, label, base, vp):
    ctx = b.new_context(viewport=vp)
    pg = ctx.new_page(); watch(pg, label)
    # 1 sign-up (listed doctor)
    pg.goto(base + "/account/")
    check(f"{label}: open account page shows sign-up", pg.is_visible("#signup-form"))
    pg.fill("#s-npi", "1999000015"); pg.fill("#s-email", "ann.testone@lakesideir.example")
    pg.click("#signup-form button[type=submit]")
    check(f"{label}: sign-up needs the terms box", "accept the terms" in status(pg))
    pg.check("#signup-form input[name=accept_terms]"); pg.click("#signup-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Check your email')")
    shot(pg, f"{label}-1-signup-sent")
    t = token(pg, base, "ann.testone@lakesideir.example")
    check(f"{label}: sign-in link emailed (outbox)", bool(t))
    pg.goto(base + "/account/#link=" + t); pg.wait_for_selector("#signout")
    check(f"{label}: link signs in, name from NPPES", "Ann Testone" in pg.inner_text("#acct-out") and "Not checked yet" in pg.inner_text("#acct-out"))
    check(f"{label}: token removed from the address bar", "#" not in pg.url)
    pg.goto(base + "/account/#link=" + t); pg.wait_for_timeout(300)
    check(f"{label}: same link twice is refused", "expired or was already used" in pg.inner_text("#acct-status"))
    # 2 check by work email
    pg.fill("#c-work", "ann@gmail.com"); press(pg, "#check-email-form button[type=submit]")
    check(f"{label}: free-mail work email refused", "does not match" in status(pg))
    pg.fill("#c-work", "ann.testone@lakesideir.example"); pg.click("#check-email-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Check that inbox')")
    pg.goto(base + "/account/#check=" + token(pg, base, "ann.testone@lakesideir.example")); pg.wait_for_selector("#attest-form")
    check(f"{label}: work email confirms; attest form shows", "Work email confirmed" in pg.inner_text("#acct-status"))
    shot(pg, f"{label}-2-checked")
    # 3 attest
    pg.check("#attest-form input[value=ufe]"); press(pg, "#attest-form button[type=submit]")
    check(f"{label}: attest needs the statement box", "tick the statement" in status(pg))
    pg.check("#attest-form input[name=agree]"); pg.click("#attest-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('confirmed group')")
    att = store(pg, base).get("attestations", [])
    check(f"{label}: attestation stored with its wording", any(a["procedure"] == "ufe" and "I personally perform" in a["statement"] for a in att))
    # 4 edit, with the screen
    pg.wait_for_selector("#profile-form")
    pg.fill("#b-ufe", "The best UFE in Chicago, guaranteed."); pg.click("#profile-form button[type=submit]")
    pg.wait_for_function("document.getElementById('why-b-ufe').textContent.length > 0")
    check(f"{label}: screen blocks a promise word and says why", "promise" in pg.inner_text("#why-b-ufe"))
    shot(pg, f"{label}-3-screened")
    pg.fill("#b-ufe", "I perform UFE at Lakeside in Chicago and Evanston. Call the office to ask whether it fits you.")
    pg.check("#profile-form input[value=Aetna]"); pg.check("#profile-form input[value=Medicare]")
    pg.check("#profile-form input[name=insurance_confirm]")
    pg.fill("#p-book", "https://lakesideir.example/book")
    pg.fill("#o0-practice", "Lakeside IR"); pg.fill("#o0-city", "Chicago"); pg.fill("#o0-state", "IL"); pg.fill("#o0-zip", "60611"); pg.fill("#o0-phone", "312-555-0100")
    pg.click("#profile-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Saved')")
    conf = json.loads(pg.request.get(base + "/__confirmed").text())
    check(f"{label}: edit live at once in the confirmed export", conf and conf[0]["blurbs"].get("ufe", "").startswith("I perform UFE") and conf[0]["insurances"] == ["Aetna", "Medicare"])
    check(f"{label}: contact change emailed the account address", any("contact details changed" in m["subject"] for m in outbox(pg, base) if m["to"] == "ann.testone@lakesideir.example"))
    # 5 photo
    pg.wait_for_selector("#photo-form")
    pg.set_input_files("#photo", png_file(os.path.join(OUT, f"_upload-{label}.png")))
    pg.click("#photo-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Photo saved')")
    prof = [p for p in store(pg, base)["profiles"] if p["npi"] == "1999000015"][0]
    check(f"{label}: photo stored under the doctor's NPI", re.match(r"^1999000015/[0-9a-f]{16}\.png$", prof["photo_key"] or ""), prof["photo_key"])
    shot(pg, f"{label}-4-profile")
    # 6 undo the newest change (the photo)
    pg.wait_for_selector("#history button.undo")
    pg.locator("#history button.undo").first.click()
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Undone')")
    prof = [p for p in store(pg, base)["profiles"] if p["npi"] == "1999000015"][0]
    check(f"{label}: undo puts back what was there (no photo)", prof["photo_key"] is None)
    check(f"{label}: undo kept in the log", any(e.get("undo_of") for e in store(pg, base)["edits"]))
    shot(pg, f"{label}-5-undone")
    # 10 Doximity: link while signed in, then sign in with it from a fresh browser
    pg.click("text=Link Doximity"); pg.fill("input[name=first]", "Ann"); pg.fill("input[name=last]", "Testone")
    pg.fill("input[name=id]", f"dx-{label}"); pg.click("text=Continue")
    pg.wait_for_selector("#dox-yes")
    check(f"{label}: Doximity asks before linking and names the account", "Ann Testone" in pg.inner_text("#dox-confirm"))
    pg.click("#dox-yes")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Doximity')")
    check(f"{label}: Doximity linked when names match", "Doximity linked" in pg.inner_text("#acct-status"))
    ctx2 = b.new_context(viewport=vp); p2 = ctx2.new_page(); watch(p2, label + "-dox")
    p2.goto(base + "/account/"); p2.click("#dox"); p2.fill("input[name=first]", "Ann"); p2.fill("input[name=last]", "Testone")
    p2.fill("input[name=id]", f"dx-{label}"); p2.click("text=Continue"); p2.wait_for_selector("#signout")
    check(f"{label}: Sign in with Doximity works once linked", "Ann Testone" in p2.inner_text("#acct-out"))
    ctx2.close()
    pg.click("#signout"); pg.wait_for_selector("#signup-form")
    check(f"{label}: sign out", pg.is_visible("#login-form"))
    ctx.close()

    # 7 new profile: not on the site, radiologist, ID check
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-new")
    pg.goto(base + "/account/")
    pg.fill("#s-npi", "1999000031"); pg.fill("#s-email", "cara@home.example"); pg.fill("#s-name", "Cara Newdoc")
    pg.check("#signup-form input[name=accept_terms]"); pg.click("#signup-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Check your email')")
    pg.goto(base + "/account/#link=" + token(pg, base, "cara@home.example")); pg.wait_for_selector("#check-id")
    pg.click("#check-id"); pg.wait_for_url(re.compile(r"/__identity/")); shot(pg, f"{label}-6-identity-standin")
    pg.click("text=Pass, name matches"); pg.wait_for_selector("#attest-form")
    check(f"{label}: new profile passes the ID check", "Checked." in pg.inner_text("#acct-out"))
    ic = store(pg, base)["identity_checks"]
    check(f"{label}: ID check keeps only result and name", all(set(r) == {"id", "account_id", "provider_session", "status", "verified_name", "at"} for r in ic))
    pg.check("#attest-form input[value=gae]"); pg.check("#attest-form input[name=agree]"); pg.click("#attest-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('confirmed group')")
    conf = json.loads(pg.request.get(base + "/__confirmed").text())
    check(f"{label}: new profile in the confirmed export", any(c["npi"] == "1999000031" and c["new_profile"] for c in conf))
    ctx.close()

    # 8 waitlist and 9 exceptions
    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); watch(pg, label + "-wait")
    pg.goto(base + "/account/")
    pg.fill("#s-npi", "1999000049"); pg.fill("#s-email", "dan@ortho.example"); pg.fill("#s-name", "Dan Orthotest")
    pg.check("#signup-form input[name=accept_terms]"); pg.click("#signup-form button[type=submit]")
    check(f"{label}: non-radiologist goes on the waitlist", "waitlist" in status(pg))
    shot(pg, f"{label}-7-waitlist")
    pg.reload(); pg.fill("#s-npi", "1999000015"); pg.fill("#s-email", "someone@other.example")
    pg.check("#signup-form input[name=accept_terms]"); pg.click("#signup-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Check your email')")
    st = store(pg, base)
    told = [m for m in outbox(pg, base) if m["to"] == "someone@other.example"]
    check(f"{label}: second claimant goes to exceptions with their email, told it is under review, no link",
          any(e["kind"] == "second_claimant" and e["detail"].get("email") == "someone@other.example" for e in st["exceptions"])
          and len(told) == 1 and "#link=" not in told[0]["text"])
    pg.reload(); pg.fill("#s-npi", "1999000072"); pg.fill("#s-email", "gil@home.example")
    pg.check("#signup-form input[name=accept_terms]"); pg.click("#signup-form button[type=submit]")
    pg.wait_for_function("document.getElementById('acct-status').textContent.includes('Check your email')")
    pg.goto(base + "/account/#link=" + token(pg, base, "gil@home.example")); pg.wait_for_selector("#check-id")
    pg.click("#check-id"); pg.wait_for_url(re.compile(r"/__identity/")); pg.click("text=Pass, different name")
    pg.wait_for_selector("#check-id")
    st = store(pg, base)
    check(f"{label}: ID name mismatch stays unchecked and goes to exceptions", any(e["kind"] == "name_mismatch" for e in st["exceptions"])
          and "Not checked yet" in pg.inner_text("#acct-out"))
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
    json.dump(R, open(os.path.join(OUT, "accounts-results.json"), "w"), indent=1)
    # Chrome logs every 4xx/5xx answer as a console error; the flows above cause those on purpose (closed site 503,
    # signed-out 401, refused input 400 and 422). Anything else is a real error.
    R["console_unexpected"] = [e for e in R["console_errors"] if not re.search(r"status of (400|401|409|422|503) ", e)]
    print(f"{R['passed']} of {R['total']}; console lines: {len(R['console_errors'])}, unexpected: {len(R['console_unexpected'])}")
    for e in R["console_unexpected"]:
        print("  console:", e)


if __name__ == "__main__":
    main()
