#!/usr/bin/env python3
"""Patient walkthrough runner. Puts the panel in panel.json through a local build in Playwright (Chromium, WebKit); at each
step a fresh, tool-less patient model decides from the persona, the task and what the page shows, and never sees the code.

  PLAYWRIGHT_BROWSERS_PATH="/Library/Application Support/ai-hq/browser/ms-playwright" \
    "/Library/Application Support/ai-hq/browser/venv/bin/python" -I tools/walkthrough/run.py \
    --origin http://localhost:8799 --out <dir> --patient-prompt <patient.md> [--engines chromium,webkit] [--personas a,b]
    [--workers 3] [--model claude-sonnet-5-5] [--budget-usd 10]
  ... run.py --prove-guard --engines webkit --out <dir>     (network guard proof on its own local page, no model; exits non-zero on any failed check)

Serve the build first: node tools/dev-server.mjs 8799 --accounts. The browser and Playwright's driver run as the locked-down macOS user _hqbrowser (driver-as-hqbrowser.sh);
this runner and the patient model stay as his user. Only a local http origin is accepted. Each browser launch has one empty temporary profile and each context is isolated inside it.
Forms the patient submits go only to the local dev server. Every page request not to the exact origin is aborted, WebSockets are routed and never connected, and service workers are
blocked; below the route, a launch-level proxy to a dead port catches what the route cannot see (redirects, preconnect). What does leave the mini: each sighted step's screenshot, and the page
text, accessibility text, persona and task, go to Anthropic through the patient model (claude -p). Per step it saves the screenshot, the accessibility snapshot, the axe result, the URL and
what was tapped. Per task: steps.jsonl and result.json. Per run: outside-connections.json; any outside connection seen from the browser user's processes fails the run."""
import argparse, base64, hashlib, http.server, json, os, re, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
# Playwright's Python client starts this instead of its node driver, so the driver and the browser run as the locked-down user. Fixed here, not an option.
os.environ["PLAYWRIGHT_NODEJS_PATH"] = os.path.join(HERE, "driver-as-hqbrowser.sh")
BROWSER_UID = 493  # _hqbrowser (scripts/mini_browser_user.sh in ai-hq)
PROOF_PORT = 8799  # the one loopback port the browser user's firewall rule passes (ops/pf/ai-hq-browser.conf in ai-hq)
DEAD_PROXY = "http://127.0.0.1:8796"  # nothing listens there and the browser user's firewall drops it; see launch()
DEVICES = {
    "phone390": dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True),
    "desktop1440": dict(viewport={"width": 1440, "height": 900}, device_scale_factor=1),
    # A 1280x800 screen at 200% browser zoom lays out as 640x800 CSS pixels at twice the density.
    "zoom200": dict(viewport={"width": 640, "height": 800}, device_scale_factor=2),
}
CONTROLS = r"""(fullPage) => {
  document.querySelectorAll('[data-wt]').forEach(e => e.removeAttribute('data-wt'));
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[tabindex]:not([tabindex="-1"])';
  const out = []; let i = 0;
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect(), c = getComputedStyle(e);
    if (r.width < 1 || r.height < 1 || c.visibility === 'hidden' || c.display === 'none') continue;
    const d = e.closest('details'); if (d && !d.open && e.tagName !== 'SUMMARY') continue;
    const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    if (!fullPage && !inView) continue;
    i++; e.setAttribute('data-wt', i);
    out.push({n: i, tag: e.tagName.toLowerCase(), type: e.type || '', href: e.getAttribute('href') || '', value: (e.value || '').slice(0, 60),
      placeholder: e.placeholder || '', checked: !!e.checked, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      text: (e.innerText || e.getAttribute('aria-label') || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 100)});
  }
  return out; }"""
VISIBLE_TEXT = r"""() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), seen = new Set(), o = []; let n;
  while (n = w.nextNode()) { const p = n.parentElement, t = n.textContent.trim().replace(/\s+/g, ' ');
    if (!t || ['SCRIPT','STYLE','NOSCRIPT'].includes(p.tagName) || seen.has(p)) continue;
    const r = p.getBoundingClientRect(), c = getComputedStyle(p);
    if (r.width < 1 || r.height < 1 || c.visibility === 'hidden' || c.display === 'none' || r.bottom <= 0 || r.top >= innerHeight) continue;
    const d = p.closest('details'); if (d && !d.open && !p.closest('summary')) continue;
    seen.add(p); o.push(t); }
  return o.join('\n'); }"""


def check_origin(origin):
    """Only a local http origin, exactly http://localhost:<port> or http://127.0.0.1:<port>; refused before any browser starts."""
    m = re.fullmatch(r"http://(localhost|127\.0\.0\.1):([1-9][0-9]{0,4})", origin)
    if not m or int(m.group(2)) > 65535:
        raise SystemExit(f"refused --origin {origin!r}: only http://localhost:<port> or http://127.0.0.1:<port> is accepted")
    return origin


