// Every Option physician accounts. Talks only to /api/account/* on this site.
// With no backend connected the status call answers 503 and this page shows "Accounts are not open yet" and does
// nothing else. No cookies of its own, no local storage; the session cookie is HttpOnly and set by the server.
// Job 22 (ai-hq projects/platform/accounts/restructure-proposal-2026-11-03.md, approved 2026-11-03): one entry page
// (Sign in, Get started); find yourself by name; one question, one tick, one code; procedures chosen in Your account,
// one attestation each; partial access edits everything but the photo and sits in Likely performs; full access moves
// the card to Confirmed and adds the photo and invitations.
(function () {
  "use strict";
  var box = document.getElementById("acct");
  if (!box) return;
  var closed = document.getElementById("acct-closed");
  var statusEl = document.getElementById("acct-status");
  var out = document.getElementById("acct-out");
  var lede = document.getElementById("acct-lede");
  var STATUS = null;
  var PROC = window.EO_PROCS.short, PROC_LONG = window.EO_PROCS.long;   // site/assets/procedures.js, the shared list
  // Job platform-directory-0009: a procedure with no abbreviation (pelvic) shows its name once, capitalized.
  function PROC_HEAD(k) { return PROC[k].toLowerCase() === PROC_LONG[k].toLowerCase() ? PROC_LONG[k] : PROC[k]; }
  function PROC_SUB(k) { return PROC[k].toLowerCase() === PROC_LONG[k].toLowerCase() ? "" : " " + PROC_LONG[k]; }
  // Job platform-directory-0036: an optional grey line under the name, in the account row only (registry field account_sub).
  var PROC_ROW_SUB = window.EO_PROCS.sub || {};
  function procName(k, extra) {
    return el("span", { "class": "proc-name" }, [el("strong", { text: PROC_HEAD(k) }), el("span", { "class": "muted", text: PROC_SUB(k) }),
      PROC_ROW_SUB[k] ? el("span", { "class": "proc-sub muted", id: "proc-sub-" + k, text: PROC_ROW_SUB[k] }) : null].concat(extra || []));
  }
  var QS = new URLSearchParams(location.search);
  var STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
  var PHOTO_CAP = 2 * 1024 * 1024, PHOTO_EDGE = 1600;
  var WORDS = {
    rate_limited: "Too many tries for now. Please wait and try again later.",
    agree_required: "Please tick the box to continue.",
    invalid: "Please check the highlighted details.",
    npi_not_individual: "That NPI is not an individual's NPI.",
    not_a_physician: "Every Option lists physicians only.",
    code_invalid: "That code is wrong, expired, or already used. Check it, or send a new code.",
    email_in_use: "That email already has an Every Option account. Sign in with it, or use a different email.",
    npi_taken: "This listing already has an account. We will look into it and contact you.",
    invite_invalid: "This invitation has expired, was already used, or was withdrawn. Ask for a new one.",
    invite_limit: "You have no invitations left. A link you withdraw, or one that expires unused, gives its place back.", invite_self: "That is your own NPI.",
    invite_email_fixed: "This invitation is for the email it was sent to.",
    invite_email_own: "Use the login email already on your account.",
    owner_only: "Only the site owner can do this.", owner_day_limit: "That is 100 invitations today, the most in one day. Try again tomorrow.",
    hidden_by_us: "Hidden by Every Option. Write to us to change this.", reconfirm_needed: "Confirm your details first (see below).",
    invite_not_live: "That link was already used, withdrawn, or has expired.", not_found: "We could not find that. Reload the page and try again.",
    not_radiologist: "Invitations are for radiologists for now.",
    street_required: "Each new office needs a street address, such as 100 Main Street, Suite 2.",
    full_needed: "This needs full access.",
    no_npi: "Confirm who you are first.",
    other_browser: "Finish linking Doximity in the same browser you started it in.",
    name_mismatch: "That name does not match the NPI Registry for this NPI. We will look into it.",
    screened: "Some text was not accepted (see below).",
    photo_type: "Use a JPEG, PNG, or WebP photo.", photo_too_large: "That photo is still over 2 MB. Try a smaller one.",
    photo_dimensions: "That photo is too small. Use one at least 100 pixels on each side.",
    photo_unreadable: "We could not read that photo. Try a JPEG or PNG.",
    changed_since: "That changed again later. Undo the newer change first.", already_undone: "Already undone.",
    signed_out: "Please sign in again.", server: "Something went wrong on our side. Please try again."
  };
  var REASONS = { too_long: "too long", link: "a link", email: "an email address", phone: "a phone number",
    patient_story: "what reads as a patient story", promise: "a promise or superlative word (like best, guaranteed, or cure)" };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) n.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  // W32 (ai-hq job platform-launch-0005): the agreement's own words link to the pages they name. Only links are added:
  // the words read the same, and the agreement stored with each attestation (lib/accounts/service.mjs AGREEMENT) stays plain text.
  function agreement(span, text) {
    span.textContent = "";
    String(text || "").split(/(terms of service|privacy policy)/).forEach(function (t) {
      if (t === "terms of service" || t === "privacy policy")
        span.appendChild(el("a", { href: t === "privacy policy" ? "/privacy/" : "/physician-terms/", target: "_blank", rel: "noopener", text: t }));
      else if (t) span.appendChild(document.createTextNode(t));
    });
    return span;
  }
  function say(msg, cls) { statusEl.className = "status " + (cls || ""); statusEl.textContent = msg || ""; if (msg) statusEl.focus(); }
  function hush() { statusEl.className = "status"; statusEl.textContent = ""; }
  // Job platform-directory-0037 (his yes 2026-11-13 22:58 CT, call 7): in Your account, a save, remove, undo or error
  // shows on the line under the button that caused it (each such line is a polite live region, made with the panel),
  // focus stays on that button, and the page does not move. The top line (say) is for page-level events only: sign-in,
  // sign-out, an invitation accepted, Doximity.
  var PENDING = null;   // the message to show after the next redraw: { key, msg, cls, focus (an id), top (px) }
  function msgLine(key) { return el("p", { "class": "act-msg", id: "msg-" + key, "aria-live": "polite" }); }
  function acts(key, kids) { return el("div", { "class": "act-wrap" }, [el("div", { "class": "acct-actions" }, kids), msgLine(key)]); }
  function near(key, msg, cls, undo) {
    var m = document.getElementById("msg-" + key);
    if (!m) return say(msg, cls);
    hush();
    [].forEach.call(out.querySelectorAll(".act-msg"), function (x) { if (x !== m) { x.textContent = ""; x.className = "act-msg"; } });
    m.className = "act-msg " + (cls || "");
    // Set the words a moment after a redraw, so a screen reader hears the new live region change.
    m.textContent = ""; setTimeout(function () {
      m.textContent = msg || "";
      if (undo && undo.fields && undo.fields.length) undoButton(m, key, undo);
      clearOfBars(m);
    }, 60);
  }
  // Job platform-directory-0038 (his call 10, "Yes to all" 2026-11-14 08:43 CT): an Undo button beside a save message,
  // doing what History's Undo does for each edit that save made (the newest edit of each saved field by this account).
  // Focus stays where the doctor is: on the save button, which Undo leaves in place. The button goes at the next action.
  function undoButton(m, key, undo) {
    var b = el("button", { "class": "link undo act-undo", type: "button", id: "undo-" + key, text: "Undo" });
    function gone(ev) {
      if (ev && b.contains(ev.target)) return;
      if (b.parentNode) b.parentNode.removeChild(b);
      ["click", "input", "change"].forEach(function (t) { document.removeEventListener(t, gone, true); });
    }
    b.addEventListener("click", function () {
      busy(b, true);
      api("GET", "edits").then(function (j) {
        var todo = undo.fields.map(function (f) {
          return (j.edits || []).filter(function (e) { return e.field === f && e.by_you && !e.undo_of; })[0];
        }).filter(function (e) { return e && e.undoable; });
        if (!todo.length) { gone(); return near(key, WORDS.already_undone, "err"); }
        var chain = Promise.resolve({ ok: true });
        todo.forEach(function (e) { chain = chain.then(function (r) { return r.ok ? api("POST", "undo", { edit_id: e.id }) : r; }); });
        return chain.then(function (r) {
          gone();
          if (r.ok) saved(key, "Undone.", "ok", undo.focus); else near(key, words(r), "err");
        });
      });
    });
    m.appendChild(document.createTextNode(" "));
    m.appendChild(b);
    setTimeout(function () { ["click", "input", "change"].forEach(function (t) { document.addEventListener(t, gone, true); }); }, 0);
  }
  // Keep a message in sight: above the first-visit notice bar (fixed to the bottom, notice.js) and below the pinned
  // contents bar. The walkthrough of 2026-11-14 saw "Saved." hidden under the notice bar.
  function clearOfBars(m) {
    var r = m.getBoundingClientRect(), bar = document.querySelector(".eo-notice");
    var bottom = window.innerHeight - (bar && bar.offsetHeight ? bar.getBoundingClientRect().height : 0) - 8;
    var top = DOCK && DOCK.classList.contains("is-on") && window.matchMedia("(max-width: 1179px)").matches ? 56 : 8;
    if (r.bottom > bottom) window.scrollBy(0, Math.min(r.bottom - bottom, r.top - top));
    else if (r.top < top) window.scrollBy(0, r.top - top);
  }
  // After a save that redraws the page: show the message where the doctor acted, on the redrawn page.
  function saved(key, msg, cls, focusId, fields) {
    var f = document.getElementById(focusId);
    PENDING = { key: key, msg: msg, cls: cls, focus: focusId, top: f ? f.getBoundingClientRect().top : null, fields: fields };
    return load();
  }
  function showPending() {
    var p = PENDING; PENDING = null;
    if (!p) return;
    var f = document.getElementById(p.focus);
    if (f) {
      if (p.top != null) window.scrollBy(0, f.getBoundingClientRect().top - p.top);   // the button stays where it was
      f.focus({ preventScroll: true });
    }
    near(p.key, p.msg, p.cls, p.fields ? { fields: p.fields, focus: p.focus } : null);
  }
  function setLede(t) { if (lede) { lede.textContent = t || ""; lede.hidden = !t; } }
  function api(method, path, body, type) {
    var o = { method: method, credentials: "same-origin", headers: {} };
    if (body !== undefined) {
      if (type) { o.headers["Content-Type"] = type; o.body = body; }
      else { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    }
    return fetch("/api/account/" + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; });
    }, function () { return { _status: 0, error: "server" }; });
  }
  function words(j) { return j.message || WORDS[j.error] || WORDS.server; }
  function procList(keys) { return keys.map(function (k) { return PROC[k]; }).join(", ").replace(/, ([^,]*)$/, keys.length > 2 ? ", and $1" : " and $1"); }
  function field(id, label, input, hint) {
    return el("div", { "class": "field" }, [el("label", { "for": id }, [label, hint ? el("span", { "class": "hint", text: " " + hint }) : null]), input]);
  }
  function busy(btn, on) { if (btn) { btn.disabled = on; btn.setAttribute("aria-busy", on ? "true" : "false"); } }
  function panel(id, title, kids, cls) {
    return el("section", { "class": "acct-panel" + (cls ? " " + cls : ""), id: id, "aria-labelledby": id + "-h" },
      [title ? el("h2", { id: id + "-h", text: title }) : null].concat(kids));
  }
  function view(nodes, ledeText) {
    if (DOCK) { DOCK.remove(); DOCK = null; }
    out.innerHTML = ""; setLede(ledeText);
    nodes.forEach(function (n) { if (n) out.appendChild(n); });
  }
  function stateSelect(id, value) {
    var s = el("select", { id: id, name: "state", autocomplete: "address-level1" }, [el("option", { value: "", text: "Any state" })]
      .concat(STATES.map(function (x) { return el("option", { value: x, text: x, selected: x === value }); })));
    return s;
  }

  // ---- The code step: replaces the view while the doctor types the code. again() sends a new code.
  function codeStep(email, challenge, done, again, back) {
    var inp = el("input", { id: "c-code", name: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", pattern: "[0-9]{6}", required: true });
    var go = el("button", { type: "submit", text: "Confirm" });
    var f = el("form", { "class": "acct-form", id: "code-form", novalidate: true }, [
      field("c-code", "6-digit code", inp),
      el("p", { "class": "small muted", text: "We sent it to " + email + ". It works once, for one hour. Not there? Check spam." }),
      el("div", { "class": "acct-actions" }, [go,
        again ? el("button", { type: "button", "class": "link", id: "c-again", text: "Send a new code", onclick: function () {
          again().then(function (ch) { if (ch) { challenge = ch; say("New code sent to " + email + ".", "ok"); inp.value = ""; inp.focus(); } });
        } }) : null,
        back ? el("button", { type: "button", "class": "link", id: "c-back", text: "Use a different email", onclick: back }) : null])
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var code = inp.value.replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) { inp.setAttribute("aria-invalid", "true"); return say("Type the 6 digits from the email.", "err"); }
      busy(go, true);
      api("POST", "code", { challenge: challenge, code: code }).then(function (j) {
        busy(go, false);
        if (j.ok) done(j); else { inp.setAttribute("aria-invalid", "true"); say(words(j), "err"); }
      });
    });
    view([panel("code", "Check your email", [f])], null);
    inp.focus();
  }

  // ---- Entry: one clear page, two choices.
  function entry() {
    hush();
    var email = el("input", { id: "l-email", name: "email", type: "email", maxlength: "200", autocomplete: "email", required: true });
    var send = el("button", { type: "submit", id: "l-send", text: "Email me a code" });
    var l = el("form", { "class": "acct-form", id: "login-form", novalidate: true }, [
      field("l-email", "Email", email),
      el("div", { "class": "acct-actions" }, [send,
        STATUS && STATUS.doximity ? el("a", { id: "dox", "class": "btn secondary", href: "/api/account/doximity/start", text: "Sign in with Doximity" }) : null])
    ]);
    function login(addr) {
      return api("POST", "login", { email: addr }).then(function (j) {
        if (j._status !== 202) { say(words(j), "err"); return null; }
        return j.challenge;
      });
    }
    l.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var addr = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) { email.setAttribute("aria-invalid", "true"); email.focus(); return say("Type the email you signed up with.", "err"); }
      busy(send, true);
      login(addr).then(function (ch) {
        busy(send, false);
        if (!ch) return;
        say("If that email has an account, a 6-digit code is on its way.", "ok");
        codeStep(addr, ch, function () { say("You are signed in.", "ok"); load(); }, function () { return login(addr); }, entry);
      });
    });
    view([
      el("div", { "class": "acct-choice" }, [
        panel("start", "New here?", [
          el("p", { text: "Find yourself by name. No NPI needed. Free, and about a minute." }),
          el("div", { "class": "acct-actions" }, [el("button", { type: "button", id: "go-start", text: "Get started", onclick: function () { find(); } })])
        ], "acct-start"),
        panel("signin", "Sign in", [l, el("p", { "class": "small muted", text: "No password. We email you a 6-digit code." })], "acct-signin")
      ]),
      el("p", { "class": "small muted acct-foot" }, ["Lost access to your email? Ask a colleague with full access for a new invitation, or ",
        el("a", { href: "mailto:errors@everyoptionmd.com", text: "email us" }), "."])
    ], "Claim your free listing. Once we confirm the account is yours, your card shows under Confirmed by physician, above Likely performs, for each procedure you confirm, with your photo and whether you see patients by video. Your edits show at once. No one can pay for placement, and we do not send or sell patients.");
  }

  // ---- Find yourself: our listings and the NPI Registry together, by name and state.
  function find(prefill) {
    hush();
    var name = el("input", { id: "f-name", name: "name", maxlength: "80", autocomplete: "name", required: true, value: (prefill && prefill.name) || "" });
    var st = stateSelect("f-state", (prefill && prefill.state) || "");
    var go = el("button", { type: "submit", id: "f-go", text: "Search" });
    var res = el("div", { id: "f-results", "aria-live": "polite" });
    var f = el("form", { "class": "acct-form", id: "find-form", novalidate: true, role: "search" }, [
      el("div", { "class": "row2" }, [field("f-name", "Your name", name, "(first and last)"), field("f-state", "State", st)]),
      el("div", { "class": "acct-actions" }, [go])
    ]);
    function search() {
      var q = name.value.trim();
      if (!/[A-Za-z\u00C0-\u024F]{1,}[\s,]+[A-Za-z\u00C0-\u024F]{2,}/.test(q)) { name.setAttribute("aria-invalid", "true"); name.focus(); return say("Type your first and last name.", "err"); }
      name.removeAttribute("aria-invalid"); hush(); busy(go, true);
      api("GET", "search?name=" + encodeURIComponent(q) + (st.value ? "&state=" + st.value : "")).then(function (j) {
        busy(go, false);
        res.innerHTML = "";
        if (!j.ok) return say(words(j), "err");
        if (j.registry === "unavailable") res.appendChild(el("p", { "class": "notice small", text: "The NPI Registry is not answering right now, so only doctors already on Every Option are shown. Try again soon, or search by NPI." }));
        if (!j.results.length) {
          res.appendChild(el("p", { "class": "small", id: "f-none", text: "No physician found with that name" + (st.value ? " in " + st.value : "") + ". Check the spelling" + (st.value ? ", try any state," : "") + " or search by NPI." }));
          return;
        }
        res.appendChild(el("p", { "class": "small muted", text: "Tap your name." }));
        res.appendChild(el("ul", { "class": "pick" }, j.results.map(function (p) {
          var where = [p.city && titleCase(p.city), p.state].filter(Boolean).join(", ");
          return el("li", null, [el("button", { type: "button", "class": "pick-row", "data-npi": p.npi, onclick: function () { signupFor(p.npi); } }, [
            el("span", { "class": "pick-name", text: titleCase(p.name) + (p.credential ? ", " + p.credential.replace(/\./g, "") : "") }),
            el("span", { "class": "pick-meta", text: [where, p.specialty].filter(Boolean).join(" · ") }),
            p.listed_for.length ? el("span", { "class": "pick-listed", text: "On Every Option for " + procList(p.listed_for) }) : null
          ])]);
        })));
        if (j.more) res.appendChild(el("p", { "class": "small muted", text: "More matches than shown. Add your state to narrow it." }));
      });
    }
    f.addEventListener("submit", function (ev) { ev.preventDefault(); search(); });
    var npi = el("input", { id: "f-npi", name: "npi", inputmode: "numeric", maxlength: "10", pattern: "[0-9]{10}" });
    var byNpi = el("form", { "class": "acct-form", id: "npi-form", novalidate: true, hidden: true }, [
      field("f-npi", "NPI", npi, "(10 digits)"),
      el("div", { "class": "acct-actions" }, [el("button", { type: "submit", "class": "secondary", text: "Continue" })])
    ]);
    byNpi.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = npi.value.replace(/\D/g, "");
      if (!/^\d{10}$/.test(v)) { npi.setAttribute("aria-invalid", "true"); npi.focus(); return say("An NPI has 10 digits.", "err"); }
      signupFor(v);
    });
    view([panel("find", "Find yourself", [f, res,
      el("div", { "class": "acct-actions acct-alt" }, [
        el("button", { type: "button", "class": "link", id: "f-by-npi", text: "Search by NPI instead", onclick: function () { byNpi.hidden = false; npi.focus(); this.hidden = true; } }),
        el("button", { type: "button", "class": "link", id: "f-back", text: "Back", onclick: entry })]),
      byNpi])], "We search Every Option and the national NPI Registry. Only public registry details are shown.");
    if (prefill && prefill.name) search(); else name.focus();
  }
  function titleCase(s) {
    return String(s || "").toLowerCase().replace(/(^|[\s\-'])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }

  // ---- Sign up for one NPI: one question, one email, one tick, one code.
  function signupFor(npi) {
    hush();
    return api("GET", "lookup?npi=" + npi).then(function (j) {
      if (!j.ok) { say(words(j), "err"); return; }
      var who = el("div", { "class": "who-box", id: "s-who" }, [
        el("p", { "class": "who-name" }, [el("strong", { text: j.name }), el("span", { "class": "muted", text: " · NPI " + j.npi })]),
        el("p", { "class": "small", text: j.listed_for.length ? "On Every Option for " + procList(j.listed_for) + "." : "Not on Every Option yet. Signing up adds you." }),
        j.held ? el("p", { "class": "small", id: "s-held", text: "This listing already has an account. If it is yours, carry on: after the code, confirm who you are and the listing moves to you." }) : null,
        el("button", { type: "button", "class": "link", id: "s-not-me", text: "Not you? Search again", onclick: function () { find(); } })
      ]);
      var yes = el("input", { type: "radio", name: "ir", value: "yes", id: "s-ir-yes" });
      var no = el("input", { type: "radio", name: "ir", value: "no", id: "s-ir-no" });
      var q = el("fieldset", { id: "s-ir" }, [el("legend", { text: "Are you an interventional radiologist?" }),
        el("div", { "class": "checks" }, [el("label", { "for": "s-ir-yes" }, [yes, "Yes"]), el("label", { "for": "s-ir-no" }, [no, "No"])])]);
      var other = el("input", { id: "s-other", name: "specialty_other", maxlength: "100" });
      var otherWrap = el("div", { id: "s-other-wrap", hidden: true }, [field("s-other", "Your specialty", other, "(optional)"),
        el("p", { "class": "small muted", text: "Every Option lists interventional radiologists for now. We will add you to the waitlist." })]);
      var email = el("input", { id: "s-email", name: "email", type: "email", maxlength: "200", autocomplete: "email", required: true });
      var agree = el("input", { type: "checkbox", name: "agree", id: "s-agree", required: true });
      var agreeText = agreement(el("span", { id: "s-agree-text" }), j.agreement);
      var agreeRow = el("label", { "class": "agree", "for": "s-agree" }, [agree, agreeText]);
      var why = el("p", { "class": "err small", id: "why-agree" });
      var send = el("button", { type: "submit", id: "s-send", text: "Email me a code" });
      var rest = el("div", { id: "s-rest", "class": "acct-form-rest" }, [field("s-email", "Email", email, "(one you'll keep; personal is fine)"), agreeRow, why]);
      var s = el("form", { "class": "acct-form", id: "signup-form", novalidate: true }, [q, otherWrap, rest,
        el("div", { "class": "acct-actions" }, [send])]);
      function stated() { return yes.checked ? "ir" : no.checked ? "other" : ""; }
      q.addEventListener("change", function () {
        var notIr = no.checked;
        otherWrap.hidden = !notIr; q.removeAttribute("aria-invalid");
        agreement(agreeText, notIr ? "I am the physician with this NPI. I accept the Every Option terms of service and privacy policy." : j.agreement);
        send.textContent = notIr ? "Join the waitlist" : "Email me a code";
      });
      function signup(addr) {
        return api("POST", "signup", { npi: j.npi, email: addr, specialty: stated(), specialty_other: other.value.trim(), agree: agree.checked });
      }
      s.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var addr = email.value.trim();
        why.textContent = "";
        if (!stated()) { q.setAttribute("aria-invalid", "true"); yes.focus(); return say("Please answer yes or no.", "err"); }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) { email.setAttribute("aria-invalid", "true"); email.focus(); return say("Please check your email address.", "err"); }
        email.removeAttribute("aria-invalid");
        if (!agree.checked) { why.textContent = "Please tick this box to continue."; agree.setAttribute("aria-invalid", "true"); agree.focus(); return; }
        agree.removeAttribute("aria-invalid");
        busy(send, true);
        signup(addr).then(function (r) {
          busy(send, false);
          if (r._status !== 202) return say(words(r), "err");
          if (r.waitlist) { view([panel("waitlist", "You are on the waitlist", [el("p", { text: r.message })])], null); return say("", ""); }
          say(r.npi_taken ? r.message : "We sent a 6-digit code to " + addr + ".", "ok");
          codeStep(addr, r.challenge, function (c) {
            say(c.claimant ? "Email confirmed. Now confirm who you are to take over this listing." :
              "You are in. Next, choose the procedures you perform.", "ok");
            load();
          }, function () { return signup(addr).then(function (x) { return x._status === 202 ? x.challenge : (say(words(x), "err"), null); }); },
          function () { signupFor(j.npi); });
        });
      });
      view([panel("signup", "Make your account", [who, s])], null);
      yes.focus();
    });
  }

  // ---- An invitation: the doctor's listing, a login email and its code, one agreement. Procedures come after, in Your
  // account. Job platform-launch-0009: nothing is made until the code is right; a published-email invitation keeps
  // the address it was sent to.
  function invitation(tok) {
    return api("POST", "invite/preview", { token: tok }).then(function (pv) {
      // Job platform-launch-0010: the sign-in page first, then the message (entry() clears the status line, so a dead
      // link used to land on a blank sign-in page with no word of why).
      if (!pv.ok) { entry(); say(words(pv), "err"); return; }
      var fixed = !!pv.email;
      var email = el("input", { id: "i-email", name: "email", type: "email", maxlength: "200", autocomplete: "email", required: true });
      if (fixed) { email.value = pv.email; email.readOnly = true; }
      var agree = el("input", { type: "checkbox", name: "agree", id: "i-agree" });
      var go = el("button", { type: "submit", id: "i-send", text: "Email me a code" });
      var f = el("form", { "class": "acct-form", id: "invite-form", novalidate: true }, [
        el("div", { "class": "who-box" }, [el("p", { "class": "who-name" }, [el("strong", { text: pv.name }), el("span", { "class": "muted", text: " · NPI " + pv.npi })]),
          el("p", { "class": "small", text: pv.listed_for.length ? "On Every Option for " + procList(pv.listed_for) + "." : "Not on Every Option yet; accepting adds you." }),
          el("p", { "class": "small", id: "i-level", text: pv.level === "full" ? "This invitation gives full access: your card shows as confirmed by physician once you choose your procedures." : "This invitation gives partial access." })]),
        field("i-email", "Login email", email, fixed ? "(the address this invitation was sent to)" : "(one you'll keep; personal is fine)"),
        el("p", { "class": "small muted", id: "i-email-note", text: fixed ? "We send it a 6-digit code." : "Enter an email you'll keep. We send it a 6-digit code." }),
        el("label", { "class": "agree", "for": "i-agree" }, [agree, agreement(el("span"), pv.agreement)]),
        el("div", { "class": "acct-actions" }, [go])
      ]);
      function accept(addr) { return api("POST", "invite/accept", { token: tok, agree: true, email: addr }); }
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var addr = email.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) { email.setAttribute("aria-invalid", "true"); email.focus(); return say("Please check your email address.", "err"); }
        email.removeAttribute("aria-invalid");
        if (!agree.checked) { agree.setAttribute("aria-invalid", "true"); agree.focus(); return say("Please tick the box to continue.", "err"); }
        agree.removeAttribute("aria-invalid");
        busy(go, true);
        accept(addr).then(function (j) {
          busy(go, false);
          if (j._status !== 202) return say(words(j), "err");
          say("We sent a 6-digit code to " + j.email + ".", "ok");
          codeStep(j.email, j.challenge, function () {
            say("You are in. Next, choose the procedures you perform.", "ok");
            load();
          }, function () { return accept(addr).then(function (x) { return x._status === 202 ? x.challenge : (say(words(x), "err"), null); }); },
          fixed ? null : function () { invitation(tok); });
        });
      });
      view([panel("invite", "Your invitation", [f])], null);
    });
  }

  // ================= Your account =================
  function levelName(a) { return a.level === "full" ? "Full access" : "Partial access"; }

  function cardPreview(me) {
    var a = me.account, p = me.profile || {}, done = p.attested || [];
    var o = (p.offices || [])[0] || null;
    var full = a.level === "full";
    var kids = [];
    if (full && done.length) {
      var tags = el("div", { "class": "card-tags" }, [el("p", { "class": "confirmed-tag", text: "✓ Confirmed by physician" })]);
      if (window.EO_TELE) tags.insertAdjacentHTML("beforeend", window.EO_TELE.teleBadge(p.telehealth));
      kids.push(tags);
    }
    var img = full && p.photo_key ? el("img", { "class": "photo", src: "/api/account/photo?v=" + encodeURIComponent(p.photo_key.slice(-12)), alt: "", width: "64", height: "64" }) : null;
    kids.push(el("div", { "class": "top" }, [img, el("div", { "class": "who" }, [el("h3", { text: (me.names && me.names.shown) || a.name }),
      el("span", { "class": "badge", text: "Interventional radiologist" })])]));
    if (!full && done.length) kids.push(el("p", { "class": "confirm-office small muted", text: "Details not confirmed by this doctor. Check with the office before you go." }));
    if (o) kids.push(el("p", { "class": "where" }, [o.practice ? el("span", { "class": "practice", text: o.practice }) : null, o.practice ? el("br") : null,
      o.street ? o.street : null, o.street ? el("br") : null, o.city + ", " + o.state]));
    else kids.push(el("p", { "class": "where muted", text: me.listed_for.length ? "Location from your public listing" : "No office yet" }));
    if (p.blurbs && done.length && p.blurbs[done[0]]) kids.push(el("p", { "class": "blurb", text: p.blurbs[done[0]] }));
    var ins = (p.insurances || []).slice(); if (p.insurance_other) ins.push(p.insurance_other);
    if (ins.length || p.insurance_confirm) kids.push(el("p", { "class": "ins" }, [el("span", { "class": "k", text: "Insurance: " }),
      ins.join(", ") + (ins.length && p.insurance_confirm ? ". " : ""), p.insurance_confirm ? "Confirm with the office." : ""]));
    var acts = [];
    if (o && o.phone) acts.push(el("span", { "class": "call", text: "Call " + o.phone.replace(/^(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") }));
    if (p.booking_url) acts.push(el("span", { "class": "book", text: "Website" }));
    if (acts.length) kids.push(el("div", { "class": "actions" }, acts));
    return el("div", { "class": "card preview" + (full && done.length ? " card-confirmed" : ""), "aria-label": "Preview of your card" }, kids);
  }

  function seeLine(me) {
    var a = me.account, done = (me.profile && me.profile.attested) || [];
    if (me.hide && me.hide.hidden) return "Your profile is hidden. Patients cannot find you on Every Option.";
    if (!done.length) return me.listed_for.length
      ? "Your public listing still shows under Likely performs for " + procList(me.listed_for) + ". Choose your procedures below to add your own details to it."
      : "You are not on any procedure list yet. Choose the procedures you perform below.";
    return (a.level === "full" ? "Shown under Confirmed by physician for " : "Shown under Likely performs for ") + procList(done) + ".";
  }

  function seePanel(me) {
    var done = (me.profile && me.profile.attested) || [];
    return panel("see", "How patients see you", [
      el("p", { "class": "see-line" + (done.length ? "" : " need"), id: "see-line", text: seeLine(me) }),
      cardPreview(me),
      el("p", { "class": "small muted", text: "Saved changes show in patient searches within about a minute." })
    ]);
  }

  // ---- Job platform-web-design-0018 (his B, HQ chat 2026-11-16 18:57 CT; go 19:07 CT): degree from a fixed list and an
  // optional first name the doctor goes by. The last name comes from the NPI Registry and is not editable here.
  function namePanel(me) {
    var a = me.account, p = me.profile || {}, n = me.names || {};
    var deg = el("select", { id: "n-degree", name: "degree" }, [el("option", { value: "",
      text: "As in the NPI Registry" + (n.registry_degree ? " (" + n.registry_degree + ")" : " (no degree shown)"), selected: !p.degree })]
      .concat((n.degrees || []).map(function (d) { return el("option", { value: d, text: d, selected: p.degree === d }); })));
    var gb = el("input", { id: "n-goes-by", name: "goes_by", maxlength: "30", autocomplete: "given-name", value: p.goes_by || "" });
    var save = el("button", { type: "submit", id: "name-save", text: "Save name" });
    var rq = "?npi=" + encodeURIComponent(a.npi) + "&name=" + encodeURIComponent(a.name);
    var f = el("form", { "class": "acct-form", id: "name-form", novalidate: true }, [
      field("n-degree", "Degree", deg),
      field("n-goes-by", "First name you go by", gb, "(optional) Leave blank to use " + (n.registry_first ? n.registry_first + ", " : "") +
        "your first name in the NPI Registry. Letters, spaces, hyphens, and apostrophes only."),
      acts("name", [save])]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = gb.value.replace(/\s+/g, " ").trim();
      if (v && (v.length > 30 || !/^\p{L}[\p{L}\p{M} '\u2018\u2019\u02bc\-]*$/u.test(v) || /['\u2018\u2019\u02bc\-]$/.test(v))) {
        gb.setAttribute("aria-invalid", "true"); gb.focus();
        return near("name", "Use only letters, spaces, hyphens, and apostrophes, up to 30 characters. Start with a letter, and do not end with a hyphen or apostrophe.", "err");
      }
      gb.removeAttribute("aria-invalid"); busy(save, true);
      api("PUT", "profile", { degree: deg.value, goes_by: v }).then(function (j) {
        busy(save, false);
        if (j.ok) saved("name", j.changed.length ? "Saved." : "No changes.", "ok", "name-save", j.changed);
        else near("name", j.error === "invalid" ? "Use only letters, spaces, hyphens, and apostrophes, up to 30 characters. Start with a letter, and do not end with a hyphen or apostrophe." : words(j), "err");
      });
    });
    return panel("name-panel", "Your name", [
      el("p", { "class": "name-shown", id: "name-shown" }, ["Patients will see your name as ", el("strong", { text: n.shown || a.name }), "."]),
      el("p", { "class": "small muted", id: "name-last" }, ["Your last name is the one the NPI Registry showed when you signed up. If it has changed, ",
        el("a", { href: "https://nppes.cms.hhs.gov/", rel: "noopener", target: "_blank", text: "update your NPI record" }), " first, then ",
        el("a", { href: "/report/" + rq, text: "tell us on the report form" }), " (choose Something else and give your new last name) so we can update it here."]),
      f]);
  }

  function procPanel(me) {
    var p = me.profile || {}, done = p.attested || [];
    var rows = Object.keys(PROC).map(function (k) {
      var on = done.indexOf(k) >= 0;
      if (on) {
        var t = el("textarea", { id: "b-" + k, name: "blurb_" + k, rows: "3", maxlength: "300" }); t.value = (p.blurbs || {})[k] || "";
        var count = el("span", { "class": "hint", text: t.value.length + " / 300" });
        t.addEventListener("input", function () { count.textContent = t.value.length + " / 300"; });
        var saveNote = el("button", { type: "button", "class": "secondary", id: "b-save-" + k, text: "Save note", onclick: function () {
          var blurbs = Object.assign({}, p.blurbs || {}); blurbs[k] = t.value;
          var why = document.getElementById("why-b-" + k); why.textContent = "";
          busy(saveNote, true);
          api("PUT", "profile", { blurbs: blurbs }).then(function (j) {
            busy(saveNote, false);
            if (j.ok) return saved("note-" + k, j.changed.length ? "Note saved." : "No changes.", "ok", "b-save-" + k, j.changed);
            if (j.error === "screened" && j.blocked.blurbs && j.blocked.blurbs[k]) why.textContent = "Not accepted: this has " + j.blocked.blurbs[k].map(function (r) { return REASONS[r] || r; }).join(" and ") + ".";
            near("note-" + k, words(j), "err");
          });
        } });
        return el("li", { "class": "proc on", id: "proc-" + k }, [
          el("div", { "class": "proc-head" }, [procName(k, [el("span", { "class": "proc-state", text: "✓ You perform this" })])]),
          el("details", { "class": "proc-note", id: "pnote-" + k, open: !!t.value }, [el("summary", { id: "pnote-s-" + k, text: t.value ? "Your note" : "Add a note for patients" }),
            el("label", { "for": "b-" + k }, ["Note for " + PROC[k] + " ", count]), t, el("p", { "class": "err small", id: "why-b-" + k }),
            acts("note-" + k, [saveNote])]),
          el("button", { type: "button", "class": "link remove", id: "remove-" + k, "data-proc": k, text: "Remove " + PROC[k], onclick: function () {
            if (!window.confirm("Remove " + PROC[k] + " from your account? You can add it again any time.")) return;
            api("POST", "withdraw", { procedure: k }).then(function (j) { if (j.ok) saved("proc-" + k, PROC[k] + " removed.", "ok", "add-" + k); else near("proc-" + k, words(j), "err"); });
          } }),
          msgLine("proc-" + k)
        ]);
      }
      var stmt = el("div", { "class": "attest", hidden: true }, [
        el("p", { "class": "attest-text", text: me.attest_wording[k] }),
        el("div", { "class": "acct-actions" }, [el("button", { type: "button", id: "attest-" + k, text: "Confirm and add", onclick: function () {
          var b = this; busy(b, true);
          api("POST", "attest", { procedures: [k], agree: true }).then(function (j) {
            busy(b, false);
            if (j.ok) saved("proc-" + k, PROC[k] + " added.", "ok", "pnote-s-" + k); else near("proc-" + k, words(j), "err");
          });
        } }), el("button", { type: "button", "class": "link", text: "Cancel", onclick: function () { stmt.hidden = true; add.hidden = false; add.focus(); } })])
      ]);
      var add = el("button", { type: "button", "class": "secondary add", id: "add-" + k, "data-proc": k, text: "Add", "aria-label": "Add " + PROC[k], onclick: function () { add.hidden = true; stmt.hidden = false; stmt.querySelector("button").focus(); } });
      return el("li", { "class": "proc", id: "proc-" + k }, [
        el("div", { "class": "proc-head" }, [procName(k), add]),
        stmt, msgLine("proc-" + k)]);
    });
    return panel("procs", "Procedures", [
      el("p", { "class": "small muted", text: "Add each procedure you personally perform. Adding one records your statement that you perform it. Notes: no links, phone numbers, or patient stories, and no words like best, guaranteed, or cure." }),
      el("ul", { "class": "procs" }, rows), alsoForm(p)]);
  }

  // Job platform-directory-0036 (his words, 2026-11-13: "a ton of other procedures as a separate check box (labeled not
  // added yet or something)"): private ticks for procedures not on the site yet. They list nobody and attest nothing;
  // the list is content/upcoming-procedures.json (site/assets/upcoming.js). One Save for the section.
  function alsoForm(p) {
    var groups = (window.EO_UPCOMING && window.EO_UPCOMING.groups) || [];
    if (!groups.length) return null;
    var ticked = p.also_performs || [];
    var other = el("input", { id: "a-other", name: "also_performs_other", maxlength: "120", autocomplete: "off" }); other.value = p.also_performs_other || "";
    var why = el("p", { "class": "err small", id: "why-a-other" });
    var save = el("button", { type: "submit", id: "also-save", text: "Save other procedures" });
    var folds = groups.map(function (g, gi) {
      var n = el("span", { "class": "also-n", id: "also-n-" + gi });
      var boxes = g.items.map(function (it) {
        return el("label", { "class": "also-item" }, [
          el("input", { type: "checkbox", name: "also_performs", value: it.slug, id: "a-" + it.slug, checked: ticked.indexOf(it.slug) >= 0 }),
          el("span", null, [el("span", { "class": "also-name", text: it.name }), el("span", { "class": "also-for muted", text: it["for"] })])]);
      });
      var d = el("details", { "class": "also-group", id: "also-g-" + gi }, [el("summary", null, [el("span", { text: g.name }), n]),
        el("div", { "class": "also-list" }, boxes)]);
      function count() {
        var c = d.querySelectorAll('input[name="also_performs"]:checked').length;
        n.textContent = c ? c + " ticked" : "";
      }
      d.addEventListener("change", count); count();
      return d;
    });
    var f = el("form", { "class": "acct-form sub also", id: "also-form", novalidate: true, "aria-labelledby": "also-h" }, [
      el("h3", { id: "also-h", text: "Other procedures you perform (not on the site yet)" }),
      el("p", { "class": "small muted", id: "also-line", text: "Private. This does not list you and does not add a procedure to your listing. It tells us what to add next. When one goes live, we will ask you to confirm it." }),
      el("div", { "class": "also-groups" }, folds),
      field("a-other", "Something else", other, "(optional)"), why,
      acts("also", [save])]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); why.textContent = ""; other.removeAttribute("aria-invalid"); busy(save, true);
      api("PUT", "profile", { also_performs: [].slice.call(f.querySelectorAll('input[name="also_performs"]:checked')).map(function (x) { return x.value; }),
        also_performs_other: other.value.trim() }).then(function (j) {
        busy(save, false);
        if (j.ok) return saved("also", j.changed.length ? "Saved." : "No changes.", "ok", "also-save", j.changed);
        if (j.error === "screened" && j.blocked && j.blocked.also_performs_other) {
          why.textContent = "Not accepted: this has " + j.blocked.also_performs_other.map(function (r) { return REASONS[r] || r; }).join(" and ") + ".";
          other.setAttribute("aria-invalid", "true");
        }
        near("also", words(j), "err");
      });
    });
    return f;
  }

  function officePanel(me) {
    var p = me.profile || {};
    var offs = el("div", { id: "offices" });
    var list = (p.offices && p.offices.length ? p.offices : [{}]);
    function officeRow(o, i) {
      function f(name, label, attrs) {
        var inp = el("input", Object.assign({ id: "o" + i + "-" + name, name: name }, attrs || {})); inp.value = o[name] || "";
        return field("o" + i + "-" + name, label, inp);
      }
      var st = stateSelect("o" + i + "-state", o.state || ""); st.firstChild.textContent = "State";
      return el("fieldset", { "class": "office" }, [el("legend", { text: i === 0 ? "Main office" : "Office " + (i + 1) }),
        f("practice", "Practice name", { maxlength: "120", autocomplete: "organization" }), f("street", "Street address", { maxlength: "120", autocomplete: "street-address" }),
        f("city", "City", { maxlength: "60", autocomplete: "address-level2" }),
        el("div", { "class": "row3" }, [field("o" + i + "-state", "State", st), f("zip", "ZIP", { maxlength: "5", inputmode: "numeric", autocomplete: "postal-code" })]),
        f("phone", "Office phone", { maxlength: "20", inputmode: "tel", autocomplete: "tel" })]);
    }
    list.forEach(function (o, i) { offs.appendChild(officeRow(o, i)); });
    var book = el("input", { id: "p-book", name: "booking_url", type: "url", maxlength: "300", placeholder: "https://", inputmode: "url" }); book.value = p.booking_url || "";
    var save = el("button", { type: "submit", id: "office-save", text: "Save offices" });
    var f = el("form", { "class": "acct-form", id: "office-form", novalidate: true }, [offs,
      el("div", null, [el("button", { "class": "link", type: "button", id: "add-office", text: "+ Add another office", onclick: function () {
        var n = offs.querySelectorAll("fieldset.office").length; if (n < 5) offs.appendChild(officeRow({}, n)); if (n + 1 >= 5) this.hidden = true; } })]),
      field("p-book", "Website or booking link", book, "(optional)"),
      acts("offices", [save])]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var bad = [];
      var offices = [].slice.call(offs.querySelectorAll("fieldset.office")).map(function (fs) {
        var g = function (n) { return fs.querySelector('[name="' + n + '"]').value.trim(); };
        var o = { practice: g("practice"), street: g("street"), city: g("city"), state: g("state").toUpperCase(), zip: g("zip"), phone: g("phone") };
        var used = o.practice || o.street || o.city || o.zip || o.phone, digits = o.phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
        [["city", used && !o.city], ["state", used && !/^[A-Z]{2}$/.test(o.state)], ["zip", used && !/^\d{5}$/.test(o.zip)],
          ["phone", o.phone && digits.length !== 10]].forEach(function (c) {
          var inp = fs.querySelector('[name="' + c[0] + '"]');
          if (c[1]) { inp.setAttribute("aria-invalid", "true"); bad.push(inp); } else inp.removeAttribute("aria-invalid");
        });
        return o;
      }).filter(function (o) { return o.practice || o.street || o.city || o.zip || o.phone; });
      var link = book.value.trim();
      if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
      if (link && !/^https:\/\/[^\s/]+\.[^\s/]+/i.test(link)) { book.setAttribute("aria-invalid", "true"); bad.push(book); } else book.removeAttribute("aria-invalid");
      if (bad.length) { near("offices", "Please check the highlighted details.", "err"); bad[0].focus(); return; }
      busy(save, true);
      api("PUT", "profile", { offices: offices, booking_url: link }).then(function (j) {
        busy(save, false);
        if (j.ok) {
          var miss = (j.unmatched || []).map(function (i) { var o = offices[i] || {}; return o.practice || o.street || "one office"; });
          return saved("offices", miss.length ? (j.changed.length ? "Saved. " : "") + "We couldn't find the street address for " + miss.join(" and ") +
            " on the map, so patients see the distance to the center of that office's ZIP code instead. Check the address, or leave it as it is." : j.changed.length ? "Saved." : "No changes.", "ok", "office-save", j.changed);
        }
        var rows = [].slice.call(offs.querySelectorAll("fieldset.office")).filter(function (fs) {
          return [].some.call(fs.querySelectorAll("input"), function (x) { return x.value.trim(); }); }), first = null;
        if (j.error === "street_required") (j.offices || []).forEach(function (i) {
          var s = rows[i] && rows[i].querySelector('[name="street"]'); if (s) { s.setAttribute("aria-invalid", "true"); first = first || s; } });
        if (j.error === "invalid" && (j.fields || []).indexOf("booking_url") >= 0) { book.setAttribute("aria-invalid", "true"); first = first || book; }
        near("offices", j.error === "invalid" && first === book ? "Please check the website link. It should start with https://." : words(j), "err");
        if (first) first.focus();
      });
    });
    return panel("offices-panel", "Offices and phone", [
      el("p", { "class": "small muted", text: "Patients see your closest office to them, with each office listed on your card. We email you when these change." }), f]);
  }

  // Job platform-directory-0007: video visits. Any holder saves it; only a Confirmed card shows it. The states start
  // from the doctor's office states the first time it is switched on; each can be added or removed.
  function telePanel(me) {
    var T = window.EO_TELE, p = me.profile || {}, full = me.account.level === "full";
    var saved = (T && T.cleanTelehealth(p.telehealth)) || { offers: null, states: [] };
    var on = saved.offers === true, states = saved.states.slice(), everOn = on || states.length > 0;
    var sw = el("button", { type: "button", id: "tele-on", "class": "tele-filter", role: "switch", "aria-checked": on ? "true" : "false",
      "aria-describedby": "tele-help" }, [el("span", { "class": "tele-switch", "aria-hidden": "true" }), "I offer video visits"]);
    var chips = el("ul", { "class": "tele-chips", id: "tele-chips", "aria-label": "States where you can see patients" });
    var pick = el("select", { id: "tele-add", name: "tele_add" });
    var addBtn = el("button", { type: "button", "class": "secondary", id: "tele-add-btn", text: "Add state" });
    var where = el("div", { "class": "tele-where", id: "tele-where", hidden: !on }, [
      el("p", { "class": "k", id: "tele-states-h", text: "States where you can see a patient by video or phone" }), chips,
      el("div", { "class": "tele-add" }, [field("tele-add", "Add a state", pick), addBtn])]);
    var save = el("button", { type: "button", id: "tele-save", text: "Save video visits" });
    function drawStates() {
      chips.innerHTML = "";
      states.forEach(function (x) {
        chips.appendChild(el("li", null, [el("button", { type: "button", "class": "tele-chip", "aria-label": "Remove " + x, onclick: function () {
          var i = states.indexOf(x); states.splice(i, 1); drawStates();
          var next = chips.querySelectorAll("button")[Math.min(i, states.length - 1)]; (next || pick).focus();
        } }, [x, el("span", { "class": "tele-x", "aria-hidden": "true", text: "\u00d7" })])]));
      });
      if (!states.length) chips.appendChild(el("li", { "class": "muted small", text: "No states yet. Add each state where you are licensed." }));
      pick.innerHTML = "";
      pick.appendChild(el("option", { value: "", text: "Choose a state" }));
      (T ? T.TELE_STATES : []).filter(function (x) { return states.indexOf(x) < 0; }).sort()
        .forEach(function (x) { pick.appendChild(el("option", { value: x, text: x })); });
    }
    addBtn.addEventListener("click", function () {
      var x = pick.value; if (!x) { pick.focus(); return; }
      if (states.indexOf(x) < 0) states.push(x);
      states = T.TELE_STATES.filter(function (s) { return states.indexOf(s) >= 0; });
      drawStates(); pick.focus();
    });
    sw.addEventListener("click", function () {
      on = !on; sw.setAttribute("aria-checked", on ? "true" : "false"); where.hidden = !on;
      if (on && !everOn && !states.length) {          // first time on: the office states
        (p.offices || []).forEach(function (o) { if (o.state && T.TELE_STATES.indexOf(o.state) >= 0 && states.indexOf(o.state) < 0) states.push(o.state); });
        states = T.TELE_STATES.filter(function (s) { return states.indexOf(s) >= 0; });
        drawStates();
      }
      everOn = everOn || on;
    });
    save.addEventListener("click", function () {
      if (on && !states.length) { near("tele", "Add at least one state where you can see patients by video.", "err"); pick.focus(); return; }
      busy(save, true);
      api("PUT", "profile", { telehealth: { offers: on, states: states } }).then(function (j) {
        busy(save, false);
        if (j.ok) return saved("tele", j.changed.length ? "Video visits saved." : "No changes.", "ok", "tele-save", j.changed);
        near("tele", words(j), "err");
      });
    });
    drawStates();
    return panel("tele-panel", "Video visits", [
      el("p", { "class": "small muted", id: "tele-help", text: "Do you see patients by video or phone? Patients can look for doctors who do. Add each state where you are licensed to see a patient." }),
      el("div", { "class": "tele-row" }, [sw, full ? null : el("p", { "class": "tele-partial small", id: "tele-partial",
        text: "Saved now; patients see it once you have full access." })]),
      where, acts("tele", [save])]);
  }

  // Phone photos are often 3 to 12 MB, sideways in their raw pixels, or HEIC. The browser decodes the photo (turned the
  // right way up), shrinks it to at most 1600 pixels on its long side, and saves a JPEG under 2 MB. The server keeps its
  // own 2 MB limit and its checks. A file the browser cannot decode gets a plain message.
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { ok(img); setTimeout(function () { URL.revokeObjectURL(url); }, 0); };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error("unreadable")); };
      img.src = url;
    });
  }
  function shrink(file) {
    return decode(file).then(function (src) {
      var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
      if (!w || !h) throw new Error("unreadable");
      if (w < 100 || h < 100) { var e = new Error("small"); e.small = true; throw e; }
      var k = Math.min(1, PHOTO_EDGE / Math.max(w, h));
      var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
      var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
      if (src.close) src.close();
      function encode(q) {
        return new Promise(function (ok) { c.toBlob(ok, "image/jpeg", q); }).then(function (b) {
          if (!b) throw new Error("unreadable");
          if (b.size <= PHOTO_CAP - 65536 || q <= 0.5) return b;
          return encode(Math.round((q - 0.1) * 10) / 10);
        });
      }
      return encode(0.86);
    });
  }

  function photoPanel(me) {
    var a = me.account, p = me.profile || {};
    if (a.level !== "full") return panel("photo-panel", "Photo", [
      el("p", { "class": "small", id: "photo-locked", text: "A photo comes with full access, once we know it is you (see Access below)." })]);
    var inp = el("input", { id: "photo", type: "file", accept: "image/*", "class": "sr", tabindex: "-1" });
    var pick = el("button", { type: "button", id: "photo-pick", text: p.photo_key ? "Replace photo" : "Choose photo", onclick: function () { inp.click(); } });
    var img = p.photo_key ? el("img", { "class": "photo-big", id: "photo-now", src: "/api/account/photo?v=" + encodeURIComponent(p.photo_key.slice(-12)), alt: "Your current photo", width: "120", height: "120" })
      : el("div", { "class": "photo-big empty", id: "photo-now", "aria-hidden": "true" });
    inp.addEventListener("change", function () {
      var file = inp.files && inp.files[0]; if (!file) return;
      busy(pick, true); near("photo", "Preparing your photo…", "");
      shrink(file).then(function (blob) {
        return api("POST", "photo", blob, "image/jpeg");
      }).then(function (j) {
        busy(pick, false); inp.value = "";
        if (j.ok) saved("photo", "Photo saved.", "ok", "photo-pick", ["photo"]); else near("photo", words(j), "err");
      }, function (e) {
        busy(pick, false); inp.value = "";
        near("photo", e && e.small ? WORDS.photo_dimensions : /heic|heif/i.test(file.type + file.name)
          ? "This browser cannot open HEIC photos. On an iPhone, choose the photo from Photos in Safari; on a computer, save it as a JPEG first."
          : "We could not read that file as a photo. Try a JPEG or PNG.", "err");
      });
    });
    return panel("photo-panel", "Photo", [
      el("div", { "class": "photo-row" }, [img, el("div", null, [
        el("p", { "class": "small muted", text: "A head-and-shoulders photo. Any phone photo works: we shrink it and remove location and camera details." }),
        acts("photo", [pick, inp,
          p.photo_key ? el("button", { type: "button", "class": "link", id: "photo-remove", text: "Remove", onclick: function () {
            if (!window.confirm("Remove your photo from your card?")) return;
            api("DELETE", "photo").then(function (j) { if (j.ok) saved("photo", "Photo removed.", "ok", "photo-pick"); else near("photo", words(j), "err"); });
          } }) : null])])])
    ]);
  }

  function insurancePanel(me) {
    var p = me.profile || {};
    var other = el("input", { id: "i-other", name: "insurance_other", maxlength: "100" }); other.value = p.insurance_other || "";
    var conf = el("input", { type: "checkbox", name: "insurance_confirm", id: "i-confirm", checked: !!p.insurance_confirm });
    var save = el("button", { type: "submit", id: "ins-save", text: "Save insurance" });
    var f = el("form", { "class": "acct-form", id: "insurance-form", novalidate: true }, [
      el("fieldset", null, [el("legend", { text: "Plans you take" }), el("div", { "class": "checks ins-grid" },
        (me.insurers || []).map(function (n) {
          return el("label", null, [el("input", { type: "checkbox", name: "insurances", value: n, checked: (p.insurances || []).indexOf(n) >= 0 }), n]);
        }))]),
      field("i-other", "Other plans", other),
      el("div", { "class": "checks" }, [el("label", { "for": "i-confirm" }, [conf, "Add “Confirm with the office”"])]),
      acts("ins", [save])]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); busy(save, true);
      api("PUT", "profile", { insurances: [].slice.call(f.querySelectorAll('input[name="insurances"]:checked')).map(function (x) { return x.value; }),
        insurance_other: other.value.trim(), insurance_confirm: conf.checked }).then(function (j) {
        busy(save, false);
        if (j.ok) saved("ins", j.changed.length ? "Saved." : "No changes.", "ok", "ins-save", j.changed); else near("ins", words(j), "err");
      });
    });
    return panel("insurance-panel", "Insurance", [f]);
  }

  function accessPanel(me) {
    var a = me.account, kids = [];
    var idOn = !!(STATUS && STATUS.identity), doxOn = !!(STATUS && STATUS.doximity);
    if (!a.npi && a.claim_npi) {
      kids.push(el("p", { id: "acct-level", text: me.dispute ? "This listing's account was already confirmed by ID or Doximity. We will look into it and contact you."
        : "This listing (NPI " + a.claim_npi + ") already has an account. Confirm who you are; a confirmed doctor takes the listing over." }));
    } else if (!a.npi) {
      kids.push(el("p", { id: "acct-level", text: "This account no longer holds a listing." }));
    } else if (a.level === "full") {
      kids.push(el("p", { id: "acct-level" }, [el("strong", { text: "Full access." }), " Your card shows under Confirmed by physician, with your photo."]));
    } else {
      kids.push(el("p", { id: "acct-level" }, [el("strong", { text: "Partial access." }), " You can edit everything here except the photo. Your card shows under Likely performs."]));
      kids.push(el("p", { "class": "small" }, ["Full access moves your card to Confirmed by physician and adds your photo. It comes with an invitation from Every Option or from a colleague with full access" +
        (idOn || doxOn ? ", or by confirming who you are below." : ".")]));
    }
    if (!me.dispute && (a.claim_npi || (a.npi && a.level !== "full")) && (idOn || doxOn)) kids.push(el("div", { "class": "acct-actions", id: "proof" }, [
      idOn ? el("button", { type: "button", id: "check-id", "class": "secondary", text: "Confirm with photo ID", onclick: function () {
        api("POST", "check/identity", {}).then(function (j) { if (j.url) location.assign(j.url); else if (j.already) load(); else near("proof", words(j), "err"); }); } }) : null,
      doxOn && !me.doximity_linked ? el("a", { "class": "btn secondary", href: "/api/account/doximity/start", id: "dox-link", text: "Confirm with Doximity" }) : null]), msgLine("proof"));
    if (me.can && me.can.invite) kids.push(inviteBox(me));
    if (doxOn && !me.doximity_linked && a.level === "full") kids.push(el("p", { "class": "small" },
      [el("a", { href: "/api/account/doximity/start", text: "Link Doximity" }), " to sign in with Doximity next time."]));
    return panel("access", "Access", kids);
  }

  function inviteWords(n, of) { return "A link for one colleague's NPI, good once for 7 days. They get full access. You have " + n + " of " + (of || 5) + " left. Send it yourself. An unused link gives its place back once it expires."; }
  function inviteBox(me) {
    var inv = me.invites || { left: 0, sent: [] };
    var inp = el("input", { id: "v-npi", name: "npi", inputmode: "numeric", maxlength: "10" });
    var res = el("div", { id: "invite-out" });
    var go = el("button", { type: "submit", "class": "secondary", id: "invite-go", text: "Make a link", disabled: inv.left <= 0 });
    var f = el("form", { "class": "acct-form sub", id: "invite-create", novalidate: true }, [
      el("h3", { text: "Invite a colleague" }),
      el("p", { "class": "small", id: "invite-left", text: inviteWords(inv.left, inv.limit) }),
      field("v-npi", "Their NPI", inp), acts("invite", [go]), res,
      (inv.sent || []).length ? el("h3", { text: "Your links" }) : null, msgLine("invite-list"),
      (inv.sent || []).length ? el("ul", { "class": "o-list", id: "invite-list" }, inv.sent.map(function (v) {
        var li = el("li", { "class": "o-inv", id: "v-inv-" + v.id, "data-status": v.status }, [
          el("p", null, [el("strong", { text: v.name ? titleCase(v.name) : "NPI " + v.npi }), el("span", { "class": "muted", text: " · NPI " + v.npi })]),
          el("p", { "class": "small", text: (STATUS_WORDS[v.status] || v.status) + ". Made " + day(v.created_at) + (v.status === "live" ? ", expires " + day(v.expires_at) : "") + "." })]);
        if (v.status === "live") li.appendChild(el("button", { type: "button", "class": "link remove", id: "v-wd-" + v.id, text: "Withdraw",
          "aria-label": "Withdraw the link for " + (v.name ? titleCase(v.name) : "NPI " + v.npi), onclick: function () {
            var btn = this; busy(btn, true);
            api("POST", "invite/withdraw", { id: v.id }).then(function (j) {
              busy(btn, false);
              if (!j.ok) return near("invite-list", words(j), "err");
              load().then(function () { near("invite-list", "Withdrawn. That link no longer works, and its place is free again.", "ok"); });
            });
          } }));
        return li;
      })) : null
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "invite/create", { npi: inp.value.trim() }).then(function (j) {
        if (j._status !== 201) return near("invite", words(j), "err");
        res.innerHTML = "";
        if (j.held) res.appendChild(el("p", { "class": "small", text: "This listing already has an account, so the link will reach us first." }));
        // Job platform-launch-0010: Copy and Share, as in the owner box; the ids invite-link and invite-copy stay.
        res.appendChild(linkBox("invite", j.url, j.name, j.expires_at));
        document.getElementById("invite-left").textContent = inviteWords(j.left, inv.limit);
        if (j.left <= 0) go.disabled = true;
        near("invite", "Invitation link made. " + j.left + " left.", "ok");
      });
    });
    return f;
  }

  // ---- Job platform-launch-0010 (his "1. Yes", HQ chat 2026-11-17 15:12 CT): the owner box. Shown only when the server
  // says this account is the owner (me.owner); every owner route checks again on the server. The link is shown once,
  // right after it is made, and is never in the list or the page again (the server keeps only its hash).
  var DAY = { month: "short", day: "numeric", year: "numeric" };
  function day(t) { return new Date(t).toLocaleDateString("en-US", DAY); }
  function linkBox(prefix, url, name, expires) {
    var link = el("input", { id: prefix + "-link", readonly: true, value: url, "aria-label": "Invitation link for " + name });
    var copy = el("button", { type: "button", "class": "secondary", id: prefix + "-copy", text: "Copy" });
    var share = el("button", { type: "button", "class": "secondary", id: prefix + "-share", text: "Share" });
    var note = el("p", { "class": "small", id: prefix + "-copied", "aria-live": "polite" });
    function doCopy() {
      function selected() { link.focus(); link.select(); note.textContent = "Press copy on your device."; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { note.textContent = "Copied."; }, selected);
      else selected();
    }
    copy.addEventListener("click", doCopy);
    share.addEventListener("click", function () {
      if (navigator.share) navigator.share({ title: "Every Option invitation", url: url }).catch(function (e) { if (!e || e.name !== "AbortError") doCopy(); });
      else doCopy();
    });
    return el("div", { "class": "notice", id: prefix + "-made" }, [
      el("p", null, [el("strong", { text: "Link for " + name + "." }), " Send it yourself."]),
      link, el("div", { "class": "acct-actions" }, [copy, share]), note,
      el("p", { "class": "small", id: prefix + "-expires", text: "Expires " + day(expires) + ". Works once, for this NPI only." }),
      el("p", { "class": "small muted", text: "This link shows only now. To send it again, withdraw it and make a new one." })]);
  }
  var STATUS_WORDS = { live: "Not used yet", used: "Used", expired: "Expired", withdrawn: "Withdrawn" };
  function ownerList(list, ul) {
    ul.innerHTML = "";
    if (!list.length) { ul.appendChild(el("li", { "class": "muted", text: "No invitations yet." })); return; }
    list.forEach(function (v) {
      var status = STATUS_WORDS[v.status] || v.status;
      if (v.status === "used" && v.used_by) status = "Used by " + v.used_by.name + (v.used_by.email ? " (" + v.used_by.email + ")" : "") + ", " + day(v.used_at);
      else if (v.status === "used") status = "Used " + day(v.used_at);
      else if (v.status === "withdrawn" && v.withdrawn_at) status = "Withdrawn " + day(v.withdrawn_at);
      var li = el("li", { "class": "o-inv", id: "o-inv-" + v.id, "data-status": v.status }, [
        el("p", null, [el("strong", { text: v.name || "NPI " + v.npi }), el("span", { "class": "muted", text: " · NPI " + v.npi })]),
        el("p", { "class": "small", text: (v.kind === "partial" ? "Partial access, to " + v.email : "Full access") + ". Made " + day(v.created_at) +
          (v.status === "live" ? ", expires " + day(v.expires_at) : "") + "." }),
        el("p", { "class": "small", id: "o-st-" + v.id, text: status + "." })]);
      if (v.status === "live") li.appendChild(el("button", { type: "button", "class": "link remove", id: "o-wd-" + v.id, text: "Withdraw",
        "aria-label": "Withdraw the invitation for " + (v.name || "NPI " + v.npi), onclick: function () {
          var btn = this; busy(btn, true);
          api("POST", "owner/withdraw", { id: v.id }).then(function (j) {
            busy(btn, false);
            if (!j.ok) return near("owner-list", words(j), "err");
            // Review round 1: if the withdrawn link is the one still shown above, take it off the screen.
            var shown = document.getElementById("o-out");
            if (shown && shown.getAttribute("data-id") === String(v.id)) { shown.innerHTML = ""; shown.removeAttribute("data-id"); }
            near("owner-list", "Withdrawn. That link no longer works.", "ok");
            refreshOwner(ul);
          });
        } }));
      ul.appendChild(li);
    });
  }
  function refreshOwner(ul) { return api("GET", "owner/invites").then(function (j) { if (j.ok) ownerList(j.invites || [], ul); }); }
  function ownerPanel(me) {
    // HQ chat 2026-11-19 (his words: "The most annoying step is looking up NPI in a different tab"): one box takes a
    // name or an NPI. A name lists matches from Every Option and the NPI Registry; tapping one looks it up as an NPI.
    var npi = el("input", { id: "o-npi", name: "npi", maxlength: "80", autocomplete: "off", autocapitalize: "words", spellcheck: "false" });
    var ost = stateSelect("o-state", "");
    var look = el("button", { type: "button", "class": "secondary", id: "o-check", text: "Look up" });
    var picks = el("div", { id: "o-results", "aria-live": "polite" });
    var who = el("div", { id: "o-who", "aria-live": "polite" });
    var full = el("input", { type: "radio", name: "o-kind", id: "o-full", value: "full", checked: true });
    var part = el("input", { type: "radio", name: "o-kind", id: "o-part", value: "published" });
    var email = el("input", { id: "o-email", name: "email", type: "email", maxlength: "200", autocomplete: "off" });
    var emailRow = field("o-email", "The email printed on their own page", email);
    emailRow.hidden = true;
    var trainee = el("input", { type: "checkbox", id: "o-trainee" });
    var traineeRow = el("label", { "class": "agree", "for": "o-trainee" }, [trainee,
      el("span", { text: "Still listed as a trainee. The registry shows only the trainee code (390200000X) for this NPI, as it does for many fellows." })]);
    var go = el("button", { type: "submit", id: "o-go", text: "Make the link", disabled: true });
    var made = el("div", { id: "o-out" });
    var ul = el("ul", { "class": "o-list", id: "o-list" });
    var checked = null;
    function reset() { checked = null; who.innerHTML = ""; go.disabled = true; made.innerHTML = ""; }
    npi.addEventListener("input", function () { reset(); picks.innerHTML = ""; });
    npi.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); look.click(); } });
    function kind() { return part.checked ? "published" : "full"; }
    [full, part].forEach(function (r) { r.addEventListener("change", function () {
      emailRow.hidden = kind() !== "published"; trainee.disabled = kind() === "published"; if (trainee.disabled) trainee.checked = false;
    }); });
    function byName(q) {
      if (!/[A-Za-z\u00C0-\u024F]{1,}[\s,]+[A-Za-z\u00C0-\u024F]{2,}/.test(q)) return near("owner", "Type a first and last name, or a 10-digit NPI.", "err");
      busy(look, true); reset(); picks.innerHTML = "";
      api("GET", "owner/search?name=" + encodeURIComponent(q) + (ost.value ? "&state=" + ost.value : "")).then(function (j) {
        busy(look, false);
        if (!j.ok) return near("owner", words(j), "err");
        near("owner", "", "");
        if (j.registry === "unavailable") picks.appendChild(el("p", { "class": "notice small", text: "The NPI Registry is not answering right now, so only doctors already on Every Option are shown." }));
        if (!j.results.length) return picks.appendChild(el("p", { "class": "small", id: "o-none", text: "No physician found with that name" + (ost.value ? " in " + ost.value : "") + ". Check the spelling" + (ost.value ? " or try any state" : "") + "." }));
        picks.appendChild(el("p", { "class": "small muted", text: "Tap the doctor." }));
        picks.appendChild(el("ul", { "class": "pick", id: "o-picks" }, j.results.map(function (p) {
          var where = [p.city && titleCase(p.city), p.state].filter(Boolean).join(", ");
          return el("li", null, [el("button", { type: "button", "class": "pick-row", "data-npi": p.npi, onclick: function () { picks.innerHTML = ""; check(p.npi); } }, [
            el("span", { "class": "pick-name", text: titleCase(p.name) + (p.credential ? ", " + p.credential.replace(/\./g, "") : "") }),
            el("span", { "class": "pick-meta", text: [where, p.specialty, "NPI " + p.npi].filter(Boolean).join(" · ") }),
            p.listed_for.length ? el("span", { "class": "pick-listed", text: "On Every Option for " + procList(p.listed_for) }) : null
          ])]);
        })));
        if (j.more) picks.appendChild(el("p", { "class": "small muted", text: "More matches than shown. Pick a state to narrow it." }));
      });
    }
    look.addEventListener("click", function () {
      var q = npi.value.trim(), digits = q.replace(/[\s-]/g, "");
      if (/^\d+$/.test(digits)) {
        if (!/^\d{10}$/.test(digits)) return near("owner", "An NPI has 10 digits.", "err");
        picks.innerHTML = ""; return check(digits);
      }
      byName(q);
    });
    function check(v) {
      busy(look, true); reset();
      api("GET", "owner/check?npi=" + v).then(function (j) {
        busy(look, false);
        if (!j.ok) return near("owner", words(j), "err");
        checked = j;
        var lines = [el("p", { id: "o-name" }, [el("strong", { text: titleCase(j.name) }), el("span", { "class": "muted", text: " · NPI " + j.npi })])];
        if (j.self) lines.push(el("p", { "class": "small", text: "That is your own NPI." }));
        else if (j.held) lines.push(el("p", { "class": "small", text: "This NPI already has an account. A full-access link moves the listing to whoever opens it." }));
        if (!j.radiology && !j.listed) lines.push(el("p", { "class": "small", id: "o-not-rad", text: j.trainee_only
          ? "The registry lists this NPI only as a trainee. Tick the trainee box to make a full-access link." : "The registry does not list a radiology specialty for this NPI, so a link would be refused." }));
        lines.push(el("p", { "class": "small muted", text: "Is this the right doctor? Then choose the access and make the link." }));
        lines.forEach(function (n) { who.appendChild(n); });
        go.disabled = !!j.self;
      });
    }
    var f = el("form", { "class": "acct-form", id: "owner-form", novalidate: true }, [
      el("p", { "class": "small", text: "Only you see this box. Each link is for one doctor's NPI. It works once and lasts 7 days. You can make up to 100 a day." }),
      el("div", { "class": "row2" }, [field("o-npi", "Their name or NPI", npi, "(first and last name)"), field("o-state", "State", ost)]),
      el("div", { "class": "acct-actions" }, [look]), picks, who,
      el("fieldset", { id: "o-kinds" }, [el("legend", { text: "Access" }), el("div", { "class": "checks" }, [
        el("label", { "for": "o-full" }, [full, "Full access (most doctors): photo, invitations, and Confirmed by physician"]),
        el("label", { "for": "o-part" }, [part, "Partial access, to an email printed on their own page: they show under Likely performs"])])]),
      emailRow, traineeRow, acts("owner", [go]), made
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!checked) return near("owner", "Look up the NPI first.", "err");
      var body = { npi: checked.npi, kind: kind() };
      if (body.kind === "published") body.email = email.value.trim();
      if (trainee.checked && body.kind === "full") body.trainee = true;
      busy(go, true);
      api("POST", "owner/invite", body).then(function (j) {
        busy(go, false);
        if (j._status !== 201) return near("owner", words(j), "err");
        var name = titleCase(j.name);
        npi.value = ""; email.value = ""; trainee.checked = false; checked = null; who.innerHTML = ""; go.disabled = true;
        made.innerHTML = ""; made.setAttribute("data-id", String(j.id)); made.appendChild(linkBox("o", j.url, name, j.expires_at));
        near("owner", "Link made for " + name + ".", "ok");
        refreshOwner(ul);
      });
    });
    var p = panel("owner", "Invite doctors", [f, el("h3", { text: "Your invitations" }), msgLine("owner-list"), ul]);
    refreshOwner(ul);
    return p;
  }

  function emailPanel(me) {
    var a = me.account;
    var inp = el("input", { id: "e-email", name: "email", type: "email", maxlength: "200", autocomplete: "email", required: true });
    var go = el("button", { type: "submit", "class": "secondary", id: "email-go", text: "Send a code" });
    var f = el("form", { "class": "acct-form", id: "email-form", novalidate: true }, [
      el("p", { "class": "small", text: a.email ? "Now: " + a.email + ". To change it, type the new one; we send it a code." :
        "Add an email you'll keep, so you can sign in again. We send it a 6-digit code." }),
      field("e-email", a.email ? "New email" : "Email", inp), acts("email", [go])
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var addr = inp.value.trim();
      function ask() { return api("POST", "email", { email: addr }).then(function (j) { if (j._status !== 202) { near("email", words(j), "err"); return null; } return j.challenge; }); }
      busy(go, true);
      ask().then(function (ch) {
        busy(go, false);
        if (!ch) return;
        say("We sent a 6-digit code to " + addr + ".", "ok");
        codeStep(addr, ch, function () { hush(); PENDING = { key: "email", msg: "Login email saved.", cls: "ok", focus: "email-go", top: null }; load(); }, ask, load);
      });
    });
    return panel("email-panel", a.email ? "Login email" : "Add a login email", [f], a.email ? "" : "need");
  }

  var FIELD = { degree: "Degree", goes_by: "First name you go by", blurbs: "Notes", insurances: "Insurance plans", insurance_other: "Other plans", insurance_confirm: "Confirm with the office",
    booking_url: "Website link", telehealth: "Video visits",
    also_performs: "Other procedures (private)", also_performs_other: "Something else (private)", offices: "Offices", photo: "Photo", attested: "Procedures", level: "Access level", account: "Account created",
    takeover: "Listing moved to you", lost_npi: "Listing lost", login_email: "Login email", invite: "Invitation made", doximity: "Doximity linked",
    owner_invite: "Invitation made (owner box)", invite_withdrawn: "Invitation withdrawn", owner: "Owner role" };
  var WHEN = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  function when(t) {
    var d = new Date(t), now = new Date();
    var o = Object.assign({}, WHEN); if (d.getFullYear() !== now.getFullYear()) o.year = "numeric";
    return d.toLocaleString("en-US", o).replace(" AM", " am").replace(" PM", " pm");
  }
  function historyPanel() {
    var ul = el("ul", { "class": "history" });
    var d = el("details", { id: "history", "class": "acct-panel history-panel" }, [el("summary", { id: "history-sum" }, [el("h2", { id: "history-h", text: "History" })]),
      el("p", { "class": "small muted", text: "Every change is kept. Undo puts back what was there before." }), msgLine("history"), ul]);
    d.addEventListener("toggle", function () {
      if (!d.open || d.loaded) return; d.loaded = true;
      api("GET", "edits").then(function (j) {
        // A jump opened History: once its list is in, put it at the top again (the page was too short before).
        if (d.jumpPending) setTimeout(function () { d.jumpPending = false; d.scrollIntoView({ block: "start" }); }, 0);
        (j.edits || []).forEach(function (e) {
          ul.appendChild(el("li", null, [
            el("span", { "class": "h-what" }, [(FIELD[e.field] || e.field) + (e.undo_of ? " (undone)" : "") + (e.by_you ? "" : " (earlier account)"),
              el("time", { "class": "h-when", datetime: e.at, text: when(e.at) })]),
            e.undoable ? el("button", { "class": "link undo", type: "button", text: "Undo", "data-edit": e.id, onclick: function () {
              api("POST", "undo", { edit_id: e.id }).then(function (r) { if (r.ok) saved("history", "Undone.", "ok", "history-sum"); else near("history", words(r), "err"); });
            } }) : null
          ]));
        });
      });
    });
    return d;
  }

  // ---- Job platform-directory-0037 (his yes 2026-11-13 22:58 CT, call 6: "table of contents style jump header"): a
  // contents list at the top of Your account, one link per panel shown, in page order, in each panel's own heading
  // words; a "Back to top" link in each panel; and, as on the deep pages (deep-nav.js, same classes and look), a pinned
  // copy once the list scrolls away: a side rail from 1180 px, a one-line bar at the top on narrower screens. A link moves
  // focus to the panel's heading. Links never change the address (this page redraws on a hash change).
  var DOCK = null, TARGETS = [], DOCK_FRAME = 0, DOCK_NOW = null;
  function panelHead(p) {
    return p.id === "history" ? document.getElementById("history-sum") : p.querySelector(p.id === "also-form" ? "h3" : ":scope > h2");
  }
  function jumpTo(id) {
    var p = document.getElementById(id); if (!p) return;
    if (p.tagName === "DETAILS" && !p.open) { p.jumpPending = true; p.open = true; }   // History loads its list on opening
    var h = panelHead(p) || p;
    p.scrollIntoView({ block: "start" });
    if (!h.matches("summary, a, button")) h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  }
  function toTop() {
    window.scrollTo(0, 0);
    var h1 = document.querySelector("main h1");
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
  }
  function topLink() {
    return el("p", { "class": "to-top-row" }, [el("a", { "class": "to-top", href: "#main", text: "Back to top", onclick: function (ev) { ev.preventDefault(); openDock(false); toTop(); } })]);
  }
  function jumpList() {
    var ps = [].slice.call(out.querySelectorAll("section.acct-panel[id], #also-form, details#history"));
    TARGETS = ps;
    var items = ps.map(function (p) {
      var h = p.id === "history" ? p.querySelector("summary h2") : panelHead(p);
      return el("li", null, [el("a", { href: "#" + p.id, "data-jump": p.id, text: h ? h.textContent : p.id })]);
    });
    return el("nav", { "class": "toc acct-toc", id: "acct-toc", "aria-labelledby": "acct-toc-h" }, [
      el("p", { "class": "toc-title", id: "acct-toc-h", text: "On this page" }), el("ol", null, items)]);
  }
  function openDock(yes) {
    if (!DOCK) return;
    DOCK.classList.toggle("is-open", yes); DOCK.querySelector(".toc-bar").setAttribute("aria-expanded", String(yes));
  }
  function pinJump(toc) {
    var dock = el("div", { "class": "toc-dock acct-dock" });
    dock.innerHTML = '<button type="button" class="toc-bar" aria-expanded="false" aria-controls="acct-toc-panel">' +
      '<span class="toc-bar-k">Contents</span><span class="toc-now" aria-hidden="true"></span>' +
      '<svg class="toc-chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<nav class="toc-panel" id="acct-toc-panel" aria-label="Contents, pinned"><p class="toc-title">On this page</p></nav>';
    var panelEl = dock.querySelector(".toc-panel");
    panelEl.appendChild(toc.querySelector("ol").cloneNode(true));
    panelEl.appendChild(el("a", { "class": "to-top", href: "#main", text: "Back to top", onclick: function (ev) { ev.preventDefault(); openDock(false); toTop(); } }));
    dock.querySelector(".toc-bar").addEventListener("click", function () { openDock(!dock.classList.contains("is-open")); });
    document.body.appendChild(dock);
    DOCK = dock; DOCK_NOW = null;
    markDock();
  }
  function markDock() {
    DOCK_FRAME = 0;
    var toc = document.getElementById("acct-toc");
    if (!DOCK || !toc) return;
    var past = toc.getBoundingClientRect().bottom < 0;
    if (past !== DOCK.classList.contains("is-on")) { DOCK.classList.toggle("is-on", past); if (!past) openDock(false); }
    var line = window.innerHeight / 3, hit = null;
    for (var i = 0; i < TARGETS.length; i++) { if (TARGETS[i].getBoundingClientRect().top <= line) hit = TARGETS[i]; else break; }
    var id = hit ? hit.id : "";
    if (id === DOCK_NOW) return;
    DOCK_NOW = id;
    var name = "";
    [].forEach.call(document.querySelectorAll("#acct-toc a[data-jump], .acct-dock a[data-jump]"), function (a) {
      if (a.getAttribute("data-jump") === id) { a.setAttribute("aria-current", "location"); name = a.textContent; } else a.removeAttribute("aria-current");
    });
    DOCK.querySelector(".toc-now").textContent = name;
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[data-jump]");
    if (a) { ev.preventDefault(); openDock(false); jumpTo(a.getAttribute("data-jump")); return; }
    if (DOCK && !DOCK.contains(ev.target)) openDock(false);
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && DOCK && DOCK.classList.contains("is-open")) { openDock(false); DOCK.querySelector(".toc-bar").focus(); }
  });
  addEventListener("scroll", function () { if (DOCK && !DOCK_FRAME) DOCK_FRAME = requestAnimationFrame(markDock); }, { passive: true });
  addEventListener("resize", function () { DOCK_NOW = null; markDock(); });

  // ---- Job platform-launch-0011 (his words, HQ chat 2026-11-17 16:24 CT; design yes 16:26 CT): hide my profile. Full
  // access only (the server checks again); a hide by Every Option shows only its line and the report form link.
  function hidePanel(me) {
    var h = me.hide, a = me.account;
    if (!h) return null;
    if (h.hidden && h.by === "every_option") return panel("hide-panel", "Hide my profile", [
      el("p", { id: "hide-state", "class": "see-line need" }, ["Hidden by Every Option. Write to us to change this. ",
        el("a", { href: "/report/?npi=" + a.npi, id: "hide-write", text: "Write to us" })])]);
    if (!h.can) return null;
    var offices = el("button", { type: "button", "class": "secondary", id: "hide-offices", text: "Update my offices", onclick: function () { jumpTo("offices-panel"); } });
    if (h.hidden) {
      var kids = [el("p", { id: "hide-state", "class": "see-line need", text: (h.since ? "Your profile has been hidden since " + day(h.since) : "Your profile is hidden") + ". Patients cannot find you on Every Option. Everything you entered is saved." })];
      var show = function (re) {
        var b = document.getElementById(re ? "hide-reconfirm" : "hide-show"); busy(b, true);
        api("POST", "show", re ? { reconfirm: true } : {}).then(function (j) {
          busy(b, false);
          if (j.ok) { PENDING = { key: "see", msg: "Your profile shows again. Patients can find you within about a minute.", cls: "ok", focus: "see-line", top: null }; load(); return; }
          if (j.error === "reconfirm_needed") { load(); return; }
          near("hide", words(j), "err");
        });
      };
      if (h.reconfirm) {
        var done = (me.profile && me.profile.attested) || [];
        var tick = el("input", { type: "checkbox", id: "hide-agree" });
        var go = el("button", { type: "button", id: "hide-reconfirm", text: "Confirm and show my profile", disabled: true, onclick: function () { show(true); } });
        tick.addEventListener("change", function () { go.disabled = !tick.checked; });
        kids.push(el("p", { text: "It has been more than a year since you last confirmed your details. Confirm them before your profile shows again." }),
          done.length ? el("ul", { "class": "small", id: "hide-statements" }, done.map(function (k) { return el("li", { text: me.attest_wording[k] }); })) : null,
          el("label", { "class": "check", "for": "hide-agree" }, [tick, " These statements are still true, and my details are up to date."]),
          acts("hide", [go, offices]));
      } else kids.push(acts("hide", [el("button", { type: "button", id: "hide-show", text: "Show my profile", onclick: function () { show(false); } }), offices]));
      return panel("hide-panel", "Hide my profile", kids);
    }
    var confirmBox = el("div", { id: "hide-confirm", hidden: true }, [
      el("p", { text: "Patients will not find you on Every Option. Search engines and AI answers may keep an old copy for a while." }),
      el("div", { "class": "acct-actions" }, [
        el("button", { type: "button", id: "hide-yes", text: "Yes, hide my profile", onclick: function () {
          var b = this; busy(b, true);
          api("POST", "hide", {}).then(function (j) {
            busy(b, false);
            if (j.ok) { PENDING = { key: "see", msg: "Your profile is hidden. It leaves patient searches within about a minute.", cls: "ok", focus: "see-line", top: null }; load(); }
            else near("hide", words(j), "err");
          }); } }),
        el("button", { type: "button", "class": "link", id: "hide-cancel", text: "Cancel", onclick: function () { confirmBox.hidden = true; ask.hidden = false; ask.focus(); } })])]);
    var ask = el("button", { type: "button", "class": "secondary", id: "hide-go", text: "Hide my profile", onclick: function () { ask.hidden = true; confirmBox.hidden = false; document.getElementById("hide-yes").focus(); } });
    return panel("hide-panel", "Hide my profile", [
      el("p", { text: "Between jobs, or not ready to be found? Hide your profile. Within about a minute you leave patient searches and city lists, and your profile page says you are not listed. Name lists and the site map catch up at our next update. Everything you entered stays saved, and you can show it again any time." }),
      el("p", { "class": "small muted", text: "Search engines and AI answers may keep an old copy for a while. Changing jobs? You may only need to update your offices." }),
      acts("hide", [ask, offices]), confirmBox]);
  }

  function dashboard(me) {
    var a = me.account, wasOpen = !!(document.getElementById("history") || {}).open;
    // Folds the doctor had open stay open through the redraw, so nothing below them moves.
    var openIds = [].map.call(out.querySelectorAll("details[open][id]"), function (d) { return d.id; });
    var head = el("div", { "class": "acct-head", id: "acct-head" }, [
      el("div", null, [el("p", { "class": "acct-name" }, [el("strong", { text: a.name })]),
        el("p", { "class": "small muted" }, [a.npi ? "NPI " + a.npi + " · " : a.claim_npi ? "NPI " + a.claim_npi + " · " : "",
          el("span", { "class": "pill" + (a.level === "full" ? " full" : ""), id: "acct-pill", text: a.npi ? levelName(a) : "No listing yet" })])]),
      el("button", { "class": "link", type: "button", id: "signout", text: "Sign out", onclick: function () {
        api("POST", "logout", {}).then(function () { location.hash = ""; hush(); start(); }); } })
    ]);
    var parts = [head];
    if (a.npi) {
      parts.push(seePanel(me), namePanel(me), procPanel(me), officePanel(me), telePanel(me), photoPanel(me), insurancePanel(me), accessPanel(me),
        hidePanel(me), me.owner ? ownerPanel(me) : null, emailPanel(me), historyPanel());
    } else {
      parts.push(accessPanel(me), emailPanel(me));
    }
    view(parts, null);
    openIds.forEach(function (id) { var d = document.getElementById(id); if (d && d.tagName === "DETAILS") d.open = true; });
    if (wasOpen) { var h = document.getElementById("history"); if (h) h.open = true; }
    [].forEach.call(out.querySelectorAll("section.acct-panel[id], details#history"), function (p) { p.appendChild(topLink()); });
    var toc = jumpList();
    head.parentNode.insertBefore(toc, head.nextSibling);
    pinJump(toc);
    showPending();
  }

  function load() {
    return api("GET", "me").then(function (j) {
      if (j._status === 200) dashboard(j);
      else if (QS.get("npi") && /^\d{10}$/.test(QS.get("npi"))) signupFor(QS.get("npi"));      // the card link "Is this you?"
      else entry();
    });
  }

  function useHash() {
    var m = /^#(invite|doximity)=([0-9a-z-]+)$/.exec(location.hash);
    if (!m) return Promise.resolve(false);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (m[1] === "invite") return invitation(m[2]).then(function () { return true; });
    if (m[2] === "signed-in") { say("Signed in with Doximity.", "ok"); return Promise.resolve(false); }
    if (m[2] === "failed") { say("Doximity sign-in did not finish. Sign in by email instead.", "err"); return Promise.resolve(false); }
    var tok = m[2];
    return api("POST", "doximity/preview", { token: tok }).then(function (pv) {
      if (!pv.ok) { say(words(pv), "err"); return false; }
      var b = el("div", { "class": "notice", id: "dox-confirm" }, [
        el("p", { text: "Link the Doximity account of " + pv.name + (pv.specialty ? " (" + pv.specialty + ")" : "") + " to this Every Option account?" }),
        el("div", { "class": "acct-actions" }, [el("button", { type: "button", id: "dox-yes", text: "Link Doximity", onclick: function () {
          api("POST", "doximity/link", { token: tok }).then(function (j) {
            b.remove();
            if (j.ok) say(j.takeover ? "Confirmed by Doximity. The listing is now yours, with full access." : j.dispute ?
              "Confirmed by Doximity. This listing's account was already confirmed, so we will look into it." : j.proof ?
              "Confirmed by Doximity. You have full access." : "Doximity linked for signing in. It could not confirm you on its own" +
              (j.reason === "name_not_unique" ? " (another radiologist shares your name)" : "") + ".", "ok");
            else say(j.error === "signed_out" ? "Sign in by email first, then link Doximity from your account." : words(j), "err");
            load();
          });
        } }),
        el("button", { "class": "link", type: "button", text: "Cancel", onclick: function () { b.remove(); } })])
      ]);
      box.insertBefore(b, statusEl);
      return false;
    });
  }

  function start() {
    return fetch("/api/account/status", { credentials: "same-origin" }).then(function (r) {
      if (r.status !== 200) return null;
      return r.json();
    }).catch(function () { return null; }).then(function (s) {
      if (!s || !s.open) {
        box.hidden = true; closed.hidden = false;
        var fix = document.getElementById("closed-report");
        if (fix && QS.get("npi")) fix.href = "/report/" + location.search;
        return;
      }
      STATUS = s; closed.hidden = true; box.hidden = false;
      if (!start.wired) { start.wired = true; window.addEventListener("hashchange", function () { useHash().then(function (inv) { if (!inv) load(); }); }); }
      return useHash().then(function (inv) { if (!inv) return load(); });
    });
  }
  start();
})();
