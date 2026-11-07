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
    invite_limit: "You have used all 5 invitations.", invite_self: "That is your own NPI.",
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
  function say(msg, cls) { statusEl.className = "status " + (cls || ""); statusEl.textContent = msg || ""; if (msg) statusEl.focus(); }
  function hush() { statusEl.className = "status"; statusEl.textContent = ""; }
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
      var agreeText = el("span", { id: "s-agree-text", text: j.agreement });
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
        agreeText.textContent = notIr ? "I am the physician with this NPI. I accept the Every Option terms of service and privacy policy." : j.agreement;
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

  // ---- An invitation: the doctor's listing and one agreement. Procedures come after, in Your account.
  function invitation(tok) {
    return api("POST", "invite/preview", { token: tok }).then(function (pv) {
      if (!pv.ok) { say(words(pv), "err"); entry(); return; }
      var agree = el("input", { type: "checkbox", name: "agree", id: "i-agree" });
      var go = el("button", { type: "submit", text: "Accept" });
      var f = el("form", { "class": "acct-form", id: "invite-form", novalidate: true }, [
        el("div", { "class": "who-box" }, [el("p", { "class": "who-name" }, [el("strong", { text: pv.name }), el("span", { "class": "muted", text: " · NPI " + pv.npi })]),
          el("p", { "class": "small", text: pv.listed_for.length ? "On Every Option for " + procList(pv.listed_for) + "." : "Not on Every Option yet; accepting adds you." }),
          el("p", { "class": "small", text: pv.level === "full" ? "This invitation gives full access: your card shows as confirmed by physician once you choose your procedures." : "This invitation gives partial access." })]),
        el("label", { "class": "agree", "for": "i-agree" }, [agree, el("span", { text: pv.agreement })]),
        el("div", { "class": "acct-actions" }, [go])
      ]);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (!agree.checked) { agree.setAttribute("aria-invalid", "true"); agree.focus(); return say("Please tick the box to continue.", "err"); }
        busy(go, true);
        api("POST", "invite/accept", { token: tok, agree: true }).then(function (j) {
          busy(go, false);
          if (!j.ok) return say(words(j), "err");
          say("Done. Next, choose the procedures you perform, and add a login email so you can sign in again.", "ok");
          load();
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
    kids.push(el("div", { "class": "top" }, [img, el("div", { "class": "who" }, [el("h3", { text: a.name }),
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

  function procPanel(me) {
    var p = me.profile || {}, done = p.attested || [];
    var rows = Object.keys(PROC).map(function (k) {
      var on = done.indexOf(k) >= 0;
      if (on) {
        var t = el("textarea", { id: "b-" + k, name: "blurb_" + k, rows: "3", maxlength: "300" }); t.value = (p.blurbs || {})[k] || "";
        var count = el("span", { "class": "hint", text: t.value.length + " / 300" });
        t.addEventListener("input", function () { count.textContent = t.value.length + " / 300"; });
        var saveNote = el("button", { type: "button", "class": "secondary", text: "Save note", onclick: function () {
          var blurbs = Object.assign({}, p.blurbs || {}); blurbs[k] = t.value;
          var why = document.getElementById("why-b-" + k); why.textContent = "";
          busy(saveNote, true);
          api("PUT", "profile", { blurbs: blurbs }).then(function (j) {
            busy(saveNote, false);
            if (j.ok) { say(j.changed.length ? "Note saved." : "No changes.", "ok"); return load(); }
            if (j.error === "screened" && j.blocked.blurbs && j.blocked.blurbs[k]) why.textContent = "Not accepted: this has " + j.blocked.blurbs[k].map(function (r) { return REASONS[r] || r; }).join(" and ") + ".";
            say(words(j), "err");
          });
        } });
        return el("li", { "class": "proc on", id: "proc-" + k }, [
          el("div", { "class": "proc-head" }, [el("span", { "class": "proc-name" }, [el("strong", { text: PROC_HEAD(k) }), el("span", { "class": "muted", text: PROC_SUB(k) }),
            el("span", { "class": "proc-state", text: "✓ You perform this" })])]),
          el("details", { "class": "proc-note", open: !!t.value }, [el("summary", { text: t.value ? "Your note" : "Add a note for patients" }),
            el("label", { "for": "b-" + k }, ["Note for " + PROC[k] + " ", count]), t, el("p", { "class": "err small", id: "why-b-" + k }),
            el("div", { "class": "acct-actions" }, [saveNote])]),
          el("button", { type: "button", "class": "link remove", "data-proc": k, text: "Remove " + PROC[k], onclick: function () {
            if (!window.confirm("Remove " + PROC[k] + " from your account? You can add it again any time.")) return;
            api("POST", "withdraw", { procedure: k }).then(function (j) { if (j.ok) { say(PROC[k] + " removed.", "ok"); load(); } else say(words(j), "err"); });
          } })
        ]);
      }
      var stmt = el("div", { "class": "attest", hidden: true }, [
        el("p", { "class": "attest-text", text: me.attest_wording[k] }),
        el("div", { "class": "acct-actions" }, [el("button", { type: "button", id: "attest-" + k, text: "Confirm and add", onclick: function () {
          var b = this; busy(b, true);
          api("POST", "attest", { procedures: [k], agree: true }).then(function (j) {
            busy(b, false);
            if (j.ok) { say(PROC[k] + " added.", "ok"); load(); } else say(words(j), "err");
          });
        } }), el("button", { type: "button", "class": "link", text: "Cancel", onclick: function () { stmt.hidden = true; add.hidden = false; add.focus(); } })])
      ]);
      var add = el("button", { type: "button", "class": "secondary add", "data-proc": k, text: "Add", "aria-label": "Add " + PROC[k], onclick: function () { add.hidden = true; stmt.hidden = false; stmt.querySelector("button").focus(); } });
      return el("li", { "class": "proc", id: "proc-" + k }, [
        el("div", { "class": "proc-head" }, [el("span", { "class": "proc-name" }, [el("strong", { text: PROC_HEAD(k) }), el("span", { "class": "muted", text: PROC_SUB(k) })]), add]),
        stmt]);
    });
    return panel("procs", "Procedures", [
      el("p", { "class": "small muted", text: "Add each procedure you personally perform. Adding one records your statement that you perform it. Notes: no links, phone numbers, or patient stories, and no words like best, guaranteed, or cure." }),
      el("ul", { "class": "procs" }, rows)]);
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
    var save = el("button", { type: "submit", text: "Save offices" });
    var f = el("form", { "class": "acct-form", id: "office-form", novalidate: true }, [offs,
      el("div", null, [el("button", { "class": "link", type: "button", id: "add-office", text: "+ Add another office", onclick: function () {
        var n = offs.querySelectorAll("fieldset.office").length; if (n < 5) offs.appendChild(officeRow({}, n)); if (n + 1 >= 5) this.hidden = true; } })]),
      field("p-book", "Website or booking link", book, "(optional)"),
      el("div", { "class": "acct-actions" }, [save])]);
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
      if (bad.length) { say("Please check the highlighted details.", "err"); bad[0].focus(); return; }
      busy(save, true);
      api("PUT", "profile", { offices: offices, booking_url: link }).then(function (j) {
        busy(save, false);
        if (j.ok) {
          var miss = (j.unmatched || []).map(function (i) { var o = offices[i] || {}; return o.practice || o.street || "one office"; });
          say(miss.length ? (j.changed.length ? "Saved. " : "") + "We couldn't find the street address for " + miss.join(" and ") +
            " on the map, so patients see the distance to the center of that office's ZIP code instead. Check the address, or leave it as it is." : j.changed.length ? "Saved." : "No changes.", "ok");
          return load();
        }
        var rows = [].slice.call(offs.querySelectorAll("fieldset.office")).filter(function (fs) {
          return [].some.call(fs.querySelectorAll("input"), function (x) { return x.value.trim(); }); }), first = null;
        if (j.error === "street_required") (j.offices || []).forEach(function (i) {
          var s = rows[i] && rows[i].querySelector('[name="street"]'); if (s) { s.setAttribute("aria-invalid", "true"); first = first || s; } });
        if (j.error === "invalid" && (j.fields || []).indexOf("booking_url") >= 0) { book.setAttribute("aria-invalid", "true"); first = first || book; }
        say(j.error === "invalid" && first === book ? "Please check the website link. It should start with https://." : words(j), "err");
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
      if (on && !states.length) { say("Add at least one state where you can see patients by video.", "err"); pick.focus(); return; }
      busy(save, true);
      api("PUT", "profile", { telehealth: { offers: on, states: states } }).then(function (j) {
        busy(save, false);
        if (j.ok) { say(j.changed.length ? "Video visits saved." : "No changes.", "ok"); return load(); }
        say(words(j), "err");
      });
    });
    drawStates();
    return panel("tele-panel", "Video visits", [
      el("p", { "class": "small muted", id: "tele-help", text: "Do you see patients by video or phone? Patients can look for doctors who do. Add each state where you are licensed to see a patient." }),
      el("div", { "class": "tele-row" }, [sw, full ? null : el("p", { "class": "tele-partial small", id: "tele-partial",
        text: "Saved now; patients see it once you have full access." })]),
      where, el("div", { "class": "acct-actions" }, [save])]);
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
      busy(pick, true); say("Preparing your photo…", "");
      shrink(file).then(function (blob) {
        return api("POST", "photo", blob, "image/jpeg");
      }).then(function (j) {
        busy(pick, false); inp.value = "";
        if (j.ok) { say("Photo saved.", "ok"); load(); } else say(words(j), "err");
      }, function (e) {
        busy(pick, false); inp.value = "";
        say(e && e.small ? WORDS.photo_dimensions : /heic|heif/i.test(file.type + file.name)
          ? "This browser cannot open HEIC photos. On an iPhone, choose the photo from Photos in Safari; on a computer, save it as a JPEG first."
          : "We could not read that file as a photo. Try a JPEG or PNG.", "err");
      });
    });
    return panel("photo-panel", "Photo", [
      el("div", { "class": "photo-row" }, [img, el("div", null, [
        el("p", { "class": "small muted", text: "A head-and-shoulders photo. Any phone photo works: we shrink it and remove location and camera details." }),
        el("div", { "class": "acct-actions" }, [pick, inp,
          p.photo_key ? el("button", { type: "button", "class": "link", id: "photo-remove", text: "Remove", onclick: function () {
            if (!window.confirm("Remove your photo from your card?")) return;
            api("DELETE", "photo").then(function (j) { if (j.ok) { say("Photo removed.", "ok"); load(); } else say(words(j), "err"); });
          } }) : null])])])
    ]);
  }

  function insurancePanel(me) {
    var p = me.profile || {};
    var other = el("input", { id: "i-other", name: "insurance_other", maxlength: "100" }); other.value = p.insurance_other || "";
    var conf = el("input", { type: "checkbox", name: "insurance_confirm", id: "i-confirm", checked: !!p.insurance_confirm });
    var save = el("button", { type: "submit", text: "Save insurance" });
    var f = el("form", { "class": "acct-form", id: "insurance-form", novalidate: true }, [
      el("fieldset", null, [el("legend", { text: "Plans you take" }), el("div", { "class": "checks ins-grid" },
        (me.insurers || []).map(function (n) {
          return el("label", null, [el("input", { type: "checkbox", name: "insurances", value: n, checked: (p.insurances || []).indexOf(n) >= 0 }), n]);
        }))]),
      field("i-other", "Other plans", other),
      el("div", { "class": "checks" }, [el("label", { "for": "i-confirm" }, [conf, "Add “Confirm with the office”"])]),
      el("div", { "class": "acct-actions" }, [save])]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); busy(save, true);
      api("PUT", "profile", { insurances: [].slice.call(f.querySelectorAll('input[name="insurances"]:checked')).map(function (x) { return x.value; }),
        insurance_other: other.value.trim(), insurance_confirm: conf.checked }).then(function (j) {
        busy(save, false);
        if (j.ok) { say(j.changed.length ? "Saved." : "No changes.", "ok"); load(); } else say(words(j), "err");
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
        api("POST", "check/identity", {}).then(function (j) { if (j.url) location.assign(j.url); else if (j.already) load(); else say(words(j), "err"); }); } }) : null,
      doxOn && !me.doximity_linked ? el("a", { "class": "btn secondary", href: "/api/account/doximity/start", id: "dox-link", text: "Confirm with Doximity" }) : null]));
    if (me.can && me.can.invite) kids.push(inviteBox(me));
    if (doxOn && !me.doximity_linked && a.level === "full") kids.push(el("p", { "class": "small" },
      [el("a", { href: "/api/account/doximity/start", text: "Link Doximity" }), " to sign in with Doximity next time."]));
    return panel("access", "Access", kids);
  }

  function inviteWords(n) { return "A link for one colleague's NPI, good once for 7 days. They get full access. You have " + n + " of 5 left. Send it yourself."; }
  function inviteBox(me) {
    var inv = me.invites || { left: 0, sent: [] };
    var inp = el("input", { id: "v-npi", name: "npi", inputmode: "numeric", maxlength: "10" });
    var res = el("div", { id: "invite-out" });
    var go = el("button", { type: "submit", "class": "secondary", text: "Make a link", disabled: inv.left <= 0 });
    var f = el("form", { "class": "acct-form sub", id: "invite-create", novalidate: true }, [
      el("h3", { text: "Invite a colleague" }),
      el("p", { "class": "small", id: "invite-left", text: inviteWords(inv.left) }),
      field("v-npi", "Their NPI", inp), el("div", { "class": "acct-actions" }, [go]), res
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "invite/create", { npi: inp.value.trim() }).then(function (j) {
        if (j._status !== 201) return say(words(j), "err");
        res.innerHTML = "";
        var link = el("input", { id: "invite-link", readonly: true, value: j.url });
        res.appendChild(el("p", { "class": "small", text: "Link for " + j.name + (j.held ? " (this listing already has an account; it will reach us first)" : "") + ":" }));
        res.appendChild(link);
        var copy = el("button", { type: "button", "class": "secondary", id: "invite-copy", text: "Copy link" });
        copy.addEventListener("click", function () {
          function selected() { link.focus(); link.select(); copy.textContent = "Press copy on your device"; }
          if (navigator.clipboard) navigator.clipboard.writeText(j.url).then(function () { copy.textContent = "Copied"; }, selected); else selected();
        });
        res.appendChild(el("div", { "class": "acct-actions" }, [copy]));
        document.getElementById("invite-left").textContent = inviteWords(j.left);
        if (j.left <= 0) go.disabled = true;
        say("Invitation link made. " + j.left + " left.", "ok");
      });
    });
    return f;
  }

  function emailPanel(me) {
    var a = me.account;
    var inp = el("input", { id: "e-email", name: "email", type: "email", maxlength: "200", autocomplete: "email", required: true });
    var go = el("button", { type: "submit", "class": "secondary", text: "Send a code" });
    var f = el("form", { "class": "acct-form", id: "email-form", novalidate: true }, [
      el("p", { "class": "small", text: a.email ? "Now: " + a.email + ". To change it, type the new one; we send it a code." :
        "Add an email you'll keep, so you can sign in again. We send it a 6-digit code." }),
      field("e-email", a.email ? "New email" : "Email", inp), el("div", { "class": "acct-actions" }, [go])
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var addr = inp.value.trim();
      function ask() { return api("POST", "email", { email: addr }).then(function (j) { if (j._status !== 202) { say(words(j), "err"); return null; } return j.challenge; }); }
      busy(go, true);
      ask().then(function (ch) {
        busy(go, false);
        if (!ch) return;
        say("We sent a 6-digit code to " + addr + ".", "ok");
        codeStep(addr, ch, function () { say("Login email saved.", "ok"); load(); }, ask, load);
      });
    });
    return panel("email-panel", a.email ? "Login email" : "Add a login email", [f], a.email ? "" : "need");
  }

  var FIELD = { blurbs: "Notes", insurances: "Insurance plans", insurance_other: "Other plans", insurance_confirm: "Confirm with the office",
    booking_url: "Website link", telehealth: "Video visits", offices: "Offices", photo: "Photo", attested: "Procedures", level: "Access level", account: "Account created",
    takeover: "Listing moved to you", lost_npi: "Listing lost", login_email: "Login email", invite: "Invitation made", doximity: "Doximity linked" };
  var WHEN = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  function when(t) {
    var d = new Date(t), now = new Date();
    var o = Object.assign({}, WHEN); if (d.getFullYear() !== now.getFullYear()) o.year = "numeric";
    return d.toLocaleString("en-US", o).replace(" AM", " am").replace(" PM", " pm");
  }
  function historyPanel() {
    var ul = el("ul", { "class": "history" });
    var d = el("details", { id: "history", "class": "acct-panel history-panel" }, [el("summary", null, [el("h2", { text: "History" })]),
      el("p", { "class": "small muted", text: "Every change is kept. Undo puts back what was there before." }), ul]);
    d.addEventListener("toggle", function () {
      if (!d.open || d.loaded) return; d.loaded = true;
      api("GET", "edits").then(function (j) {
        (j.edits || []).forEach(function (e) {
          ul.appendChild(el("li", null, [
            el("span", { "class": "h-what" }, [(FIELD[e.field] || e.field) + (e.undo_of ? " (undone)" : "") + (e.by_you ? "" : " (earlier account)"),
              el("time", { "class": "h-when", datetime: e.at, text: when(e.at) })]),
            e.undoable ? el("button", { "class": "link undo", type: "button", text: "Undo", "data-edit": e.id, onclick: function () {
              api("POST", "undo", { edit_id: e.id }).then(function (r) { if (r.ok) { say("Undone.", "ok"); load(); } else say(words(r), "err"); });
            } }) : null
          ]));
        });
      });
    });
    return d;
  }

  function dashboard(me) {
    var a = me.account, wasOpen = !!(document.getElementById("history") || {}).open;
    var head = el("div", { "class": "acct-head", id: "acct-head" }, [
      el("div", null, [el("p", { "class": "acct-name" }, [el("strong", { text: a.name })]),
        el("p", { "class": "small muted" }, [a.npi ? "NPI " + a.npi + " · " : a.claim_npi ? "NPI " + a.claim_npi + " · " : "",
          el("span", { "class": "pill" + (a.level === "full" ? " full" : ""), id: "acct-pill", text: a.npi ? levelName(a) : "No listing yet" })])]),
      el("button", { "class": "link", type: "button", id: "signout", text: "Sign out", onclick: function () {
        api("POST", "logout", {}).then(function () { location.hash = ""; hush(); start(); }); } })
    ]);
    var parts = [head];
    if (a.npi) {
      parts.push(seePanel(me), procPanel(me), officePanel(me), telePanel(me), photoPanel(me), insurancePanel(me), accessPanel(me), emailPanel(me), historyPanel());
    } else {
      parts.push(accessPanel(me), emailPanel(me));
    }
    view(parts, null);
    if (wasOpen) { var h = document.getElementById("history"); if (h) h.open = true; }
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