def launch(p, engine, origin=None):
    """Sandbox on for Chromium. With an origin (every guarded launch): a launch-level proxy to a dead port with only that exact origin bypassed, so whatever the
    context route cannot see (a followed redirect, preconnect, dns-prefetch; Playwright continues redirects without a route) has nowhere to go."""
    # The map: the firewall passes 127.0.0.1:8799 only and silently drops ::1, and Chromium trying localhost on ::1 first failed the navigation (ERR_SOCKET_NOT_CONNECTED, seen 2026-11-09).
    kw = {"chromium_sandbox": True, "args": ["--host-resolver-rules=MAP localhost 127.0.0.1"]} if engine == "chromium" else {}
    if origin:
        # Chromium: <-loopback> first, or its implicit loopback bypass would also let 127.0.0.1 and other local ports past the proxy; later rules win, so the origin stays exempt.
        kw["proxy"] = {"server": DEAD_PROXY, "bypass": ("<-loopback>," if engine == "chromium" else "") + urlsplit(origin).netloc}
    return getattr(p, engine).launch(**kw)


def allowed(url, origin):
    """Exact scheme, host and port; a prefix test would let http://localhost:8799.example.com through."""
    u, o = urlsplit(url), urlsplit(origin)
    if u.scheme in ("data", "blob", "about"):
        return True
    try:
        return (u.scheme, u.hostname, u.port) == (o.scheme, o.hostname, o.port)
    except ValueError:  # a port that is not a number, as in http://localhost:8799.example.com
        return False


def guard(ctx, origin, blocked):
    def on_route(route):
        if allowed(route.request.url, origin):
            route.continue_()
        else:
            blocked.append(route.request.url); route.abort()
    def on_ws(ws):
        # Log only: a routed socket that is not connected onward never reaches a server. Calling ws.close() here hangs the sync API (seen 2026-11-08).
        blocked.append("ws:" + ws.url)
    ctx.route("**/*", on_route)
    ctx.route_web_socket(re.compile(".*"), on_ws)


def new_context(browser, device, origin, blocked, bypass_csp=False):
    ctx = browser.new_context(color_scheme="light", service_workers="block", bypass_csp=bypass_csp, **DEVICES[device])
    guard(ctx, origin, blocked)
    return ctx


class Spend:
    def __init__(self, limit): self.limit, self.total, self.calls, self.lock = limit, 0.0, 0, threading.Lock()
    def add(self, usd):
        with self.lock: self.total += usd; self.calls += 1
    def over(self):
        with self.lock: return self.total >= self.limit


def ask_patient(system, text, jpeg, model, cwd, spend):
    """One fresh process with no tools, no settings, no MCP and an empty folder: it can use only what this message holds."""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE", "AI_AGENT"))}
    cmd = ["claude", "-p", "--model", model, "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--disable-slash-commands",
           "--no-session-persistence", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
           "--max-budget-usd", "0.60", "--system-prompt", system]
    content = []
    if jpeg:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}})
    content.append({"type": "text", "text": text})
    line = json.dumps({"type": "user", "message": {"role": "user", "content": content}})
    last_err = ""
    for attempt in range(3):
        try:
            p = subprocess.run(cmd, input=line, capture_output=True, text=True, timeout=180, cwd=cwd, env=env)
        except subprocess.TimeoutExpired:
            last_err = "timeout"; continue
        res = None
        for l in p.stdout.splitlines():
            try:
                o = json.loads(l)
            except ValueError:
                continue
            if o.get("type") == "result":
                res = o
        if not res:
            last_err = (p.stderr or p.stdout)[-300:]; continue
        spend.add(float(res.get("total_cost_usd") or 0))
        m = re.search(r"\{.*\}", res.get("result") or "", re.S)
        if m:
            try:
                return json.loads(m.group(0)), float(res.get("total_cost_usd") or 0)
            except ValueError:
                pass
        last_err = "no JSON: " + (res.get("result") or "")[:200]
    return {"looking_for": "", "action": "error", "why": last_err}, 0.0


def axe_check(page, axe_path):
    try:
        if not page.evaluate("typeof window.axe !== 'undefined'"):
            page.add_script_tag(path=axe_path)
        r = page.evaluate("async () => { const r = await axe.run(document, {resultTypes: ['violations','incomplete'], rules: {'target-size': {enabled: true}}}); "
                          "const f = a => a.map(v => ({id: v.id, impact: v.impact, help: v.help, tags: v.tags.filter(t => /wcag|best/.test(t)), count: v.nodes.length, "
                          "nodes: v.nodes.slice(0, 5).map(n => ({target: n.target, html: n.html.slice(0, 160)}))})); "
                          "return {version: axe.version, url: location.href, violations: f(r.violations), incomplete: f(r.incomplete)}; }")
        return r
    except Exception as ex:
        return {"error": str(ex)[:300], "violations": [], "incomplete": []}


