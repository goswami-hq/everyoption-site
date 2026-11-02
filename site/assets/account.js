// Every Option physician accounts (job 10, built, not open). Talks only to /api/account/* on this site.
// With no backend connected the status call answers 503 and this page shows "Accounts are not open yet" and does
// nothing else. No cookies of its own, no local storage; the session cookie is HttpOnly and set by the server.
(function () {
  "use strict";
  var box = document.getElementById("acct");
  if (!box) return;
  var closed = document.getElementById("acct-closed");
  var statusEl = document.getElementById("acct-status");
  var out = document.getElementById("acct-out");
  var forms = out.innerHTML;
  var STATUS = null;
  var PROC = { ufe: "UFE", pae: "PAE", gae: "GAE" };
  var WORDS = {
    rate_limited: "Too many tries for now. Please wait and try again later.",
    terms_required: "Please accept the terms of service and privacy policy.",
    invalid: "Please check the highlighted details.",
    npi_not_individual: "That NPI is not an individual's NPI.",
    not_a_physician: "Every Option lists physicians only.",
    name_mismatch: "That name does not match the NPI Registry for this NPI.",
    link_invalid: "That link has expired or was already used. Ask for a new one.",
    npi_taken: "This NPI already has an account. We will look into it and contact you.",
    domain_no_match: "That email's domain does not match a page on your listing. Try another work email, or check with ID.",
    name_not_in_email: "The work email needs your last name in it (like ann.testone@). We will look at this one; meanwhile you can check with ID.",
    work_email_in_use: "That work email already confirmed another account. Try another, or check with ID.",
    other_browser: "Finish linking Doximity in the same browser you started it in.",
    not_verified: "Finish one check first.",
    agree_required: "Please tick the statement.",
    screened: "Some text was not accepted (see below).",
    photo_type: "Use a JPEG, PNG or WebP photo.", photo_too_large: "That photo is over 2 MB.",
    photo_dimensions: "Use a photo between 100 and 6000 pixels on each side.", photo_unreadable: "We could not read that photo.",
    changed_since: "That field changed again later. Undo the newer change first.", already_undone: "Already undone.",
    signed_out: "Please sign in again.", server: "Something went wrong on our side. Please try again."
  };
  var REASONS = { too_long: "too long", link: "a link", email: "an email address", phone: "a phone number",
    patient_story: "what reads as a patient story", promise: "a promise or superlative word (like best, guaranteed or cure)" };

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
  function words(j) { return WORDS[j.error] || WORDS.server; }

  function wire() {
    var s = document.getElementById("signup-form"), l = document.getElementById("login-form");
    if (STATUS && STATUS.doximity) document.getElementById("dox").hidden = false;
    s.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "signup", { npi: s.npi.value.trim(), email: s.email.value.trim(), name: s.name.value.trim(),
        accept_terms: s.accept_terms.checked }).then(function (j) {
        if (j._status === 202) say(j.waitlist ? j.message : "Check your email for a sign-in link. It works once, for 15 minutes.", "ok");
        else say(words(j), "err");
      });
    });
    l.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "login", { email: l.email.value.trim() }).then(function (j) {
        say(j._status === 202 ? "If that email has an account, a sign-in link is on its way." : words(j), j._status === 202 ? "ok" : "err");
      });
    });
  }

  function dashboard(me) {
    var a = me.account, p = me.profile || {};
    out.innerHTML = "";
    var head = el("div", { "class": "notice" }, [
      el("p", null, [el("strong", { text: a.name }), " · NPI " + a.npi]),
      el("p", { "class": "small", text: a.status === "verified" ? "Checked. Your edits show on your card at the next site update." :
        "Not checked yet. One check below puts you in the confirmed group." }),
      el("button", { "class": "secondary", type: "button", id: "signout", text: "Sign out", onclick: function () {
        api("POST", "logout", {}).then(function () { location.hash = ""; start(); }); } })
    ]);
    out.appendChild(head);
    if (a.status !== "verified") out.appendChild(checks());
    else {
      out.appendChild(attest(me));
      out.appendChild(profile(me, p));
      out.appendChild(photo(p));
      out.appendChild(changes());
    }
    if (STATUS && STATUS.doximity && !me.doximity_linked) out.appendChild(el("p", { "class": "small" },
      [el("a", { href: "/api/account/doximity/start", text: "Link Doximity" }), " to sign in with Doximity next time."]));
  }

  function checks() {
    var f = el("form", { "class": "claim-form", id: "check-email-form", novalidate: true }, [
      el("h2", { style: "margin-top:0", text: "One check to go live" }),
      el("p", { text: "Option 1: a work email at the same site as a page on your listing." }),
      el("div", null, [el("label", { "for": "c-work", text: "Work email" }),
        el("input", { id: "c-work", name: "work_email", type: "email", maxlength: "200", required: true })]),
      el("div", null, [el("button", { type: "submit", text: "Send a check link" })]),
      el("p", { text: "Option 2: a photo ID and a selfie, checked by our identity provider. We keep only the result and the name on the ID, never the images." }),
      el("div", null, [el("button", { "class": "secondary", type: "button", id: "check-id", text: "Check with ID", onclick: function () {
        api("POST", "check/identity", {}).then(function (j) {
          if (j.url) location.assign(j.url); else if (j.already) start(); else say(words(j), "err");
        }); } })])
    ]);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "check/email", { work_email: f.work_email.value.trim() }).then(function (j) {
        say(j._status === 202 ? "Check that inbox for a link. It works once, for 15 minutes." : words(j), j._status === 202 ? "ok" : "err");
      });
    });
    return f;
  }

  function attest(me) {
    var done = (me.profile && me.profile.attested) || [];
    var procs = Object.keys(PROC);
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
    if (done.length === procs.length) return el("p", { "class": "notice", id: "attest-form", text: "Confirmed: UFE, PAE, GAE." });
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var ps = [].slice.call(f.querySelectorAll('input[name="procedures"]:checked')).map(function (x) { return x.value; });
      api("POST", "attest", { procedures: ps, agree: f.agree.checked }).then(function (j) {
        if (j.ok) { say("Thank you. You are in the confirmed group for " + j.attested.map(function (k) { return PROC[k]; }).join(", ") + ".", "ok"); load(); }
        else say(words(j), "err");
      });
    });
    return f;
  }

  function counter(t) {
    var c = el("span", { "class": "hint", text: t.value.length + " / 300" });
    t.addEventListener("input", function () { c.textContent = t.value.length + " / 300"; });
    return c;
  }

  function profile(me, p) {
    var kids = [el("h2", { style: "margin-top:0", text: "Your card" }),
      el("p", { "class": "small muted", text: "Your card shows only what you fill in. No links, phone numbers or patient stories in the notes, and no words like best, guaranteed or cure." })];
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
    var book = el("input", { id: "p-book", name: "booking_url", type: "url", maxlength: "300", placeholder: "https://" }); book.value = p.booking_url || "";
    kids.push(el("div", null, [el("label", { "for": "p-book", text: "Online booking link" }), book]));
    var offs = el("div", { id: "offices" });
    var list = (p.offices && p.offices.length ? p.offices : [{}]);
    function officeRow(o, i) {
      function f(name, label, attrs) {
        var inp = el("input", Object.assign({ id: "o" + i + "-" + name, name: name }, attrs || {})); inp.value = o[name] || "";
        return el("div", null, [el("label", { "for": "o" + i + "-" + name, text: label }), inp]);
      }
      return el("fieldset", { "class": "office" }, [el("legend", { text: i === 0 ? "Main office" : "Office " + (i + 1) }),
        f("practice", "Practice name", { maxlength: "120" }), f("city", "City", { maxlength: "60" }),
        el("div", { "class": "row2" }, [f("state", "State (2 letters)", { maxlength: "2" }), f("zip", "ZIP", { maxlength: "5", inputmode: "numeric" })]),
        f("phone", "Office phone", { maxlength: "20", inputmode: "tel" })]);
    }
    list.forEach(function (o, i) { offs.appendChild(officeRow(o, i)); });
    kids.push(offs);
    kids.push(el("div", null, [el("button", { "class": "secondary", type: "button", id: "add-office", text: "Add another office", onclick: function () {
      var n = offs.querySelectorAll("fieldset.office").length; if (n < 5) offs.appendChild(officeRow({}, n)); } })]));
    kids.push(el("div", null, [el("button", { type: "submit", text: "Save" })]));
    var f = el("form", { "class": "claim-form", id: "profile-form", novalidate: true }, kids);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var blurbs = {};
      Object.keys(PROC).forEach(function (k) { blurbs[k] = f["blurb_" + k].value; f.querySelector("#why-b-" + k).textContent = ""; });
      var offices = [].slice.call(offs.querySelectorAll("fieldset.office")).map(function (fs) {
        var g = function (n) { return fs.querySelector('[name="' + n + '"]').value.trim(); };
        return { practice: g("practice"), city: g("city"), state: g("state").toUpperCase(), zip: g("zip"), phone: g("phone") };
      }).filter(function (o) { return o.practice || o.city || o.zip || o.phone; });
      api("PUT", "profile", { blurbs: blurbs, insurances: [].slice.call(f.querySelectorAll('input[name="insurances"]:checked')).map(function (x) { return x.value; }),
        insurance_other: other.value.trim(), insurance_confirm: f.insurance_confirm.checked, booking_url: book.value.trim(), offices: offices })
        .then(function (j) {
          if (j.ok) { say(j.changed.length ? "Saved." : "No changes.", "ok"); load(); return; }
          if (j.error === "screened") Object.keys(j.blocked).forEach(function (k) {
            var why = k === "blurbs" ? j.blocked.blurbs : null;
            if (why) Object.keys(why).forEach(function (pk) { var n = f.querySelector("#why-b-" + pk); if (n) n.textContent = "Not accepted: this has " + why[pk].map(function (r) { return REASONS[r] || r; }).join(" and ") + "."; });
          });
          say(words(j) + (j.fields ? " (" + j.fields.join(", ").replace(/_/g, " ") + ")" : ""), "err");
        });
    });
    return f;
  }

  function photo(p) {
    var inp = el("input", { id: "photo", type: "file", accept: "image/jpeg,image/png,image/webp" });
    var f = el("form", { "class": "claim-form", id: "photo-form", novalidate: true }, [
      el("h2", { style: "margin-top:0", text: "Photo" }),
      el("p", { "class": "small muted", text: p.photo_key ? "You have a photo on file." : "A head-and-shoulders photo. JPEG, PNG or WebP, up to 2 MB. We remove location and camera details from the file." }),
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
    booking_url: "Booking link", offices: "Offices", photo: "Photo", attested: "Procedures confirmed", verified: "Check passed", account: "Account made" };
  function changes() {
    var wrap = el("section", { id: "history" }, [el("h2", { text: "Your changes" }), el("p", { "class": "small muted", text: "Every change is kept. Undo puts back what was there before." })]);
    var ul = el("ul", { "class": "history" });
    wrap.appendChild(ul);
    api("GET", "edits").then(function (j) {
      (j.edits || []).forEach(function (e) {
        ul.appendChild(el("li", null, [
          el("span", { text: (FIELD[e.field] || e.field) + (e.undo_of ? " (undone)" : "") + " · " + new Date(e.at).toLocaleString() }),
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
      else { out.innerHTML = forms; wire(); }
    });
  }

  function useHash() {
    var m = /^#(link|check|doximity)=([0-9a-z-]+)$/.exec(location.hash);
    if (!m) return Promise.resolve();
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    if (m[1] === "doximity") {
      if (m[2] === "signed-in") { say("Signed in with Doximity.", "ok"); return Promise.resolve(); }
      if (m[2] === "failed") { say("Doximity sign-in did not finish. Sign in by email instead.", "err"); return Promise.resolve(); }
      // Review round 1: show whose Doximity account this is and wait for a click before linking it.
      var tok = m[2];
      return api("POST", "doximity/preview", { token: tok }).then(function (pv) {
        if (!pv.ok) { say(words(pv), "err"); return; }
        var b = el("div", { "class": "notice", id: "dox-confirm" }, [
          el("p", { text: "Link the Doximity account of " + pv.name + (pv.specialty ? " (" + pv.specialty + ")" : "") + " to this Every Option account?" }),
          el("button", { type: "button", id: "dox-yes", text: "Link Doximity", onclick: function () {
            api("POST", "doximity/link", { token: tok }).then(function (j) {
              b.remove();
              say(j.ok ? "Doximity linked. Next time you can sign in with Doximity." : j.error === "signed_out" ?
                "Sign in by email first, then link Doximity from your account." : words(j).indexOf("Something") === 0 ?
                "We could not link that Doximity account; we will look into it." : words(j), j.ok ? "ok" : "err");
            });
          } }), " ",
          el("button", { "class": "secondary", type: "button", text: "Cancel", onclick: function () { b.remove(); } })
        ]);
        box.insertBefore(b, statusEl);
      });
    }
    return api("POST", "link", { token: m[2] }).then(function (j) {
      if (j.ok && j.verified) say("Work email confirmed. Your check is done.", "ok");
      else if (j.ok) say("You are signed in.", "ok");
      else say(words(j), "err");
    });
  }

  function start() {
    return fetch("/api/account/status", { credentials: "same-origin" }).then(function (r) {
      if (r.status !== 200) return null;
      return r.json();
    }).catch(function () { return null; }).then(function (s) {
      if (!s || !s.open) { box.hidden = true; closed.hidden = false; return; }
      STATUS = s; closed.hidden = true; box.hidden = false;
      if (!start.wired) { start.wired = true; window.addEventListener("hashchange", function () { useHash().then(load); }); }
      return useHash().then(load);
    });
  }
  start();
})();
