// Every Option physician accounts (job 11, built, not open). Talks only to /api/account/* on this site.
// With no backend connected the status call answers 503 and this page shows "Accounts are not open yet" and does
// nothing else. No cookies of its own, no local storage; the session cookie is HttpOnly and set by the server.
// Sign-in is a 6-digit code typed on this page. An invitation link (#invite=...) opens straight to the doctor's listing.
(function () {
  "use strict";
  var box = document.getElementById("acct");
  if (!box) return;
  var closed = document.getElementById("acct-closed");
  var statusEl = document.getElementById("acct-status");
  var out = document.getElementById("acct-out");
  var STATUS = null;
  var PROC = window.EO_PROCS.short, PROC_LONG = window.EO_PROCS.long;   // site/assets/procedures.js, the shared list
  var QS = new URLSearchParams(location.search);
  var WANT = QS.get("procedure") || "";      // the procedure from the card link, ticked to start with
  var WORDS = {
    rate_limited: "Too many tries for now. Please wait and try again later.",
    agree_required: "Please tick the agreement.",
    invalid: "Please check the highlighted details.",
    npi_not_individual: "That NPI is not an individual's NPI.",
    not_a_physician: "Every Option lists physicians only.",
    code_invalid: "That code is wrong, expired, or already used. Check it, or ask for a new code.",
    email_in_use: "That email already has an Every Option account. Sign in with it, or use a different email.",
    npi_taken: "This listing already has an account. We will look into it and contact you.",
    invite_invalid: "This invitation has expired, was already used, or was withdrawn. Ask for a new one.",
    invite_limit: "You have used all 5 invitations.", invite_self: "That is your own NPI.",
    street_required: "Each new office needs a street address, such as 100 Main Street, Suite 2.",
    full_needed: "This needs full access. Confirm who you are with ID or Doximity, or ask a colleague with full access for an invitation.",
    no_npi: "Confirm who you are first.",
    other_browser: "Finish linking Doximity in the same browser you started it in.",
    name_mismatch: "That name does not match the NPI Registry for this NPI. We will look into it.",
    screened: "Some text was not accepted (see below).",
    photo_type: "Use a JPEG, PNG, or WebP photo.", photo_too_large: "That photo is over 2 MB.",
    photo_dimensions: "Use a photo between 100 and 6000 pixels on each side.", photo_unreadable: "We could not read that photo.",
    changed_since: "That field changed again later. Undo the newer change first.", already_undone: "Already undone.",
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
  function api(method, path, body, type) {
    var o = { method: method, credentials: "same-origin", headers: {} };
    if (body !== undefined) {
      if (type) { o.headers["Content-Type"] = type; o.body = body; }
      else { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    }
    return fetch("/api/account/" + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; });
    });
  }
  function words(j) { return j.message || WORDS[j.error] || WORDS.server; }
  function procBoxes(listed, name) {
    return el("fieldset", null, [el("legend", { text: "Procedures you personally perform" }),
      el("div", { "class": "checks", style: "flex-direction:column" }, Object.keys(PROC).map(function (k) {
        return el("label", null, [el("input", { type: "checkbox", name: name || "procedures", value: k, checked: k === WANT }), PROC_LONG[k] +
          (listed && listed.indexOf(k) >= 0 ? " (on your listing)" : "")]);
      }))]);
  }
  function ticked(f) { return [].slice.call(f.querySelectorAll('input[name="procedures"]:checked')).map(function (x) { return x.value; }); }

  // The code step, shown in place after a code is sent. done(j) runs on a right code.
  function codeStep(where, email, challenge, done) {
    var old = document.getElementById("code-form"); if (old) old.remove();
    var inp = el("input", { id: "c-code", name: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", pattern: "[0-9]{6}", required: true });
    var f = el("form", { "class": "claim-form", id: "code-form", novalidate: true }, [
      el("div", null, [el("label", { "for": "c-code", text: "6-digit code sent to " + email }), inp]),
      el("p", { "class": "small muted", text: "It works once, for one hour. Not there? Check spam, or send it again." }),
      el("div", null, [el("button", { type: "submit", text: "Confirm" })])
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "code", { challenge: challenge, code: inp.value.replace(/\s/g, "") }).then(function (j) {
        if (j.ok) done(j); else say(words(j), "err");
      });
    });
    where.parentNode.insertBefore(f, where.nextSibling);
    inp.focus();
  }

  function forms() {
    out.innerHTML = "";
    var npi = (QS.get("npi") || "").replace(/\D/g, "").slice(0, 10);
    var who = el("div", { id: "s-who", "class": "notice", hidden: true });
    var procs = el("div", { id: "s-procs" }, [procBoxes([])]);
    var agreeText = el("span", { id: "s-agree-text", text: "I am the physician with this NPI. I personally perform each procedure I ticked, and what I enter about my practice is accurate. I accept the Every Option terms of service and privacy policy." });
    var s = el("form", { "class": "claim-form", id: "signup-form", novalidate: true }, [
      el("h2", { style: "margin-top:0", text: "Is this you? Confirm your listing" }),
      el("div", null, [el("label", { "for": "s-npi" }, ["NPI ", el("span", { "class": "hint", text: "(10 digits)" })]),
        el("input", { id: "s-npi", name: "npi", inputmode: "numeric", maxlength: "10", pattern: "[0-9]{10}", required: true, value: npi })]),
      who, procs,
      el("div", null, [el("label", { "for": "s-email" }, ["Email ", el("span", { "class": "hint", text: "(use an email you'll keep; personal is fine)" })]),
        el("input", { id: "s-email", name: "email", type: "email", maxlength: "200", autocomplete: "email", required: true })]),
      el("div", { "class": "checks" }, [el("label", null, [el("input", { type: "checkbox", name: "agree", id: "s-agree", required: true }), agreeText])]),
      el("p", { "class": "small muted", text: "No password. We email you a 6-digit code to type here. Your name comes from the NPI Registry." }),
      el("div", null, [el("button", { type: "submit", text: "Send my code" })])
    ]);
    function look() {
      var v = s.npi.value.trim();
      if (!/^\d{10}$/.test(v)) { who.hidden = true; return; }
      api("GET", "lookup?npi=" + v).then(function (j) {
        if (!j.ok) { who.hidden = false; who.textContent = words(j); return; }
        who.hidden = false; who.innerHTML = "";
        who.appendChild(el("p", null, [el("strong", { text: j.name }), " · NPI " + j.npi]));
        who.appendChild(el("p", { "class": "small", text: j.listed_for.length ? "Listed on Every Option for " +
          j.listed_for.map(function (k) { return PROC[k]; }).join(", ") + "." : "Not listed on Every Option yet; confirming adds you." }));
        if (j.held) who.appendChild(el("p", { "class": "small", text: "This listing already has an account. If it is yours, carry on: after the code, confirm who you are with Doximity or a photo ID and the listing moves to you." }));
        procs.innerHTML = ""; procs.appendChild(procBoxes(j.listed_for));
        agreeText.textContent = j.agreement;
      });
    }
    s.npi.addEventListener("input", look);
    if (npi) look();
    s.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = s.email.value.trim();
      api("POST", "signup", { npi: s.npi.value.trim(), email: email, procedures: ticked(s), agree: s.agree.checked }).then(function (j) {
        if (j._status !== 202) return say(words(j), "err");
        if (j.waitlist) return say(j.message, "ok");
        say(j.npi_taken ? j.message : "We sent a 6-digit code to " + email + ".", "ok");
        codeStep(s, email, j.challenge, function (r) {
          say(r.claimant ? "Email confirmed. Now confirm who you are to take over this listing." : "You are in. Your listing shows “confirmed by physician” at the next site update.", "ok");
          load();
        });
      });
    });
    var l = el("form", { "class": "claim-form", id: "login-form", novalidate: true }, [
      el("h2", { style: "margin-top:0", text: "Already have an account?" }),
      el("div", null, [el("label", { "for": "l-email", text: "Email" }), el("input", { id: "l-email", name: "email", type: "email", maxlength: "200", autocomplete: "email", required: true })]),
      el("div", null, [el("button", { type: "submit", "class": "secondary", text: "Send me a code" }), " ",
        STATUS && STATUS.doximity ? el("a", { id: "dox", href: "/api/account/doximity/start", text: "Sign in with Doximity" }) : null]),
      el("p", { "class": "small muted", text: "Lost access to your email? Sign in with Doximity if you linked it, confirm your listing again and confirm who you are with a photo ID, or ask for a new invitation." })
    ]);
    l.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = l.email.value.trim();
      api("POST", "login", { email: email }).then(function (j) {
        if (j._status !== 202) return say(words(j), "err");
        say("If that email has an account, a 6-digit code is on its way.", "ok");
        codeStep(l, email, j.challenge, function () { say("You are signed in.", "ok"); load(); });
      });
    });
    out.appendChild(s); out.appendChild(l);
  }

  // An invitation: the doctor's listing, procedures to tick, one agreement. Nothing else to type.
  function invitation(tok) {
    return api("POST", "invite/preview", { token: tok }).then(function (pv) {
      out.innerHTML = "";
      if (!pv.ok) { say(words(pv), "err"); forms(); return; }
      var f = el("form", { "class": "claim-form", id: "invite-form", novalidate: true }, [
        el("h2", { style: "margin-top:0", text: "Your Every Option listing" }),
        el("div", { "class": "notice" }, [el("p", null, [el("strong", { text: pv.name }), " · NPI " + pv.npi]),
          el("p", { "class": "small", text: pv.listed_for.length ? "Listed for " + pv.listed_for.map(function (k) { return PROC[k]; }).join(", ") + "." : "Not listed yet; confirming adds you." })]),
        procBoxes(pv.listed_for),
        el("div", { "class": "checks" }, [el("label", null, [el("input", { type: "checkbox", name: "agree", id: "i-agree" }), pv.agreement])]),
        el("div", null, [el("button", { type: "submit", text: "Confirm my listing" })])
      ]);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        api("POST", "invite/accept", { token: tok, procedures: ticked(f), agree: f.agree.checked }).then(function (j) {
          if (!j.ok) return say(words(j), "err");
          say("Done. Your listing shows “confirmed by physician” at the next site update. To edit later, add a login email below.", "ok");
          load();
        });
      });
      out.appendChild(f);
    });
  }

  function levelText(me) {
    var a = me.account;
    if (!a.npi && a.claim_npi) return me.dispute ? "This listing's account was already confirmed by ID or Doximity. We will look into it and contact you."
      : "This listing (NPI " + a.claim_npi + ") already has an account. Confirm who you are below; a confirmed doctor takes the listing over.";
    if (!a.npi) return "This account no longer holds a listing.";
    return a.level === "full" ? "Full access." : "Basic access: confirm procedures, write notes, and add insurances. To change phone, offices, booking link, or photo, confirm who you are with ID or Doximity, or ask a colleague with full access for an invitation.";
  }

  function proofBox(me) {
    return el("div", { "class": "claim-form", id: "proof" }, [
      el("h2", { style: "margin-top:0", text: "Confirm who you are" }),
      el("p", { text: "A photo ID and a selfie, checked by our identity provider. We keep only the result and the name on the ID, never the images." }),
      el("div", null, [el("button", { type: "button", id: "check-id", text: "Confirm with ID", onclick: function () {
        api("POST", "check/identity", {}).then(function (j) {
          if (j.url) location.assign(j.url); else if (j.already) load(); else say(words(j), "err");
        }); } }),
        STATUS && STATUS.doximity && !me.doximity_linked ? " " : null,
        STATUS && STATUS.doximity && !me.doximity_linked ? el("a", { href: "/api/account/doximity/start", id: "dox-link", text: "Confirm with Doximity" }) : null])
    ]);
  }

  function emailBox(me) {
    var a = me.account;
    var inp = el("input", { id: "e-email", name: "email", type: "email", maxlength: "200", autocomplete: "email", required: true });
    var f = el("form", { "class": "claim-form", id: "email-form", novalidate: true }, [
      el("h2", { style: "margin-top:0", text: a.email ? "Login email" : "Add a login email" }),
      el("p", { "class": "small", text: a.email ? "Now: " + a.email + ". Change it below; we send a code to the new address." :
        "To sign in again later, add an email you'll keep. We send it a 6-digit code." }),
      el("div", null, [el("label", { "for": "e-email", text: a.email ? "New email" : "Email" }), inp]),
      el("div", null, [el("button", { type: "submit", "class": "secondary", text: "Send a code" })])
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = inp.value.trim();
      api("POST", "email", { email: email }).then(function (j) {
        if (j._status !== 202) return say(words(j), "err");
        say("We sent a 6-digit code to " + email + ".", "ok");
        codeStep(f, email, j.challenge, function () { say("Login email saved.", "ok"); load(); });
      });
    });
    return f;
  }

  function inviteBox(me) {
    var inv = me.invites || { left: 0, sent: [] };
    var inp = el("input", { id: "v-npi", name: "npi", inputmode: "numeric", maxlength: "10" });
    var res = el("div", { id: "invite-out" });
    var f = el("form", { "class": "claim-form", id: "invite-create", novalidate: true }, [
      el("h2", { style: "margin-top:0", text: "Invite a colleague" }),
      el("p", { "class": "small", text: "A link for one colleague's NPI, good once for 7 days. They get full access. You have " + inv.left + " of 5 left. Send it yourself." }),
      el("div", null, [el("label", { "for": "v-npi", text: "Their NPI" }), inp]),
      el("div", null, [el("button", { type: "submit", "class": "secondary", text: "Make a link", disabled: inv.left <= 0 })]), res
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "invite/create", { npi: inp.value.trim() }).then(function (j) {
        if (j._status !== 201) return say(words(j), "err");
        res.innerHTML = "";
        var link = el("input", { id: "invite-link", readonly: true, value: j.url });
        res.appendChild(el("p", { "class": "small", text: "Link for " + j.name + (j.held ? " (this listing already has an account; it will reach us first)" : "") + ":" }));
        res.appendChild(link);
        say("Invitation link made. " + j.left + " left.", "ok");
      });
    });
    return f;
  }

  function attest(me) {
    var done = (me.profile && me.profile.attested) || [];
    var procs = Object.keys(PROC);
    if (done.length === procs.length) return el("p", { "class": "notice", id: "attest-form", text: "Confirmed: UFE, PAE, GAE." });
    var f = el("form", { "class": "claim-form", id: "attest-form", novalidate: true }, [
      el("h2", { style: "margin-top:0", text: "Procedures you perform" }),
      done.length ? el("p", { "class": "small", text: "Confirmed: " + done.map(function (k) { return PROC[k]; }).join(", ") + "." }) : null,
      el("fieldset", null, [el("legend", { text: "Tick each one you personally perform" }),
        el("div", { "class": "checks", style: "flex-direction:column" }, procs.filter(function (k) { return done.indexOf(k) < 0; }).map(function (k) {
          return el("label", null, [el("input", { type: "checkbox", name: "procedures", value: k }), me.attest_wording[k]]);
        }))]),
      el("div", { "class": "checks" }, [el("label", null, [el("input", { type: "checkbox", name: "agree" }), "The statements I ticked are true."])]),
      el("div", null, [el("button", { type: "submit", text: "Confirm" })])
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "attest", { procedures: ticked(f), agree: f.agree.checked }).then(function (j) {
        if (j.ok) { say("Thank you. You are in the confirmed group for " + j.attested.map(function (k) { return PROC[k]; }).join(", ") + ".", "ok"); load(); }
        else say(words(j), "err");
      });
    });
    return f;
  }

  function dashboard(me) {
    var a = me.account, p = me.profile || {};
    out.innerHTML = "";
    out.appendChild(el("div", { "class": "notice", id: "acct-head" }, [
      el("p", null, [el("strong", { text: a.name }), a.npi ? " · NPI " + a.npi : ""]),
      el("p", { "class": "small", id: "acct-level", text: levelText(me) }),
      el("button", { "class": "secondary", type: "button", id: "signout", text: "Sign out", onclick: function () {
        api("POST", "logout", {}).then(function () { location.hash = ""; start(); }); } })
    ]));
    if (!me.dispute && (a.claim_npi || (a.npi && a.level !== "full"))) out.appendChild(proofBox(me));
    if (a.npi) {
      out.appendChild(attest(me));
      out.appendChild(profile(me, p));
      if (me.can.photo) out.appendChild(photo(p));
      if (me.can.invite) out.appendChild(inviteBox(me));
    }
    out.appendChild(emailBox(me));
    if (a.npi) out.appendChild(changes());
    if (STATUS && STATUS.doximity && !me.doximity_linked && a.level === "full") out.appendChild(el("p", { "class": "small" },
      [el("a", { href: "/api/account/doximity/start", text: "Link Doximity" }), " to sign in with Doximity next time."]));
  }

  function counter(t) {
    var c = el("span", { "class": "hint", text: t.value.length + " / 300" });
    t.addEventListener("input", function () { c.textContent = t.value.length + " / 300"; });
    return c;
  }

  function profile(me, p) {
    var kids = [el("h2", { style: "margin-top:0", text: "Your card" }),
      el("p", { "class": "small muted", text: "Your card shows only what you fill in. No links, phone numbers, or patient stories in the notes, and no words like best, guaranteed, or cure." })];
    Object.keys(PROC).forEach(function (k) {
      var t = el("textarea", { id: "b-" + k, name: "blurb_" + k, rows: "3", maxlength: "300" });
      t.value = (p.blurbs || {})[k] || "";
      kids.push(el("div", null, [el("label", { "for": "b-" + k }, ["Note for " + PROC[k] + " ", counter(t)]), t,
        el("p", { "class": "err small", id: "why-b-" + k })]));
    });
    kids.push(el("fieldset", null, [el("legend", { text: "Insurance plans you take" }), el("div", { "class": "checks" },
      (me.insurers || []).map(function (n) {
        return el("label", null, [el("input", { type: "checkbox", name: "insurances", value: n, checked: (p.insurances || []).indexOf(n) >= 0 }), n]);
      }))]));
    var other = el("input", { id: "i-other", name: "insurance_other", maxlength: "100" }); other.value = p.insurance_other || "";
    kids.push(el("div", null, [el("label", { "for": "i-other", text: "Other plans" }), other]));
    kids.push(el("div", { "class": "checks" }, [el("label", null, [el("input", { type: "checkbox", name: "insurance_confirm", checked: !!p.insurance_confirm }),
      "Add “Confirm with the office”"])]));
    var contact = !!(me.can && me.can.contact);
    var book = el("input", { id: "p-book", name: "booking_url", type: "url", maxlength: "300", placeholder: "https://" }); book.value = p.booking_url || "";
    if (contact) kids.push(el("div", null, [el("label", { "for": "p-book", text: "Online booking link" }), book]));
    else kids.push(el("p", { "class": "notice small", id: "contact-locked", text: "Phone, offices, booking link, and photo need full access (see above)." }));
    var offs = el("div", { id: "offices" });
    var list = (p.offices && p.offices.length ? p.offices : [{}]);
    function officeRow(o, i) {
      function f(name, label, attrs) {
        var inp = el("input", Object.assign({ id: "o" + i + "-" + name, name: name }, attrs || {})); inp.value = o[name] || "";
        return el("div", null, [el("label", { "for": "o" + i + "-" + name, text: label }), inp]);
      }
      return el("fieldset", { "class": "office" }, [el("legend", { text: i === 0 ? "Main office" : "Office " + (i + 1) }),
        f("practice", "Practice name", { maxlength: "120" }), f("street", "Street address", { maxlength: "120", autocomplete: "street-address" }),
        f("city", "City", { maxlength: "60" }),
        el("div", { "class": "row2" }, [f("state", "State (2 letters)", { maxlength: "2" }), f("zip", "ZIP", { maxlength: "5", inputmode: "numeric" })]),
        f("phone", "Office phone", { maxlength: "20", inputmode: "tel" })]);
    }
    list.forEach(function (o, i) { offs.appendChild(officeRow(o, i)); });
    if (contact) {
      kids.push(offs);
      kids.push(el("div", null, [el("button", { "class": "secondary", type: "button", id: "add-office", text: "Add another office", onclick: function () {
        var n = offs.querySelectorAll("fieldset.office").length; if (n < 5) offs.appendChild(officeRow({}, n)); } })]));
    }
    kids.push(el("div", null, [el("button", { type: "submit", text: "Save" })]));
    var f = el("form", { "class": "claim-form", id: "profile-form", novalidate: true }, kids);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var blurbs = {};
      Object.keys(PROC).forEach(function (k) { blurbs[k] = f["blurb_" + k].value; f.querySelector("#why-b-" + k).textContent = ""; });
      var badOffice = [];
      var offices = [].slice.call(offs.querySelectorAll("fieldset.office")).map(function (fs) {
        var g = function (n) { return fs.querySelector('[name="' + n + '"]').value.trim(); };
        var o = { practice: g("practice"), street: g("street"), city: g("city"), state: g("state").toUpperCase(), zip: g("zip"), phone: g("phone") };
        // Job 20: the same rules as the server, so the field that is wrong is the one marked (the server names only "offices").
        var used = o.practice || o.street || o.city || o.zip || o.phone, digits = o.phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
        [["city", used && !o.city], ["state", used && !/^[A-Z]{2}$/.test(o.state)], ["zip", used && !/^\d{5}$/.test(o.zip)],
          ["phone", o.phone && digits.length !== 10]].forEach(function (c) {
          var inp = fs.querySelector('[name="' + c[0] + '"]');
          if (c[1]) { inp.setAttribute("aria-invalid", "true"); badOffice.push(inp); } else inp.removeAttribute("aria-invalid");
        });
        return o;
      }).filter(function (o) { return o.practice || o.street || o.city || o.zip || o.phone; });
      if (contact && badOffice.length) { say("Please check the highlighted office details.", "err"); badOffice[0].focus(); return; }
      var patch = { blurbs: blurbs, insurances: [].slice.call(f.querySelectorAll('input[name="insurances"]:checked')).map(function (x) { return x.value; }),
        insurance_other: other.value.trim(), insurance_confirm: f.insurance_confirm.checked };
      if (contact) { patch.booking_url = book.value.trim(); patch.offices = offices; }
      api("PUT", "profile", patch)
        .then(function (j) {
          if (j.ok) {
            var miss = (j.unmatched || []).map(function (i) { var o = offices[i] || {}; return o.practice || o.street || "one office"; });
            say(miss.length ? (j.changed.length ? "Saved. " : "") + "We couldn't find the street address for " + miss.join(" and ") +
              " on the map, so patients see the distance to the center of that office's ZIP code instead. Check the address, or leave it as it is." : j.changed.length ? "Saved." : "No changes.", "ok");
            load(); return;
          }
          if (j.error === "screened") Object.keys(j.blocked).forEach(function (k) {
            var why = k === "blurbs" ? j.blocked.blurbs : null;
            if (why) Object.keys(why).forEach(function (pk) { var n = f.querySelector("#why-b-" + pk); if (n) n.textContent = "Not accepted: this has " + why[pk].map(function (r) { return REASONS[r] || r; }).join(" and ") + "."; });
          });
          var rows = [].slice.call(offs.querySelectorAll("fieldset.office")).filter(function (fs) {   // same rows as the saved list
            return [].some.call(fs.querySelectorAll("input"), function (x) { return x.name !== "state" && x.value.trim(); }); }), first = null;
          if (j.error === "street_required") (j.offices || []).forEach(function (i) {
            var s = rows[i] && rows[i].querySelector('[name="street"]'); if (s) { s.setAttribute("aria-invalid", "true"); first = first || s; } });
          say(words(j) + (j.fields && !first ? " (" + j.fields.join(", ").replace(/_/g, " ") + ")" : ""), "err");
          if (first) first.focus();
        });
    });
    return f;
  }

  function photo(p) {
    var inp = el("input", { id: "photo", type: "file", accept: "image/jpeg,image/png,image/webp" });
    var f = el("form", { "class": "claim-form", id: "photo-form", novalidate: true }, [
      el("h2", { style: "margin-top:0", text: "Photo" }),
      el("p", { "class": "small muted", text: p.photo_key ? "You have a photo on file." : "A head-and-shoulders photo. JPEG, PNG, or WebP, up to 2 MB. We remove location and camera details from the file." }),
      el("div", null, [el("label", { "for": "photo", text: "Choose a photo" }), inp]),
      el("div", null, [el("button", { type: "submit", text: "Upload" })])
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var file = inp.files && inp.files[0]; if (!file) return say("Choose a photo first.", "err");
      api("POST", "photo", file, file.type || "application/octet-stream").then(function (j) {
        if (j.ok) { say("Photo saved.", "ok"); load(); } else say(words(j), "err");
      });
    });
    return f;
  }

  var FIELD = { blurbs: "Notes", insurances: "Insurance plans", insurance_other: "Other plans", insurance_confirm: "Confirm with the office",
    booking_url: "Booking link", offices: "Offices", photo: "Photo", attested: "Procedures confirmed", level: "Access level", account: "Account made", takeover: "Listing taken over", lost_npi: "Listing lost", login_email: "Login email", invite: "Invitation made", doximity: "Doximity linked" };
  function changes() {
    var wrap = el("section", { id: "history" }, [el("h2", { text: "Your changes" }), el("p", { "class": "small muted", text: "Every change is kept. Undo puts back what was there before." })]);
    var ul = el("ul", { "class": "history" });
    wrap.appendChild(ul);
    api("GET", "edits").then(function (j) {
      (j.edits || []).forEach(function (e) {
        ul.appendChild(el("li", null, [
          el("span", { text: (FIELD[e.field] || e.field) + (e.undo_of ? " (undone)" : "") + (e.by_you ? "" : " (by an earlier account)") + " · " + new Date(e.at).toLocaleString() }),
          e.undoable ? el("button", { "class": "secondary undo", type: "button", text: "Undo", "data-edit": e.id, onclick: function () {
            api("POST", "undo", { edit_id: e.id }).then(function (r) { if (r.ok) { say("Undone.", "ok"); load(); } else say(words(r), "err"); });
          } }) : null
        ]));
      });
    });
    return wrap;
  }

  function load() {
    return api("GET", "me").then(function (j) {
      if (j._status === 200) dashboard(j);
      else forms();
    });
  }

  function useHash() {
    var m = /^#(invite|doximity)=([0-9a-z-]+)$/.exec(location.hash);
    if (!m) return Promise.resolve(false);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (m[1] === "invite") return invitation(m[2]).then(function () { return true; });
    if (m[2] === "signed-in") { say("Signed in with Doximity.", "ok"); return Promise.resolve(false); }
    if (m[2] === "failed") { say("Doximity sign-in did not finish. Sign in by email instead.", "err"); return Promise.resolve(false); }
    // Show whose Doximity account this is and wait for a click before linking it.
    var tok = m[2];
    return api("POST", "doximity/preview", { token: tok }).then(function (pv) {
      if (!pv.ok) { say(words(pv), "err"); return false; }
      var b = el("div", { "class": "notice", id: "dox-confirm" }, [
        el("p", { text: "Link the Doximity account of " + pv.name + (pv.specialty ? " (" + pv.specialty + ")" : "") + " to this Every Option account?" }),
        el("button", { type: "button", id: "dox-yes", text: "Link Doximity", onclick: function () {
          api("POST", "doximity/link", { token: tok }).then(function (j) {
            b.remove();
            if (j.ok) say(j.takeover ? "Confirmed by Doximity. The listing is now yours, with full access." : j.dispute ?
              "Confirmed by Doximity. This listing's account was already confirmed, so we will look into it." : j.proof ?
              "Confirmed by Doximity. You have full access." : "Doximity linked for signing in. It could not confirm you on its own" +
              (j.reason === "name_not_unique" ? " (another radiologist shares your name)" : "") + "; use a photo ID for full access.", "ok");
            else say(j.error === "signed_out" ? "Sign in by email first, then link Doximity from your account." : words(j), "err");
            load();
          });
        } }), " ",
        el("button", { "class": "secondary", type: "button", text: "Cancel", onclick: function () { b.remove(); } })
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