def observe(page, persona, device_sees_screen, step_dir, n, axe_path, sr_pos):
    shot = os.path.join(step_dir, f"step-{n:02d}.jpg")
    page.screenshot(path=shot, type="jpeg", quality=70)
    try:
        aria = page.locator("body").aria_snapshot(timeout=8000)
    except Exception as ex:
        aria = f"(accessibility snapshot failed: {ex})"
    open(os.path.join(step_dir, f"step-{n:02d}-aria.yml"), "w", encoding="utf8").write(aria)
    axe = axe_check(page, axe_path)
    json.dump(axe, open(os.path.join(step_dir, f"step-{n:02d}-axe.json"), "w"), indent=1)
    sr = not device_sees_screen
    controls = page.evaluate(CONTROLS, sr)[:120 if sr else 45]
    for c in controls:
        try:
            first = page.locator(f'[data-wt="{c["n"]}"]').first.aria_snapshot(timeout=800).splitlines()[0]
            c["aria"] = first.lstrip("- ").rstrip(":")
        except Exception:
            c["aria"] = f'{c["tag"]} "{c["text"]}"'
    json.dump(controls, open(os.path.join(step_dir, f"step-{n:02d}-controls.json"), "w"), indent=1)
    return shot, aria, axe, controls


def describe_controls(controls):
    rows = []
    for c in controls:
        extra = "".join([f' value="{c["value"]}"' if c["value"] and c["tag"] in ("input", "textarea", "select") and c["type"] not in ("radio", "checkbox") else "",
                         f' hint="{c["placeholder"]}"' if c["placeholder"] else "", " (selected)" if c["checked"] else ""])
        rows.append(f'[{c["n"]}] {c["aria"]}{extra}')
    return "\n".join(rows) or "(no controls)"


def build_message(persona, task, sees, trail, taps, budget, url_path, visible, aria, controls, sr_pos):
    head = [f'You are: {persona["who"]}', f'You came here after: {persona.get("query") or "following a link"}', f'What you want right now: {task["goal"]}',
            f'Words you would look for: {", ".join(task.get("words") or persona.get("words") or [])}',
            f'Taps used: {taps} of {budget}.' + (" You have used all your taps. If what you need is in front of you, answer done; otherwise give_up." if taps >= budget else ""),
            f"Address bar: {url_path}"]
    head.append("What you have done so far:\n" + ("\n".join(trail) if trail else "(nothing yet)"))
    if sees:
        head += ["The screenshot is exactly what is on your screen now.", "Text on the screen:\n" + visible[:2500], "Things you can tap on this screen:\n" + describe_controls(controls)]
    else:
        lines = aria.splitlines()
        heads = [f"line {i}: {l.strip()[2:60]}" for i, l in enumerate(lines) if "heading " in l]
        head += ["You cannot see the screen. Your screen reader gives you this.", "Headings on the page:\n" + "\n".join(heads[:40]),
                 f"Reading from line {sr_pos} of {len(lines)}:\n" + "\n".join(lines[sr_pos:sr_pos + 90]), "Links, buttons and fields on the page:\n" + describe_controls(controls)]
    head.append('Answer with one JSON object only: {"looking_for": "what you are looking for, in your own words", "thinking": "one short sentence", '
                '"action": "tap|type|scroll_down|scroll_up|back|read_more|read_from|done|give_up", "target": <number of the control, or heading line for read_from>, '
                '"text": "what you type, if type", "submit": false, "why": "one short sentence"}')
    return "\n\n".join(head)


def finish_met(page, finish, url_path, called, whole_page):
    if finish.get("any_of"):
        return any(finish_met(page, f, url_path, called, whole_page) for f in finish["any_of"])
    if finish.get("called") and not called:
        return False
    if finish.get("url_re") and not re.search(finish["url_re"], url_path):
        return False
    if finish.get("text_re"):
        text = page.inner_text("body") if whole_page else page.evaluate(VISIBLE_TEXT)
        if not re.search(finish["text_re"], text, re.I | re.S):
            return False
    if finish.get("selector"):
        vis = page.evaluate("""([s, whole]) => [...document.querySelectorAll(s)].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (whole || (r.bottom > 0 && r.top < innerHeight)); })""", [finish["selector"], whole_page])
        if not vis:
            return False
    return bool(finish)


def run_task(browser, engine, persona, task, a, spend, cwd, system):
    device, mode = persona["device"], persona.get("mode", "sighted")
    sees = mode != "screen_reader"
    blocked, errors = [], []
    ctx = new_context(browser, device, a.origin, blocked)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)[:200]))
    tdir = os.path.join(a.out, engine, persona["id"], task["id"])
    os.makedirs(tdir, exist_ok=True)
    start = task.get("start") or persona["start"]
    page.goto(a.origin + start, wait_until="load", timeout=30000); page.wait_for_timeout(900)
    budget = task["tap_budget"]
    max_steps = min(budget * 2 + 6, 18)
    trail, steps = [], []
    taps = scrolls = backs = fails = 0
    called = False
    finish_step = None
    outcome, sr_pos = None, 0
    log = open(os.path.join(tdir, "steps.jsonl"), "w", encoding="utf8")
    for n in range(max_steps):
        if spend.over():
            outcome = "stopped_budget"; break
        url_path = page.url.replace(a.origin, "") or "/"
        shot, aria, axe, controls = observe(page, persona, sees, tdir, n, a.axe, sr_pos)
        if finish_step is None and finish_met(page, task["finish"], url_path, called, not sees):
            finish_step = n
        visible = page.evaluate(VISIBLE_TEXT) if sees else ""
        msg = build_message(persona, task, sees, trail, taps, budget, url_path, visible, aria, controls, sr_pos)
        d, cost = ask_patient(system, msg, open(shot, "rb").read() if sees else None, a.model, cwd, spend)
        act = d.get("action", "error")
        rec = {"step": n, "engine": engine, "persona": persona["id"], "task": task["id"], "device": device, "url": url_path, "screenshot": os.path.basename(shot),
               "looking_for": d.get("looking_for", ""), "thinking": d.get("thinking", ""), "action": act, "why": d.get("why", ""), "cost_usd": cost, "finish_met_now": finish_step is not None,
               "axe": {"violations": len(axe.get("violations", [])), "incomplete": len(axe.get("incomplete", [])), "error": axe.get("error")}}
        target = next((c for c in controls if c["n"] == d.get("target")), None)
        rec["target"] = {k: target[k] for k in ("n", "aria", "href", "x", "y", "w", "h") if k in target} if target else d.get("target")
        result = ""
        try:
            if act in ("done", "give_up", "error"):
                rec["result"] = act; steps.append(rec); log.write(json.dumps(rec) + "\n"); outcome = act; break
            if act == "tap":
                if not target:
                    result = "tap on nothing (no such control)"; fails += 1
                elif target["href"].startswith(("tel:", "mailto:")):
                    taps += 1; called = target["href"].startswith("tel:"); result = "tapped a " + target["href"].split(":")[0] + " link"
                else:
                    loc = page.locator(f'[data-wt="{target["n"]}"]').first
                    before = page.url
                    (loc.tap if DEVICES[device].get("has_touch") else loc.click)(timeout=5000)
                    taps += 1
                    try:
                        page.wait_for_load_state("load", timeout=6000)
                    except Exception:
                        pass
                    page.wait_for_timeout(700)
                    result = "opened " + page.url.replace(a.origin, "") if page.url != before else "tapped, same address"
                    if blocked and not allowed(target["href"], a.origin) and target["href"].startswith("http"):
                        result = "tapped an outside link (blocked in this test): " + target["href"]
            elif act == "type":
                if not target:
                    result = "type into nothing"; fails += 1
                else:
                    loc = page.locator(f'[data-wt="{target["n"]}"]').first
                    loc.fill(str(d.get("text", "")), timeout=5000)
                    if d.get("submit"):
                        loc.press("Enter", timeout=4000)
                        page.wait_for_timeout(1200)
                    result = f'typed "{d.get("text", "")}"'
            elif act in ("scroll_down", "scroll_up"):
                sign = 1 if act == "scroll_down" else -1
                page.evaluate("s => window.scrollBy(0, s * Math.round(innerHeight * 0.8))", sign); page.wait_for_timeout(350); scrolls += 1; result = "scrolled"
            elif act == "back":
                page.go_back(wait_until="load", timeout=8000); page.wait_for_timeout(600); taps += 1; backs += 1; result = "went back to " + page.url.replace(a.origin, "")
            elif act == "read_more":
                sr_pos += 80; result = "read on"
            elif act == "read_from":
                sr_pos = max(0, int(d.get("target") or 0)); result = f"jumped to line {sr_pos}"
            else:
                result = "unknown action"; fails += 1
        except Exception as ex:
            result = "FAILED: " + str(ex).splitlines()[0][:160]; fails += 1
        if finish_step is None and finish_met(page, task["finish"], page.url.replace(a.origin, "") or "/", called, not sees):
            finish_step = n + 1
        label = (target or {}).get("aria", "") if isinstance(target, dict) else ""
        trail.append(f'{n + 1}. Looked for: {d.get("looking_for", "")}. Did: {act} {label}. Result: {result}.')
        rec.update(result=result, taps=taps, scrolls=scrolls)
        steps.append(rec); log.write(json.dumps(rec) + "\n"); log.flush()
        if called and task["finish"].get("called"):
            outcome = "done"; break
        if act == "tap" and result.startswith("FAILED") and fails >= 3:
            outcome = "stuck"; break
    else:
        outcome = "step_cap"
    # After the loop: the screen after the last action, so the final state is on file.
    if outcome in ("step_cap", "stuck"):
        observe(page, persona, sees, tdir, len(steps), a.axe, sr_pos)
    log.close()
    met = finish_step is not None
    status = "found" if met and outcome == "done" else "found_late_or_unclaimed" if met else "claimed_done_not_met" if outcome == "done" else "not_found"
    within = taps <= budget
    result_rec = dict(engine=engine, persona=persona["id"], task=task["id"], function=task["function"], device=device, mode=mode, outcome=outcome, status=status, taps=taps, budget=budget,
                      within_budget=within, scrolls=scrolls, backs=backs, fails=fails, finish_step=finish_step, steps=len(steps), blocked=sorted(set(blocked))[:20],
                      page_errors=errors[:5], final_url=page.url.replace(a.origin, ""), cost_usd=round(sum(s.get("cost_usd", 0) for s in steps), 4))
    json.dump(result_rec, open(os.path.join(tdir, "result.json"), "w"), indent=1)
    ctx.close()
    return result_rec


def run_persona(args):
    engine, persona, a, spend, system = args
    cwd = os.path.join(a.out, "_patient_cwd"); os.makedirs(cwd, exist_ok=True)
    results = []
    with sync_playwright() as p:
        browser = launch(p, engine, a.origin)
        for task in persona["tasks"]:
            if spend.over():
                break
            print(time.strftime("%H:%M:%S"), engine, persona["id"], task["id"], flush=True)
            try:
                r = run_task(browser, engine, persona, task, a, spend, cwd, system)
            except Exception as ex:
                r = dict(engine=engine, persona=persona["id"], task=task["id"], function=task["function"], status="runner_error", error=str(ex)[:400])
            results.append(r)
            print(" ", r.get("status"), "taps", r.get("taps"), "/", r.get("budget"), "cost", r.get("cost_usd"), flush=True)
        browser.close()
    return results


def check_axe_lock(path):
    lock = json.load(open(os.path.join(HERE, "axe.lock.json")))
    h = hashlib.sha256(open(path, "rb").read()).hexdigest()
    if h != lock["axe_min_js_sha256"]:
        raise SystemExit(f"axe.min.js sha256 {h} is not the pinned {lock['axe_min_js_sha256']}")
    return lock


POSITIVE_URL = "http://example.com/"  # plain HTTP on purpose: HTTP/3 would use UDP, which this sampler does not read (the browser user's firewall drops all UDP). On the egress allowlist (window playwright-render)


def browser_root(exe):
    """Playwright's browsers folder. Matching on it catches what a process tree misses: WebKit's Networking and WebContent services start through launchd on
    macOS, and Chromium headless runs from a sibling folder of the one executable_path names."""
    m = re.match(r"(.*/ms-playwright/)", exe)
    return m.group(1) if m else os.path.dirname(exe) + "/"


def browser_pids(root):
    """PIDs of the browser user's processes started from the browsers folder or the driver, and their descendants of that user. Not the runner's own tree: the patient model is a child of the
    runner and talks to Anthropic. Another job's browser under the same user is counted too (its helpers have parent PID 1, so it cannot be told apart): a false alarm, never a miss.
    Returns (pids, names started from the folder, command lines)."""
    kids, roots, names, cmds = {}, set(), set(), {}
    driver = "/Library/Application Support/ai-hq/browser/venv/"
    uid_of = {}
    for l in subprocess.run(["ps", "-axww", "-o", "pid=,ppid=,uid=,command="], capture_output=True, text=True, check=True).stdout.splitlines():
        f = l.split(None, 3)
        if len(f) < 4:
            continue
        pid, ppid, uid, cmd = int(f[0]), int(f[1]), int(f[2]), f[3]
        kids.setdefault(ppid, []).append(pid); uid_of[pid] = uid
        if uid == BROWSER_UID and (cmd.startswith(root) or cmd.startswith(driver)):
            roots.add(pid); cmds[pid] = cmd
            if cmd.startswith(root):
                names.add(os.path.basename(cmd[len(root):].split()[0]))
    tree, todo = set(roots), list(roots)
    while todo:
        for k in kids.get(todo.pop(), []):
            if k not in tree and uid_of.get(k) == BROWSER_UID:
                tree.add(k); todo.append(k)
    return tree, names, cmds


def sample_outside(state, stop, root):
    """While state["now"] names a phase, record the browser user's TCP connections that do not end on loopback, in any state (SYN_SENT included). A route guard cannot see a browser's own
    traffic; this can, within limits: TCP only, only these PIDs (macOS daemons such as trustd or nsurlsessiond that fetch on the browser's behalf are invisible), and a connection opened and closed between two samples is missed.
    sudo because lsof shows another user's sockets only to root."""
    while not stop.is_set():
        phase = state["now"]
        if phase is None:
            stop.wait(0.05); continue
        try:
            pids, names, cmds = browser_pids(root)
            state["pids_seen"] = state.get("pids_seen", 0) + len(pids)
            state["no_sandbox_seen"] = state.get("no_sandbox_seen", False) or any("--no-sandbox" in c for c in cmds.values())
            if not pids:
                stop.wait(0.05); continue
            # Scoped to these PIDs: each sample is quicker, so fewer short connections fall between samples.
            r = subprocess.run(["sudo", "-n", "lsof", "+c", "0", "-nP", "-a", "-iTCP", "-p", ",".join(map(str, sorted(pids)))], capture_output=True, text=True)
            if r.returncode not in (0, 1):  # 1 means nothing matched
                raise RuntimeError(f"lsof exit {r.returncode}: {r.stderr[:200]}")
        except Exception as ex:
            state["errors"].append(f"{phase}: {str(ex)[:200]}"); stop.wait(0.2); continue
        found = state["sets"].setdefault(phase, set())
        for l in r.stdout.splitlines()[1:]:
            m = re.search(r"\s(\d+)\s", l)  # the PID is the first all-digit column; +c 0 names may hold spaces
            if m and int(m.group(1)) in pids and "->" in l and not re.search(r"->(127\.|\[::1\])", l):
                found.add(re.sub(r"\s+", " ", l)[:200])
        state["samples"][phase] = state["samples"].get(phase, 0) + 1
        state["procs"].setdefault(phase, set()).update(names)
        stop.wait(state.get("wait", 0.05))


def wait_browser_gone(root, seconds=20):
    """Between the two launches: a connection held by the unguarded browser must not be counted against the guarded one."""
    end = time.time() + seconds
    while time.time() < end:
        if not browser_pids(root)[1]:  # names started from the browsers folder: the driver stays up between launches
            return True
        time.sleep(0.25)
    return False


PAGE = b'<!doctype html><html lang="en"><title>Guard proof page</title><main><h1>Guard proof page</h1><p>Local page for the network guard proof.</p></main></html>'
PRECONNECT = b'<!doctype html><html lang="en"><title>Preconnect</title><link rel="preconnect" href="http://example.com"><link rel="dns-prefetch" href="http://example.com"><main><h1>Preconnect test</h1></main></html>'


def prove_engine(p, engine, a, can, hits, attempt):
    state, halt, failures = {"now": None, "sets": {}, "samples": {}, "procs": {}, "errors": []}, threading.Event(), []
    root = browser_root(getattr(p, engine).executable_path)
    sampler = threading.Thread(target=sample_outside, args=(state, halt, root), daemon=True); sampler.start()
    # First browser, no guard and no proxy: the positive control (a deliberate outside connection the sampler must catch), then the canary and the redirect controls.
    b = launch(p, engine)
    state["now"] = "baseline"; time.sleep(1.5)
    c0 = b.new_context(bypass_csp=True); pg = c0.new_page(); pg.goto(a.origin + "/how-we-know/", wait_until="load", timeout=20000)
    state["now"] = "positive"
    # An HTTP fetch here lasts about 100 ms and a sample takes longer, so one fetch can fall between samples: repeat, with gaps, until caught (at most 40 requests).
    seen, caught, tries = "not run", [], 0
    while not caught and tries < 40:
        seen = pg.evaluate("async u => { try { await fetch(u, {mode: 'no-cors', cache: 'no-store'}); return 'sent'; } catch (e) { return 'failed'; } }", f"{POSITIVE_URL}?wt={tries}")
        tries += 1; time.sleep(0.25)
        caught = sorted(l for l in state["sets"].get("positive", set()) - state["sets"].get("baseline", set()) if re.search(r"->\S+:(80|443) ", l))
    state["now"] = None; print("positive control", engine, seen, len(caught), flush=True)
    if not caught:
        failures.append("positive control: the sampler did not catch the deliberate outside connection")
    before = len(hits); ctl = pg.evaluate(attempt, [can, engine + "-noguard"]); pg.wait_for_timeout(500); ctl_hits = hits[before:]; print("canary control", ctl, flush=True)
    for kind in ("fetch", "img", "beacon", "ws"):  # all four: a kind the control cannot hit says nothing when the guarded run shows 0 hits
        if not any(f"/{kind}-" in h for h in ctl_hits):
            failures.append(f"canary control: no {kind} hit without the guard, so the canary cannot speak for it")
    redirect_noguard = {}
    try:
        pg.goto(a.origin + "/redirect-out/", wait_until="load", timeout=15000); redirect_noguard = {"went_to": pg.url}
    except Exception as ex:
        redirect_noguard = {"error": str(ex).splitlines()[0][:160]}
    if "example.com" not in redirect_noguard.get("went_to", ""):
        failures.append("redirect control: without guard or proxy the test page did not reach the outside host, so it proves nothing")
    pg3 = c0.new_page(); pg3.goto(a.origin + "/preconnect/", wait_until="load", timeout=15000); pg3.wait_for_timeout(1000); c0.close(); b.close()
    gone = wait_browser_gone(root)
    if not gone:
        failures.append("the first browser's processes did not exit, so the guarded phase cannot start clean")
    # Second browser, guarded, with the dead-port proxy. Sampled from before launch to after its context closes. pf's log counts what reached the firewall at the dead port.
    pflog = subprocess.Popen(["sudo", "-n", "tcpdump", "-n", "-l", "-e", "-i", "pflog0", "dst", "host", "127.0.0.1", "and", "dst", "port", DEAD_PROXY.rsplit(":", 1)[1]], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    time.sleep(1.5)
    state["now"] = "guarded"
    b = launch(p, engine, a.origin)
    blocked = []; c1 = new_context(b, "phone390", a.origin, blocked, bypass_csp=True); pg = c1.new_page(); pg.goto(a.origin + "/how-we-know/", wait_until="load", timeout=20000)
    before = len(hits); gd = pg.evaluate(attempt, [can, engine + "-guard"]); pg.wait_for_timeout(1000); gd_hits = hits[before:]; print("guarded done", gd, flush=True)
    axe = axe_check(pg, a.axe); sw = pg.evaluate("'serviceWorker' in navigator ? 'present' : 'absent'")
    redirect_guarded = {}
    try:
        r = pg.goto(a.origin + "/redirect-out/", wait_until="load", timeout=8000); redirect_guarded = {"went_to": pg.url, "status": r.status if r else None}
    except Exception as ex:
        redirect_guarded = {"stopped": str(ex).splitlines()[0][:160], "address_after": pg.url}
    if "example.com" in redirect_guarded.get("went_to", "") or "example.com" in redirect_guarded.get("address_after", ""):
        failures.append("guarded: the redirect reached the outside host")
    pg2 = c1.new_page(); pg2.goto(a.origin + "/preconnect/", wait_until="load", timeout=15000); pg2.wait_for_timeout(1500)
    route_saw_redirect_target = any("example.com/wt-redirect" in u for u in blocked)
    c1.close(); state["now"] = None; time.sleep(0.3); b.close(); halt.set(); sampler.join(10)
    subprocess.run(["sudo", "-n", "pkill", "-INT", "-f", "tcpdump -n -l -e -i pflog0 dst host 127.0.0.1"]); drops = [l for l in pflog.communicate(timeout=15)[0].splitlines() if "block" in l]
    guarded_set = sorted(state["sets"].get("guarded", set())); samples = state["samples"].get("guarded", 0)
    if gd_hits:
        failures.append("guarded: the canary was reached")
    if guarded_set:
        failures.append("guarded: outside connections seen from the browser user's processes")
    if samples < 5:
        failures.append(f"guarded: only {samples} samples, too few to mean anything")
    if not any("example.com" in u for u in blocked):
        failures.append("guarded: the outside request was not aborted by the guard")
    if state["errors"]:
        failures.append("sampler errors: " + "; ".join(state["errors"][:3]))
    if not state.get("pids_seen"):
        failures.append("the sampler saw no processes of the browser user, so the browser did not run as _hqbrowser")
    if state.get("no_sandbox_seen"):
        failures.append("the browser ran with --no-sandbox")
    return {"browser_folder": root, "browser_user_uid": BROWSER_UID, "no_sandbox_flag_seen": state.get("no_sandbox_seen", False), "passed": not failures, "failures": failures, "samples_per_phase": state["samples"],
            "processes_started_from_folder": {k: sorted(v) for k, v in state["procs"].items()},
            "positive_control": {"url": POSITIVE_URL, "page_saw": seen, "fetches_until_caught": tries, "connections_caught": caught, "baseline": sorted(state["sets"].get("baseline", set()))},
            "outside_connections_guarded": guarded_set, "first_browser_gone_before_guarded": gone,
            "control_no_guard": {"page_saw": ctl, "canary_hits": ctl_hits, "redirect": redirect_noguard, "outside_connections_seen_unguarded": sorted(state["sets"].get("positive", set()))},
            "guarded": {"page_saw": gd, "canary_hits": gd_hits, "blocked_by_guard": blocked, "redirect": redirect_guarded, "route_guard_saw_redirect_target": route_saw_redirect_target,
                        "pf_drops_at_dead_proxy": len(drops), "pf_drop_lines": drops[:6]},
            "axe_version": axe.get("version"), "axe_error": axe.get("error"), "axe_violations_on_home": len(axe.get("violations", [])), "service_worker_api": sw}


def prove_guard(a):
    # The proof page and the canary share the one port the browser user may reach. The canary is reached as 127.0.0.1, which is not the origin (localhost), so the guard must abort it.
    hits = []
    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.startswith("/redirect-out"):
                self.send_response(302); self.send_header("Location", "http://example.com/wt-redirect"); self.end_headers(); return
            if re.match(r"/(fetch|img|beacon|ws)-", self.path):
                hits.append(self.path); self.send_response(200); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(b"ok"); return
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(PRECONNECT if self.path.startswith("/preconnect") else PAGE)
        def do_POST(self): self.do_GET()
        def log_message(self, *x): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PROOF_PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    a.origin = f"http://localhost:{PROOF_PORT}"
    can = f"http://127.0.0.1:{PROOF_PORT}"
    attempt = """async ([can, tag]) => { const out = {};
      try { await fetch(can + '/fetch-' + tag, {mode: 'no-cors'}); out.fetch = 'sent'; } catch (e) { out.fetch = 'failed'; }
      await new Promise(r => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = can + '/img-' + tag; });
      out.beacon = navigator.sendBeacon(can + '/beacon-' + tag, 'x');
      await new Promise(r => { let w; try { w = new WebSocket(can.replace('http', 'ws') + '/ws-' + tag); w.onopen = w.onerror = w.onclose = () => r(); } catch (e) { r(); } setTimeout(r, 2500); });
      try { await fetch('http://example.com/', {mode: 'no-cors'}); out.example = 'sent'; } catch (e) { out.example = 'failed'; }
      await new Promise(r => setTimeout(r, 800)); return out; }"""
    report = {"origin": a.origin, "canary": can, "prefix_test": {a.origin + ".example.com/": allowed(a.origin + ".example.com/", a.origin), a.origin + "/x": allowed(a.origin + "/x", a.origin), can + "/x": allowed(can + "/x", a.origin)}}
    with sync_playwright() as p:
        for engine in a.engines.split(","):
            report[engine] = prove_engine(p, engine, a, can, hits, attempt)
    srv.shutdown()
    os.makedirs(a.out, exist_ok=True)
    json.dump(report, open(os.path.join(a.out, "guard-proof.json"), "w"), indent=1)
    print(json.dumps(report, indent=1))
    bad = [e for e in a.engines.split(",") if not report[e]["passed"]] or list(report["prefix_test"].values()) != [False, True, False]
    raise SystemExit(1 if bad else 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", default=os.path.join(HERE, "panel.json")); ap.add_argument("--out", required=True); ap.add_argument("--origin", default="http://localhost:8799")
    ap.add_argument("--engines", default="chromium"); ap.add_argument("--personas", default=""); ap.add_argument("--tasks", default=""); ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--model", default="claude-sonnet-5-5"); ap.add_argument("--budget-usd", type=float, default=10.0); ap.add_argument("--patient-prompt")
    ap.add_argument("--prove-guard", action="store_true")
    ap.add_argument("--axe", default=os.path.expanduser("~/ai-hq-data/tools/axe-core/4.14.0/package/axe.min.js"))
    a = ap.parse_args()
    check_origin(a.origin)
    a.out = os.path.abspath(a.out); check_axe_lock(a.axe)
    if a.prove_guard:
        prove_guard(a)
    panel = json.load(open(a.panel))
    system = re.sub(r"\A---.*?---\s*", "", open(a.patient_prompt, encoding="utf8").read(), flags=re.S)
    wanted = set(filter(None, a.personas.split(",")))
    only = set(filter(None, a.tasks.split(",")))
    jobs = []
    spend = Spend(a.budget_usd)
    for engine in a.engines.split(","):
        for persona in panel["personas"]:
            if wanted and persona["id"] not in wanted:
                continue
            p = dict(persona)
            if only:
                p["tasks"] = [t for t in persona["tasks"] if t["id"] in only]
            jobs.append((engine, p, a, spend, system))
    os.makedirs(a.out, exist_ok=True)
    # The whole run is sampled, not only the proof; any outside connection seen from the browser user's processes fails it (exit 3).
    state, halt = {"now": "run", "sets": {}, "samples": {}, "procs": {}, "errors": [], "wait": 0.25}, threading.Event()
    sampler = threading.Thread(target=sample_outside, args=(state, halt, "/Library/Application Support/ai-hq/browser/ms-playwright/"), daemon=True); sampler.start()
    with ThreadPoolExecutor(max_workers=max(1, min(a.workers, 3))) as ex:
        results = [r for rs in ex.map(run_persona, jobs) for r in rs]
    halt.set(); sampler.join(10)
    outside = sorted(state["sets"].get("run", set()))
    json.dump({"samples": state["samples"].get("run", 0), "outside_connections": outside, "sampler_errors": state["errors"][:20], "note": "Sampled while the run lasted: TCP only, the browser user's processes only, a connection between two samples is missed; another job's browser under the same user would show here too."},
              open(os.path.join(a.out, "outside-connections.json"), "w"), indent=1)
    json.dump({"results": results, "spend_usd": round(spend.total, 4), "calls": spend.calls, "model": a.model, "origin": a.origin, "outside_connections": len(outside)}, open(os.path.join(a.out, "results.json"), "w"), indent=1)
    print("spend", round(spend.total, 4), "calls", spend.calls, "samples", state["samples"].get("run", 0), "outside connections", len(outside))
    if outside or state["errors"] or not state["samples"].get("run"):
        print("FAILED: outside connection, sampler error or no samples; see outside-connections.json", file=sys.stderr)
        raise SystemExit(3)


if __name__ == "__main__":
    main()
